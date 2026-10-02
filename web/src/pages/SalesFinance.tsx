import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/store";
import { formatCurrency } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Account = { id: string; name: string; kind: "cash" | "bank"; balance: number };
type Closing = { drawer_id: string; closed_at: string; cashier_name: string; opening_cash: number; cash_sales: number; deductions: number; change_given: number; counted_cash: number; difference: number; card_sales: number; transfer_sales: number; card_settled: boolean; transfer_settled: boolean };
type Entry = { id: string; created_at: string; kind: string; amount: number; fee: number; source_id: string | null; destination_id: string | null; reason: string; created_by: string | null; drawer_id: string | null };
type Snapshot = { accounts: Account[]; closings: Closing[]; entries: Entry[]; entry_count: number; open_float: number };
const labels: Record<string, string> = { initialize: "Set initial cash on hand", bank_opening: "Add bank account", deposit: "Deposit cash into bank", cash_expense: "Spend cash on hand", bank_expense: "Spend from bank account", cash_receipt: "Record incoming cash / correction", card_settlement: "Record card settlement", transfer_settlement: "Record received bank transfer", drawer_open: "Drawer opening float", drawer_close: "Drawer closing cash" };
const money = (n: number) => formatCurrency(Number(n));
const date = (s: string) => new Date(s).toLocaleString("en-GB", { timeZone: "Indian/Maldives", dateStyle: "medium", timeStyle: "short" });
const field = "w-full rounded-md border bg-background p-2 text-sm";

export default function SalesFinance() {
  const user = useCurrentUser();
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [kind, setKind] = useState("deposit");
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
    const result = await supabase.rpc("finance_snapshot", { p_offset: offset });
    if (generation.current !== current) return;
    if (result.error) { setError(`Unable to load balances. ${result.error.message}`); return; }
    setData(result.data as Snapshot); setError(""); setUpdated(new Date().toISOString());
  }, [user?.role, offset]);
  useEffect(() => {
    void refresh();
    if (user?.role !== "admin") return;
    const channel = supabase.channel(`sales-finance-${user.id}`)
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
  const action = cash ? kind : "initialize";
  const settlement = action === "card_settlement" || action === "transfer_settlement";
  const needsBank = ["deposit", "bank_expense", "card_settlement", "transfer_settlement"].includes(action);
  const pendingCard = data?.closings.filter(c => !c.card_settled).reduce((s,c) => s + Number(c.card_sales), 0) ?? 0;
  const pendingTransfer = data?.closings.filter(c => !c.transfer_settled).reduce((s,c) => s + Number(c.transfer_sales), 0) ?? 0;
  const name = (id: string | null) => data?.accounts.find(a => a.id === id)?.name ?? "—";
  const reset = (next: string) => { setKind(next); setAmount(""); setFee("0"); setReason(""); setDrawer(""); };
  const chooseSettlement = (c: Closing, type: "card_settlement" | "transfer_settlement") => {
    reset(type); setDrawer(c.drawer_id); setAmount(String(type === "card_settlement" ? c.card_sales : c.transfer_sales));
    document.getElementById("finance-entry")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving.current || error || !data) return;
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || !/^\d+(\.\d{1,2})?$/.test(fee)) { toast.error("Enter amounts with at most two decimal places"); return; }
    const payload = { p_kind: action, p_amount: Number(amount), p_fee: action === "card_settlement" ? Number(fee) : 0, p_account: needsBank ? account : null, p_reason: reason.trim(), p_drawer: settlement ? drawer : null };
    const key = JSON.stringify(payload);
    if (request.current?.payload !== key) request.current = { payload: key, id: crypto.randomUUID() };
    saving.current = true; setBusy(true);
    try {
      const result = await supabase.rpc("finance_post", { ...payload, p_request: request.current.id });
      if (result.error) throw result.error;
      request.current = undefined; reset("deposit"); setOffset(0);
      await refresh(); toast.success("Transaction recorded and balances updated");
    } catch (e) { toast.error(e instanceof Error ? e.message : (e as { message?: string }).message ?? "Could not save. Retry the same entry safely."); }
    finally { saving.current = false; setBusy(false); }
  };
  return <div className="space-y-6">
    <PageHeader title="Sales Management · Cash & Accounts" description="Admin-only cash custody, bank balances and money movements. All amounts are MVR." actions={<Button variant="outline" onClick={() => void refresh()}>Refresh</Button>} />
    <p className="text-sm text-muted-foreground">Records money movements you have completed; this page does not send money through a bank. <Link className="underline" to="/cash-drawer">Open Cash Drawer</Link></p>
    {error && <div role="alert" className="rounded-lg border border-destructive p-4 text-destructive">{error} Balances are unavailable until the connection is restored. If this module is new, apply migration 0042 first.</div>}
    {!data && !error && <p>Loading balances…</p>}
    {data && !error && <>
      {cash ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[
          ["Cash on hand", cash.balance, "Available outside open drawers"], ["Opening float in drawers", data.open_float, "Returned with counted cash at close"],
          ["Bank account balances", banks.reduce((s,a) => s+Number(a.balance),0), "Recorded balances across accounts"], ["Card awaiting settlement", pendingCard, "Not included in bank balance yet"], ["Transfers awaiting allocation", pendingTransfer, "Confirm the receiving account"]
        ].map(([title,value,help]) => <section key={String(title)} className="rounded-xl border bg-card p-4"><h2 className="text-sm text-muted-foreground">{title}</h2><p className="my-2 text-xl font-bold">{money(Number(value))}</p><p className="text-xs text-muted-foreground">{help}</p></section>)}</div>
        <p className="text-xs text-muted-foreground">Updated {date(updated)}. Drawer sales become available when the drawer closes. Deductions are already reflected in counted cash. Opening float is moved, never counted as new income.</p>
        <div className="flex flex-wrap gap-3">{banks.map(a => <div key={a.id} className="rounded-lg border p-3"><span className="text-sm">{a.name}</span><p className="font-semibold">{money(a.balance)}</p></div>)}</div>
      </> : <section className="rounded-lg border bg-muted/30 p-4"><h2 className="font-semibold">Start with a reconciled cash balance</h2><p className="text-sm">Close every drawer first. Enter all cash currently held, including float to be used next time. Historical drawer totals are not added again. Future drawer openings and closings update this balance automatically. Add each bank account with its current balance; only settle receipts not already included in that balance.</p></section>}
      <form id="finance-entry" onSubmit={save} className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 font-semibold">{cash ? "Record a money movement" : "Initialize cash tracking"}</h2>
        <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
          {cash && <label className="space-y-1 text-sm">Action<select className={field} value={kind} onChange={e => reset(e.target.value)}>{["deposit","bank_expense","cash_expense","cash_receipt","bank_opening",...(settlement ? [kind] : [])].map(k => <option key={k} value={k}>{labels[k]}</option>)}</select></label>}
          {needsBank && <label className="space-y-1 text-sm">Bank account<select required className={field} value={account} onChange={e => setAccount(e.target.value)}><option value="">Select an account</option>{banks.map(a => <option key={a.id} value={a.id}>{a.name} — {money(a.balance)}</option>)}</select></label>}
          <label className="space-y-1 text-sm">{action === "bank_opening" || action === "initialize" ? "Opening balance (MVR)" : "Amount (MVR)"}<input className={field} type="number" step="0.01" min={action === "bank_opening" || action === "initialize" ? "0" : "0.01"} required readOnly={settlement} value={amount} onChange={e => setAmount(e.target.value)} /></label>
          {action === "card_settlement" && <label className="space-y-1 text-sm">Bank processing fee (MVR)<input required type="number" min="0" max={amount} step="0.01" className={field} value={fee} onChange={e => setFee(e.target.value)} /></label>}
          <label className="space-y-1 text-sm">{action === "bank_opening" ? "Account name" : "Reason / purchase details / deposit reference"}<input required maxLength={action === "bank_opening" ? 100 : 500} className={field} value={reason} onChange={e => setReason(e.target.value)} placeholder={action.includes("expense") ? "Goods purchased, supplier and invoice reference" : "Enter details"} /></label>
          {settlement && <p className="text-sm md:col-span-2">Closing: {drawer}. This records the full receipt once; bank credit: {money(Number(amount)-Number(action === "card_settlement" ? fee : 0))}.</p>}
          {action === "deposit" && <p className="text-sm md:col-span-2">A full deposit clears available cash on hand; a partial deposit leaves the remaining cash. Both balances update together.</p>}
          <Button type="submit" className="md:col-span-2" disabled={busy || (needsBank && !banks.length)}>{busy ? "Saving…" : "Record transaction"}</Button>
        </fieldset>
      </form>
      <section><h2 className="mb-3 text-lg font-semibold">Daily drawer closings</h2><p className="mb-3 text-sm text-muted-foreground">Since tracking started. Dates use Maldives time. Card and transfer receipts stay separate from physical cash.</p>
        <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted"><tr>{["Closed / cashier","Opening","Cash sales","Cash used","Change","Counted cash","Difference","Card","Transfer"].map(h => <th key={h} className="whitespace-nowrap p-3 text-left">{h}</th>)}</tr></thead><tbody>{data.closings.map(c => <tr key={c.drawer_id} className="border-t"><td className="p-3">{date(c.closed_at)}<div className="text-xs text-muted-foreground">{c.cashier_name}</div></td>{[c.opening_cash,c.cash_sales,c.deductions,c.change_given,c.counted_cash,c.difference].map((n,i) => <td key={i} className="whitespace-nowrap p-3">{money(n)}</td>)}<td className="p-3">{money(c.card_sales)}{Number(c.card_sales)>0 && (c.card_settled ? <p className="text-xs">Settled</p> : <Button disabled={busy} size="sm" variant="outline" onClick={() => chooseSettlement(c,"card_settlement")}>Record settlement</Button>)}</td><td className="p-3">{money(c.transfer_sales)}{Number(c.transfer_sales)>0 && (c.transfer_settled ? <p className="text-xs">Allocated</p> : <Button disabled={busy} size="sm" variant="outline" onClick={() => chooseSettlement(c,"transfer_settlement")}>Record receipt</Button>)}</td></tr>)}</tbody></table>{!data.closings.length && <p className="p-4 text-muted-foreground">No drawers closed since tracking started.</p>}</div>
      </section>
      <section><h2 className="mb-3 text-lg font-semibold">Transaction history</h2><div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted"><tr>{["Date","Movement","Amount","Fee","From","To","Reason / reference","Recorded by"].map(h => <th key={h} className="p-3 text-left">{h}</th>)}</tr></thead><tbody>{data.entries.map(e => <tr className="border-t" key={e.id}><td className="p-3">{date(e.created_at)}</td><td className="p-3">{labels[e.kind] ?? e.kind}</td><td className="whitespace-nowrap p-3">{money(e.amount)}</td><td className="p-3">{money(e.fee)}</td><td className="p-3">{name(e.source_id)}</td><td className="p-3">{name(e.destination_id)}</td><td className="min-w-48 p-3">{e.reason}{e.drawer_id && <p className="text-xs text-muted-foreground">{e.drawer_id}</p>}</td><td className="max-w-36 break-all p-3 text-xs">{e.created_by ?? "System"}</td></tr>)}</tbody></table></div><div className="mt-3 flex items-center gap-3"><Button variant="outline" disabled={offset===0} onClick={() => setOffset(Math.max(0,offset-100))}>Previous</Button><span className="text-sm">{data.entry_count ? offset+1 : 0}–{Math.min(offset+100,data.entry_count)} of {data.entry_count}</span><Button variant="outline" disabled={offset+100>=data.entry_count} onClick={() => setOffset(offset+100)}>Next</Button></div></section>
    </>}
  </div>;
}
