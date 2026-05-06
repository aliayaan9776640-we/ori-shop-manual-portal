import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useStore, useCurrentUser } from "@/lib/store";
import { useSettings } from "@/lib/settings";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  Printer,
  Download,
  Receipt as ReceiptIcon,
  Search,
  FileSpreadsheet,
  Filter,
  Ban,
  Pencil,
  ShieldAlert,
  History,
  Lock,
} from "lucide-react";
import {
  printReceipt as printReceiptDoc,
  downloadReceiptHtml,
  type ReceiptData,
} from "@/lib/receipt";
import { Save } from "lucide-react";
import type { Sale, PaymentMethod } from "@/lib/types";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function BillHistory() {
  const sales = useStore((s) => s.sales);
  const customers = useStore((s) => s.customers);
  const users = useStore((s) => s.users);
  const logs = useStore((s) => s.logs);
  const voidSale = useStore((s) => s.voidSale);
  const editSale = useStore((s) => s.editSale);
  const user = useCurrentUser();
  const settings = useSettings();
  const isAdmin = user?.role === "admin";

  const [voidTarget, setVoidTarget] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [editTarget, setEditTarget] = useState<Sale | null>(null);
  const [editPayment, setEditPayment] = useState<PaymentMethod>("cash");
  const [editCustomerId, setEditCustomerId] = useState<string>("");
  const [editReason, setEditReason] = useState("");
  const [showAudit, setShowAudit] = useState(false);

  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentMethod | "all">(
    "all"
  );
  const [cashierFilter, setCashierFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const cashiers = useMemo(
    () => users.filter((u) => u.role === "cashier" || u.role === "admin"),
    [users]
  );

  const visibleSales = useMemo(() => {
    let list = sales;
    // Cashier only sees own
    if (!isAdmin && user) {
      list = list.filter((s) => s.cashierId === user.id);
    }
    if (cashierFilter !== "all") {
      list = list.filter((s) => s.cashierId === cashierFilter);
    }
    if (paymentFilter !== "all") {
      list = list.filter((s) => s.paymentMethod === paymentFilter);
    }
    if (fromDate) {
      const f = new Date(fromDate).getTime();
      list = list.filter((s) => new Date(s.date).getTime() >= f);
    }
    if (toDate) {
      const t = new Date(toDate).getTime() + 24 * 60 * 60 * 1000;
      list = list.filter((s) => new Date(s.date).getTime() <= t);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((s) => {
        const inv = s.id.slice(-8).toLowerCase();
        const cust = customers.find((c) => c.id === s.customerId);
        return (
          inv.includes(q) ||
          (cust?.name ?? "").toLowerCase().includes(q) ||
          (cust?.phone ?? "").toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [
    sales,
    isAdmin,
    user,
    cashierFilter,
    paymentFilter,
    fromDate,
    toDate,
    search,
    customers,
  ]);

  const totalAmount = visibleSales.reduce((s, x) => s + x.total, 0);

  const buildReceipt = (s: Sale): ReceiptData => {
    const cust = customers.find((c) => c.id === s.customerId);
    const cashier = users.find((u) => u.id === s.cashierId);
    const subtotal = s.items.reduce((a, b) => a + b.total, 0);
    const gstSubtotal = s.items
      .filter((i) => i.gstApplicable !== false)
      .reduce((a, b) => a + b.total, 0);
    const nonGstSubtotal = subtotal - gstSubtotal;
    return {
      saleId: s.id,
      invoiceNo: s.id.slice(-8).toUpperCase(),
      date: s.date,
      cashierName: cashier?.fullName,
      customerName: cust?.name,
      customerPhone: cust?.phone,
      items: s.items.map((i) => ({
        name: i.name,
        qty: i.qty,
        price: i.price,
        total: i.total,
        gstApplicable: i.gstApplicable,
      })),
      subtotal,
      gstSubtotal,
      nonGstSubtotal,
      discount: 0,
      bag: 0,
      cardFee: 0,
      gstAmount: 0,
      gstPercent: settings.gstPercent,
      total: s.total,
      paid: s.paymentMethod === "credit" ? 0 : s.total,
      change: 0,
      payment: s.paymentMethod,
      shopName: settings.shopName,
      footer: settings.receiptFooter,
    };
  };

  const reprint = (s: Sale): void => printReceiptDoc(buildReceipt(s));
  const downloadPdf = (s: Sale): void => {
    downloadReceiptHtml(buildReceipt(s));
    toast.success("Receipt downloaded");
  };

  const exportCsv = (): void => {
    const rows = [
      [
        "Invoice",
        "Date",
        "Cashier",
        "Customer",
        "Payment",
        "Items",
        "Total",
      ],
      ...visibleSales.map((s) => {
        const cust = customers.find((c) => c.id === s.customerId);
        const cashier = users.find((u) => u.id === s.cashierId);
        return [
          s.id.slice(-8).toUpperCase(),
          new Date(s.date).toLocaleString(),
          cashier?.fullName ?? "",
          cust?.name ?? "",
          s.paymentMethod,
          String(s.items.reduce((a, b) => a + b.qty, 0)),
          s.total.toFixed(2),
        ];
      }),
    ];
    const csv = rows
      .map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bill-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Bill history exported");
  };

  return (
    <>
      <PageHeader
        title="Bill History"
        description={
          isAdmin
            ? "All bills across cashiers. Filter, export, reprint, or download any receipt."
            : "Your recent bills. Reprint or download any receipt."
        }
        actions={
          isAdmin ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAudit((v) => !v)}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-secondary"
              >
                <History className="h-4 w-4" />
                {showAudit ? "Hide audit log" : "Audit log"}
              </button>
              <button
                onClick={exportCsv}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-secondary"
              >
                <FileSpreadsheet className="h-4 w-4" /> Export CSV
              </button>
            </div>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Cashiers cannot edit or delete sales
            </span>
          )
        }
      />

      {/* Filters */}
      <div className="pos-card mb-4 grid grid-cols-1 gap-3 p-4 md:grid-cols-5">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Invoice #, customer name or phone..."
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <select
          value={paymentFilter}
          onChange={(e) =>
            setPaymentFilter(e.target.value as PaymentMethod | "all")
          }
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
        >
          <option value="all">All payments</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="bank">Bank</option>
          <option value="credit">Credit</option>
        </select>
        {isAdmin && (
          <select
            value={cashierFilter}
            onChange={(e) => setCashierFilter(e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
          >
            <option value="all">All cashiers</option>
            {cashiers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
              </option>
            ))}
          </select>
        )}
        <div className="flex gap-2">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
          />
        </div>
      </div>

      {/* Summary strip */}
      <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card px-4 py-2 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Filter className="h-4 w-4" />
          <span>{visibleSales.length} bills</span>
        </div>
        <div className="ml-auto font-bold text-foreground">
          Total: {formatCurrency(totalAmount)}
        </div>
      </div>

      {/* Audit log (admin) */}
      {isAdmin && showAudit && (
        <div className="pos-card mb-4 p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Sales audit trail
            </h3>
            <span className="text-xs text-muted-foreground">
              Every edit, void, and create is logged.
            </span>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-secondary/80 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">Who</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs
                  .filter((l) => l.action.startsWith("sale."))
                  .slice(0, 100)
                  .map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                        {formatDateTime(l.date)}
                      </td>
                      <td className="px-3 py-1.5 font-medium text-foreground">
                        {l.userName}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                            l.action === "sale.void"
                              ? "bg-red-100 text-red-700"
                              : l.action === "sale.edit"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {l.action.replace("sale.", "")}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {l.detail}
                      </td>
                    </tr>
                  ))}
                {logs.filter((l) => l.action.startsWith("sale.")).length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-6 text-center text-muted-foreground"
                    >
                      No sale activity yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="pos-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Invoice</th>
                <th className="px-4 py-3 text-left">Date / Time</th>
                {isAdmin && <th className="px-4 py-3 text-left">Cashier</th>}
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Payment</th>
                <th className="px-4 py-3 text-right">Items</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleSales.length === 0 ? (
                <tr>
                  <td
                    colSpan={isAdmin ? 8 : 7}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    <ReceiptIcon className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    No bills found.
                  </td>
                </tr>
              ) : (
                visibleSales.map((s) => {
                  const cust = customers.find((c) => c.id === s.customerId);
                  const cashier = users.find((u) => u.id === s.cashierId);
                  const itemQty = s.items.reduce((a, b) => a + b.qty, 0);
                  return (
                    <tr key={s.id} className="hover:bg-secondary/30">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-foreground">
                        <div className="flex items-center gap-2">
                          <span>#{s.id.slice(-8).toUpperCase()}</span>
                          {s.voided && (
                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-700">
                              Voided
                            </span>
                          )}
                          {s.editedAt && !s.voided && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700">
                              Edited
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDateTime(s.date)}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-foreground">
                          {cashier?.fullName ?? "—"}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        {cust ? (
                          <div>
                            <div className="font-medium text-foreground">
                              {cust.name}
                            </div>
                            {cust.phone && (
                              <div className="text-xs text-muted-foreground">
                                {cust.phone}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Walk-in</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            s.paymentMethod === "cash"
                              ? "bg-emerald-100 text-emerald-700"
                              : s.paymentMethod === "card"
                                ? "bg-blue-100 text-blue-700"
                                : s.paymentMethod === "bank"
                                  ? "bg-violet-100 text-violet-700"
                                  : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {s.paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {itemQty}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">
                        {formatCurrency(s.total)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => reprint(s)}
                            className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-secondary"
                            title="Reprint receipt"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => downloadPdf(s)}
                            className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-secondary"
                            title="Download PDF"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          {isAdmin ? (
                            <>
                              <button
                                disabled={s.voided}
                                onClick={() => {
                                  setEditTarget(s);
                                  setEditPayment(s.paymentMethod);
                                  setEditCustomerId(s.customerId ?? "");
                                  setEditReason("");
                                }}
                                className="rounded-md border border-border bg-background px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-40 disabled:hover:bg-background"
                                title="Edit sale (admin only)"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                disabled={s.voided}
                                onClick={() => {
                                  setVoidTarget(s);
                                  setVoidReason("");
                                }}
                                className="rounded-md border border-border bg-background px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-background"
                                title="Void sale (admin only)"
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[10px] font-medium text-muted-foreground"
                              title="Cashiers cannot edit or delete sales"
                            >
                              <Lock className="h-3 w-3" /> Locked
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Void dialog */}
      <Dialog
        open={!!voidTarget}
        onOpenChange={(o) => {
          if (!o) setVoidTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-red-600" />
              Void sale #{voidTarget?.id.slice(-8).toUpperCase()}
            </DialogTitle>
            <DialogDescription>
              This will mark the sale as voided, restore stock, and reverse any
              credit. The action is permanent and will be recorded in the audit
              log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md bg-secondary/50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-bold">
                  {voidTarget ? formatCurrency(voidTarget.total) : ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment</span>
                <span className="font-medium uppercase">
                  {voidTarget?.paymentMethod}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>
                <span>{voidTarget?.items.length}</span>
              </div>
            </div>
            <label className="text-sm font-medium">
              Reason for void <span className="text-red-600">*</span>
            </label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
              placeholder="e.g. Customer returned, wrong items, duplicate billing..."
              className="w-full rounded-md border border-border bg-background p-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!voidTarget) return;
                if (voidReason.trim().length < 3) {
                  toast.error("Please enter a reason (min 3 chars)");
                  return;
                }
                const res = voidSale(voidTarget.id, voidReason.trim());
                if (!res.ok) {
                  toast.error(res.error ?? "Failed to void");
                  return;
                }
                toast.success("Sale voided and logged");
                setVoidTarget(null);
              }}
            >
              <Ban className="mr-1 h-4 w-4" /> Void sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" />
              Edit sale #{editTarget?.id.slice(-8).toUpperCase()}
            </DialogTitle>
            <DialogDescription>
              Admin-only changes. Every change is recorded in the audit log
              with your name and timestamp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Payment method
              </label>
              <select
                value={editPayment}
                onChange={(e) =>
                  setEditPayment(e.target.value as PaymentMethod)
                }
                className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank">Bank</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Customer
              </label>
              <select
                value={editCustomerId}
                onChange={(e) => setEditCustomerId(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="">Walk-in (no customer)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` — ${c.phone}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Reason for edit <span className="text-red-600">*</span>
              </label>
              <textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                rows={2}
                placeholder="Why are you changing this sale?"
                className="w-full rounded-md border border-border bg-background p-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!editTarget) return;
                if (editReason.trim().length < 3) {
                  toast.error("Please enter a reason (min 3 chars)");
                  return;
                }
                const res = editSale(
                  editTarget.id,
                  {
                    paymentMethod: editPayment,
                    customerId: editCustomerId,
                  },
                  editReason.trim()
                );
                if (!res.ok) {
                  toast.error(res.error ?? "Failed to edit");
                  return;
                }
                toast.success("Sale updated and logged");
                setEditTarget(null);
              }}
            >
              <Save className="mr-1 h-4 w-4" /> Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
