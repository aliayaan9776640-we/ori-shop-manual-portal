import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useCreditSends, type CreditSendStatus } from "@/lib/creditSends";
import { useStore, useCurrentUser } from "@/lib/store";
import { useSettings } from "@/lib/settings";
import { formatCurrency, formatDateTime } from "@/lib/format";
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
import {
  Send,
  Copy,
  Check,
  Trash2,
  Inbox,
  CalendarRange,
  RefreshCw,
  MessageCircle,
  AlertTriangle,
  FileDown,
  Share2,
  Mail,
  Printer,
} from "lucide-react";
import { toast } from "sonner";

export default function CreditSends(): JSX.Element {
  const items = useCreditSends((s) => s.items);
  const load = useCreditSends((s) => s.load);
  const enqueue = useCreditSends((s) => s.enqueue);
  const markSent = useCreditSends((s) => s.markSent);
  const remove = useCreditSends((s) => s.remove);
  const tableMissing = useCreditSends((s) => s.tableMissing);
  const customers = useStore((s) => s.customers);
  const creditTx = useStore((s) => s.creditTx);
  const settings = useSettings();
  const me = useCurrentUser();
  const [filter, setFilter] = useState<CreditSendStatus | "all">("pending");
  const [generating, setGenerating] = useState(false);
  const [initiated, setInitiated] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-trigger monthly run on/after configured day, once per calendar month.
  useEffect(() => {
    if (me?.role !== "admin") return;
    if (!settings.creditMonthlyEnabled) return;
    const today = new Date();
    if (today.getDate() < settings.creditMonthlyRunDay) return;
    const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    try {
      const last = localStorage.getItem("credit-monthly-last-run");
      if (last === ym) return;
      localStorage.setItem("credit-monthly-last-run", ym);
    } catch {
      // ignore storage errors
    }
    void generateMonthly();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role, settings.creditMonthlyEnabled, settings.creditMonthlyRunDay]);

  const visible = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((x) => x.status === filter);
  }, [items, filter]);

  const counts = useMemo(() => {
    const c = { pending: 0, sent: 0, failed: 0, skipped: 0 } as Record<
      CreditSendStatus,
      number
    >;
    items.forEach((x) => {
      c[x.status] = (c[x.status] ?? 0) + 1;
    });
    return c;
  }, [items]);

  const generateMonthly = async (): Promise<void> => {
    if (me?.role !== "admin") {
      toast.error("Only admin can generate monthly statements");
      return;
    }
    setGenerating(true);
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const periodStart = start.toISOString().slice(0, 10);
    const periodEnd = end.toISOString().slice(0, 10);
    const startMs = start.getTime();
    const endMs = new Date(periodEnd + "T23:59:59").getTime();
    let queued = 0;
    for (const c of customers) {
      if (c.approvalStatus !== "approved") continue;
      if (c.balance <= 0) continue;
      const tx = creditTx
        .filter((t) => t.customerId === c.id)
        .sort(
          (a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );
      let openingBalance = 0;
      let totalSales = 0;
      let totalPayments = 0;
      const entries: StatementEntry[] = [];
      let bal = 0;
      for (const t of tx) {
        const ts = new Date(t.date).getTime();
        if (ts < startMs) {
          bal += t.type === "sale" ? t.amount : -t.amount;
          openingBalance = bal;
          continue;
        }
        if (ts > endMs) break;
        const debit = t.type === "sale" ? t.amount : 0;
        const credit = t.type === "payment" ? t.amount : 0;
        bal += debit - credit;
        if (t.type === "sale") totalSales += t.amount;
        else if (t.type === "payment") totalPayments += t.amount;
        entries.push({
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
        });
      }
      const monthLabel = start.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      const tpl = settings.creditMessageTemplate ||
        "Hello {name},\nYour credit statement for {month} is attached as a PDF.\nTotal balance: MVR {amount}\nThank you.";
      const msg = tpl
        .replace(/\{name\}/g, c.name)
        .replace(/\{month\}/g, monthLabel)
        .replace(/\{amount\}/g, bal.toFixed(2))
        .replace(/\{link\}/g, "")
        .split("\n")
        .filter((line, i, arr) => !(line.trim() === "" && i > 0 && arr[i - 1]?.trim() === ""))
        .join("\n");
      const r = await enqueue({
        customerId: c.id,
        customerName: c.name,
        customerPhone: c.phone || null,
        amount: bal,
        kind: "statement",
        message: msg,
        link: null,
        periodStart,
        periodEnd,
      });
      if (r.ok) queued += 1;
      // Suppress lint about unused variables — kept for future per-row PDF gen
      void openingBalance;
      void totalSales;
      void totalPayments;
      void entries;
    }
    setGenerating(false);
    if (queued > 0) toast.success(`Queued ${queued} monthly statements`);
    else toast.info("No customers with outstanding balances");
  };

  const renderStatementForItem = (id: string): StatementData | null => {
    const item = items.find((x) => x.id === id);
    if (!item || !item.customerId) return null;
    const cust = customers.find((c) => c.id === item.customerId);
    if (!cust) return null;
    const startMs = item.periodStart
      ? new Date(item.periodStart + "T00:00:00").getTime()
      : 0;
    const endMs = item.periodEnd
      ? new Date(item.periodEnd + "T23:59:59").getTime()
      : Date.now();
    const ascTx = creditTx
      .filter((t) => t.customerId === cust.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let opening = 0;
    let totalSales = 0;
    let totalPayments = 0;
    let bal = 0;
    const entries: StatementEntry[] = [];
    for (const t of ascTx) {
      const ts = new Date(t.date).getTime();
      if (ts < startMs) {
        bal += t.type === "sale" ? t.amount : -t.amount;
        opening = bal;
        continue;
      }
      if (ts > endMs) break;
      const debit = t.type === "sale" ? t.amount : 0;
      const credit = t.type === "payment" ? t.amount : 0;
      bal += debit - credit;
      if (t.type === "sale") totalSales += t.amount;
      else if (t.type === "payment") totalPayments += t.amount;
      entries.push({
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
      });
    }
    return {
      customerName: cust.name,
      customerPhone: cust.phone,
      customerAddress: cust.address,
      periodStart: item.periodStart ?? new Date().toISOString().slice(0, 10),
      periodEnd: item.periodEnd ?? new Date().toISOString().slice(0, 10),
      openingBalance: opening,
      totalSales,
      totalPayments,
      totalAdjustments: 0,
      closingBalance: bal,
      creditLimit: cust.creditLimit,
      entries,
      shopName: settings.shopName,
      footer: settings.receiptFooter,
    };
  };

  const copy = (text: string): void => {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Copied"))
      .catch(() => toast.error("Could not copy"));
  };

  const sendViaDefault = async (item: (typeof items)[number]): Promise<void> => {
    const channel = settings.creditDefaultSendMethod;
    const phone = (item.customerPhone ?? "").replace(/[^0-9+]/g, "");
    const phoneNoPlus = phone.replace(/^\+/, "");
    const subject = item.kind === "statement" ? "Credit Statement" : "Credit Bill";
    if (channel === "whatsapp") {
      if (!phone) {
        toast.error("Customer has no phone number");
        return;
      }
      const url = `https://wa.me/${phoneNoPlus}?text=${encodeURIComponent(item.message)}`;
      window.open(url, "_blank");
      toast.success("Opening WhatsApp");
    } else if (channel === "viber") {
      if (!phone) {
        toast.error("Customer has no phone number");
        return;
      }
      try {
        await navigator.clipboard.writeText(item.message);
      } catch {
        // ignore
      }
      window.location.href = `viber://chat?number=${encodeURIComponent(phone)}`;
      toast.success("Message copied — opening Viber");
    } else if (channel === "email") {
      const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(item.message)}`;
      window.location.href = mailto;
      toast.success("Opening email client");
    } else {
      try {
        await navigator.clipboard.writeText(item.message);
        toast.success("Message copied to clipboard");
      } catch {
        toast.error("Could not copy");
        return;
      }
    }
    setInitiated((s) => ({ ...s, [item.id]: true }));
  };

  const generatePdfForItem = async (
    id: string
  ): Promise<{ blob: Blob; file: File; filename: string } | null> => {
    const item = items.find((x) => x.id === id);
    if (!item) return null;
    if (item.kind !== "statement") {
      toast.error("PDF generation only available for statements in the queue");
      return null;
    }
    const d = renderStatementForItem(id);
    if (!d) {
      toast.error("Could not build statement");
      return null;
    }
    try {
      return await generateCreditStatementPdf(d);
    } catch (e) {
      console.error("[creditSends] pdf gen failed", e);
      toast.error("Could not generate PDF");
      return null;
    }
  };

  const downloadPdf = async (id: string): Promise<void> => {
    const out = await generatePdfForItem(id);
    if (out) {
      downloadBlob(out.blob, out.filename);
      toast.success("PDF downloaded");
    }
  };
  const printPdf = async (id: string): Promise<void> => {
    const out = await generatePdfForItem(id);
    if (out) printPdfBlob(out.blob);
  };
  const sharePdf = async (id: string, message: string): Promise<void> => {
    const out = await generatePdfForItem(id);
    if (!out) return;
    if (canSharePdfFile(out.file)) {
      const r = await sharePdfFile(out.file, "Credit Statement", message);
      if (r.ok) toast.success("Shared");
      else if (r.reason === "unsupported") {
        downloadBlob(out.blob, out.filename);
        toast.message("Sharing not supported \u2014 PDF downloaded");
      } else if (r.reason === "error") {
        toast.error("Share failed");
      }
    } else {
      downloadBlob(out.blob, out.filename);
      try {
        await navigator.clipboard.writeText(message);
        toast.message("PDF downloaded & message copied \u2014 attach manually");
      } catch {
        toast.message("PDF downloaded \u2014 attach it manually");
      }
    }
  };
  const emailPdfAction = async (id: string, subject: string, body: string): Promise<void> => {
    const out = await generatePdfForItem(id);
    if (out) emailPdf(out.blob, out.filename, undefined, subject, body);
  };

  const channelLabel = (() => {
    switch (settings.creditDefaultSendMethod) {
      case "whatsapp":
        return "Send via WhatsApp";
      case "viber":
        return "Send via Viber";
      case "email":
        return "Send via Email";
      default:
        return "Copy to Queue";
    }
  })();

  return (
    <>
      {tableMissing && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-900 shadow-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div className="text-sm">
            <div className="font-bold">Migration not applied</div>
            <div className="mt-0.5">
              Run <code className="rounded bg-rose-100 px-1">web/supabase/migrations/0009_credit_billing.sql</code>{" "}
              in the Supabase SQL editor to enable the credit send queue.
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Pending Credit Sends"
        description="Statements & credit bill links queued for sending. Open the customer chat in WhatsApp/Viber, paste the message, then mark as sent."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => { void load(); }}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            {me?.role === "admin" && (
              <Button
                onClick={() => { void generateMonthly(); }}
                disabled={generating}
                className="gap-2"
              >
                <CalendarRange className="h-4 w-4" />
                {generating ? "Generating…" : "Generate Monthly Statements"}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["pending", "sent", "failed", "skipped"] as CreditSendStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-xl border p-4 text-left shadow-sm transition ${
              filter === s
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:bg-secondary/40"
            }`}
          >
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {s}
            </div>
            <div className="mt-1 text-2xl font-bold capitalize">{counts[s] ?? 0}</div>
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            filter === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground"
          }`}
        >
          All ({items.length})
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
          <Inbox className="mx-auto mb-2 h-8 w-8 opacity-50" />
          No items in this view.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((it) => {
            const phone = (it.customerPhone ?? "").replace(/[^0-9+]/g, "");
            const waUrl = phone
              ? `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(it.message)}`
              : null;
            const viberUrl = phone
              ? `viber://chat?number=${encodeURIComponent(phone)}`
              : null;
            return (
              <div
                key={it.id}
                className={`rounded-2xl border bg-card p-4 shadow-sm ${
                  it.status === "sent"
                    ? "border-emerald-200 bg-emerald-50/40"
                    : it.status === "failed"
                      ? "border-rose-200 bg-rose-50/30"
                      : "border-border"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                        {it.kind}
                      </span>
                      <span className="text-base font-semibold">
                        {it.customerName}
                      </span>
                      {it.customerPhone && (
                        <span className="text-xs text-muted-foreground">
                          {it.customerPhone}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          it.status === "pending"
                            ? "bg-amber-100 text-amber-800"
                            : it.status === "sent"
                              ? "bg-emerald-100 text-emerald-800"
                              : it.status === "failed"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {it.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Amount: <b>{formatCurrency(it.amount)}</b> · Created{" "}
                      {formatDateTime(it.createdAt)}
                      {it.periodStart && it.periodEnd
                        ? ` · Period ${it.periodStart} → ${it.periodEnd}`
                        : ""}
                    </div>
                  </div>
                </div>

                <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-secondary/40 px-3 py-2 text-xs">
                  {it.message}
                </pre>

                <div className="mt-3 flex flex-wrap gap-2">
                  {it.status !== "sent" && (
                    <Button
                      size="sm"
                      onClick={() => { void sendViaDefault(it); }}
                      className="gap-1"
                    >
                      <Send className="h-3.5 w-3.5" /> {channelLabel}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copy(it.message)}
                    className="gap-1"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy Message
                  </Button>
                  {waUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(waUrl, "_blank")}
                      className="gap-1 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                    >
                      <Send className="h-3.5 w-3.5" /> WhatsApp
                    </Button>
                  )}
                  {viberUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        copy(it.message);
                        window.location.href = viberUrl;
                      }}
                      className="gap-1 border-violet-300 text-violet-800 hover:bg-violet-50"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> Viber
                    </Button>
                  )}
                  {it.kind === "statement" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { void downloadPdf(it.id); }}
                        className="gap-1"
                      >
                        <FileDown className="h-3.5 w-3.5" /> Download PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { void printPdf(it.id); }}
                        className="gap-1"
                      >
                        <Printer className="h-3.5 w-3.5" /> Print PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { void sharePdf(it.id, it.message); }}
                        className="gap-1"
                      >
                        <Share2 className="h-3.5 w-3.5" /> Share PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { void emailPdfAction(it.id, "Credit Statement", it.message); }}
                        className="gap-1"
                      >
                        <Mail className="h-3.5 w-3.5" /> Email PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const d = renderStatementForItem(it.id);
                          if (d) printCreditStatement(d);
                        }}
                        className="gap-1"
                      >
                        Preview
                      </Button>
                    </>
                  )}
                  {it.status !== "sent" && (
                    <Button
                      size="sm"
                      variant={initiated[it.id] ? "default" : "outline"}
                      onClick={() => {
                        void markSent(it.id);
                        setInitiated((s) => {
                          const n = { ...s };
                          delete n[it.id];
                          return n;
                        });
                      }}
                      className={`gap-1 ${initiated[it.id] ? "animate-pulse" : ""}`}
                    >
                      <Check className="h-3.5 w-3.5" />{" "}
                      {initiated[it.id] ? "Confirm Mark as Sent" : "Mark Sent"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { void remove(it.id); }}
                    className="gap-1 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
