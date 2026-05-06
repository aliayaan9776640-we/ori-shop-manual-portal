import { formatCurrency } from "./format";
import { useSettings } from "./settings";
import { LOGO_URL } from "@/components/Logo";

export interface ReceiptLine {
  name: string;
  qty: number;
  price: number;
  total: number;
  gstApplicable?: boolean;
}

export interface ReceiptData {
  saleId: string;
  invoiceNo?: string;
  date: string;
  cashierName?: string;
  customerName?: string;
  customerPhone?: string;
  items: ReceiptLine[];
  subtotal: number;
  gstSubtotal?: number;
  nonGstSubtotal?: number;
  discount: number;
  bag: number;
  cardFee: number;
  gstAmount: number;
  gstPercent: number;
  total: number;
  paid?: number;
  change?: number;
  payment: string;
  shopName: string;
  footer: string;
}

const buildReceiptHtml = (d: ReceiptData): string => {
  const itemRows = d.items
    .map(
      (i) =>
        `<tr><td>${escape(i.name)}</td><td style="text-align:right">${i.qty}</td><td style="text-align:right">${formatCurrency(
          i.price
        )}</td><td style="text-align:right">${formatCurrency(i.total)}</td></tr>`
    )
    .join("");

  const inv = d.invoiceNo ?? d.saleId.slice(-8).toUpperCase();

  return `<!doctype html><html><head><meta charset="utf-8"/><title>Receipt ${inv}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:ui-monospace,Menlo,Consolas,monospace;padding:16px;color:#111;max-width:380px;margin:0 auto}
  h2{margin:0 0 4px;text-align:center;font-size:18px}
  .muted{color:#555;font-size:11px;text-align:center;margin-bottom:10px;line-height:1.5}
  .divider{border-top:1px dashed #999;margin:8px 0}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{text-align:left;border-bottom:1px solid #333;padding:4px 2px;font-size:11px}
  td{padding:4px 2px;border-bottom:1px dotted #ddd;font-size:12px}
  .totals{margin-top:8px;font-size:13px}
  .totals .row{display:flex;justify-content:space-between;padding:2px 0}
  .grand{font-weight:800;font-size:16px;border-top:2px solid #111;border-bottom:2px solid #111;padding:6px 0;margin:6px 0}
  .pay{background:#f4f4f4;padding:6px 8px;border-radius:6px;margin-top:6px;font-size:12px}
  .pay .row{display:flex;justify-content:space-between;padding:2px 0}
  .change{font-weight:700;color:#047857}
  .due{font-weight:700;color:#b91c1c}
  .center{text-align:center;margin-top:12px;font-size:11px;color:#555}
  @media print { body{padding:6px} .noprint{display:none} }
</style></head><body>
<div class="noprint" style="text-align:center;margin-bottom:8px">
  <button onclick="window.print()" style="padding:8px 14px;font-weight:700;background:#0f172a;color:#fff;border:0;border-radius:6px;cursor:pointer">Print / Save as PDF</button>
</div>
<h2>${escape(d.shopName)}</h2>
<div class="muted">
  ${escape(new Date(d.date).toLocaleString())}<br/>
  Invoice #${escape(inv)}<br/>
  ${d.cashierName ? `Cashier: ${escape(d.cashierName)}<br/>` : ""}
  ${d.customerName ? `Customer: ${escape(d.customerName)}${d.customerPhone ? " · " + escape(d.customerPhone) : ""}` : ""}
</div>
<div class="divider"></div>
<table>
  <thead><tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead>
  <tbody>${itemRows}</tbody>
</table>
<div class="totals">
  ${typeof d.gstSubtotal === "number" && typeof d.nonGstSubtotal === "number" && d.nonGstSubtotal > 0 ? `<div class="row"><span>GST items subtotal</span><span>${formatCurrency(d.gstSubtotal)}</span></div><div class="row"><span>Non-GST items subtotal</span><span>${formatCurrency(d.nonGstSubtotal)}</span></div>` : ""}
  <div class="row"><span>Subtotal</span><span>${formatCurrency(d.subtotal)}</span></div>
  ${d.discount ? `<div class="row"><span>Discount</span><span>-${formatCurrency(d.discount)}</span></div>` : ""}
  ${d.bag ? `<div class="row"><span>Plastic bag fee</span><span>${formatCurrency(d.bag)}</span></div>` : ""}
  ${d.gstAmount ? `<div class="row"><span>GST (${d.gstPercent}%)</span><span>${formatCurrency(d.gstAmount)}</span></div>` : ""}
  ${d.cardFee ? `<div class="row"><span>Card charge</span><span>${formatCurrency(d.cardFee)}</span></div>` : ""}
  <div class="grand"><span style="float:left">TOTAL</span><span style="float:right">${formatCurrency(d.total)}</span><div style="clear:both"></div></div>
  <div class="pay">
    <div class="row"><span>Payment method</span><span><strong>${escape(d.payment.toUpperCase())}</strong></span></div>
    ${typeof d.paid === "number" ? `<div class="row"><span>Amount paid</span><span>${formatCurrency(d.paid)}</span></div>` : ""}
    ${
      typeof d.change === "number"
        ? d.change >= 0
          ? `<div class="row change"><span>Change</span><span>${formatCurrency(d.change)}</span></div>`
          : `<div class="row due"><span>Remaining</span><span>${formatCurrency(Math.abs(d.change))}</span></div>`
        : ""
    }
  </div>
</div>
<div class="center">${escape(d.footer)}</div>
<script>window.onload=function(){setTimeout(function(){window.print()},250)};<\/script>
</body></html>`;
};

const escape = (s: string): string =>
  String(s).replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );

export const printReceipt = (data: ReceiptData): void => {
  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) return;
  w.document.write(buildReceiptHtml(data));
  w.document.close();
};

export const downloadReceiptHtml = (data: ReceiptData): void => {
  const html = buildReceiptHtml(data);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `receipt-${data.invoiceNo ?? data.saleId.slice(-8)}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export interface QuotationReceiptData {
  quotationNo: string;
  date: string;
  validUntil: string;
  preparedBy: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  customerEmail?: string;
  customerAttention?: string;
  items: (ReceiptLine & { code?: string; unit?: string; description?: string })[];
  subtotal: number;
  discount: number;
  gstPercent: number;
  gstAmount: number;
  total: number;
  notes?: string;
  shopName: string;
  footer: string;
  status?: string;
  approvedBy?: string;
  approvedAt?: string;
}

const buildQuotationHtml = (d: QuotationReceiptData): string => {
  const s = useSettings.getState();

  const dateStr = new Date(d.date).toLocaleDateString("en-GB");
  const validStr = new Date(d.validUntil).toLocaleDateString("en-GB");

  const gstItems = d.items.filter((i) => i.gstApplicable !== false);
  const nonGstItems = d.items.filter((i) => i.gstApplicable === false);
  const gstSubtotal = gstItems.reduce((a, i) => a + i.total, 0);
  const nonGstSubtotal = nonGstItems.reduce((a, i) => a + i.total, 0);
  const hasMixed = gstItems.length > 0 && nonGstItems.length > 0;

  const rows = d.items
    .map((i, idx) => {
      const tag = i.gstApplicable === false ? `<span style="background:#fee2e2;color:#991b1b;border-radius:3px;padding:1px 5px;font-size:9px;font-weight:700;margin-left:6px">NON-GST</span>` : "";
      return `<tr>
        <td style="text-align:center">${idx + 1}</td>
        <td><div style="font-weight:600">${escape(i.name)}${hasMixed ? tag : ""}</div>${i.description ? `<div style="font-size:10px;color:#64748b">${escape(i.description)}</div>` : ""}</td>
        <td style="text-align:center;color:#64748b;font-size:11px">${escape(i.code ?? "")}</td>
        <td style="text-align:center;color:#64748b;font-size:11px">${escape((i.unit ?? "").toString().toUpperCase())}</td>
        <td style="text-align:right">${i.qty}</td>
        <td style="text-align:right">${formatCurrency(i.price)}</td>
        <td style="text-align:right;font-weight:600">${formatCurrency(i.total)}</td>
      </tr>`;
    })
    .join("");

  // pad rows to keep table size consistent
  const minRows = 10;
  const padding = Math.max(0, minRows - d.items.length);
  const padRows = Array.from({ length: padding }, () => `<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join("");

  const statusBadge = d.status
    ? `<span style="display:inline-block;background:${
        d.status === "approved"
          ? "#16a34a"
          : d.status === "rejected"
            ? "#dc2626"
            : d.status === "pending_approval"
              ? "#d97706"
              : "#475569"
      };color:#fff;font-size:9px;font-weight:800;letter-spacing:.1em;padding:3px 8px;border-radius:4px;margin-left:8px;vertical-align:middle">${escape(
        d.status === "pending_approval" ? "PENDING" : d.status.toUpperCase()
      )}</span>`
    : "";

  const termsHtml = (s.quotationTerms || "")
    .split(/\n+/)
    .filter((l) => l.trim())
    .map((l) => `<li>${escape(l.replace(/^\d+\.\s*/, ""))}</li>`) 
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"/><title>Quotation ${escape(d.quotationNo)}</title>
<style>
  *{box-sizing:border-box}
  @page { size: A4; margin: 12mm; }
  body{font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;margin:0;padding:0;background:#f1f5f9}
  .page{position:relative;width:210mm;min-height:297mm;margin:12px auto;padding:14mm 14mm;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden}
  .watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-20deg);width:380px;height:380px;opacity:0.05;pointer-events:none;z-index:0}
  .watermark img{width:100%;height:100%;object-fit:contain}
  .content{position:relative;z-index:1}

  /* Header */
  .header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #0f766e;padding-bottom:14px;margin-bottom:18px}
  .brand{display:flex;align-items:center;gap:14px}
  .brand img{width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid #0f766e;background:#fff}
  .brand .name{font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.01em;line-height:1.1}
  .brand .tag{font-size:11px;color:#0f766e;font-weight:600;letter-spacing:.18em;text-transform:uppercase;margin-top:2px}
  .contact{text-align:right;font-size:11px;line-height:1.55;color:#475569}
  .contact b{color:#0f172a}

  /* Title */
  .title-row{display:flex;justify-content:space-between;align-items:center;margin:14px 0 18px}
  .title{font-size:34px;font-weight:900;letter-spacing:.04em;color:#0f172a}
  .title-meta{text-align:right;font-size:12px;color:#334155;line-height:1.6}
  .title-meta .num{font-size:18px;font-weight:800;color:#0f766e}

  /* Customer */
  .blocks{display:grid;grid-template-columns:1.4fr 1fr;gap:14px;margin-bottom:14px}
  .block{border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;background:#f8fafc}
  .block .label{font-size:9px;font-weight:800;letter-spacing:.16em;color:#0f766e;text-transform:uppercase;margin-bottom:4px}
  .block .v{font-size:13px;color:#0f172a;line-height:1.55}
  .block .v b{font-weight:700}

  /* Items */
  table.items{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px}
  table.items thead th{background:#0f766e;color:#fff;text-align:left;padding:8px 8px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
  table.items tbody td{padding:7px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}
  table.items tbody tr:nth-child(even) td{background:#f8fafc}

  /* Totals */
  .summary{display:grid;grid-template-columns:1.2fr 1fr;gap:14px;align-items:flex-start}
  .bank{border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;background:#fefce8;font-size:11px;color:#713f12}
  .bank h4{margin:0 0 6px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#854d0e}
  .bank .row{display:flex;justify-content:space-between;padding:2px 0}
  .totals{border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px}
  .totals .row{display:flex;justify-content:space-between;padding:8px 14px;border-bottom:1px solid #e2e8f0}
  .totals .row:last-child{border-bottom:none}
  .totals .row.grand{background:#0f766e;color:#fff;font-size:16px;font-weight:800;letter-spacing:.04em}
  .totals .row.grand span:last-child{font-size:18px}

  /* Terms / Footer */
  .terms{margin-top:18px;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;background:#fff;font-size:11px;color:#475569}
  .terms h4{margin:0 0 6px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#0f766e;font-weight:800}
  .terms ol{margin:0;padding-left:18px;line-height:1.6}

  .signs{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:32px;padding-top:6px}
  .sign{border-top:1.5px solid #0f172a;padding-top:6px;font-size:11px;color:#475569}
  .sign b{color:#0f172a;font-size:12px}
  .sign .approved{color:#15803d;font-weight:700;font-size:11px;margin-top:2px}
  .stamp{display:inline-block;border:2px dashed #0f766e;color:#0f766e;padding:6px 14px;border-radius:6px;font-size:10px;font-weight:800;letter-spacing:.1em;margin-top:6px;opacity:.55}

  .doc-footer{margin-top:18px;padding-top:10px;border-top:1px dashed #cbd5e1;text-align:center;font-size:10px;color:#64748b}

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
          <div class="tag">Retail · Wholesale · Distribution</div>
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
      <div class="title">QUOTATION${statusBadge}</div>
      <div class="title-meta">
        <div class="num">No. ${escape(d.quotationNo)}</div>
        <div><b>Date:</b> ${escape(dateStr)}</div>
        <div><b>Valid until:</b> ${escape(validStr)}</div>
      </div>
    </div>

    <div class="blocks">
      <div class="block">
        <div class="label">Bill to / Customer</div>
        <div class="v">
          <b>${escape(d.customerName)}</b>
          ${d.customerAttention ? `<br/>Attn: ${escape(d.customerAttention)}` : ""}
          ${d.customerAddress ? `<br/>${escape(d.customerAddress)}` : ""}
          ${d.customerPhone ? `<br/>Tel: ${escape(d.customerPhone)}` : ""}
          ${d.customerEmail ? `<br/>Email: ${escape(d.customerEmail)}` : ""}
        </div>
      </div>
      <div class="block">
        <div class="label">Prepared by</div>
        <div class="v"><b>${escape(d.preparedBy)}</b></div>
        ${d.notes ? `<div class="label" style="margin-top:8px">Reference / Notes</div><div class="v" style="font-size:11px">${escape(d.notes)}</div>` : ""}
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th style="width:36px;text-align:center">No</th>
          <th>Item / Description</th>
          <th style="width:70px;text-align:center">Code</th>
          <th style="width:60px;text-align:center">Unit</th>
          <th style="width:60px;text-align:right">Qty</th>
          <th style="width:90px;text-align:right">Unit Price</th>
          <th style="width:100px;text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>${rows}${padRows}</tbody>
    </table>

    <div class="summary">
      <div class="bank">
        <h4>Bank / Payment Details</h4>
        ${s.bankName ? `<div class="row"><span>Bank</span><b>${escape(s.bankName)}</b></div>` : ""}
        ${s.bankAccountName ? `<div class="row"><span>Account Name</span><b>${escape(s.bankAccountName)}</b></div>` : ""}
        ${s.bankAccountNumber ? `<div class="row"><span>Account No</span><b>${escape(s.bankAccountNumber)}</b></div>` : ""}
        ${s.bankBeneficiary ? `<div class="row"><span>Beneficiary</span><b>${escape(s.bankBeneficiary)}</b></div>` : ""}
        <div style="margin-top:6px;font-size:10px;color:#854d0e">Payment by Bank Transfer / Deposit. Please send slip after payment.</div>
      </div>
      <div class="totals">
        ${hasMixed ? `<div class="row"><span>GST items subtotal</span><span>${formatCurrency(gstSubtotal)}</span></div><div class="row"><span>Non-GST items subtotal</span><span>${formatCurrency(nonGstSubtotal)}</span></div>` : ""}
        <div class="row"><span>Sub Total</span><span>${formatCurrency(d.subtotal)}</span></div>
        ${d.discount ? `<div class="row"><span>Discount</span><span>-${formatCurrency(d.discount)}</span></div>` : ""}
        ${d.gstAmount ? `<div class="row"><span>GST (${d.gstPercent}%)</span><span>${formatCurrency(d.gstAmount)}</span></div>` : ""}
        <div class="row grand"><span>TOTAL (MVR)</span><span>${formatCurrency(d.total)}</span></div>
      </div>
    </div>

    <div class="terms">
      <h4>Terms &amp; Conditions</h4>
      <ol>${termsHtml || `<li>Quotation valid for ${s.quotationValidityDays} days.</li>`}</ol>
    </div>

    <div class="signs">
      <div class="sign">
        <b>Prepared by</b><br/>
        ${escape(d.preparedBy)}<br/>
        <span style="font-size:10px">Date: ${escape(dateStr)}</span>
      </div>
      <div class="sign" style="text-align:right">
        <b>Approved by</b><br/>
        ${
          d.status === "approved" && d.approvedBy
            ? `${escape(d.approvedBy)}<div class="approved">✓ Approved${d.approvedAt ? ` · ${escape(new Date(d.approvedAt).toLocaleDateString("en-GB"))}` : ""}</div><div class="stamp">OFFICIAL</div>`
            : `<span style="color:#94a3b8">Pending admin approval</span>`
        }
      </div>
    </div>

    <div class="doc-footer">${escape(d.footer)} · This is a computer generated quotation.</div>
  </div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},400)};</script>
</body></html>`;
};

export const printQuotation = (d: QuotationReceiptData): void => {
  const w = window.open("", "_blank", "width=900,height=900");
  if (!w) return;
  w.document.write(buildQuotationHtml(d));
  w.document.close();
};

export const downloadQuotationHtml = (d: QuotationReceiptData): void => {
  const html = buildQuotationHtml(d);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `quotation-${d.quotationNo}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
