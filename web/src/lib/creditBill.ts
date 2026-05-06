import { formatCurrency } from "./format";
import { useSettings } from "./settings";
import { LOGO_URL } from "@/components/Logo";
import { htmlToPdfBlob } from "./pdf";

const escape = (s: string): string =>
  String(s).replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );

/* ------------------------------------------------------------------ */
/*                       Credit Bill Slip                              */
/* ------------------------------------------------------------------ */

export interface CreditBillLine {
  name: string;
  qty: number;
  unit?: string;
  price: number;
  total: number;
  gstApplicable?: boolean;
}

export interface CreditBillData {
  invoiceNo: string;
  saleId: string;
  date: string;
  cashierName?: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  items: CreditBillLine[];
  subtotal: number;
  gstSubtotal: number;
  nonGstSubtotal: number;
  discount: number;
  bag: number;
  gstPercent: number;
  gstAmount: number;
  total: number;
  previousBalance: number;
  newBalance: number;
  creditLimit: number;
  remainingCreditLimit: number;
  publicLink?: string;
  shopName: string;
  footer: string;
}

const buildCreditBillHtml = (d: CreditBillData): string => {
  const s = useSettings.getState();
  const dateStr = new Date(d.date).toLocaleString("en-GB");

  const hasMixed = d.gstSubtotal > 0 && d.nonGstSubtotal > 0;
  const rows = d.items
    .map((i, idx) => {
      const tag =
        i.gstApplicable === false
          ? `<span style="background:#fee2e2;color:#991b1b;border-radius:3px;padding:1px 5px;font-size:9px;font-weight:700;margin-left:6px">NON-GST</span>`
          : "";
      return `<tr>
        <td style="text-align:center">${idx + 1}</td>
        <td><b>${escape(i.name)}</b>${hasMixed ? tag : ""}</td>
        <td style="text-align:right">${i.qty}${i.unit ? " " + escape(i.unit) : ""}</td>
        <td style="text-align:right">${formatCurrency(i.price)}</td>
        <td style="text-align:right;font-weight:600">${formatCurrency(i.total)}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>Credit Bill ${escape(d.invoiceNo)}</title>
<style>
  *{box-sizing:border-box}
  @page { size: A4; margin: 12mm; }
  body{font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;margin:0;padding:0;background:#f1f5f9}
  .page{position:relative;width:210mm;min-height:297mm;margin:12px auto;padding:14mm;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.08);overflow:hidden}
  .watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-20deg);width:380px;height:380px;opacity:.05;pointer-events:none;z-index:0}
  .watermark img{width:100%;height:100%;object-fit:contain}
  .content{position:relative;z-index:1}

  .header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #b45309;padding-bottom:14px;margin-bottom:18px}
  .brand{display:flex;align-items:center;gap:14px}
  .brand img{width:60px;height:60px;border-radius:50%;object-fit:cover;border:2px solid #b45309;background:#fff}
  .brand .name{font-size:22px;font-weight:800;letter-spacing:-0.01em;line-height:1.1}
  .brand .tag{font-size:11px;color:#b45309;font-weight:700;letter-spacing:.18em;text-transform:uppercase;margin-top:2px}
  .contact{text-align:right;font-size:11px;line-height:1.55;color:#475569}
  .contact b{color:#0f172a}

  .title-row{display:flex;justify-content:space-between;align-items:center;margin:14px 0 16px}
  .title{font-size:30px;font-weight:900;letter-spacing:.04em;color:#b45309}
  .title-meta{text-align:right;font-size:12px;color:#334155;line-height:1.6}
  .title-meta .num{font-size:18px;font-weight:800;color:#0f172a}
  .badge{display:inline-block;background:#fde68a;color:#7c2d12;font-size:9px;font-weight:800;letter-spacing:.1em;padding:3px 8px;border-radius:4px;margin-left:8px;vertical-align:middle}

  .blocks{display:grid;grid-template-columns:1.4fr 1fr;gap:14px;margin-bottom:14px}
  .block{border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;background:#fffbeb}
  .block .label{font-size:9px;font-weight:800;letter-spacing:.16em;color:#b45309;text-transform:uppercase;margin-bottom:4px}
  .block .v{font-size:13px;color:#0f172a;line-height:1.55}
  .block .v b{font-weight:700}

  table.items{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px}
  table.items thead th{background:#b45309;color:#fff;text-align:left;padding:8px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
  table.items tbody td{padding:7px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}
  table.items tbody tr:nth-child(even) td{background:#fffbeb}

  .summary{display:grid;grid-template-columns:1.2fr 1fr;gap:14px;align-items:flex-start}
  .creditbox{border:2px solid #b45309;border-radius:10px;padding:12px 14px;background:#fff7ed;font-size:12px;color:#7c2d12}
  .creditbox h4{margin:0 0 6px;font-size:11px;letter-spacing:.16em;text-transform:uppercase}
  .creditbox .row{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed #fed7aa}
  .creditbox .row:last-child{border-bottom:none;font-weight:800;font-size:13px;padding-top:6px}
  .totals{border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px}
  .totals .row{display:flex;justify-content:space-between;padding:8px 14px;border-bottom:1px solid #e2e8f0}
  .totals .row:last-child{border-bottom:none}
  .totals .row.grand{background:#b45309;color:#fff;font-size:16px;font-weight:800;letter-spacing:.04em}
  .totals .row.grand span:last-child{font-size:18px}

  .signs{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:32px;padding-top:6px}
  .sign{border-top:1.5px solid #0f172a;padding-top:6px;font-size:11px;color:#475569}
  .sign b{color:#0f172a;font-size:12px}

  .doc-footer{margin-top:18px;padding-top:10px;border-top:1px dashed #cbd5e1;text-align:center;font-size:10px;color:#64748b}
  .qrline{margin-top:10px;font-size:10px;color:#475569;text-align:center;word-break:break-all}

  .toolbar{position:sticky;top:0;display:flex;justify-content:flex-end;gap:8px;padding:8px 12px;background:#0f172a}
  .toolbar button{background:#fff;color:#0f172a;border:0;border-radius:6px;padding:8px 14px;font-weight:700;cursor:pointer;font-size:12px}
  @media print { .toolbar{display:none} body{background:#fff} .page{box-shadow:none;margin:0;width:auto;min-height:auto} }
</style></head><body>
<div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button></div>
<div class="page">
  <div class="watermark"><img src="${escape(LOGO_URL)}" alt=""/></div>
  <div class="content">
    <div class="header">
      <div class="brand">
        <img src="${escape(LOGO_URL)}" alt="logo"/>
        <div>
          <div class="name">${escape(d.shopName)}</div>
          <div class="tag">Credit Sale Bill Slip</div>
        </div>
      </div>
      <div class="contact">
        ${s.companyAddress ? `${escape(s.companyAddress)}<br/>` : ""}
        ${s.companyPhone ? `<b>Tel:</b> ${escape(s.companyPhone)}<br/>` : ""}
        ${s.companyEmail ? `<b>Email:</b> ${escape(s.companyEmail)}<br/>` : ""}
        ${s.companyRegNo ? `<b>Reg No:</b> ${escape(s.companyRegNo)}` : ""}
      </div>
    </div>

    <div class="title-row">
      <div class="title">CREDIT BILL<span class="badge">CREDIT</span></div>
      <div class="title-meta">
        <div class="num">No. ${escape(d.invoiceNo)}</div>
        <div><b>Date:</b> ${escape(dateStr)}</div>
        ${d.cashierName ? `<div><b>Cashier:</b> ${escape(d.cashierName)}</div>` : ""}
      </div>
    </div>

    <div class="blocks">
      <div class="block">
        <div class="label">Bill To / Customer</div>
        <div class="v">
          <b>${escape(d.customerName)}</b>
          ${d.customerPhone ? `<br/>Tel: ${escape(d.customerPhone)}` : ""}
          ${d.customerAddress ? `<br/>${escape(d.customerAddress)}` : ""}
        </div>
      </div>
      <div class="block">
        <div class="label">Account Reference</div>
        <div class="v">
          <b>Sale ID:</b> ${escape(d.saleId.slice(-12).toUpperCase())}<br/>
          <b>Type:</b> Credit / On Account
        </div>
      </div>
    </div>

    <table class="items">
      <thead><tr>
        <th style="width:36px;text-align:center">#</th>
        <th>Item</th>
        <th style="width:80px;text-align:right">Qty</th>
        <th style="width:90px;text-align:right">Unit Price</th>
        <th style="width:100px;text-align:right">Line Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="summary">
      <div class="creditbox">
        <h4>Credit Account Summary</h4>
        <div class="row"><span>Previous balance</span><b>${formatCurrency(d.previousBalance)}</b></div>
        <div class="row"><span>This bill</span><b>+ ${formatCurrency(d.total)}</b></div>
        <div class="row"><span>Credit limit</span><b>${formatCurrency(d.creditLimit)}</b></div>
        <div class="row"><span>Remaining limit</span><b>${formatCurrency(d.remainingCreditLimit)}</b></div>
        <div class="row"><span>NEW BALANCE</span><b>${formatCurrency(d.newBalance)}</b></div>
      </div>
      <div class="totals">
        ${hasMixed ? `<div class="row"><span>GST items subtotal</span><span>${formatCurrency(d.gstSubtotal)}</span></div><div class="row"><span>Non-GST items subtotal</span><span>${formatCurrency(d.nonGstSubtotal)}</span></div>` : ""}
        <div class="row"><span>Sub Total</span><span>${formatCurrency(d.subtotal)}</span></div>
        ${d.discount ? `<div class="row"><span>Discount</span><span>- ${formatCurrency(d.discount)}</span></div>` : ""}
        ${d.bag ? `<div class="row"><span>Plastic bag fee</span><span>${formatCurrency(d.bag)}</span></div>` : ""}
        ${d.gstAmount ? `<div class="row"><span>GST (${d.gstPercent}%)</span><span>${formatCurrency(d.gstAmount)}</span></div>` : ""}
        <div class="row grand"><span>TOTAL CREDIT (MVR)</span><span>${formatCurrency(d.total)}</span></div>
      </div>
    </div>

    <div class="signs">
      <div class="sign">
        <b>Received By (Customer)</b><br/>
        ${escape(d.customerName)}<br/>
        <span style="font-size:10px">Signature / Date</span>
      </div>
      <div class="sign" style="text-align:right">
        <b>Issued By</b><br/>
        ${escape(d.cashierName ?? "Cashier")}<br/>
        <span style="font-size:10px">${escape(d.shopName)}</span>
      </div>
    </div>

    <div class="doc-footer">${escape(d.footer)} · Goods sold on credit remain payable in full on demand. Computer generated bill.</div>
  </div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},400)};</script>
</body></html>`;
};

export const printCreditBill = (d: CreditBillData): void => {
  const w = window.open("", "_blank", "width=900,height=900");
  if (!w) return;
  w.document.write(buildCreditBillHtml(d));
  w.document.close();
};

export const creditBillFileName = (d: CreditBillData): string =>
  `credit-bill-${d.invoiceNo}.pdf`;

export const generateCreditBillPdf = async (
  d: CreditBillData
): Promise<{ blob: Blob; file: File; filename: string }> => {
  const html = buildCreditBillHtml(d);
  return await htmlToPdfBlob(html, creditBillFileName(d));
};

/* ------------------------------------------------------------------ */
/*                    Customer Statement                                */
/* ------------------------------------------------------------------ */

export interface StatementEntry {
  date: string;
  type: "sale" | "payment" | "adjust";
  reference?: string;
  note?: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface StatementData {
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  totalSales: number;
  totalPayments: number;
  totalAdjustments: number;
  closingBalance: number;
  creditLimit: number;
  entries: StatementEntry[];
  publicLink?: string;
  shopName: string;
  footer: string;
}

const buildStatementHtml = (d: StatementData): string => {
  const s = useSettings.getState();
  const periodStr = `${new Date(d.periodStart).toLocaleDateString("en-GB")} → ${new Date(d.periodEnd).toLocaleDateString("en-GB")}`;
  const generatedStr = new Date().toLocaleString("en-GB");

  const rows = d.entries
    .map(
      (e) => `<tr>
        <td>${escape(new Date(e.date).toLocaleDateString("en-GB"))}</td>
        <td style="text-transform:capitalize">${escape(e.type)}</td>
        <td>${escape(e.reference ?? "")}${e.note ? `<div style="font-size:10px;color:#64748b">${escape(e.note)}</div>` : ""}</td>
        <td style="text-align:right;color:#b91c1c">${e.debit > 0 ? formatCurrency(e.debit) : ""}</td>
        <td style="text-align:right;color:#15803d">${e.credit > 0 ? formatCurrency(e.credit) : ""}</td>
        <td style="text-align:right;font-weight:600">${formatCurrency(e.balance)}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>Statement — ${escape(d.customerName)}</title>
<style>
  *{box-sizing:border-box}
  @page { size: A4; margin: 12mm; }
  body{font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;margin:0;padding:0;background:#f1f5f9}
  .page{position:relative;width:210mm;min-height:297mm;margin:12px auto;padding:14mm;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.08);overflow:hidden}
  .watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-20deg);width:380px;height:380px;opacity:.05;pointer-events:none;z-index:0}
  .watermark img{width:100%;height:100%;object-fit:contain}
  .content{position:relative;z-index:1}
  .header{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid #0f766e;padding-bottom:14px;margin-bottom:18px}
  .brand{display:flex;align-items:center;gap:14px}
  .brand img{width:60px;height:60px;border-radius:50%;object-fit:cover;border:2px solid #0f766e;background:#fff}
  .brand .name{font-size:22px;font-weight:800;line-height:1.1}
  .brand .tag{font-size:11px;color:#0f766e;font-weight:700;letter-spacing:.18em;text-transform:uppercase;margin-top:2px}
  .contact{text-align:right;font-size:11px;line-height:1.55;color:#475569}
  .contact b{color:#0f172a}
  .title-row{display:flex;justify-content:space-between;align-items:center;margin:14px 0 16px}
  .title{font-size:28px;font-weight:900;letter-spacing:.04em;color:#0f766e}
  .title-meta{text-align:right;font-size:12px;color:#334155;line-height:1.6}
  .blocks{display:grid;grid-template-columns:1.4fr 1fr;gap:14px;margin-bottom:14px}
  .block{border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;background:#f0fdfa}
  .block .label{font-size:9px;font-weight:800;letter-spacing:.16em;color:#0f766e;text-transform:uppercase;margin-bottom:4px}
  .block .v{font-size:13px;line-height:1.55}
  .summary-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
  .card{border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;background:#fff}
  .card .l{font-size:9px;font-weight:800;letter-spacing:.14em;color:#64748b;text-transform:uppercase}
  .card .v{font-size:15px;font-weight:800;margin-top:4px}
  .card.opening{background:#fefce8;border-color:#fde68a}
  .card.sales{background:#fef2f2;border-color:#fecaca}
  .card.paid{background:#f0fdf4;border-color:#bbf7d0}
  .card.closing{background:#0f766e;color:#fff;border-color:#0f766e}
  .card.closing .l{color:#a7f3d0}
  table.ledger{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px}
  table.ledger thead th{background:#0f766e;color:#fff;text-align:left;padding:8px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
  table.ledger tbody td{padding:6px 8px;border-bottom:1px solid #e5e7eb}
  table.ledger tbody tr:nth-child(even) td{background:#f8fafc}
  .doc-footer{margin-top:18px;padding-top:10px;border-top:1px dashed #cbd5e1;text-align:center;font-size:10px;color:#64748b}
  .qrline{margin-top:10px;font-size:10px;color:#475569;text-align:center;word-break:break-all}
  .toolbar{position:sticky;top:0;display:flex;justify-content:flex-end;gap:8px;padding:8px 12px;background:#0f172a}
  .toolbar button{background:#fff;color:#0f172a;border:0;border-radius:6px;padding:8px 14px;font-weight:700;cursor:pointer;font-size:12px}
  @media print { .toolbar{display:none} body{background:#fff} .page{box-shadow:none;margin:0;width:auto;min-height:auto} }
</style></head><body>
<div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button></div>
<div class="page">
  <div class="watermark"><img src="${escape(LOGO_URL)}" alt=""/></div>
  <div class="content">
    <div class="header">
      <div class="brand">
        <img src="${escape(LOGO_URL)}" alt="logo"/>
        <div>
          <div class="name">${escape(d.shopName)}</div>
          <div class="tag">Customer Credit Statement</div>
        </div>
      </div>
      <div class="contact">
        ${s.companyAddress ? `${escape(s.companyAddress)}<br/>` : ""}
        ${s.companyPhone ? `<b>Tel:</b> ${escape(s.companyPhone)}<br/>` : ""}
        ${s.companyEmail ? `<b>Email:</b> ${escape(s.companyEmail)}<br/>` : ""}
        ${s.companyRegNo ? `<b>Reg No:</b> ${escape(s.companyRegNo)}` : ""}
      </div>
    </div>

    <div class="title-row">
      <div class="title">STATEMENT OF ACCOUNT</div>
      <div class="title-meta">
        <div><b>Period:</b> ${escape(periodStr)}</div>
        <div><b>Generated:</b> ${escape(generatedStr)}</div>
      </div>
    </div>

    <div class="blocks">
      <div class="block">
        <div class="label">Customer</div>
        <div class="v">
          <b>${escape(d.customerName)}</b>
          ${d.customerPhone ? `<br/>Tel: ${escape(d.customerPhone)}` : ""}
          ${d.customerAddress ? `<br/>${escape(d.customerAddress)}` : ""}
        </div>
      </div>
      <div class="block">
        <div class="label">Credit Limit</div>
        <div class="v"><b>${formatCurrency(d.creditLimit)}</b></div>
        <div class="label" style="margin-top:8px">Closing balance</div>
        <div class="v"><b style="color:#b45309">${formatCurrency(d.closingBalance)}</b></div>
      </div>
    </div>

    <div class="summary-cards">
      <div class="card opening"><div class="l">Opening Balance</div><div class="v">${formatCurrency(d.openingBalance)}</div></div>
      <div class="card sales"><div class="l">Credit Sales</div><div class="v">+ ${formatCurrency(d.totalSales)}</div></div>
      <div class="card paid"><div class="l">Payments Received</div><div class="v">- ${formatCurrency(d.totalPayments)}</div></div>
      <div class="card closing"><div class="l">Closing Balance</div><div class="v">${formatCurrency(d.closingBalance)}</div></div>
    </div>

    <table class="ledger">
      <thead><tr>
        <th style="width:90px">Date</th>
        <th style="width:80px">Type</th>
        <th>Reference / Note</th>
        <th style="width:100px;text-align:right">Debit (Sale)</th>
        <th style="width:100px;text-align:right">Credit (Paid)</th>
        <th style="width:100px;text-align:right">Balance</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="6" style="text-align:center;padding:20px;color:#64748b">No transactions in this period.</td></tr>`}</tbody>
    </table>

    <div class="doc-footer">${escape(d.footer)} · Computer generated statement. Please settle outstanding amounts on or before due date.</div>
  </div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},400)};</script>
</body></html>`;
};

export const printCreditStatement = (d: StatementData): void => {
  const w = window.open("", "_blank", "width=900,height=900");
  if (!w) return;
  w.document.write(buildStatementHtml(d));
  w.document.close();
};

export const creditStatementFileName = (d: StatementData): string => {
  const safe = d.customerName.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_-]/g, "");
  return `statement-${safe}-${d.periodStart}-to-${d.periodEnd}.pdf`;
};

export const generateCreditStatementPdf = async (
  d: StatementData
): Promise<{ blob: Blob; file: File; filename: string }> => {
  const html = buildStatementHtml(d);
  return await htmlToPdfBlob(html, creditStatementFileName(d));
};
