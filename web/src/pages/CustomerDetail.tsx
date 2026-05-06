import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore, useCurrentUser } from "@/lib/store";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import {
  printCreditStatement,
  generateCreditStatementPdf,
  type StatementData,
  type StatementEntry,
} from "@/lib/creditBill";
import {
  downloadBlob,
  printPdfBlob,
  sharePdfFile,
  canSharePdfFile,
  emailPdf,
} from "@/lib/pdf";
import { useCreditSends } from "@/lib/creditSends";
import { useSettings } from "@/lib/settings";
import { Calendar, FileDown, Printer, Share2, Mail } from "lucide-react";
import {
  ArrowLeft,
  HandCoins,
  MapPin,
  MessageCircle,
  Phone,
  Receipt,
  ShieldCheck,
  Send,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

interface MonthBucket {
  key: string;
  label: string;
  credit: number;
  payment: number;
}

export default function CustomerDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const customers = useStore((s) => s.customers);
  const tx = useStore((s) => s.creditTx);
  const sales = useStore((s) => s.sales);
  const products = useStore((s) => s.products);
  const addCreditPayment = useStore((s) => s.addCreditPayment);
  const me = useCurrentUser();
  const isAdmin = me?.role === "admin";

  const customer = useMemo(
    () => customers.find((c) => c.id === id),
    [customers, id]
  );

  const customerTx = useMemo(
    () =>
      tx
        .filter((t) => t.customerId === id)
        .slice()
        .sort(
          (a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        ),
    [tx, id]
  );

  const totals = useMemo(() => {
    let credit = 0;
    let paid = 0;
    customerTx.forEach((t) => {
      if (t.type === "sale") credit += t.amount;
      else paid += t.amount;
    });
    const lastPayment = customerTx.find((t) => t.type === "payment");
    return { credit, paid, lastPayment };
  }, [customerTx]);

  const months = useMemo<MonthBucket[]>(() => {
    const map = new Map<string, MonthBucket>();
    customerTx.forEach((t) => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
      const cur = map.get(key) ?? { key, label, credit: 0, payment: 0 };
      if (t.type === "sale") cur.credit += t.amount;
      else cur.payment += t.amount;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) =>
      a.key < b.key ? 1 : -1
    );
  }, [customerTx]);

  const [payOpen, setPayOpen] = useState(false);
  const [payAmt, setPayAmt] = useState<number>(0);
  const [payNote, setPayNote] = useState("");

  // Statement period filter (defaults: this month)
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  const [periodStart, setPeriodStart] = useState<string>(firstOfMonth);
  const [periodEnd, setPeriodEnd] = useState<string>(lastOfMonth);
  const settings = useSettings();
  const enqueueSend = useCreditSends((s) => s.enqueue);

  const buildStatement = (): StatementData | null => {
    if (!customer) return null;
    const startMs = new Date(periodStart + "T00:00:00").getTime();
    const endMs = new Date(periodEnd + "T23:59:59").getTime();
    // sort ascending by date for ledger
    const ascTx = customerTx.slice().reverse();
    let runningBefore = 0;
    const before: typeof ascTx = [];
    const within: typeof ascTx = [];
    ascTx.forEach((t) => {
      const ts = new Date(t.date).getTime();
      if (ts < startMs) before.push(t);
      else if (ts <= endMs) within.push(t);
    });
    before.forEach((t) => {
      runningBefore += t.type === "sale" ? t.amount : -t.amount;
    });
    let bal = runningBefore;
    let totalSales = 0;
    let totalPayments = 0;
    let totalAdj = 0;
    const entries: StatementEntry[] = within.map((t) => {
      const debit = t.type === "sale" ? t.amount : 0;
      const credit = t.type === "payment" ? t.amount : 0;
      bal += debit - credit;
      if (t.type === "sale") totalSales += t.amount;
      else if (t.type === "payment") totalPayments += t.amount;
      else totalAdj += t.amount;
      return {
        date: t.date,
        type: t.type,
        reference: t.saleId
          ? `Sale #${t.saleId.slice(-8).toUpperCase()}`
          : t.type === "payment"
            ? "Payment"
            : "Adjustment",
        note: t.note,
        debit,
        credit,
        balance: bal,
      };
    });
    return {
      customerName: customer.name,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      periodStart,
      periodEnd,
      openingBalance: runningBefore,
      totalSales,
      totalPayments,
      totalAdjustments: totalAdj,
      closingBalance: bal,
      creditLimit: customer.creditLimit,
      entries,
      shopName: settings.shopName,
      footer: settings.receiptFooter,
    };
  };

  const [pdfBusy, setPdfBusy] = useState(false);

  const buildStatementPdf = async (): Promise<{ blob: Blob; file: File; filename: string; data: StatementData } | null> => {
    const d = buildStatement();
    if (!d) return null;
    setPdfBusy(true);
    try {
      const out = await generateCreditStatementPdf(d);
      return { ...out, data: d };
    } catch (e) {
      console.error("[customerDetail] pdf gen failed", e);
      toast.error("Could not generate PDF");
      return null;
    } finally {
      setPdfBusy(false);
    }
  };

  const printStatement = (): void => {
    const d = buildStatement();
    if (d) printCreditStatement(d);
  };
  const downloadStatement = async (): Promise<void> => {
    const out = await buildStatementPdf();
    if (out) {
      downloadBlob(out.blob, out.filename);
      toast.success("PDF downloaded");
    }
  };
  const printPdfStatement = async (): Promise<void> => {
    const out = await buildStatementPdf();
    if (out) printPdfBlob(out.blob);
  };

  const baseStatementMessage = (closingBalance: number): string =>
    customer
      ? [
          `Hello ${customer.name},`,
          `Your credit statement for ${new Date(periodStart).toLocaleDateString("en-GB")} → ${new Date(periodEnd).toLocaleDateString("en-GB")} is attached as a PDF.`,
          `Closing balance: MVR ${closingBalance.toFixed(2)}.`,
          `Thank you.`,
        ].join("\n")
      : "";

  const sharePdfStatement = async (): Promise<void> => {
    const out = await buildStatementPdf();
    if (!out) return;
    const msg = baseStatementMessage(out.data.closingBalance);
    if (canSharePdfFile(out.file)) {
      const r = await sharePdfFile(out.file, "Credit Statement", msg);
      if (r.ok) toast.success("Shared");
      else if (r.reason === "unsupported") {
        downloadBlob(out.blob, out.filename);
        toast.message("Sharing not supported — PDF downloaded");
      } else if (r.reason === "error") toast.error("Share failed");
    } else {
      downloadBlob(out.blob, out.filename);
      try {
        await navigator.clipboard.writeText(msg);
        toast.message("PDF downloaded & message copied — attach manually");
      } catch {
        toast.message("PDF downloaded — attach it manually");
      }
    }
  };
  const emailPdfStatement = async (): Promise<void> => {
    const out = await buildStatementPdf();
    if (!out) return;
    const msg = baseStatementMessage(out.data.closingBalance);
    emailPdf(out.blob, out.filename, undefined, "Credit Statement", msg);
  };
  const queueStatement = async (): Promise<void> => {
    const d = buildStatement();
    if (!d || !customer) return;
    const msg = baseStatementMessage(d.closingBalance);
    const r = await enqueueSend({
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone || null,
      amount: d.closingBalance,
      kind: "statement",
      message: msg,
      link: null,
      periodStart,
      periodEnd,
    });
    if (r.ok) toast.success("Statement added to Pending Sends");
  };

  if (!customer) {
    return (
      <div>
        <PageHeader title="Customer not found" />
        <Link to="/customers" className="text-sm text-primary underline">
          ← Back to credit customers
        </Link>
      </div>
    );
  }

  const reminderMessage = (): string => {
    return [
      `Dear ${customer.name},`,
      ``,
      `Your credit account at Ori Barakah Store:`,
      `Outstanding balance: MVR ${customer.balance.toFixed(2)}`,
      customer.lastPaymentAt
        ? `Last payment: ${formatDate(customer.lastPaymentAt)}`
        : `No payments recorded yet.`,
      ``,
      `Please settle your bill before month end. A PDF statement can be shared on request.`,
    ]
      .filter(Boolean)
      .join("\n");
  };

  const cleanedPhone = (customer.phone ?? "").replace(/[^0-9+]/g, "");

  const sendWhatsApp = (): void => {
    if (!cleanedPhone) return toast.error("Customer has no phone number");
    const url = `https://wa.me/${cleanedPhone.replace(/^\+/, "")}?text=${encodeURIComponent(
      reminderMessage()
    )}`;
    window.open(url, "_blank");
  };
  const sendViber = (): void => {
    if (!cleanedPhone) return toast.error("Customer has no phone number");
    const url = `viber://chat?number=${encodeURIComponent(cleanedPhone)}`;
    window.location.href = url;
    setTimeout(() => {
      navigator.clipboard
        .writeText(reminderMessage())
        .then(() => toast.success("Reminder copied — paste it in Viber"))
        .catch(() => undefined);
    }, 100);
  };
  const sendSMS = (): void => {
    if (!cleanedPhone) return toast.error("Customer has no phone number");
    const url = `sms:${cleanedPhone}?body=${encodeURIComponent(reminderMessage())}`;
    window.location.href = url;
  };


  const submitPayment = (): void => {
    if (payAmt <= 0) return toast.error("Amount must be > 0");
    addCreditPayment(customer.id, payAmt, payNote);
    toast.success("Payment recorded");
    setPayOpen(false);
    setPayAmt(0);
    setPayNote("");
  };

  return (
    <>
      <PageHeader
        title={customer.name}
        description="Full credit account log, payments, and monthly statements."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => navigate("/customers")}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              onClick={() => {
                setPayOpen(true);
                setPayAmt(0);
                setPayNote("");
              }}
              disabled={customer.balance <= 0}
              className="gap-2"
            >
              <HandCoins className="h-4 w-4" /> Record Payment
            </Button>
          </>
        }
      />

      {/* Top summary */}
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Customer
          </div>
          <div className="mt-2 text-lg font-semibold">{customer.name}</div>
          {customer.phone && (
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" /> {customer.phone}
            </div>
          )}
          {customer.address && (
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> {customer.address}
            </div>
          )}
          <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
            {customer.approvalStatus}
          </div>
        </div>

        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 shadow-sm">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Outstanding Balance
          </div>
          <div className="mt-1 text-3xl font-bold">
            {formatCurrency(customer.balance)}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-muted-foreground">Total credit</div>
              <div className="font-semibold">
                {formatCurrency(totals.credit)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Total paid</div>
              <div className="font-semibold text-emerald-700">
                {formatCurrency(totals.paid)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Limit</div>
              <div className="font-semibold">
                {formatCurrency(customer.creditLimit)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Last payment</div>
              <div className="font-semibold">
                {totals.lastPayment
                  ? formatDate(totals.lastPayment.date)
                  : "—"}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <Receipt className="h-3.5 w-3.5" /> Statement PDF & Reminders
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Customers receive their bill as a PDF file. Use the buttons below to share, email or print the latest statement (current month).
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => { void downloadStatement(); }} disabled={pdfBusy} className="gap-2">
              <FileDown className="h-4 w-4" /> PDF
            </Button>
            <Button variant="outline" onClick={() => { void printPdfStatement(); }} disabled={pdfBusy} className="gap-2">
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button variant="outline" onClick={() => { void sharePdfStatement(); }} disabled={pdfBusy} className="gap-2">
              <Share2 className="h-4 w-4" /> Share PDF
            </Button>
            <Button variant="outline" onClick={() => { void emailPdfStatement(); }} disabled={pdfBusy} className="gap-2">
              <Mail className="h-4 w-4" /> Email
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              onClick={sendWhatsApp}
              className="gap-1 text-emerald-700 hover:bg-emerald-50"
              title="Send reminder via WhatsApp"
            >
              <Send className="h-3.5 w-3.5" />WA
            </Button>
            <Button
              variant="outline"
              onClick={sendViber}
              className="gap-1 text-violet-700 hover:bg-violet-50"
              title="Send reminder via Viber"
            >
              <MessageCircle className="h-3.5 w-3.5" />Viber
            </Button>
            <Button
              variant="outline"
              onClick={sendSMS}
              className="gap-1"
              title="Send reminder via SMS"
            >
              <MessageCircle className="h-3.5 w-3.5" />SMS
            </Button>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Reminder text includes balance & last payment — attach the PDF manually if your chat app does not support sharing files.
          </p>
        </div>
      </div>

      {/* Statement builder */}
      <section className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Calendar className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            Generate Statement
          </h2>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
            />
            <Button onClick={printStatement} size="sm" variant="outline" className="gap-1">
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
            <Button onClick={() => { void downloadStatement(); }} disabled={pdfBusy} size="sm" variant="outline" className="gap-1">
              <FileDown className="h-3.5 w-3.5" /> PDF
            </Button>
            <Button onClick={() => { void sharePdfStatement(); }} disabled={pdfBusy} size="sm" variant="outline" className="gap-1">
              <Share2 className="h-3.5 w-3.5" /> Share
            </Button>
            <Button onClick={() => { void emailPdfStatement(); }} disabled={pdfBusy} size="sm" variant="outline" className="gap-1">
              <Mail className="h-3.5 w-3.5" /> Email
            </Button>
            <Button onClick={() => { void queueStatement(); }} size="sm" className="gap-1">
              <Send className="h-3.5 w-3.5" /> Queue Send
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Build a printable statement for any date range. “Queue Send” adds it
          to the Pending Sends list with a copy-ready WhatsApp/Viber message.
        </p>
      </section>

      {/* Monthly statements */}
      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Monthly Statements
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Month</th>
                <th className="px-4 py-3 text-right">Credit Sales</th>
                <th className="px-4 py-3 text-right">Payments</th>
                <th className="px-4 py-3 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const net = m.credit - m.payment;
                return (
                  <tr key={m.key} className="border-t border-border">
                    <td className="px-4 py-2.5 font-medium">{m.label}</td>
                    <td className="px-4 py-2.5 text-right">
                      {formatCurrency(m.credit)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-emerald-700">
                      {formatCurrency(m.payment)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-semibold ${
                        net > 0 ? "text-rose-600" : "text-emerald-700"
                      }`}
                    >
                      {formatCurrency(net)}
                    </td>
                  </tr>
                );
              })}
              {months.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Full ledger */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Full Credit Log
        </h2>
        <div className="space-y-3">
          {customerTx.map((t) => {
            const sale = t.saleId
              ? sales.find((s) => s.id === t.saleId)
              : undefined;
            const isSale = t.type === "sale";
            return (
              <div
                key={t.id}
                className={`rounded-2xl border bg-card p-4 shadow-sm ${
                  isSale
                    ? "border-rose-100"
                    : "border-emerald-200 bg-emerald-50/40"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {isSale ? (
                        <Receipt className="h-4 w-4 text-rose-600" />
                      ) : (
                        <Wallet className="h-4 w-4 text-emerald-600" />
                      )}
                      <span className="font-semibold uppercase tracking-wider text-xs">
                        {isSale ? "Credit Sale" : "Payment Received"}
                      </span>
                      {t.saleId && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px]">
                          #{t.saleId.slice(-8).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {formatDateTime(t.date)}
                      {t.userName ? ` · by ${t.userName}` : ""}
                    </div>
                    {t.note && (
                      <div className="mt-1 text-xs italic text-muted-foreground">
                        Note: {t.note}
                      </div>
                    )}
                  </div>
                  <div
                    className={`text-2xl font-bold ${
                      isSale ? "text-rose-600" : "text-emerald-700"
                    }`}
                  >
                    {isSale ? "+" : "-"}
                    {formatCurrency(t.amount)}
                  </div>
                </div>

                {isSale && sale && sale.items.length > 0 && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-secondary/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Item</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Unit Price</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sale.items.map((it, i) => {
                          const prod = products.find(
                            (p) => p.id === it.productId
                          );
                          return (
                            <tr key={i} className="border-t border-border">
                              <td className="px-3 py-1.5">
                                {prod?.name ?? it.name}
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                {it.qty} {it.unit}
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                {formatCurrency(it.price)}
                              </td>
                              <td className="px-3 py-1.5 text-right font-medium">
                                {formatCurrency(it.total)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          {customerTx.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
              No credit activity yet.
            </div>
          )}
        </div>
      </section>

      {/* Payment dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment — {customer.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl bg-secondary/40 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Outstanding
              </div>
              <div className="text-2xl font-bold">
                {formatCurrency(customer.balance)}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Amount received
              </label>
              <input
                type="number"
                value={payAmt || ""}
                onChange={(e) =>
                  setPayAmt(e.target.value === "" ? 0 : Number(e.target.value))
                }
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Note (optional)
              </label>
              <input
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              />
            </div>
            {!isAdmin && (
              <p className="text-[11px] text-muted-foreground">
                Cashiers can only enter payments. Cost / profit data stays
                hidden.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitPayment}>Confirm Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
