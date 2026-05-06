import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useSettings } from "@/lib/settings";
import { useCashDrawers } from "@/lib/cashDrawer";
import { useConsignment } from "@/lib/consignment";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { FileSpreadsheet, FileText, Printer } from "lucide-react";
import Logo, { LOGO_URL } from "@/components/Logo";
import { toast } from "sonner";

export type ActivityPeriod = "daily" | "monthly" | "yearly";

interface Props {
  period: ActivityPeriod;
  from: string; // ISO date (yyyy-mm-dd)
  to: string;   // ISO date (yyyy-mm-dd)
}

interface ActivityRow {
  label: string;
  sales: number;
  returns: number;
  net: number;
  bold?: boolean;
}

interface ReportModel {
  generatedAt: string;
  periodLabel: string;
  rangeLabel: string;
  shopName: string;
  activity: ActivityRow[];
  adjustments: { label: string; value: number }[];
  discounts: { label: string; sales: number; returns: number; net: number }[];
  discountTotal: number;
  receiptCounts: { label: string; value: number }[];
  paymentBreakdown: { label: string; value: number; bold?: boolean }[];
  bankTransfers: {
    amount: number;
    customer: string;
    phone: string;
    reference: string;
    notes: string;
  }[];
  bankTransferTotal: number;
  bankTransferCount: number;
  cashDrawer: { label: string; value: number; bold?: boolean }[];
  consignment: { label: string; value: number; bold?: boolean }[];
}

const fmtRangeUS = (from: string, to: string, period: ActivityPeriod): string => {
  const f = new Date(from);
  const t = new Date(to);
  if (period === "daily") {
    const dStr = f.toLocaleDateString("en-US");
    return `${dStr} 12:00:00 AM to ${dStr} 11:59:59 PM`;
  }
  const fmt = (d: Date): string =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  return `${fmt(f)} to ${fmt(t)}`;
};

const periodLabel = (p: ActivityPeriod): string =>
  p === "daily" ? "Daily Sales Report" : p === "monthly" ? "Monthly Sales Report" : "Yearly Sales Report";

export function buildSalesActivity(period: ActivityPeriod, from: string, to: string): ReportModel {
  const sales = useStore.getState().sales;
  const products = useStore.getState().products;
  const customers = useStore.getState().customers;
  const drawers = useCashDrawers.getState().drawers;
  const cons = useConsignment.getState();
  const settings = useSettings.getState();
  const shopName = settings.shopName;

  const fromTs = new Date(from).getTime();
  const toTs = new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1;
  const inRange = (iso: string): boolean => {
    const t = new Date(iso).getTime();
    return t >= fromTs && t <= toTs;
  };

  const inPeriod = sales.filter((s) => inRange(s.date));

  // Live (non-voided) sales contribute to "Sales"; voided sales contribute to "Returns/Reversed".
  const live = inPeriod.filter((s) => !s.voided);
  const voided = inPeriod.filter((s) => s.voided);

  let gstSales = 0;
  let nonGstSales = 0;
  let gstReturns = 0;
  let nonGstReturns = 0;

  const isGstItem = (productId: string, override?: boolean): boolean => {
    if (override !== undefined) return override;
    const p = products.find((x) => x.id === productId);
    return p?.gstApplicable !== false;
  };

  live.forEach((s) =>
    s.items.forEach((it) => {
      if (isGstItem(it.productId, it.gstApplicable)) gstSales += it.total;
      else nonGstSales += it.total;
    })
  );
  voided.forEach((s) =>
    s.items.forEach((it) => {
      if (isGstItem(it.productId, it.gstApplicable)) gstReturns += it.total;
      else nonGstReturns += it.total;
    })
  );

  const subSales = gstSales + nonGstSales;
  const subReturns = gstReturns + nonGstReturns;
  const totalSales = live.reduce((a, b) => a + b.total, 0);
  const totalReturns = voided.reduce((a, b) => a + b.total, 0);

  const activity: ActivityRow[] = [
    { label: "GST Sales", sales: gstSales, returns: gstReturns, net: gstSales - gstReturns },
    { label: "Non-GST Sales", sales: nonGstSales, returns: nonGstReturns, net: nonGstSales - nonGstReturns },
    { label: "Subtotal", sales: subSales, returns: subReturns, net: subSales - subReturns, bold: true },
    { label: "Total Activity", sales: totalSales, returns: totalReturns, net: totalSales - totalReturns, bold: true },
    { label: "Net Sales Activity", sales: totalSales - totalReturns, returns: 0, net: totalSales - totalReturns, bold: true },
  ];

  // Payments
  const sumBy = (arr: typeof live, m: string): number =>
    arr.filter((s) => s.paymentMethod === m).reduce((a, b) => a + b.total, 0);
  const cashIn = sumBy(live, "cash");
  const cardTotal = sumBy(live, "card");
  const bankTotal = sumBy(live, "bank");
  const creditTotal = sumBy(live, "credit");
  const cashOut = sumBy(voided, "cash");
  const netCash = cashIn - cashOut;

  // Adjustments
  const totalAvailableForDeposit = cashIn + cardTotal + bankTotal - cashOut;
  const adjustments = [
    { label: "Charged to account / Credit sales", value: creditTotal },
    { label: "Gift cards / vouchers", value: 0 },
    { label: "Payouts", value: 0 },
    { label: "Cash used / expenses", value: 0 },
    { label: "Total Available for Deposit", value: totalAvailableForDeposit },
  ];

  // Discount breakout — store currently has no discount entity. Keep zero rows.
  const discounts = [
    { label: "Global", sales: 0, returns: 0, net: 0 },
    { label: "Unknown", sales: 0, returns: 0, net: 0 },
  ];
  const discountTotal = 0;

  const receiptCounts = [
    { label: "Total sales receipts", value: live.length },
    { label: "Returns", value: 0 },
    { label: "Reversed / cancelled bills", value: voided.length },
    { label: "Payouts", value: 0 },
  ];

  const paymentBreakdown = [
    { label: "Cash paid in", value: cashIn },
    { label: "Cash paid out", value: cashOut },
    { label: "Net cash", value: netCash, bold: true },
    { label: "Card total", value: cardTotal },
    { label: "Bank transfer total", value: bankTotal },
    { label: "Credit total", value: creditTotal },
  ];

  // Bank transfer listing
  const bankSales = live.filter((s) => s.paymentMethod === "bank");
  const bankTransfers = bankSales.map((s) => {
    const c = s.customerId ? customers.find((x) => x.id === s.customerId) : null;
    return {
      amount: s.total,
      customer: c?.name ?? "Walk-in",
      phone: c?.phone ?? "",
      reference: s.id.slice(-8).toUpperCase(),
      notes: "",
    };
  });
  const bankTransferTotal = bankTransfers.reduce((a, b) => a + b.amount, 0);

  // Cash drawer (latest drawer that closed in the range; otherwise latest open)
  const closedInRange = drawers
    .filter((d) => d.closedAt && inRange(d.closedAt))
    .sort((a, b) => (a.closedAt! < b.closedAt! ? 1 : -1));
  const drawer = closedInRange[0] ?? drawers.find((d) => d.status === "open");
  const opening = drawer?.openingCash ?? 0;
  const drawerCashSales = drawer?.cashSales ?? cashIn;
  const drawerCardSales = drawer?.cardSales ?? cardTotal;
  const drawerBankSales = drawer?.bankSales ?? bankTotal;
  const drawerCreditSales = drawer?.creditSales ?? creditTotal;
  const drawerTotalSales =
    drawer?.totalSales ?? drawerCashSales + drawerCardSales + drawerBankSales + drawerCreditSales;
  const change = drawer?.changeGiven ?? 0;
  const cashUsed = drawer?.cashUsed ?? 0;
  const expectedCash = drawer?.expectedCash ?? opening + drawerCashSales - change - cashUsed;
  const counted = drawer?.countedCash ?? 0;
  const diff = drawer?.difference ?? counted - expectedCash;

  const cashDrawer = [
    { label: "Total sales for the day", value: drawerTotalSales, bold: true },
    { label: "Cash sales", value: drawerCashSales },
    { label: "Card sales", value: drawerCardSales },
    { label: "Bank transfer sales", value: drawerBankSales },
    { label: "Credit sales", value: drawerCreditSales },
    { label: "Opening cash", value: opening },
    { label: "Change given", value: change },
    { label: "Cash used", value: cashUsed },
    { label: "Expected drawer cash", value: expectedCash, bold: true },
    { label: "Actual drawer cash", value: counted },
    { label: diff >= 0 ? "Excess" : "Shortage", value: Math.abs(diff), bold: true },
  ];

  // Consignment
  const consInRange = cons.sales.filter((s) => inRange(s.createdAt));
  const consSettleInRange = cons.settlements.filter((s) => inRange(s.paidAt));
  const consSalesTotal = consInRange.reduce((a, s) => a + s.totalAmount, 0);
  const consPayable = consInRange.reduce((a, s) => a + s.payableAmount, 0);
  const consCommission = consInRange.reduce((a, s) => a + s.commission, 0);
  const consPaid = consSettleInRange.reduce((a, s) => a + s.amount, 0);
  // Unpaid balance across all owners (lifetime)
  const lifetimePayable = cons.sales.reduce((a, s) => a + s.payableAmount, 0);
  const lifetimePaid = cons.settlements.reduce((a, s) => a + s.amount, 0);
  const consignment = [
    { label: "Consignment sales total", value: consSalesTotal },
    { label: "Owner payable amount", value: consPayable },
    { label: "Shop commission", value: consCommission },
    { label: "Settlements paid (period)", value: consPaid },
    { label: "Unpaid settlement balance", value: Math.max(0, lifetimePayable - lifetimePaid), bold: true },
  ];

  return {
    generatedAt: new Date().toLocaleString("en-US"),
    periodLabel: periodLabel(period),
    rangeLabel: fmtRangeUS(from, to, period),
    shopName,
    activity,
    adjustments,
    discounts,
    discountTotal,
    receiptCounts,
    paymentBreakdown,
    bankTransfers,
    bankTransferTotal,
    bankTransferCount: bankTransfers.length,
    cashDrawer,
    consignment,
  };
}

const renderHTML = (m: ReportModel): string => {
  const sect = (title: string, body: string): string => `
    <section class="sect">
      <h2>${title}</h2>
      ${body}
    </section>`;

  const moneyTbl = (
    cols: string[],
    rows: { cells: (string | number)[]; bold?: boolean }[]
  ): string => `
    <table class="t">
      <thead><tr>${cols.map((c, i) => `<th class="${i === 0 ? "l" : "r"}">${c}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows
          .map(
            (r) =>
              `<tr class="${r.bold ? "b" : ""}">${r.cells
                .map(
                  (v, i) =>
                    `<td class="${i === 0 ? "l" : "r"}">${typeof v === "number" ? formatCurrency(v) : v}</td>`
                )
                .join("")}</tr>`
          )
          .join("")}
      </tbody>
    </table>`;

  const kvTbl = (rows: { label: string; value: number; bold?: boolean }[]): string =>
    moneyTbl(
      ["", "Amount"],
      rows.map((r) => ({ cells: [r.label, r.value], bold: r.bold }))
    );

  const countTbl = (rows: { label: string; value: number }[]): string => `
    <table class="t">
      <tbody>
        ${rows
          .map((r) => `<tr><td class="l">${r.label}</td><td class="r">${r.value}</td></tr>`)
          .join("")}
      </tbody>
    </table>`;

  const activityTbl = moneyTbl(
    ["", "Sales", "Returns", "Net"],
    m.activity.map((r) => ({ cells: [r.label, r.sales, r.returns, r.net], bold: r.bold }))
  );

  const discountTbl = moneyTbl(
    ["Reason", "Sales", "Returns", "Net"],
    [
      ...m.discounts.map((d) => ({ cells: [d.label, d.sales, d.returns, d.net] })),
      { cells: ["Total discounts", m.discountTotal, "", ""], bold: true },
    ]
  );

  const bankList = m.bankTransfers.length
    ? `<table class="t">
        <thead><tr><th class="r">Amount</th><th class="l">Customer</th><th class="l">Mobile</th><th class="l">Ref</th><th class="l">Notes</th></tr></thead>
        <tbody>
          ${m.bankTransfers
            .map(
              (b) =>
                `<tr><td class="r">${formatCurrency(b.amount)}</td><td class="l">${b.customer}</td><td class="l">${b.phone}</td><td class="l">${b.reference}</td><td class="l">${b.notes}</td></tr>`
            )
            .join("")}
          <tr class="b"><td class="r">${formatCurrency(m.bankTransferTotal)}</td><td class="l" colspan="4">Total transfers — ${m.bankTransferCount}</td></tr>
        </tbody>
      </table>`
    : `<div class="empty">No bank transfers in this period.</div>`;

  return `
    <div class="header">
      <img src="${LOGO_URL}" alt="logo"/>
      <div>
        <h1>${m.periodLabel}</h1>
        <div class="sub">${m.shopName} · Generated ${m.generatedAt}</div>
        <div class="sub">Date: ${m.rangeLabel}</div>
      </div>
    </div>
    ${sect("Sales Activity", activityTbl)}
    ${sect("Sales Adjustments", kvTbl(m.adjustments))}
    ${sect("Discount Breakout", discountTbl)}
    ${sect("Receipt Counts", countTbl(m.receiptCounts))}
    ${sect("Payment Method Breakdown", kvTbl(m.paymentBreakdown))}
    ${sect("Bank Transfer Listing", bankList)}
    ${sect("Cash Drawer Summary", kvTbl(m.cashDrawer))}
    ${sect("Consignment Section", kvTbl(m.consignment))}
  `;
};

const printableDocument = (m: ReportModel): string => `
<!doctype html><html><head><meta charset="utf-8"/>
<title>${m.periodLabel} — ${m.shopName}</title>
<style>
@page { size: A4; margin: 14mm; }
body{font-family:-apple-system,Segoe UI,sans-serif;color:#1f2418;margin:0;padding:24px;position:relative}
body::before{content:"";position:fixed;inset:0;background:url('${LOGO_URL}') center/45% no-repeat;opacity:.05;pointer-events:none;z-index:0}
.header{display:flex;align-items:center;gap:16px;border-bottom:3px solid #d97a17;padding-bottom:12px;margin-bottom:18px;position:relative;z-index:1}
.header img{width:56px;height:56px;border-radius:50%;border:2px solid #1f2418;background:#fff}
.header h1{margin:0;font-size:22px;color:#5a6b1f}
.header .sub{font-size:11px;color:#666}
.sect{margin:14px 0;position:relative;z-index:1;page-break-inside:avoid}
.sect h2{font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:#5a6b1f;border-bottom:1px solid #d97a17;padding-bottom:4px;margin:0 0 8px}
.t{width:100%;border-collapse:collapse;font-size:11px}
.t th{background:#5a6b1f;color:#fff;text-transform:uppercase;font-size:9px;letter-spacing:1px;padding:6px 8px}
.t td{border:1px solid #e3e3d8;padding:6px 8px}
.t .l{text-align:left}
.t .r{text-align:right;font-variant-numeric:tabular-nums}
.t tr.b td{font-weight:700;background:#faf8f1}
.empty{font-size:11px;color:#888;padding:8px}
</style></head><body>
${renderHTML(m)}
<div style="margin-top:16px;font-size:10px;color:#888;text-align:center;border-top:1px solid #e3e3d8;padding-top:8px">© ${new Date().getFullYear()} ${m.shopName} · Confidential — Internal Use Only</div>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
</body></html>`;

const xlsDocument = (m: ReportModel): string => {
  const row = (cells: (string | number)[], bold = false): string =>
    `<tr>${cells
      .map(
        (c) =>
          `<td${bold ? ' style="font-weight:bold"' : ""}>${typeof c === "number" ? c.toFixed(2) : c}</td>`
      )
      .join("")}</tr>`;
  const header = (label: string): string =>
    `<tr><td colspan="5" style="background:#5a6b1f;color:#fff;font-weight:bold">${label}</td></tr>`;
  const rows: string[] = [];
  rows.push(row([m.periodLabel]));
  rows.push(row([`Period: ${m.rangeLabel}`]));
  rows.push(row([`Generated: ${m.generatedAt}`]));
  rows.push(row([""]));

  rows.push(header("Sales Activity"));
  rows.push(row(["", "Sales", "Returns", "Net"], true));
  m.activity.forEach((a) => rows.push(row([a.label, a.sales, a.returns, a.net], a.bold)));

  rows.push(row([""]));
  rows.push(header("Sales Adjustments"));
  m.adjustments.forEach((a) => rows.push(row([a.label, a.value])));

  rows.push(row([""]));
  rows.push(header("Discount Breakout"));
  rows.push(row(["Reason", "Sales", "Returns", "Net"], true));
  m.discounts.forEach((d) => rows.push(row([d.label, d.sales, d.returns, d.net])));
  rows.push(row(["Total discounts", m.discountTotal], true));

  rows.push(row([""]));
  rows.push(header("Receipt Counts"));
  m.receiptCounts.forEach((r) => rows.push(row([r.label, r.value])));

  rows.push(row([""]));
  rows.push(header("Payment Method Breakdown"));
  m.paymentBreakdown.forEach((r) => rows.push(row([r.label, r.value], r.bold)));

  rows.push(row([""]));
  rows.push(header("Bank Transfer Listing"));
  rows.push(row(["Amount", "Customer", "Mobile", "Reference", "Notes"], true));
  m.bankTransfers.forEach((b) => rows.push(row([b.amount, b.customer, b.phone, b.reference, b.notes])));
  rows.push(row(["Total", m.bankTransferTotal, `${m.bankTransferCount} transfers`], true));

  rows.push(row([""]));
  rows.push(header("Cash Drawer Summary"));
  m.cashDrawer.forEach((r) => rows.push(row([r.label, r.value], r.bold)));

  rows.push(row([""]));
  rows.push(header("Consignment Section"));
  m.consignment.forEach((r) => rows.push(row([r.label, r.value], r.bold)));

  return `<!doctype html><html><head><meta charset="utf-8"/></head><body><table border="1">${rows.join("")}</table></body></html>`;
};

export default function SalesActivityReport({ period, from, to }: Props) {
  const model = useMemo(() => buildSalesActivity(period, from, to), [period, from, to]);

  const printIt = (): void => {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      toast.error("Popup blocked");
      return;
    }
    w.document.write(printableDocument(model));
    w.document.close();
  };

  const downloadExcel = (): void => {
    const blob = new Blob([xlsDocument(model)], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${model.periodLabel.replace(/\s+/g, "_")}_${Date.now()}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported to Excel");
  };

  const renderActivityRow = (r: ActivityRow): JSX.Element => (
    <tr key={r.label} className={r.bold ? "font-semibold bg-muted/40" : ""}>
      <td className="px-3 py-2">{r.label}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.sales)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.returns)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.net)}</td>
    </tr>
  );

  const renderKv = (
    rows: { label: string; value: number; bold?: boolean }[]
  ): JSX.Element => (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className={r.bold ? "font-semibold bg-muted/40" : ""}>
            <td className="px-3 py-2">{r.label}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Logo size={48} ring />
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{model.periodLabel}</div>
            <div className="text-sm font-semibold">{model.shopName}</div>
            <div className="mt-0.5 text-sm font-medium">Date: {model.rangeLabel}</div>
            <div className="text-xs text-muted-foreground">Generated: {model.generatedAt}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadExcel} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" onClick={printIt} className="gap-2">
            <FileText className="h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" onClick={printIt} className="gap-2">
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      <Section title="Sales Activity">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">&nbsp;</th>
              <th className="px-3 py-2 text-right">Sales</th>
              <th className="px-3 py-2 text-right">Returns</th>
              <th className="px-3 py-2 text-right">Net</th>
            </tr>
          </thead>
          <tbody>{model.activity.map(renderActivityRow)}</tbody>
        </table>
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Sales Adjustments">{renderKv(model.adjustments)}</Section>
        <Section title="Receipt Counts">
          <table className="w-full text-sm">
            <tbody>
              {model.receiptCounts.map((r) => (
                <tr key={r.label}>
                  <td className="px-3 py-2">{r.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      <Section title="Discount Breakout">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Reason</th>
              <th className="px-3 py-2 text-right">Sales</th>
              <th className="px-3 py-2 text-right">Returns</th>
              <th className="px-3 py-2 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {model.discounts.map((d) => (
              <tr key={d.label}>
                <td className="px-3 py-2">{d.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(d.sales)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(d.returns)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(d.net)}</td>
              </tr>
            ))}
            <tr className="font-semibold bg-muted/40">
              <td className="px-3 py-2">Total discounts</td>
              <td className="px-3 py-2 text-right tabular-nums" colSpan={3}>
                {formatCurrency(model.discountTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="Payment Method Breakdown">{renderKv(model.paymentBreakdown)}</Section>

      <Section title="Bank Transfer Listing">
        {model.bankTransfers.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">No bank transfers in this period.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Customer</th>
                <th className="px-3 py-2 text-left">Mobile</th>
                <th className="px-3 py-2 text-left">Reference</th>
                <th className="px-3 py-2 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {model.bankTransfers.map((b, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(b.amount)}</td>
                  <td className="px-3 py-2">{b.customer}</td>
                  <td className="px-3 py-2">{b.phone}</td>
                  <td className="px-3 py-2">{b.reference}</td>
                  <td className="px-3 py-2">{b.notes}</td>
                </tr>
              ))}
              <tr className="font-semibold bg-muted/40">
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(model.bankTransferTotal)}</td>
                <td className="px-3 py-2" colSpan={4}>
                  Total transfers — {model.bankTransferCount}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Cash Drawer Summary">{renderKv(model.cashDrawer)}</Section>
        <Section title="Consignment Section">{renderKv(model.consignment)}</Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-secondary/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
