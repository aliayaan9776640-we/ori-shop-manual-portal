import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useStore, useCurrentUser, landedCostPerPiece } from "@/lib/store";
import { useQuotations, type QuotationItem, type Quotation } from "@/lib/quotations";
import { useSettings } from "@/lib/settings";
import {
  Plus,
  Trash2,
  Search,
  Printer,
  Download,
  FileText,
  CheckCircle2,
  X,
  ArrowRight,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { printQuotation, downloadQuotationHtml } from "@/lib/receipt";
import { toast } from "sonner";
import type { SaleItem } from "@/lib/types";

export default function Quotations() {
  const products = useStore((s) => s.products);
  const addSale = useStore((s) => s.addSale);
  const user = useCurrentUser();
  const isAdmin = user?.role === "admin";
  const settings = useSettings();
  const { quotations, add, update, approve, reject, remove } = useQuotations();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Quotation | null>(null);

  // form state
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState("Prices valid until expiry date. Subject to stock availability.");
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [gstPercent, setGstPercent] = useState(settings.gstPercent);
  const [gstEnabled, setGstEnabled] = useState(settings.gstEnabled);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, search]);

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const gstSubtotal = items
    .filter((i) => i.gstApplicable !== false)
    .reduce((s, i) => s + i.total, 0);
  const nonGstSubtotal = subtotal - gstSubtotal;
  const discountAmt = Math.min(discount, subtotal);
  // Distribute discount proportionally so GST is only computed on the
  // discounted portion of GST-applicable items (never twice).
  const discGst = subtotal > 0 ? (discountAmt * gstSubtotal) / subtotal : 0;
  const taxableGstBase = Math.max(0, gstSubtotal - discGst);
  const taxableBase = Math.max(0, subtotal - discountAmt);
  const gstAmount = gstEnabled
    ? +(taxableGstBase * (gstPercent / 100)).toFixed(2)
    : 0;
  const total = +(taxableBase + gstAmount).toFixed(2);
  void nonGstSubtotal;

  const resetForm = (): void => {
    setEditing(null);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    const d = new Date();
    d.setDate(d.getDate() + 14);
    setValidUntil(d.toISOString().slice(0, 10));
    setNotes("Prices valid until expiry date. Subject to stock availability.");
    setItems([]);
    setDiscount(0);
    setGstPercent(settings.gstPercent);
    setGstEnabled(settings.gstEnabled);
    setSearch("");
  };

  const startNew = (): void => {
    resetForm();
    setEditorOpen(true);
  };

  const startEdit = (q: Quotation): void => {
    setEditing(q);
    setCustomerName(q.customerName);
    setCustomerPhone(q.customerPhone ?? "");
    setCustomerAddress(q.customerAddress ?? "");
    setValidUntil(q.validUntil);
    setNotes(q.notes ?? "");
    setItems(q.items);
    setDiscount(q.discount);
    setGstPercent(q.gstPercent);
    setGstEnabled(q.gstAmount > 0);
    setEditorOpen(true);
  };

  const addItem = (productId: string): void => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === productId);
      if (existing) {
        return prev.map((i) =>
          i.productId === productId
            ? { ...i, qty: i.qty + 1, total: (i.qty + 1) * i.price }
            : i
        );
      }
      const price = p.sellingPrice / Math.max(1, p.piecesPerCase);
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          code: p.barcode,
          unit: p.unit,
          qty: 1,
          price,
          total: price,
          gstApplicable: p.gstApplicable !== false,
        },
      ];
    });
    setSearch("");
  };

  const addCustom = (): void => {
    setItems((prev) => [
      ...prev,
      { name: "Custom item", qty: 1, price: 0, total: 0, unit: "piece", gstApplicable: true },
    ]);
  };

  const setItem = (idx: number, patch: Partial<QuotationItem>): void => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        next.total = +(next.qty * next.price).toFixed(2);
        return next;
      })
    );
  };
  const removeItem = (idx: number): void => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = (): Quotation | null => {
    if (!customerName.trim()) {
      toast.error("Customer name is required");
      return null;
    }
    if (items.length === 0) {
      toast.error("Add at least one item");
      return null;
    }
    if (editing) {
      const patch = {
        customerName,
        customerPhone,
        customerAddress,
        validUntil,
        notes,
        items,
        subtotal,
        discount: discountAmt,
        gstPercent,
        gstAmount,
        total,
      };
      update(editing.id, patch);
      toast.success(`Quotation ${editing.number} updated`);
      const next = { ...editing, ...patch };
      return next;
    }
    const initialStatus = isAdmin ? "approved" : "pending_approval";
    const q = add(
      {
        customerName,
        customerPhone,
        customerAddress,
        validUntil,
        preparedBy: user?.fullName ?? "Staff",
        preparedById: user?.id ?? "",
        items,
        subtotal,
        discount: discountAmt,
        gstPercent,
        gstAmount,
        total,
        notes,
        ...(isAdmin
          ? {
              approvedBy: user?.fullName,
              approvedById: user?.id,
              approvedAt: new Date().toISOString(),
            }
          : {}),
      },
      initialStatus
    );
    toast.success(
      isAdmin
        ? `Quotation ${q.number} saved & approved`
        : `Quotation ${q.number} submitted for admin approval`
    );
    return q;
  };

  const handleApprove = (q: Quotation): void => {
    approve(q.id, user?.fullName ?? "Admin", user?.id ?? "");
    toast.success(`Quotation ${q.number} approved`);
  };
  const handleReject = (q: Quotation): void => {
    const reason = window.prompt("Rejection reason (optional)") ?? "";
    reject(q.id, user?.fullName ?? "Admin", reason);
    toast(`Quotation ${q.number} rejected`);
  };

  const saveAndClose = (): void => {
    if (save()) {
      setEditorOpen(false);
      resetForm();
    }
  };

  const printAndSave = (): void => {
    const q = save();
    if (!q) return;
    setTimeout(() => {
      printQuotation({
        quotationNo: q.number,
        date: q.date,
        validUntil: q.validUntil,
        preparedBy: q.preparedBy,
        customerName: q.customerName,
        customerPhone: q.customerPhone,
        customerAddress: q.customerAddress,
        items: q.items.map((i) => ({
          name: i.name,
          qty: i.qty,
          price: i.price,
          total: i.total,
          code: i.code,
          unit: i.unit,
          gstApplicable: i.gstApplicable,
        })),
        subtotal: q.subtotal,
        discount: q.discount,
        gstPercent: q.gstPercent,
        gstAmount: q.gstAmount,
        total: q.total,
        notes: q.notes,
        shopName: settings.shopName,
        footer: settings.receiptFooter,
        status: q.status,
        approvedBy: q.approvedBy,
        approvedAt: q.approvedAt,
      });
    }, 100);
    setEditorOpen(false);
    resetForm();
  };

  const printExisting = (q: Quotation): void => {
    printQuotation({
      quotationNo: q.number,
      date: q.date,
      validUntil: q.validUntil,
      preparedBy: q.preparedBy,
      customerName: q.customerName,
      customerPhone: q.customerPhone,
      customerAddress: q.customerAddress,
      items: q.items.map((i) => ({
        name: i.name,
        qty: i.qty,
        price: i.price,
        total: i.total,
        code: i.code,
        unit: i.unit,
        gstApplicable: i.gstApplicable,
      })),
      subtotal: q.subtotal,
      discount: q.discount,
      gstPercent: q.gstPercent,
      gstAmount: q.gstAmount,
      total: q.total,
      notes: q.notes,
      shopName: settings.shopName,
      footer: settings.receiptFooter,
      status: q.status,
      approvedBy: q.approvedBy,
      approvedAt: q.approvedAt,
    });
  };

  const downloadExisting = (q: Quotation): void => {
    downloadQuotationHtml({
      quotationNo: q.number,
      date: q.date,
      validUntil: q.validUntil,
      preparedBy: q.preparedBy,
      customerName: q.customerName,
      customerPhone: q.customerPhone,
      customerAddress: q.customerAddress,
      items: q.items.map((i) => ({
        name: i.name,
        qty: i.qty,
        price: i.price,
        total: i.total,
        code: i.code,
        unit: i.unit,
        gstApplicable: i.gstApplicable,
      })),
      subtotal: q.subtotal,
      discount: q.discount,
      gstPercent: q.gstPercent,
      gstAmount: q.gstAmount,
      total: q.total,
      notes: q.notes,
      shopName: settings.shopName,
      footer: settings.receiptFooter,
      status: q.status,
      approvedBy: q.approvedBy,
      approvedAt: q.approvedAt,
    });
    toast.success("Quotation downloaded");
  };

  const convertToSale = (q: Quotation): void => {
    if (user?.role === "storekeeper") {
      toast.error("Storekeepers cannot create sales");
      return;
    }
    if (q.status !== "approved") {
      toast.error("Quotation must be approved by admin before conversion");
      return;
    }
    const saleItems: SaleItem[] = [];
    for (const it of q.items) {
      const p = products.find((pp) => pp.id === it.productId);
      if (!p) {
        toast.error(`Product ${it.name} no longer exists`);
        return;
      }
      const ppCase = Math.max(1, p.piecesPerCase);
      const pieces = it.qty * ppCase;
      if (p.stockPieces < pieces) {
        toast.error(`Insufficient stock for ${p.name}`);
        return;
      }
      saleItems.push({
        productId: p.id,
        name: p.name,
        qty: pieces,
        unit: p.unit,
        unitQty: it.qty,
        price: it.price / ppCase,
        landedCost: landedCostPerPiece(p),
        total: it.total,
        profit: it.total - landedCostPerPiece(p) * pieces,
      });
    }
    const sale = addSale(saleItems, "cash");
    update(q.id, { status: "converted", convertedToSaleId: sale.id });
    toast.success(`Quotation ${q.number} converted to sale`);
  };

  return (
    <>
      <PageHeader
        title="Quotations"
        description={
          isAdmin
            ? "Approve, reject, and manage quotations from cashiers."
            : "Create quotations — admin approval required before they can be printed as final or converted to sale."
        }
        actions={
          <Button onClick={startNew} size="lg" className="gap-2">
            <Plus className="h-4 w-4" /> New quotation
          </Button>
        }
      />

      {/* Filter chips */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {([
          { k: "all", l: "All" },
          { k: "pending_approval", l: "Pending" },
          { k: "approved", l: "Approved" },
          { k: "rejected", l: "Rejected" },
          { k: "converted", l: "Converted" },
        ] as const).map((f) => {
          const count =
            f.k === "all"
              ? quotations.length
              : quotations.filter((q) => q.status === f.k).length;
          return (
            <button
              key={f.k}
              onClick={() => setStatusFilter(f.k)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                statusFilter === f.k
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground/70 hover:bg-secondary"
              }`}
            >
              {f.l} <span className="ml-1 opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="pos-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Number</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Valid until</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(() => {
                const list = quotations.filter(
                  (q) => statusFilter === "all" || q.status === statusFilter
                );
                if (list.length === 0) {
                  return (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                        <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
                        No quotations match this filter.
                      </td>
                    </tr>
                  );
                }
                return list.map((q) => (
                  <tr key={q.id} className="hover:bg-secondary/30">
                    <td className="px-4 py-3 font-semibold text-foreground">{q.number}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{q.customerName}</div>
                      {q.customerPhone && (
                        <div className="text-xs text-muted-foreground">{q.customerPhone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(q.date)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(q.validUntil)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-foreground">
                      {formatCurrency(q.total)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={`inline-block w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            q.status === "converted"
                              ? "bg-emerald-100 text-emerald-700"
                              : q.status === "approved"
                                ? "bg-emerald-100 text-emerald-700"
                                : q.status === "pending_approval"
                                  ? "bg-amber-100 text-amber-700"
                                  : q.status === "rejected"
                                    ? "bg-rose-100 text-rose-700"
                                    : q.status === "expired"
                                      ? "bg-rose-100 text-rose-700"
                                      : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {q.status === "pending_approval" ? "pending" : q.status}
                        </span>
                        {q.approvedBy && q.status === "approved" && (
                          <span className="text-[10px] text-emerald-700">by {q.approvedBy}</span>
                        )}
                        {q.rejectedBy && q.status === "rejected" && (
                          <span className="text-[10px] text-rose-700">
                            by {q.rejectedBy}
                            {q.rejectionReason ? ` · ${q.rejectionReason}` : ""}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <button
                          onClick={() => printExisting(q)}
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-secondary"
                          title="Print"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => downloadExisting(q)}
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-secondary"
                          title="Download PDF"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => startEdit(q)}
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-secondary"
                        >
                          Edit
                        </button>
                        {isAdmin && q.status === "pending_approval" && (
                          <>
                            <button
                              onClick={() => handleApprove(q)}
                              className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                              title="Approve"
                            >
                              <ShieldCheck className="inline h-3.5 w-3.5" /> Approve
                            </button>
                            <button
                              onClick={() => handleReject(q)}
                              className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                              title="Reject"
                            >
                              <ShieldX className="inline h-3.5 w-3.5" /> Reject
                            </button>
                          </>
                        )}
                        {q.status === "approved" && (
                          <button
                            onClick={() => convertToSale(q)}
                            className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                            title="Convert to sale"
                          >
                            <ArrowRight className="inline h-3.5 w-3.5" /> Sale
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm(`Delete quotation ${q.number}?`)) remove(q.id);
                          }}
                          className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Editor modal */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 sm:items-center sm:p-6">
          <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h2 className="text-base font-bold text-slate-900">
                  {editing ? `Edit ${editing.number}` : "New Quotation"}
                </h2>
              </div>
              <button
                onClick={() => {
                  setEditorOpen(false);
                  resetForm();
                }}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-3">
              {/* Left: form */}
              <div className="col-span-2 overflow-y-auto border-r border-slate-200 p-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Customer name *">
                    <input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="qinput"
                    />
                  </Field>
                  <Field label="Customer phone">
                    <input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="qinput"
                    />
                  </Field>
                  <Field label="Address" full>
                    <input
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      className="qinput"
                    />
                  </Field>
                  <Field label="Valid until">
                    <input
                      type="date"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                      className="qinput"
                    />
                  </Field>
                  <Field label="Prepared by">
                    <input
                      value={user?.fullName ?? ""}
                      readOnly
                      className="qinput bg-slate-50"
                    />
                  </Field>
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">Items</h3>
                    <button
                      onClick={addCustom}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      + Custom line
                    </button>
                  </div>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search a product to add..."
                      className="qinput pl-9"
                    />
                    {search && filtered.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                        {filtered.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => addItem(p.id)}
                            className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
                          >
                            <span className="font-medium text-slate-800">{p.name}</span>
                            <span className="text-xs text-slate-500">
                              {formatCurrency(p.sellingPrice / Math.max(1, p.piecesPerCase))}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 text-xs uppercase tracking-wider text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left">Item</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Price</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                              No items yet
                            </td>
                          </tr>
                        ) : (
                          items.map((it, idx) => (
                            <tr key={idx} className="border-t border-slate-100">
                              <td className="px-3 py-2">
                                <input
                                  value={it.name}
                                  onChange={(e) => setItem(idx, { name: e.target.value })}
                                  className="qinput-sm w-full"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.5"
                                  value={it.qty}
                                  onChange={(e) =>
                                    setItem(idx, { qty: Number(e.target.value) })
                                  }
                                  className="qinput-sm w-20 text-right"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={it.price}
                                  onChange={(e) =>
                                    setItem(idx, { price: Number(e.target.value) })
                                  }
                                  className="qinput-sm w-24 text-right"
                                />
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-900">
                                {formatCurrency(it.total)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  onClick={() => removeItem(idx)}
                                  className="rounded p-1 text-rose-500 hover:bg-rose-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <Field label="Notes / Terms" full>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="qinput min-h-[80px] resize-none"
                  />
                </Field>
              </div>

              {/* Right: totals */}
              <div className="flex flex-col bg-slate-50 p-5">
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Totals
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Subtotal</span>
                      <span className="font-semibold">{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Discount</span>
                      <input
                        type="number"
                        min={0}
                        value={discount}
                        onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                        className="qinput-sm w-24 text-right"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-slate-600">
                        <input
                          type="checkbox"
                          checked={gstEnabled}
                          onChange={(e) => setGstEnabled(e.target.checked)}
                          className="h-4 w-4"
                        />
                        GST
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="0.5"
                        disabled={!gstEnabled}
                        value={gstPercent}
                        onChange={(e) => setGstPercent(Number(e.target.value))}
                        className="qinput-sm w-20 text-right"
                      />
                    </div>
                    {gstEnabled && (
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>GST amount</span>
                        <span>{formatCurrency(gstAmount)}</span>
                      </div>
                    )}
                    <div className="my-2 border-t border-slate-200" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-700">TOTAL</span>
                      <span className="text-2xl font-extrabold text-slate-900">
                        {formatCurrency(total)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2">
                  <Button onClick={saveAndClose} className="h-11">
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Save quotation
                  </Button>
                  <Button
                    onClick={printAndSave}
                    variant="outline"
                    className="h-11 border-slate-300"
                  >
                    <Printer className="mr-2 h-4 w-4" /> Save & Print
                  </Button>
                  <Button
                    onClick={() => {
                      setEditorOpen(false);
                      resetForm();
                    }}
                    variant="ghost"
                    className="h-10"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .qinput { height: 40px; width: 100%; border-radius: 8px; border: 1px solid #cbd5e1; background:#fff; padding: 0 12px; font-size: 14px; color: #0f172a; outline: none; }
        .qinput:focus { border-color: hsl(var(--primary)); box-shadow: 0 0 0 3px hsl(var(--primary) / 0.18); }
        .qinput-sm { height: 32px; border-radius: 6px; border: 1px solid #cbd5e1; background:#fff; padding: 0 8px; font-size: 13px; color: #0f172a; outline: none; }
        .qinput-sm:focus { border-color: hsl(var(--primary)); }
      `}</style>
    </>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
