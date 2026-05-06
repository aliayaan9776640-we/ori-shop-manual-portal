import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useStore, useCurrentUser } from "@/lib/store";
import {
  useCashDrawers,
  DEFAULT_DENOMINATIONS,
  sumDenominations,
  type DenominationCount,
  type CashDrawer,
} from "@/lib/cashDrawer";
import { Banknote } from "lucide-react";
import { formatCurrency, formatDateTime, isSameDay } from "@/lib/format";
import {
  Wallet,
  DoorOpen,
  DoorClosed,
  CheckCircle2,
  AlertTriangle,
  Calculator,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/lib/settings";

export default function CashDrawerPage() {
  const user = useCurrentUser();
  const isAdmin = user?.role === "admin";
  const settings = useSettings();
  const sales = useStore((s) => s.sales);
  const { drawers, open, close, approve, remove, addCashUsed, load, loaded } =
    useCashDrawers();

  useEffect(() => {
    if (!loaded) {
      void load().catch((e: unknown) => {
        console.warn("[cash_drawers] load failed", e);
      });
    }
  }, [loaded, load]);
  const [cashUsedInput, setCashUsedInput] = useState<string>("");
  const [cashUsedNote, setCashUsedNote] = useState<string>("");

  const [openingCash, setOpeningCash] = useState<string>("");
  const [denominations, setDenominations] =
    useState<DenominationCount[]>(DEFAULT_DENOMINATIONS);
  const [closeNotes, setCloseNotes] = useState<string>("");

  // Shop-wide: there can only be ONE open drawer at a time.
  // Any cashier sees and may close it.
  const myDrawer = drawers.find((d) => d.status === "open");
  const openedByOther =
    !!myDrawer && !!user && myDrawer.cashierId !== user.id;

  // Sales linked to this drawer session. Prefer the explicit drawerId
  // captured at POS; fall back to (cashier + opened-at window) for sales
  // recorded before drawer linking was introduced.
  // Voided sales are excluded so cash aggregates reverse correctly when admin voids.
  const drawerSales = useMemo(() => {
    if (!myDrawer) return [];
    const openedAt = new Date(myDrawer.openedAt).getTime();
    return sales.filter((s) => {
      if (s.voided) return false;
      if (s.drawerId) return s.drawerId === myDrawer.id;
      // Legacy fallback: any sale rung up after the drawer opened belongs to it.
      return new Date(s.date).getTime() >= openedAt;
    });
  }, [sales, myDrawer]);

  const aggregates = useMemo(() => {
    const cash = drawerSales
      .filter((s) => s.paymentMethod === "cash")
      .reduce((a, b) => a + b.total, 0);
    const card = drawerSales
      .filter((s) => s.paymentMethod === "card")
      .reduce((a, b) => a + b.total, 0);
    const bank = drawerSales
      .filter((s) => s.paymentMethod === "bank")
      .reduce((a, b) => a + b.total, 0);
    const credit = drawerSales
      .filter((s) => s.paymentMethod === "credit")
      .reduce((a, b) => a + b.total, 0);
    const total = cash + card + bank + credit;
    return { cash, card, bank, credit, total, count: drawerSales.length };
  }, [drawerSales]);

  const counted = sumDenominations(denominations);
  const opening = myDrawer?.openingCash ?? 0;
  const changeGiven = myDrawer?.changeGiven ?? 0;
  const cashUsed = myDrawer?.cashUsed ?? 0;
  // Expected Drawer Cash = Opening Cash + Cash Sales - Change Given - Cash Used
  const expectedDrawer = +(opening + aggregates.cash - changeGiven - cashUsed).toFixed(2);
  const difference = +(counted - expectedDrawer).toFixed(2);

  const setDen = (value: number, count: number): void => {
    setDenominations((prev) =>
      prev.map((d) =>
        d.value === value ? { ...d, count: Math.max(0, count) } : d
      )
    );
  };

  const handleOpen = async (): Promise<void> => {
    if (!user) return;
    const oc = Number(openingCash);
    if (isNaN(oc) || oc < 0) {
      toast.error("Enter a valid opening cash amount");
      return;
    }
    try {
      await open(user.id, user.fullName, oc);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      return;
    }
    setOpeningCash("");
    setDenominations(DEFAULT_DENOMINATIONS.map((d) => ({ ...d })));
    toast.success(`Drawer opened with ${formatCurrency(oc)}`);
  };

  const handleClose = async (): Promise<void> => {
    if (!myDrawer || !user) return;
    if (counted <= 0) {
      toast.error(
        "Enter the actual counted cash (denomination count) before closing."
      );
      return;
    }
    let reason: string | undefined;
    if (openedByOther) {
      const ok = window.confirm(
        `You are closing a drawer opened by ${myDrawer.openedByName ?? myDrawer.cashierName}. Confirm?`
      );
      if (!ok) return;
      reason =
        window.prompt(
          "Optional: reason for closing another cashier's drawer"
        ) ?? undefined;
    }
    try {
      await close(
        myDrawer.id,
        {
      cashSales: aggregates.cash,
      cardSales: aggregates.card,
      bankSales: aggregates.bank,
      creditSales: aggregates.credit,
      totalSales: aggregates.total,
      changeGiven,
      cashUsed,
      gstCollected: 0,
      bagFeesCollected: 0,
      cardFeesCollected: 0,
      discountsGiven: 0,
      expectedCash: expectedDrawer,
      countedCash: counted,
      difference,
        denominations,
        notes: closeNotes,
        },
        { id: user.id, name: user.fullName, reason }
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to save closing record: ${msg}`);
      return;
    }
    toast.success(
      difference === 0
        ? "Drawer closed — perfectly balanced"
        : difference > 0
          ? `Drawer closed — excess of ${formatCurrency(difference)}`
          : `Drawer closed — shortage of ${formatCurrency(Math.abs(difference))}`
    );
    setCloseNotes("");
  };

  const handleApprove = async (id: string): Promise<void> => {
    const note = window.prompt("Admin note (optional):") ?? undefined;
    try {
      await approve(id, note);
      toast.success("Drawer closing approved");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to approve: ${msg}`);
    }
  };

  const handleForceClose = async (d: CashDrawer): Promise<void> => {
    if (!user) return;
    const ok = window.confirm(
      `Force close drawer opened by ${d.openedByName ?? d.cashierName}? This bypasses the cash count.`
    );
    if (!ok) return;
    const reason = window.prompt("Reason for force close (required):") ?? "";
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }
    try {
      await close(
        d.id,
        {
          cashSales: d.cashSales ?? 0,
          cardSales: d.cardSales ?? 0,
          bankSales: d.bankSales ?? 0,
          creditSales: d.creditSales ?? 0,
          totalSales: d.totalSales ?? 0,
          changeGiven: d.changeGiven ?? 0,
          cashUsed: d.cashUsed ?? 0,
          expectedCash: d.expectedCash ?? d.openingCash,
          countedCash: 0,
          difference: -(d.expectedCash ?? d.openingCash),
          notes: `[FORCE CLOSED BY ADMIN] ${reason}`,
        },
        { id: user.id, name: user.fullName, reason: `force close: ${reason}` }
      );
      toast.success("Drawer force-closed");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    }
  };

  const handleRemove = async (id: string): Promise<void> => {
    if (!confirm("Delete this drawer record?")) return;
    try {
      await remove(id);
      toast.success("Drawer record deleted");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to delete: ${msg}`);
    }
  };

  const printDrawer = (d: CashDrawer): void => {
    const w = window.open("", "_blank", "width=520,height=720");
    if (!w) return;
    const denRows =
      (d.denominations ?? [])
        .map(
          (x) =>
            `<tr><td>${x.value}</td><td style="text-align:center">${x.count}</td><td style="text-align:right">${formatCurrency(
              x.value * x.count
            )}</td></tr>`
        )
        .join("") || `<tr><td colspan="3" style="text-align:center;color:#888">—</td></tr>`;
    w.document.write(`<!doctype html><html><head><title>Cash drawer ${d.id}</title>
<style>
  body{font-family:ui-sans-serif,system-ui;padding:20px;color:#111;max-width:480px;margin:0 auto}
  h2{margin:0 0 4px;text-align:center}
  .small{font-size:11px;color:#555;text-align:center;margin-bottom:14px}
  .row{display:flex;justify-content:space-between;padding:3px 0;font-size:13px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin:10px 0}
  th,td{padding:5px;border-bottom:1px solid #eee}
  th{background:#0f172a;color:#fff;text-align:left}
  .grand{border-top:2px solid #111;border-bottom:2px solid #111;font-weight:800;padding:6px 0;margin-top:6px}
  .ok{color:#047857;font-weight:700}
  .bad{color:#b91c1c;font-weight:700}
</style></head><body>
<h2>${escapeHtml(settings.shopName)}</h2>
<div class="small">CASH DRAWER REPORT<br/>${formatDateTime(d.openedAt)} → ${
      d.closedAt ? formatDateTime(d.closedAt) : "open"
    }<br/>Cashier: ${escapeHtml(d.cashierName)}</div>
<div class="row"><span>Opening cash</span><span>${formatCurrency(d.openingCash)}</span></div>
<div class="row"><span>Total cash sales</span><span>${formatCurrency(d.cashSales ?? 0)}</span></div>
<div class="row"><span>Change given</span><span>- ${formatCurrency(d.changeGiven ?? 0)}</span></div>
<div class="row"><span>Cash used</span><span>- ${formatCurrency(d.cashUsed ?? 0)}</span></div>
<div class="row"><span>Card sales</span><span>${formatCurrency(d.cardSales ?? 0)}</span></div>
<div class="row"><span>Bank transfer sales</span><span>${formatCurrency(d.bankSales ?? 0)}</span></div>
<div class="row"><span>Credit sales</span><span>${formatCurrency(d.creditSales ?? 0)}</span></div>
<div class="row"><strong>Total sales</strong><strong>${formatCurrency(d.totalSales ?? 0)}</strong></div>
<table>
  <thead><tr><th>Denom</th><th style="text-align:center">Qty</th><th style="text-align:right">Subtotal</th></tr></thead>
  <tbody>${denRows}</tbody>
</table>
<div class="row"><span>Expected drawer cash</span><span>${formatCurrency(d.expectedCash ?? 0)}</span></div>
<div class="row"><span>Actual counted cash</span><span>${formatCurrency(d.countedCash ?? 0)}</span></div>
<div class="row grand"><span>Difference</span><span class="${(d.difference ?? 0) === 0 ? "ok" : (d.difference ?? 0) > 0 ? "ok" : "bad"}">${formatCurrency(d.difference ?? 0)}</span></div>
${d.notes ? `<div style="margin-top:10px;padding:8px;background:#fefce8;border-radius:6px;font-size:12px"><strong>Notes:</strong> ${escapeHtml(d.notes)}</div>` : ""}
<script>window.onload=()=>setTimeout(()=>window.print(),200);<\/script>
</body></html>`);
    w.document.close();
  };

  const visibleDrawers = isAdmin
    ? drawers
    : drawers.filter((d) => d.cashierId === user?.id);

  const todaySummary = useMemo(() => {
    const today = visibleDrawers.filter((d) => isSameDay(d.openedAt, new Date()));
    return {
      drawers: today.length,
      totalSales: today.reduce((a, b) => a + (b.totalSales ?? 0), 0),
      shortage: today
        .filter((d) => (d.difference ?? 0) < 0)
        .reduce((a, b) => a + Math.abs(b.difference ?? 0), 0),
      excess: today
        .filter((d) => (d.difference ?? 0) > 0)
        .reduce((a, b) => a + (b.difference ?? 0), 0),
    };
  }, [visibleDrawers]);

  return (
    <>
      <PageHeader
        title="Cash Drawer"
        description="Open and close shifts, count denominations, and reconcile cash."
      />

      {/* Today summary */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Today drawers" value={String(todaySummary.drawers)} icon={Wallet} />
        <SummaryCard
          label="Today sales"
          value={formatCurrency(todaySummary.totalSales)}
          icon={Calculator}
        />
        <SummaryCard
          label="Shortage"
          value={formatCurrency(todaySummary.shortage)}
          icon={AlertTriangle}
          tone="rose"
        />
        <SummaryCard
          label="Excess"
          value={formatCurrency(todaySummary.excess)}
          icon={CheckCircle2}
          tone="emerald"
        />
      </div>

      {/* Open / close panel for current cashier */}
      {user?.role !== "storekeeper" && (
        <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Status */}
          <div className="pos-card p-5 lg:col-span-1">
            <div className="mb-3 flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  myDrawer ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                }`}
              >
                {myDrawer ? <DoorOpen className="h-5 w-5" /> : <DoorClosed className="h-5 w-5" />}
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {myDrawer ? "Drawer open" : "Drawer closed"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {myDrawer
                    ? `Opened ${formatDateTime(myDrawer.openedAt)} · by ${myDrawer.openedByName ?? myDrawer.cashierName}`
                    : "Open a drawer to start your shift"}
                </p>
                {openedByOther && (
                  <p className="mt-0.5 text-[11px] font-semibold text-amber-700">
                    Opened by another cashier — you can still close it.
                  </p>
                )}
              </div>
            </div>

            {!myDrawer ? (
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Opening cash (MVR)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  className="h-12 w-full rounded-lg border border-input bg-background px-3 text-lg font-bold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="0.00"
                />
                <Button
                  onClick={() => { void handleOpen(); }}
                  className="mt-3 h-11 w-full gap-2"
                >
                  <DoorOpen className="h-4 w-4" /> Open drawer
                </Button>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <Row label="Opening cash" value={formatCurrency(opening)} />
                <Row label="Total cash sales" value={formatCurrency(aggregates.cash)} />
                <Row label="Change given" value={`- ${formatCurrency(changeGiven)}`} />
                <Row label="Cash used" value={`- ${formatCurrency(cashUsed)}`} />
                <div className="my-1 border-t border-slate-200" />
                <Row label="Card sales" value={formatCurrency(aggregates.card)} />
                <Row label="Bank transfer sales" value={formatCurrency(aggregates.bank)} />
                <Row label="Credit sales" value={formatCurrency(aggregates.credit)} />
                <div className="my-1 border-t border-slate-200" />
                <Row
                  label="Expected drawer cash"
                  value={formatCurrency(expectedDrawer)}
                  bold
                />
                <Row label="Actual counted cash" value={formatCurrency(counted)} bold />
                <div
                  className={`mt-1 flex items-center justify-between rounded-lg px-3 py-2 ${
                    difference === 0
                      ? "bg-emerald-50"
                      : difference > 0
                        ? "bg-amber-50"
                        : "bg-rose-50"
                  }`}
                >
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {difference === 0
                      ? "Balanced"
                      : difference > 0
                        ? "Excess"
                        : "Shortage"}
                  </span>
                  <span
                    className={`text-lg font-extrabold ${
                      difference === 0
                        ? "text-emerald-700"
                        : difference > 0
                          ? "text-amber-700"
                          : "text-rose-700"
                    }`}
                  >
                    {formatCurrency(Math.abs(difference))}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Denomination counter (visible when drawer open) */}
          {myDrawer && (
            <div className="pos-card p-5 lg:col-span-2">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Calculator className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    Money roll / denomination count
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Enter the quantity of each note/coin you've counted.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {denominations.map((d) => (
                  <div
                    key={d.value}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-500">MVR</div>
                      <div className="text-base font-extrabold text-slate-900">
                        {d.value}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-lg font-bold text-slate-400">×</span>
                      <input
                        type="number"
                        min={0}
                        value={d.count}
                        onChange={(e) => setDen(d.value, Number(e.target.value))}
                        className="h-9 w-16 rounded-md border border-slate-300 px-2 text-center text-sm font-bold text-slate-900 outline-none focus:border-primary"
                      />
                    </div>
                    <div className="text-sm font-semibold text-slate-700">
                      {formatCurrency(d.value * d.count)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Cash used / paid out */}
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-amber-700" />
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                    Cash used (paid out from drawer)
                  </span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={cashUsedInput}
                    onChange={(e) => setCashUsedInput(e.target.value)}
                    placeholder="Amount (MVR)"
                    className="h-10 w-full sm:w-40 rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-amber-500"
                  />
                  <input
                    type="text"
                    value={cashUsedNote}
                    onChange={(e) => setCashUsedNote(e.target.value)}
                    placeholder="Reason (e.g. expense, refund)"
                    className="h-10 flex-1 rounded-md border border-amber-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-amber-500"
                  />
                  <Button
                    onClick={() => {
                      const amt = Number(cashUsedInput);
                      if (!user || isNaN(amt) || amt <= 0) {
                        toast.error("Enter a valid amount");
                        return;
                      }
                      addCashUsed(user.id, amt);
                      setCloseNotes(
                        (prev) =>
                          (prev ? prev + "\n" : "") +
                          `Cash used ${formatCurrency(amt)}${cashUsedNote ? ` — ${cashUsedNote}` : ""}`
                      );
                      setCashUsedInput("");
                      setCashUsedNote("");
                      toast.success(`Recorded cash used ${formatCurrency(amt)}`);
                    }}
                    className="h-10 bg-amber-600 hover:bg-amber-700"
                  >
                    Record
                  </Button>
                </div>
                <div className="mt-2 text-[11px] text-amber-800">
                  Running total: <strong>{formatCurrency(cashUsed)}</strong>
                </div>
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Closing notes (optional)
                </label>
                <textarea
                  rows={2}
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Anything to flag for admin..."
                />
              </div>

              <Button
                onClick={() => { void handleClose(); }}
                className="mt-3 h-12 w-full bg-rose-600 text-base font-bold hover:bg-rose-700"
              >
                <DoorClosed className="mr-2 h-5 w-5" /> Close drawer · Counted{" "}
                {formatCurrency(counted)}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* History */}
      <div className="pos-card overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-bold text-foreground">
            {isAdmin ? "All cash drawers" : "My cash drawers"}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Cashier</th>
                <th className="px-4 py-3 text-left">Opened</th>
                <th className="px-4 py-3 text-left">Closed</th>
                <th className="px-4 py-3 text-right">Opening</th>
                <th className="px-4 py-3 text-right">Sales</th>
                <th className="px-4 py-3 text-right">Expected</th>
                <th className="px-4 py-3 text-right">Counted</th>
                <th className="px-4 py-3 text-right">Difference</th>
                <th className="px-4 py-3 text-right">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleDrawers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                    <Wallet className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    No drawer history yet.
                  </td>
                </tr>
              ) : (
                visibleDrawers.map((d) => (
                  <tr key={d.id} className="hover:bg-secondary/30">
                    <td className="px-4 py-3 font-medium text-foreground">{d.cashierName}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDateTime(d.openedAt)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {d.closedAt ? formatDateTime(d.closedAt) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">{formatCurrency(d.openingCash)}</td>
                    <td className="px-4 py-3 text-right">
                      {formatCurrency(d.totalSales ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatCurrency(d.expectedCash ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatCurrency(d.countedCash ?? 0)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-bold ${
                        (d.difference ?? 0) === 0
                          ? "text-emerald-600"
                          : (d.difference ?? 0) > 0
                            ? "text-amber-600"
                            : "text-rose-600"
                      }`}
                    >
                      {d.status === "closed" ? formatCurrency(d.difference ?? 0) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {d.status === "open" ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                          OPEN
                        </span>
                      ) : d.approvedByAdmin ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                          <ShieldCheck className="h-3 w-3" /> Approved
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                          Closed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => printDrawer(d)}
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-secondary"
                          title="Print report"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        {isAdmin && d.status === "open" && (
                          <button
                            onClick={() => { void handleForceClose(d); }}
                            className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                            title="Force close drawer"
                          >
                            Force close
                          </button>
                        )}
                        {isAdmin && d.status === "closed" && !d.approvedByAdmin && (
                          <button
                            onClick={() => { void handleApprove(d.id); }}
                            className="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            Approve
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => { void handleRemove(d.id); }}
                            className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100"
                          >
                            Del
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "font-bold text-foreground" : "font-semibold text-foreground"}>
        {value}
      </span>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone?: "rose" | "emerald";
}) {
  const toneClass =
    tone === "rose"
      ? "bg-rose-100 text-rose-700"
      : tone === "emerald"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-primary/10 text-primary";
  return (
    <div className="pos-card p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="truncate text-lg font-extrabold text-foreground">{value}</div>
        </div>
      </div>
    </div>
  );
}
