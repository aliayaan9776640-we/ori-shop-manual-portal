import BankAccountHistory from "@/components/BankAccountHistory";
import CashCollectionRange from "@/components/CashCollectionRange";
import SalesFinanceOverview, { maldivesDay, closingCash, type FinanceSummary } from "@/components/SalesFinanceOverview";
import { useCallback, useEffect, useRef, useState } from "react";

import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/store";
import { formatCurrency } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

type Account = { id: string; name: string; kind: "cash" | "bank"; balance: number; auto_receipts?: boolean; exclude_opening_float?: boolean };
type Closing = { drawer_id: string; closed_at: string; cashier_name: string; opening_cash: number; cash_sales: number; deductions: number; change_given: number; counted_cash: number; difference: number; card_sales: number; transfer_sales: number; tracked?: boolean; recorded_expected?: number; card_settled: boolean; transfer_settled: boolean };
type Entry = { id: string; created_at: string; kind: string; amount: number; fee: number; source_id: string | null; destination_id: string | null; reason: string; created_by: string | null; drawer_id: string | null };
type Snapshot = { accounts: Account[]; closings: Closing[]; entries: Entry[]; entry_count: number; open_float: number; active_drawers?: number };
const labels: Record<string, string> = { initialize: "Set initial cash on hand", bank_opening: "Add bank account", deposit: "Deposit into bank", bank_receipt: "Bank deposit · other source", cash_expense: "Spend cash on hand", bank_expense: "Use Bank Money", cash_receipt: "Record incoming cash / correction", card_settlement: "Record card settlement", transfer_settlement: "Record received bank transfer", historical_drawer_cash: "Imported actual drawer cash", drawer_float_excluded: "Opening float excluded", drawer_open: "Drawer opening float", drawer_close: "Drawer closing cash" };
const money = (n: number) => formatCurrency(Number(n));
const date = (s: string) => new Date(s).toLocaleString("en-GB", { timeZone: "Indian/Maldives", dateStyle: "medium", timeStyle: "short" });
const field = "w-full rounded-md border bg-background p-2 text-sm";

export default function SalesFinance() {
  const user = useCurrentUser();
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [day, setDay] = useState(() => maldivesDay(new Date()));
  const [summary, setSummary] = useState<FinanceSummary>({ days: [], deposited: 0, used: 0, recorders: {} });
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [offset, setOffset] = useState(0);
  const [kind, setKind] = useState("deposit");
  const [depositSource, setDepositSource] = useState("cash");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("0");
  const [account, setAccount] = useState("");
  const [reason, setReason] = useState("");
  const [drawer, setDrawer] = useState("");
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState("");
  const request = useRef<{ payload: string; id: string }>();
  const saving = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    if (user?.role !== "admin") return;
    if (!isSupabaseConfigured) { setError("A database connection is required for cash and account records."); return; }
    const [result, stats] = await Promise.all([
      supabase.rpc("finance_snapshot", { p_offset: offset }),
      supabase.rpc("finance_dashboard", { p_day: day }),
    ]);
    if (generation.current !== current) return;
    if (result.error) { setError(`Unable to load balances. ${result.error.message}`); return; }
    if (stats.error) { setError(`Unable to load sales summary. ${stats.error.message}`); return; }
    setSummary({ days: stats.data?.days ?? [], deposited: Number(stats.data?.deposited ?? 0), used: Number(stats.data?.used ?? 0), recorders: stats.data?.recorders ?? {} });
    setData(result.data as Snapshot); setError(""); setUpdated(new Date().toISOString());
  }, [user?.role, offset, day]);
  useEffect(() => {
    void refresh();
    if (user?.role !== "admin") return;
    const channel = supabase.channel(`sales-finance-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_refresh_signals" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_accounts" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_entries" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_closings" }, () => void refresh()).subscribe();
    const timer = window.setInterval(() => void refresh(), 15000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => { ++generation.current; clearInterval(timer); window.removeEventListener("focus", focus); void supabase.removeChannel(channel); };
  }, [refresh, user?.id, user?.role]);
  if (user?.role !== "admin") return <p>Administrator access required.</p>;
  const cash = data?.accounts.find(a => a.kind === "cash");
  const banks = data?.accounts.filter(a => a.kind === "bank") ?? [];
  const receivingBank = banks.find(a => a.auto_receipts);
  const action = cash ? kind : "initialize";
  const settlement = action === "card_settlement" || action === "transfer_settlement";
  const needsBank = ["deposit", "bank_expense", "card_settlement", "transfer_settlement"].includes(action);
  const name = (id: string | null) => data?.accounts.find(a => a.id === id)?.name ?? "—";
  const reset = (next: string) => { setShowForm(true); setKind(next); setAccount(receivingBank?.id ?? banks[0]?.id ?? ""); setDepositSource("cash"); setAmount(""); setFee("0"); setReason(""); setDrawer(""); };
  const chooseSettlement = (c: Closing, type: "card_settlement" | "transfer_settlement") => {
    reset(type); setDrawer(c.drawer_id); setAmount(String(type === "card_settlement" ? c.card_sales : c.transfer_sales));

  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving.current || error || !data) return;
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || !/^\d+(\.\d{1,2})?$/.test(fee)) { toast.error("Enter amounts with at most two decimal places"); return; }
    const payload = { p_kind: action === "deposit" && depositSource === "other" ? "bank_receipt" : action, p_amount: Number(amount), p_fee: action === "card_settlement" ? Number(fee) : 0, p_account: needsBank ? account : null, p_reason: reason.trim(), p_drawer: settlement ? drawer : null };
    const key = JSON.stringify(payload);
    if (request.current?.payload !== key) request.current = { payload: key, id: crypto.randomUUID() };
    saving.current = true; setBusy(true);
    try {
      const result = await supabase.rpc("finance_post", { ...payload, p_request: request.current.id });
      if (result.error) throw result.error;
      request.current = undefined; reset("deposit"); setOffset(0);
      await refresh(); setShowForm(false); toast.success("Transaction recorded and balances updated");
    } catch (e) { toast.error(e instanceof Error ? e.message : (e as { message?: string }).message ?? "Could not save. Retry the same entry safely."); }
    finally { saving.current = false; setBusy(false); }
  };
  return <div className="space-y-4 text-slate-900">
    <PageHeader title="Sales Management · Cash & Accounts" description="Monitor daily sales, cash on hand, bank balances and money movements. All amounts are in MVR." actions={<div className="flex gap-2"><input aria-label="Dashboard date" type="date" value={day} onChange={e => { if(e.target.value) setDay(e.target.value); }} className="rounded-lg border bg-white px-3 text-sm"/><Button variant="outline" onClick={() => void refresh()}>Refresh</Button></div>} />

    {error && <div role="alert" className="rounded-lg border border-destructive p-4 text-destructive">{error} Balances are unavailable until the connection is restored. Please contact your administrator if this continues.</div>}
    {!data && !error && <p>Loading balances…</p>}
    {data && !error && <>
      <SalesFinanceOverview accounts={data.accounts} summary={summary} day={day} openFloat={data.open_float} latestClosing={data.closings[0]} activeDrawers={data.active_drawers ?? 0} onAction={next => next.startsWith("view_") ? setDetail(next) : reset(next)}/>
      <CashCollectionRange closings={data.closings}/>
      <p className="text-xs text-slate-500">Updated {updated ? date(updated) : "—"}. Sales and charts follow the selected Maldives date; account cards show current balances. Card and transfers post on closing. Recording a deposit here does not send money through a bank.</p>
      {cash?.exclude_opening_float && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">Cash collections include saved drawer history. Record any past deposits or spending that happened after those closings and are not yet in Transaction History to reconcile the remaining balance.</p>}
      {!cash && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h2 className="font-semibold">Set up your opening balances once</h2><p className="mt-1 text-sm">Close every drawer first, then enter the cash you actually hold, including float for the next drawer. The latest actual drawer count is shown above automatically, including any excess or shortage. Add any cash kept separately when setting the opening balance. Daily counts are not summed because opening cash can be reused. The closing history already shows your saved drawer records. Add each bank with its actual current balance to start automatic tracking.</p></section>}
      {cash && <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Automatic posting settings · {receivingBank?.name ?? "Select a receiving bank"}</summary><section className="mt-3 space-y-2">
        <h2 className="font-semibold">Automatic bank updates at drawer closing</h2>
        <p className="text-sm">{receivingBank ? `Card and transfer payments automatically increase ${receivingBank.name} when each drawer closes. Actual closing cash less opening float updates collected cash; excess is already included.` : "Add a bank account below, then select it here. Until an account is selected, card and transfer receipts remain pending for manual allocation."}</p>
        {!!banks.length && <label className="block text-sm">Receiving bank account<select className={field} disabled={busy} value={receivingBank?.id ?? ""} onChange={async e => {
          const id = e.target.value;
          if (!id || saving.current) return;
          saving.current = true; setBusy(true);
          try {
            const result = await supabase.rpc("finance_set_receiving_bank", { p_account: id });
            if (result.error) throw result.error;
            await refresh(); toast.success("Future card and transfer receipts will update this account automatically");
          } catch (e) { toast.error((e as { message?: string }).message ?? "Unable to save receiving account"); }
          finally { saving.current = false; setBusy(false); }
        }}><option value="" disabled>Select receiving bank</option>{banks.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
        <p className="text-xs text-muted-foreground">Bank spending deducts from the selected account. A cash deposit deducts the same amount from cash on hand and adds it to the selected bank. A full cash deposit leaves cash on hand at zero. Changing the receiving bank affects future closings only.</p>
      </section></details>}
      <Dialog open={showForm || (!cash && !setupDismissed && !!data && !error)} onOpenChange={open => { if (!saving.current) { setShowForm(open); setSetupDismissed(!open); } }}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"><DialogTitle>{cash ? labels[kind] : "Initialize cash tracking"}</DialogTitle><DialogDescription>Record a money movement</DialogDescription><form id="finance-entry" onSubmit={save} className="rounded-xl border bg-card p-5">

        <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
          {cash && <label className="space-y-1 text-sm">Action<select className={field} value={kind} onChange={e => reset(e.target.value)}>{["deposit","bank_expense","cash_expense","cash_receipt","bank_opening",...(settlement ? [kind] : [])].map(k => <option key={k} value={k}>{labels[k]}</option>)}</select></label>}
          {action === "deposit" && <label className="space-y-1 text-sm">Deposit source<select className={field} value={depositSource} onChange={e => setDepositSource(e.target.value)}><option value="cash">On-hand cash</option><option value="other">Other source</option></select></label>}
          {needsBank && !banks.length && <div role="status" className="rounded-lg bg-amber-50 p-3 text-sm md:col-span-2">Add a bank account before recording this transaction. <Button type="button" variant="outline" onClick={() => reset("bank_opening")}>Set up bank account</Button></div>}
          {needsBank && <label className="space-y-1 text-sm">Bank account<select required className={field} value={account} onChange={e => setAccount(e.target.value)}><option value="">Select an account</option>{banks.map(a => <option key={a.id} value={a.id}>{a.name} — {money(a.balance)}</option>)}</select></label>}
          <label className="space-y-1 text-sm">{action === "bank_opening" || action === "initialize" ? "Opening balance (MVR)" : "Amount (MVR)"}<input className={field} type="number" step="0.01" min={action === "bank_opening" || action === "initialize" ? "0" : "0.01"} required readOnly={settlement} value={amount} onChange={e => setAmount(e.target.value)} /></label>
          {action === "card_settlement" && <label className="space-y-1 text-sm">Bank processing fee (MVR)<input required type="number" min="0" max={amount} step="0.01" className={field} value={fee} onChange={e => setFee(e.target.value)} /></label>}
          <label className="space-y-1 text-sm">{action === "bank_opening" ? "Account name" : "Reason / purchase details / deposit reference"}<input required maxLength={action === "bank_opening" ? 100 : 500} className={field} value={reason} onChange={e => setReason(e.target.value)} placeholder={action.includes("expense") ? "Goods purchased, supplier and invoice reference" : "Enter details"} /></label>
          {settlement && <p className="text-sm md:col-span-2">Closing: {drawer}. This records the full receipt once; bank credit: {money(Number(amount)-Number(action === "card_settlement" ? fee : 0))}.</p>}
          {action === "bank_expense" && <p className="text-sm md:col-span-2">Enter the amount and reason, such as goods purchased or a supplier payment. Saving deducts this amount from the selected bank and records it in bank history. On-hand cash is unchanged.</p>}
          {action === "deposit" && <p className="text-sm md:col-span-2">{depositSource === "cash" ? "Deducts this amount from on-hand cash and adds the same amount to the selected bank. A full deposit clears the cash balance." : "Adds only the entered amount to the selected bank. On-hand cash stays unchanged. Enter the source or deposit reference below."}</p>}
          <Button type="submit" className="md:col-span-2" disabled={busy || (needsBank && !banks.length)}>{busy ? "Saving…" : "Record transaction"}</Button>
        </fieldset>
      </form></DialogContent></Dialog>
      <Dialog open={detail !== null} onOpenChange={open => { if (!open) setDetail(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogTitle>{detail === "view_banks" ? "Bank account history" : detail === "view_deposits" ? "Cash deposited this month" : detail === "view_used" ? "Money used this month" : "Sales by payment method"}</DialogTitle><DialogDescription>{detail === "view_banks" ? "Current recorded balances for each bank." : "Selected Maldives date: " + day + ". Monthly totals follow the selected month."}</DialogDescription>
        {detail === "view_banks" ? <BankAccountHistory banks={banks} updated={updated} onSpend={id => { setDetail(null); reset("bank_expense"); if(id) setAccount(id); }} onAdd={() => { setDetail(null); reset("bank_opening"); }}/> : detail === "view_deposits" || detail === "view_used" ? <><strong className="text-2xl">{money(detail === "view_deposits" ? summary.deposited : summary.used)}</strong><p className="text-sm">{detail === "view_deposits" ? "Cash transferred from on hand into bank accounts. Other-source deposits are listed separately in transaction history." : "Includes drawer cash-outs, recorded cash and bank spending, and bank fees."}</p><Button onClick={() => { setDetail(null); requestAnimationFrame(() => document.getElementById("finance-history")?.scrollIntoView?.({behavior:"smooth"})); }}>View transaction history</Button></> : <div className="space-y-3">{[["Total sales","total"],["Cash sales","cash"],["Card payments","card"],["Bank transfers","bank"],["Credit sales","credit"]].map(([label,key]) => <div key={key} className="flex justify-between"><span>{label}</span><strong>{money(Number((summary.days.find(d => d.day === day) as unknown as Record<string, unknown> | undefined)?.[key] ?? 0))}</strong></div>)}<p className="text-sm text-muted-foreground">Card and transfer receipts post to your receiving bank when the drawer closes. Credit sales are not cash received.</p></div>}
      </DialogContent></Dialog>
      <div className="grid gap-4 2xl:grid-cols-2">
      <section className="min-w-0 rounded-xl border bg-white p-4"><h2 className="mb-3 text-sm font-bold">Daily Cash Drawer Closing Summary</h2><p className="mb-3 text-sm text-muted-foreground">Actual cash, cash-outs and excess / shortage come directly from each saved drawer closing. Recorded expected cash = actual cash − recorded difference. Excess is already included in actual cash; it is never added twice. Opening float is excluded from each daily collection. Historical bank receipts are not reposted.</p>
        <div className="max-h-80 overflow-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted"><tr>{["Closed / cashier","Opening float","Cash sales","Cash out","Expected cash","Actual drawer cash","Net collection","Excess / shortage","Card to bank","Transfer to bank"].map(h => <th key={h} className="whitespace-nowrap p-3 text-left">{h}</th>)}</tr></thead><tbody>{data.closings.filter(c => maldivesDay(c.closed_at) === day).map(c => <tr key={c.drawer_id} className="border-t"><td className="p-3">{date(c.closed_at)}<div className="text-xs text-muted-foreground">{c.cashier_name}</div><div className="text-xs text-muted-foreground">{c.tracked === false ? cash?.exclude_opening_float ? "Imported cash collection · historical bank receipts" : "Historical record · not posted to accounts" : "Posted to accounts"}</div></td>{[c.opening_cash,c.cash_sales,c.deductions,closingCash(c).expected,c.counted_cash,Number(c.counted_cash)-Number(c.opening_cash),closingCash(c).difference].map((n,i) => <td key={i} className="whitespace-nowrap p-3">{money(n)}</td>)}<td className="p-3">{money(c.card_sales)}{Number(c.card_sales)>0 && c.tracked !== false && (c.card_settled ? <p className="text-xs">Settled</p> : <Button disabled={busy} size="sm" variant="outline" onClick={() => chooseSettlement(c,"card_settlement")}>Record settlement</Button>)}</td><td className="p-3">{money(c.transfer_sales)}{Number(c.transfer_sales)>0 && c.tracked !== false && (c.transfer_settled ? <p className="text-xs">Allocated</p> : <Button disabled={busy} size="sm" variant="outline" onClick={() => chooseSettlement(c,"transfer_settlement")}>Record receipt</Button>)}</td></tr>)}</tbody></table>{!data.closings.some(c => maldivesDay(c.closed_at) === day) && <p className="p-4 text-muted-foreground">No drawers closed on this date. Select an earlier date to see saved closings.</p>}</div>
      </section>
      <section id="finance-history" className="min-w-0 rounded-xl border bg-white p-4"><h2 className="mb-3 text-sm font-bold">Recent Transactions</h2><div className="max-h-80 overflow-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted"><tr>{["Date","Movement","Amount","Fee","From","To","Reason / reference","Recorded by"].map(h => <th key={h} className="p-3 text-left">{h}</th>)}</tr></thead><tbody>{data.entries.map(e => <tr className="border-t" key={e.id}><td className="p-3">{date(e.created_at)}</td><td className="p-3">{labels[e.kind] ?? e.kind}</td><td className="whitespace-nowrap p-3">{money(e.amount)}</td><td className="p-3">{money(e.fee)}</td><td className="p-3">{e.kind === "bank_receipt" ? "Other source" : name(e.source_id)}</td><td className="p-3">{name(e.destination_id)}</td><td className="min-w-48 p-3">{e.reason}{e.drawer_id && <p className="text-xs text-muted-foreground">{e.drawer_id}</p>}</td><td className="max-w-36 break-all p-3 text-xs">{e.created_by ? summary.recorders[e.created_by] ?? "Staff" : "System"}</td></tr>)}</tbody></table></div><div className="mt-3 flex items-center gap-3"><Button variant="outline" disabled={offset===0} onClick={() => setOffset(Math.max(0,offset-100))}>Previous</Button><span className="text-sm">{data.entry_count ? offset+1 : 0}–{Math.min(offset+100,data.entry_count)} of {data.entry_count}</span><Button variant="outline" disabled={offset+100>=data.entry_count} onClick={() => setOffset(offset+100)}>Next</Button></div></section>
      </div>
    </>}
  </div>;
}
