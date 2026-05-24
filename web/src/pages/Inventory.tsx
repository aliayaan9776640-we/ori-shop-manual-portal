import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useStore, landedCostPerPiece, landedCostTotal } from "@/lib/store";
import { useCurrentUser } from "@/lib/store";
import { useTaxSettings, computePrice } from "@/lib/taxSettings";
import type {
  InventoryTx,
  Product,
  Sale,
  StockBatch,
  UnitType,
} from "@/lib/types";
import {
  productExpiryStatus,
  daysUntilExpiry,
  sortBatchesFifo,
} from "@/lib/expiry";
import { useSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatCurrency, formatNumber } from "@/lib/format";
import { computeProfitParts, formatPct } from "@/lib/profitCalc";
import { useDropdownGroup } from "@/lib/dropdowns";
import NumInput from "@/components/NumInput";
import FileUpload from "@/components/FileUpload";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  TrendingDown,
} from "lucide-react";
import { toast } from "sonner";

interface FormState {
  name: string;
  barcode: string;
  category: string;
  size: string;
  supplierId: string;
  purchasePrice: number;
  sellingPrice: number;
  marginPct: number;
  unit: UnitType;
  piecesPerCase: number;
  stockPieces: number;
  reorderLevel: number;
  expiryDate: string;
  boatFee: number;
  otherCost: number;
  photo: string;
  gstApplicable: boolean;
  applyPlasticBag: boolean;
  applyCardCharge: boolean;
}

const baseUnitLabel = (unit?: string): string => {
  const u = String(unit || "piece").toLowerCase();
  if (u === "kg" || u === "kilogram") return "kg";
  if (u === "g" || u === "gram") return "g";
  if (u === "bag") return "kg";
  return "pc";
};

const bulkUnitLabel = (unit?: string): string => {
  const u = String(unit || "piece").toLowerCase();
  if (u === "kg" || u === "kilogram") return "kg";
  if (u === "g" || u === "gram") return "g";
  if (u === "bag") return "bag";
  if (u === "box") return "box";
  if (u === "case") return "case";
  if (u === "packet") return "packet";
  if (u === "bottle") return "bottle";
  if (u === "tin") return "tin";
  return "case";
};

const isWeightUnit = (unit?: string): boolean => {
  const u = String(unit || "").toLowerCase();
  return u === "kg" || u === "g" || u === "gram" || u === "bag";
};

const formatQtySmart = (n: number): string => {
  const value = Number(n || 0);
  if (Number.isInteger(value)) return formatNumber(value);
  return value.toLocaleString("en-US", { maximumFractionDigits: 3 });
};

const splitBulkAndBase = (totalBase: number, perBulk: number) => {
  const safe = Math.max(1, Number(perBulk || 1));
  const bulk = Math.floor(Number(totalBase || 0) / safe);
  const loose = Number(totalBase || 0) - bulk * safe;
  return { bulk, loose };
};

const formatStockBalance = (
  totalBase: number,
  perBulk: number,
  unit?: string,
): string => {
  const base = baseUnitLabel(unit);
  const bulk = bulkUnitLabel(unit);
  const safe = Math.max(1, Number(perBulk || 1));
  if (safe <= 1) return `${formatQtySmart(totalBase)} ${base}`;
  const parts = splitBulkAndBase(totalBase, safe);
  return `${formatQtySmart(parts.bulk)} ${bulk} + ${formatQtySmart(parts.loose)} ${base}`;
};

const formatTotalBase = (totalBase: number, unit?: string): string =>
  `${formatQtySmart(totalBase)} ${baseUnitLabel(unit)}`;

const blank: FormState = {
  name: "",
  barcode: "",
  category: "",
  size: "",
  supplierId: "",
  purchasePrice: 0,
  sellingPrice: 0,
  marginPct: 25,
  unit: "piece",
  piecesPerCase: 1,
  stockPieces: 0,
  reorderLevel: 10,
  expiryDate: "",
  boatFee: 0,
  otherCost: 0,
  photo: "",
  gstApplicable: true,
  applyPlasticBag: false,
  applyCardCharge: false,
};

export default function Inventory() {
  const products = useStore((s) => s.products);
  const suppliers = useStore((s) => s.suppliers);
  const sales = useStore((s) => s.sales);
  const inventoryTx = useStore((s) => s.inventoryTx);
  const addProduct = useStore((s) => s.addProduct);
  const updateProduct = useStore((s) => s.updateProduct);
  const deleteProduct = useStore((s) => s.deleteProduct);
  const adjustStock = useStore((s) => s.adjustStock);
  const user = useCurrentUser();

  const canEdit = user?.role === "admin" || user?.role === "storekeeper";

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [stockOpen, setStockOpen] = useState<{
    id: string;
    name: string;
    mode: "in" | "out";
    piecesPerCase: number;
    currentPieces: number;
    unit: UnitType;
  } | null>(null);
  const [existingStock, setExistingStock] = useState(0);
  const [addBulk, setAddBulk] = useState(0);
  const [addLoose, setAddLoose] = useState(0);
  const [stockBulk, setStockBulk] = useState(0);
  const [stockLoose, setStockLoose] = useState(0);
  const [stockReason, setStockReason] = useState("");
  const [stockExpiry, setStockExpiry] = useState("");
  const [stockBuyingPersonId, setStockBuyingPersonId] = useState("");
  const [addBuyingPersonId, setAddBuyingPersonId] = useState("");
  const users = useStore((s) => s.users);
  const buyingPeople = useMemo(() => users.filter((u) => u.active), [users]);
  const batches = useStore((s) => s.batches);
  const nearExpiryDays = useSettings((s) => s.nearExpiryDays);
  const [taxOpen, setTaxOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<Product | null>(null);
  const tax = useTaxSettings();
  const unitOptions = useDropdownGroup("unit_type");
  const categoryOptions = useDropdownGroup("product_category");
  const gstOptions = useDropdownGroup("gst_applicable");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !p.barcode.toLowerCase().includes(q)
      )
        return false;
      if (
        filter === "low" &&
        !(p.stockPieces > 0 && p.stockPieces <= p.reorderLevel)
      )
        return false;
      if (filter === "out" && p.stockPieces !== 0) return false;
      return true;
    });
  }, [products, search, filter]);

  const openNew = (): void => {
    setEditing(null);
    setExistingStock(0);
    setAddBulk(0);
    setAddLoose(0);
    setForm({ ...blank, supplierId: suppliers[0]?.id ?? "" });
    setOpen(true);
  };

  const openEdit = (p: Product): void => {
    setEditing(p);
    setExistingStock(p.stockPieces);
    setAddBulk(0);
    setAddLoose(0);
    setForm({
      name: p.name,
      barcode: p.barcode,
      category: p.category,
      size: (p as Product & { size?: string }).size ?? "",
      supplierId: p.supplierId,
      purchasePrice: p.purchasePrice,
      sellingPrice: p.sellingPrice,
      marginPct: p.marginPct,
      unit: p.unit,
      piecesPerCase: p.piecesPerCase,
      stockPieces: p.stockPieces,
      reorderLevel: p.reorderLevel,
      expiryDate: p.expiryDate ?? "",
      boatFee: p.boatFee,
      otherCost: p.otherCost,
      photo: p.photo ?? "",
      gstApplicable: p.gstApplicable !== false,
      applyPlasticBag: false,
      applyCardCharge: false,
    });
    setOpen(true);
  };

  const submit = (): void => {
    if (!form.name.trim()) {
      toast.error("Product name is required");
      return;
    }
    const { applyPlasticBag: _ap, applyCardCharge: _ac, ...rest } = form;
    void _ap;
    void _ac;
    const payload = {
      ...rest,
      expiryDate: form.expiryDate || undefined,
      photo: form.photo || undefined,
    };
    if (editing) {
      updateProduct(editing.id, payload);
      toast.success("Product updated");
    } else {
      // Duplicate detection (case-insensitive name or matching barcode)
      const nameKey = form.name.trim().toLowerCase();
      const barcodeKey = form.barcode.trim().toLowerCase();
      const dup = products.find((x) => {
        const xb = (x.barcode ?? "").trim().toLowerCase();
        const xn = (x.name ?? "").trim().toLowerCase();
        return (
          (barcodeKey && xb && xb === barcodeKey) || (nameKey && xn === nameKey)
        );
      });
      if (dup) {
        if (addedPieces > 0) {
          adjustStock(dup.id, addedPieces, "New stock added", {
            expiryDate: form.expiryDate || undefined,
            buyingPersonId: addBuyingPersonId || undefined,
          });
          toast.success(
            `"${dup.name}" already exists — added ${formatTotalBase(addedPieces, form.unit)} to existing item`,
          );
        } else {
          toast.info(`"${dup.name}" already exists. No quantity to add.`);
        }
      } else {
        addProduct(payload, { buyingPersonId: addBuyingPersonId || undefined });
        toast.success("Product added");
      }
    }
    setOpen(false);
  };

  const onDelete = (p: Product): void => {
    if (!confirm(`Delete ${p.name}?`)) return;
    deleteProduct(p.id);
    toast.success("Product deleted");
  };

  const stockTotalPieces = stockOpen
    ? stockBulk * Math.max(1, stockOpen.piecesPerCase) + stockLoose
    : 0;
  const submitStock = (): void => {
    if (!stockOpen) return;
    if (stockTotalPieces <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    if (
      stockOpen.mode === "out" &&
      stockTotalPieces > stockOpen.currentPieces
    ) {
      toast.error("Cannot remove more than current stock");
      return;
    }
    const delta =
      stockOpen.mode === "in" ? stockTotalPieces : -stockTotalPieces;
    adjustStock(stockOpen.id, delta, stockReason || stockOpen.mode, {
      expiryDate:
        stockOpen.mode === "in" && stockExpiry ? stockExpiry : undefined,
      buyingPersonId:
        stockOpen.mode === "in" && stockBuyingPersonId
          ? stockBuyingPersonId
          : undefined,
    });
    toast.success(
      `Stock ${stockOpen.mode === "in" ? "added" : "removed"} (${formatTotalBase(stockTotalPieces, stockOpen.unit)})`,
    );
    setStockOpen(null);
    setStockBulk(0);
    setStockLoose(0);
    setStockReason("");
    setStockExpiry("");
    setStockBuyingPersonId("");
  };

  const breakdown = computePrice({
    purchasePrice: form.purchasePrice,
    boatFee: form.boatFee,
    otherCost: form.otherCost,
    marginPct: form.marginPct,
    applyGst: form.gstApplicable,
    gstPct: tax.gstPct,
  });

  // ----- Unit helpers (UI-only; stockPieces remains the source of truth) -----
  // For piece/case items, stockPieces means pieces. For KG/bag items, it means kg/base unit.
  const ppc = Math.max(1, form.piecesPerCase || 1);
  const baseLabel = baseUnitLabel(form.unit);
  const bulkLabel = bulkUnitLabel(form.unit);
  const weighted = isWeightUnit(form.unit);
  const addedPieces =
    Math.max(0, Number(addBulk || 0)) * ppc +
    Math.max(0, Number(addLoose || 0));
  const newBalance = existingStock + addedPieces;
  // Keep form.stockPieces in sync with existing + added
  if (form.stockPieces !== newBalance) {
    // schedule update via setForm in effectless way — safe within render because we guard equality
    queueMicrotask(() =>
      setForm((f) =>
        f.stockPieces === newBalance ? f : { ...f, stockPieces: newBalance },
      ),
    );
  }
  const existingSplit = splitBulkAndBase(existingStock, ppc);
  const existingCases = existingSplit.bulk;
  const existingLoose = existingSplit.loose;
  const balSplit = splitBulkAndBase(newBalance, ppc);
  const balCases = balSplit.bulk;
  const balLoose = balSplit.loose;
  const landedPerPiece = breakdown.landed / ppc;
  const sellingPerPiece = form.sellingPrice / ppc;
  const sellingPerCase = form.sellingPrice;
  const profitPerPiece = sellingPerPiece - landedPerPiece;
  const profitPerCase = profitPerPiece * ppc;
  const suggestedPerPiece = breakdown.baseSelling / ppc;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Manage products, stock levels, and pricing."
        actions={
          canEdit && (
            <div className="flex gap-2">
              {user?.role === "admin" && (
                <Button
                  variant="outline"
                  onClick={() => setTaxOpen(true)}
                  className="gap-2"
                >
                  Tax Settings
                </Button>
              )}
              <Button onClick={openNew} className="gap-2">
                <Plus className="h-4 w-4" /> Add Product
              </Button>
            </div>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or barcode..."
            className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "low", "out"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg border px-3 py-2 text-xs font-medium capitalize transition ${
                filter === f
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-secondary"
              }`}
            >
              {f === "all" ? "All" : f === "low" ? "Low stock" : "Out of stock"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-right">Stock Balance</th>
                <th className="px-4 py-3 text-right">Landed / unit</th>
                <th className="px-4 py-3 text-right">Selling / unit</th>
                <th className="px-4 py-3 text-right">Selling / bulk</th>
                <th className="px-4 py-3 text-right">Profit / unit</th>
                <th className="px-4 py-3 text-right">Profit / bulk</th>
                <th className="px-4 py-3 text-right">Margin %</th>
                <th className="px-4 py-3 text-right">Markup %</th>
                <th className="px-4 py-3 text-right">Inventory Value</th>
                <th className="px-4 py-3 text-left">Expiry</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const ppcRow = Math.max(1, p.piecesPerCase || 1);
                const landed = landedCostPerPiece(p);
                const sellPerPiece = p.sellingPrice / ppcRow;
                const sellPerCase = p.sellingPrice;
                const profitPiece = sellPerPiece - landed;
                const profitCase = profitPiece * ppcRow;
                const parts = computeProfitParts(
                  landedCostTotal(p),
                  p.sellingPrice,
                );
                const marginActual = parts.marginPct;
                const markupActual = parts.markupPct;
                const stockValue = landed * p.stockPieces;
                const isOut = p.stockPieces === 0;
                const isLow = !isOut && p.stockPieces <= p.reorderLevel;
                const baseLabelRow = baseUnitLabel(p.unit);
                const bulkLabelRow = bulkUnitLabel(p.unit);
                const splitRow = splitBulkAndBase(p.stockPieces, ppcRow);
                const cases = splitRow.bulk;
                const looseRow = splitRow.loose;
                return (
                  <tr
                    key={p.id}
                    className="border-t border-border transition hover:bg-secondary/30"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                          {p.photo ? (
                            <img
                              src={p.photo}
                              alt={p.name}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                (
                                  e.currentTarget as HTMLImageElement
                                ).style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-wider text-muted-foreground">
                              No img
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{p.name}</span>
                            {p.gstApplicable === false && (
                              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-700">
                                Non-GST
                              </span>
                            )}
                            {p.publishStatus === "pending" && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800">
                                Pending
                              </span>
                            )}
                            {p.publishStatus === "rejected" && (
                              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-800">
                                Rejected
                              </span>
                            )}
                            {p.publishStatus === "approved" && (
                              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-800">
                                Live
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {p.barcode} · {p.unit}
                            {(p as Product & { size?: string }).size
                              ? ` · Size: ${(p as Product & { size?: string }).size}`
                              : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.category}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div
                        className={`font-semibold ${
                          isOut
                            ? "text-rose-600"
                            : isLow
                              ? "text-amber-600"
                              : ""
                        }`}
                      >
                        {ppcRow > 1 ? (
                          <span>
                            {formatQtySmart(cases)}
                            <span className="text-xs font-normal text-muted-foreground">
                              {" "}
                              {bulkLabelRow}
                            </span>
                            {" · "}
                            {formatQtySmart(looseRow)}
                            <span className="text-xs font-normal text-muted-foreground">
                              {" "}
                              {baseLabelRow}
                            </span>
                          </span>
                        ) : (
                          <span>
                            {formatQtySmart(p.stockPieces)}
                            <span className="text-xs font-normal text-muted-foreground">
                              {" "}
                              {baseLabelRow}
                            </span>
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Total: {formatTotalBase(p.stockPieces, p.unit)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatCurrency(landed)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(sellPerPiece)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {ppcRow > 1 ? formatCurrency(sellPerCase) : "—"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right ${
                        profitPiece >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {formatCurrency(profitPiece)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right ${
                        profitCase >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {ppcRow > 1 ? formatCurrency(profitCase) : "—"}
                    </td>
                    <td
                      className="px-4 py-3 text-right"
                      title="Profit ÷ selling price"
                    >
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          marginActual >= 20
                            ? "bg-emerald-100 text-emerald-700"
                            : marginActual >= 10
                              ? "bg-amber-100 text-amber-700"
                              : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {formatPct(marginActual)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right" title="Profit ÷ cost">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {formatPct(markupActual)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatCurrency(stockValue)}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const exp = productExpiryStatus(
                          p,
                          batches,
                          nearExpiryDays,
                        );
                        if (exp.status === "none")
                          return (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          );
                        const date = exp.nextExpiry
                          ? new Date(exp.nextExpiry).toLocaleDateString(
                              undefined,
                              {
                                day: "2-digit",
                                month: "short",
                                year: "2-digit",
                              },
                            )
                          : "";
                        const cls =
                          exp.status === "expired"
                            ? "bg-rose-100 text-rose-700"
                            : exp.status === "near"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700";
                        const label =
                          exp.status === "expired"
                            ? "Expired"
                            : exp.status === "near"
                              ? `${exp.days}d left`
                              : `${exp.days}d`;
                        return (
                          <div className="flex flex-col">
                            <span
                              className={`inline-block w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${cls}`}
                            >
                              {label}
                            </span>
                            <span className="mt-0.5 text-[10px] text-muted-foreground">
                              {date}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <>
                            <button
                              onClick={() => {
                                setStockBulk(0);
                                setStockLoose(0);
                                setStockReason("");
                                setStockExpiry("");
                                setStockOpen({
                                  id: p.id,
                                  name: p.name,
                                  mode: "in",
                                  piecesPerCase: ppcRow,
                                  currentPieces: p.stockPieces,
                                  unit: p.unit,
                                });
                              }}
                              title="Stock in"
                              className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50"
                            >
                              <ArrowDownToLine className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                setStockBulk(0);
                                setStockLoose(0);
                                setStockReason("");
                                setStockExpiry("");
                                setStockOpen({
                                  id: p.id,
                                  name: p.name,
                                  mode: "out",
                                  piecesPerCase: ppcRow,
                                  currentPieces: p.stockPieces,
                                  unit: p.unit,
                                });
                              }}
                              title="Stock out"
                              className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50"
                            >
                              <ArrowUpFromLine className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setHistoryFor(p)}
                              title="Stock history"
                              className="rounded-md p-1.5 text-blue-600 hover:bg-blue-50"
                            >
                              <History className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openEdit(p)}
                              className="rounded-md p-1.5 hover:bg-secondary"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            {user?.role === "admin" && (
                              <button
                                onClick={() => onDelete(p)}
                                className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={13}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    No products match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Product" : "Add Product"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name" full>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Barcode / SKU">
              <input
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Category">
              {categoryOptions.length > 0 ? (
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                  className={inputCls}
                >
                  <option value="">— Select —</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                  {form.category &&
                    !categoryOptions.some((c) => c.value === form.category) && (
                      <option value={form.category}>
                        {form.category} (legacy)
                      </option>
                    )}
                </select>
              ) : (
                <input
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                  className={inputCls}
                />
              )}
            </Field>
            <Field label="Supplier">
              <select
                value={form.supplierId}
                onChange={(e) =>
                  setForm({ ...form, supplierId: e.target.value })
                }
                className={inputCls}
              >
                <option value="">— Select —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Unit type">
              <select
                value={form.unit}
                onChange={(e) =>
                  setForm({ ...form, unit: e.target.value as UnitType })
                }
                className={inputCls}
              >
                <option value="piece">Piece</option>
                <option value="kg">KG</option>
                <option value="g">Gram</option>
                <option value="box">Box</option>
                <option value="case">Case</option>
                <option value="packet">Packet</option>
                <option value="bottle">Bottle</option>
                <option value="tin">Tin</option>
                <option value="bag">Bag</option>
                {!unitOptions.some((u) => u.value === form.unit) && (
                  <option value={form.unit}>{form.unit} (legacy)</option>
                )}
              </select>
            </Field>
            <Field label="Size / Option">
              <input
                value={form.size || ""}
                onChange={(e) => setForm({ ...form, size: e.target.value })}
                placeholder="Ex: 1KG, 500ML, XL, Large"
                className={inputCls}
              />
            </Field>
            <Field label={`Purchase price per ${bulkLabel}`}>
              <NumInput
                value={form.purchasePrice}
                onChange={(n) => setForm({ ...form, purchasePrice: n })}
                className={inputCls}
              />
              <div className="mt-1 text-[10px] text-muted-foreground">
                = {baseLabel} price × {ppc} {baseLabel}/{bulkLabel}
              </div>
            </Field>
            <Field label={`Purchase price per ${baseLabel}`}>
              <NumInput
                value={ppc > 0 ? form.purchasePrice / ppc : 0}
                onChange={(n) =>
                  setForm({
                    ...form,
                    purchasePrice: +(
                      n * Math.max(1, form.piecesPerCase || 1)
                    ).toFixed(4),
                  })
                }
                className={inputCls}
              />
              <div className="mt-1 text-[10px] text-muted-foreground">
                Auto: {ppc > 0 ? formatCurrency(form.purchasePrice / ppc) : "—"}
              </div>
            </Field>
            <Field label="Boat fee / transport">
              <NumInput
                value={form.boatFee}
                onChange={(n) => setForm({ ...form, boatFee: n })}
                className={inputCls}
              />
            </Field>
            <Field label="Other cost">
              <NumInput
                value={form.otherCost}
                onChange={(n) => setForm({ ...form, otherCost: n })}
                className={inputCls}
              />
            </Field>
            <Field label="Markup % (added on cost)">
              <NumInput
                value={form.marginPct}
                onChange={(n) => setForm({ ...form, marginPct: n })}
                className={inputCls}
              />
              <div className="mt-1 text-[10px] text-muted-foreground">
                This is markup, not margin. Selling = cost × (1 + markup%).
              </div>
            </Field>
            <Field
              label={`Selling price per ${bulkLabel} / selling unit (BEFORE GST)`}
              full
            >
              <NumInput
                value={form.sellingPrice}
                onChange={(n) => setForm({ ...form, sellingPrice: n })}
                className={inputCls}
              />
              <div className="mt-1 text-[10px] text-muted-foreground">
                GST is added at checkout. Do NOT include GST in this price.
              </div>
            </Field>
            <div className="sm:col-span-2 rounded-xl border border-border bg-secondary/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Stock entry
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Current balance:{" "}
                  <span className="font-semibold text-foreground">
                    {formatTotalBase(existingStock, form.unit)}
                  </span>
                  {ppc > 1 && (
                    <> · {formatStockBalance(existingStock, ppc, form.unit)}</>
                  )}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={`Add bulk quantity (${bulkLabel})`}>
                  <NumInput
                    value={addBulk}
                    min={0}
                    allowDecimal={weighted}
                    onChange={(n) =>
                      setAddBulk(
                        Math.max(
                          0,
                          weighted ? Number(n || 0) : Math.floor(n || 0),
                        ),
                      )
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label={`Units per ${bulkLabel} (${baseLabel})`}>
                  <NumInput
                    value={form.piecesPerCase}
                    min={1}
                    allowDecimal={weighted}
                    onChange={(n) =>
                      setForm({
                        ...form,
                        piecesPerCase: Math.max(
                          1,
                          weighted ? Number(n || 1) : Math.floor(n || 1),
                        ),
                      })
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label={`Add loose ${baseLabel}`}>
                  <NumInput
                    value={addLoose}
                    min={0}
                    allowDecimal={weighted}
                    onChange={(n) =>
                      setAddLoose(
                        Math.max(
                          0,
                          weighted ? Number(n || 0) : Math.floor(n || 0),
                        ),
                      )
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label="Adding now (auto)">
                  <input
                    type="text"
                    readOnly
                    value={addedPieces}
                    className={`${inputCls} bg-muted/40 font-semibold`}
                  />
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    = bulk × units per bulk + loose units
                  </div>
                </Field>
                <Field label={`Balance Qty (${baseLabel}) — auto`} full>
                  <input
                    type="text"
                    readOnly
                    value={newBalance}
                    className={`${inputCls} bg-muted/40 text-base font-bold`}
                  />
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {formatTotalBase(existingStock, form.unit)} (current) +{" "}
                    {formatTotalBase(addedPieces, form.unit)} (added) ={" "}
                    {formatTotalBase(newBalance, form.unit)}
                    {ppc > 1 && (
                      <>
                        {" "}
                        · {formatQtySmart(balCases)} {bulkLabel} +{" "}
                        {formatQtySmart(balLoose)} {baseLabel}
                      </>
                    )}
                  </div>
                </Field>
                <Field label="Buying person / Purchased by" full>
                  <select
                    value={addBuyingPersonId}
                    onChange={(e) => setAddBuyingPersonId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— Select buying person —</option>
                    {buyingPeople.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                        {u.isPurchasingStaff ? " · Purchasing" : ""}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Logged on the new stock batch separately from “entered by”.
                  </div>
                </Field>
              </div>
            </div>
            <Field label="Expiry date (optional)">
              <input
                type="date"
                value={form.expiryDate ? form.expiryDate.slice(0, 10) : ""}
                onChange={(e) =>
                  setForm({ ...form, expiryDate: e.target.value })
                }
                className={inputCls}
              />
            </Field>
            <Field label="Product photo (optional)" full>
              <FileUpload
                value={form.photo}
                onChange={(url) => setForm({ ...form, photo: url })}
                folder="products"
                showUrlField
              />
            </Field>
          </div>

          <div className="rounded-xl border border-border bg-secondary/30 p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              GST status
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-foreground">
                Is this product subject to GST?
                <div className="text-xs text-muted-foreground">
                  Cashier POS will automatically charge GST only on items marked
                  GST applicable.
                </div>
              </div>
              <div className="flex gap-2">
                {(gstOptions.length > 0
                  ? gstOptions
                  : [
                      { id: "gst-yes", value: "yes", label: "GST item" },
                      { id: "gst-no", value: "no", label: "Non-GST item" },
                    ]
                ).map((opt) => {
                  const isYes = opt.value === "yes" || opt.value === "true";
                  const selected = form.gstApplicable === isYes;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setForm({ ...form, gstApplicable: isYes })}
                      className={`rounded-lg border px-4 py-2 text-xs font-bold transition ${
                        selected
                          ? isYes
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-slate-700 bg-slate-700 text-white"
                          : "border-border bg-card text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-3 text-xs">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cost & price breakdown ({ppc} {baseLabel} / {bulkLabel})
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                label="Landed cost / bulk"
                value={formatCurrency(breakdown.landed)}
              />
              <Stat
                label="Landed cost / unit"
                value={formatCurrency(landedPerPiece)}
              />
              <Stat
                label="Suggested selling / bulk"
                value={formatCurrency(breakdown.baseSelling)}
                accent
              />
              <Stat
                label="Suggested selling / unit"
                value={formatCurrency(suggestedPerPiece)}
                accent
              />
              <Stat
                label="Selling / bulk (set)"
                value={formatCurrency(sellingPerCase)}
              />
              <Stat
                label="Selling / unit (set)"
                value={formatCurrency(sellingPerPiece)}
              />
              <Stat
                label="Profit / unit"
                value={formatCurrency(profitPerPiece)}
                tone={profitPerPiece >= 0 ? "good" : "bad"}
              />
              <Stat
                label="Profit / bulk"
                value={formatCurrency(profitPerCase)}
                tone={profitPerCase >= 0 ? "good" : "bad"}
              />
            </div>
            {(() => {
              const parts = computeProfitParts(
                breakdown.landed,
                sellingPerCase,
              );
              return (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-2">
                  <Stat
                    label="Margin % (of selling)"
                    value={formatPct(parts.marginPct)}
                    tone={parts.marginPct >= 0 ? "good" : "bad"}
                  />
                  <Stat
                    label="Markup % (of cost)"
                    value={formatPct(parts.markupPct)}
                  />
                </div>
              );
            })()}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                label={`GST (${tax.gstPct}%)`}
                value={formatCurrency(breakdown.gstAmount)}
              />
              <Stat
                label="Customer pays incl. GST"
                value={formatCurrency(breakdown.finalPrice)}
              />
              <Stat
                label="Total stock"
                value={formatTotalBase(form.stockPieces, form.unit)}
              />
              <Stat
                label="Inventory value"
                value={formatCurrency(landedPerPiece * form.stockPieces)}
              />
            </div>
            <button
              type="button"
              onClick={() =>
                setForm({
                  ...form,
                  sellingPrice: Math.round(breakdown.baseSelling * 100) / 100,
                })
              }
              className="mt-3 text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Use suggested pre-GST price →
            </button>
            <div className="mt-2 text-[10px] text-muted-foreground">
              GST is applied only at POS checkout on GST-applicable items.
              Inventory pricing stays GST-exclusive.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit}>
              {editing ? "Save changes" : "Add product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tax settings dialog */}
      <Dialog open={taxOpen} onOpenChange={setTaxOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tax & Charge Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="GST percentage (%)">
              <NumInput
                value={tax.gstPct}
                onChange={(n) => tax.set({ gstPct: n })}
                className={inputCls}
              />
            </Field>
            <Field label="Plastic bag fee (per bag)">
              <NumInput
                value={tax.plasticBagFee}
                onChange={(n) => tax.set({ plasticBagFee: n })}
                className={inputCls}
              />
            </Field>
            <Field label="Bank card charge (%)">
              <NumInput
                value={tax.cardChargePct}
                onChange={(n) => tax.set({ cardChargePct: n })}
                className={inputCls}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              These rates are applied per item via the tax toggles when adding
              or editing a product, and on cashier checkout.
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setTaxOpen(false);
                toast.success("Tax settings saved");
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock history / details dialog */}
      <StockHistoryDialog
        product={historyFor}
        onClose={() => setHistoryFor(null)}
        sales={sales}
        inventoryTx={inventoryTx}
        batches={batches}
        nearExpiryDays={nearExpiryDays}
      />

      {/* Stock adjust dialog */}
      <Dialog open={!!stockOpen} onOpenChange={(o) => !o && setStockOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Stock {stockOpen?.mode === "in" ? "in" : "out"} —{" "}
              {stockOpen?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {stockOpen && stockOpen.mode === "in" && (
              <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                Current stock:{" "}
                <span className="font-semibold text-foreground">
                  {formatTotalBase(stockOpen.currentPieces, stockOpen.unit)}
                </span>
                {stockOpen.piecesPerCase > 1 && (
                  <>
                    {" "}
                    ·{" "}
                    {formatStockBalance(
                      stockOpen.currentPieces,
                      stockOpen.piecesPerCase,
                      stockOpen.unit,
                    )}
                  </>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={`Bulk qty (${stockOpen ? bulkUnitLabel(stockOpen.unit) : "bulk"})`}
              >
                <NumInput
                  value={stockBulk}
                  min={0}
                  allowDecimal={
                    stockOpen ? isWeightUnit(stockOpen.unit) : false
                  }
                  onChange={(n) =>
                    setStockBulk(
                      stockOpen && isWeightUnit(stockOpen.unit)
                        ? Number(n || 0)
                        : Math.floor(n || 0),
                    )
                  }
                  className={inputCls}
                />
              </Field>
              <Field
                label={`Loose ${stockOpen ? baseUnitLabel(stockOpen.unit) : "units"}`}
              >
                <NumInput
                  value={stockLoose}
                  min={0}
                  allowDecimal={
                    stockOpen ? isWeightUnit(stockOpen.unit) : false
                  }
                  onChange={(n) =>
                    setStockLoose(
                      stockOpen && isWeightUnit(stockOpen.unit)
                        ? Number(n || 0)
                        : Math.floor(n || 0),
                    )
                  }
                  className={inputCls}
                />
              </Field>
            </div>
            <Field
              label={`Total ${stockOpen ? baseUnitLabel(stockOpen.unit) : "units"} (auto)`}
            >
              <input
                type="text"
                readOnly
                value={stockTotalPieces}
                className={`${inputCls} bg-muted/40 font-semibold`}
              />
              {stockOpen &&
                stockOpen.mode === "in" &&
                stockTotalPieces > 0 &&
                (() => {
                  const ppcD = Math.max(1, stockOpen.piecesPerCase);
                  const after = stockOpen.currentPieces + stockTotalPieces;
                  const cs = Math.floor(after / ppcD);
                  const lo = after - cs * ppcD;
                  const selectedUnit = String(stockOpen.unit || "piece");

                  const unitLabel =
                    selectedUnit === "kg"
                      ? "KG"
                      : selectedUnit === "g"
                        ? "Gram"
                        : selectedUnit === "box"
                          ? "Box"
                          : selectedUnit === "case"
                            ? "Case"
                            : selectedUnit === "packet"
                              ? "Packet"
                              : selectedUnit === "bottle"
                                ? "Bottle"
                                : selectedUnit === "tin"
                                  ? "Tin"
                                  : selectedUnit === "bag"
                                    ? "Bag"
                                    : "Piece";

                  return (
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      After: {formatTotalBase(after, stockOpen.unit)}
                      {ppcD > 1
                        ? ` → ${formatStockBalance(after, ppcD, stockOpen.unit)}`
                        : ""}
                    </div>
                  );
                })()}
            </Field>
            {stockOpen?.mode === "in" && (
              <Field label="Buying person / Purchased by">
                <select
                  value={stockBuyingPersonId}
                  onChange={(e) => setStockBuyingPersonId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Select buying person —</option>
                  {buyingPeople.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                      {u.isPurchasingStaff ? " · Purchasing" : ""}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  Who physically bought / arranged the goods. Separate from the
                  user entering this record.
                </div>
              </Field>
            )}
            {stockOpen?.mode === "in" && (
              <Field label="Expiry date (this batch)">
                <input
                  type="date"
                  value={stockExpiry}
                  onChange={(e) => setStockExpiry(e.target.value)}
                  className={inputCls}
                />
                <div className="mt-1 text-[10px] text-muted-foreground">
                  Leave blank for items without an expiry date. Each stock-in is
                  saved as a separate batch.
                </div>
              </Field>
            )}
            <Field label="Reason / note">
              <input
                value={stockReason}
                onChange={(e) => setStockReason(e.target.value)}
                placeholder={
                  stockOpen?.mode === "in"
                    ? "Received, return, etc."
                    : "Sold, transfer, etc."
                }
                className={inputCls}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockOpen(null)}>
              Cancel
            </Button>
            <Button onClick={submitStock}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface FieldProps {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}
function Field({ label, children, full }: FieldProps) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "good" | "bad";
}
function Stat({ label, value, accent, tone }: StatProps) {
  const cls =
    tone === "good"
      ? "text-emerald-600"
      : tone === "bad"
        ? "text-rose-600"
        : accent
          ? "text-primary"
          : "";
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={`font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

interface StockHistoryDialogProps {
  product: Product | null;
  onClose: () => void;
  sales: Sale[];
  inventoryTx: InventoryTx[];
  batches: StockBatch[];
  nearExpiryDays: number;
}
function StockHistoryDialog({
  product,
  onClose,
  sales,
  inventoryTx,
  batches,
  nearExpiryDays,
}: StockHistoryDialogProps) {
  const txs = useMemo(() => {
    if (!product) return [] as InventoryTx[];
    return inventoryTx
      .filter((t) => t.productId === product.id)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [product, inventoryTx]);

  const stockAddEntries = useMemo(
    () => txs.filter((t) => t.type === "in" || t.type === "receive"),
    [txs],
  );
  const lastAdded = stockAddEntries[0];

  // Selling speed from sales
  const speed = useMemo(() => {
    if (!product) return null;
    const lines = sales
      .filter((s) => !s.voided)
      .flatMap((s) =>
        s.items
          .filter((i) => i.productId === product.id)
          .map((i) => ({ date: s.date, qty: i.qty })),
      );
    if (lines.length === 0) return null;
    const totalSold = lines.reduce((a, b) => a + b.qty, 0);
    const dates = lines.map((l) => new Date(l.date).getTime());
    const earliest = Math.min(...dates);
    const now = Date.now();
    const days = Math.max(1, Math.ceil((now - earliest) / 86_400_000));
    const perDay = totalSold / days;
    return { totalSold, days, perDay };
  }, [product, sales]);

  const daysLeft =
    speed && speed.perDay > 0 && product
      ? product.stockPieces / speed.perDay
      : null;

  const ppc = product ? Math.max(1, product.piecesPerCase || 1) : 1;
  const cases = product ? Math.floor(product.stockPieces / ppc) : 0;
  const loose = product ? product.stockPieces - cases * ppc : 0;

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <History className="h-4 w-4" /> {product?.name} — Stock details
            </span>
          </DialogTitle>
        </DialogHeader>
        {product && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Current balance"
                value={formatTotalBase(product.stockPieces, product.unit)}
                accent
              />
              <Stat
                label="As bulk + loose"
                value={
                  ppc > 1
                    ? formatStockBalance(product.stockPieces, ppc, product.unit)
                    : formatTotalBase(product.stockPieces, product.unit)
                }
              />
              <Stat
                label="Last stock added"
                value={
                  lastAdded
                    ? new Date(lastAdded.date).toLocaleDateString(undefined, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"
                }
              />
              <Stat
                label="Last added qty"
                value={
                  lastAdded ? formatTotalBase(lastAdded.qty, product.unit) : "—"
                }
              />
            </div>

            <div className="rounded-xl border border-border bg-secondary/30 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5" /> Selling speed
              </div>
              {speed ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat
                    label="Total sold"
                    value={formatTotalBase(speed.totalSold, product.unit)}
                  />
                  <Stat label="Tracked days" value={`${speed.days}`} />
                  <Stat
                    label="Avg / day"
                    value={`${speed.perDay.toFixed(2)} ${baseUnitLabel(product.unit)}`}
                    accent
                  />
                  <Stat
                    label="Estimated days left"
                    value={
                      daysLeft != null ? `${Math.round(daysLeft)} days` : "—"
                    }
                    tone={daysLeft != null && daysLeft < 7 ? "bad" : "good"}
                  />
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  No sales yet for this product. Selling speed will appear after
                  the first sale.
                </div>
              )}
            </div>

            <ProductBatchesPanel
              product={product}
              batches={batches}
              nearExpiryDays={nearExpiryDays}
            />

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Stock history ({txs.length})
              </div>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-left">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((t) => {
                      const isIn = t.type === "in" || t.type === "receive";
                      return (
                        <tr key={t.id} className="border-t border-border">
                          <td className="px-3 py-2 text-muted-foreground">
                            {new Date(t.date).toLocaleString(undefined, {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                isIn
                                  ? "bg-emerald-100 text-emerald-700"
                                  : t.type === "damage"
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {t.type}
                            </span>
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-semibold ${
                              isIn ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {isIn ? "+" : "−"}
                            {formatTotalBase(t.qty, product.unit)}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {t.note ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {txs.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-8 text-center text-muted-foreground"
                        >
                          No stock history yet for this item.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ProductBatchesPanelProps {
  product: Product;
  batches: StockBatch[];
  nearExpiryDays: number;
}
function ProductBatchesPanel({
  product,
  batches,
  nearExpiryDays,
}: ProductBatchesPanelProps) {
  const own = useMemo(
    () => sortBatchesFifo(batches.filter((b) => b.productId === product.id)),
    [batches, product.id],
  );
  if (own.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
        No batch records yet. Future stock-ins with an expiry date will be
        tracked as separate batches here.
      </div>
    );
  }
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Batches ({own.length}) — FIFO sale order
      </div>
      <div className="max-h-60 overflow-y-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Purchased</th>
              <th className="px-3 py-2 text-left">Expires</th>
              <th className="px-3 py-2 text-right">Initial</th>
              <th className="px-3 py-2 text-right">Remaining</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {own.map((b) => {
              const days = daysUntilExpiry(b.expiryDate);
              const isExpired = days != null && days < 0;
              const isNear =
                days != null && days >= 0 && days <= nearExpiryDays;
              const empty = b.remainingPieces <= 0;
              return (
                <tr key={b.id} className="border-t border-border">
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(b.purchaseDate).toLocaleDateString(undefined, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    {b.expiryDate ? (
                      <span
                        className={
                          isExpired
                            ? "font-semibold text-rose-600"
                            : isNear
                              ? "font-semibold text-amber-600"
                              : "text-foreground"
                        }
                      >
                        {new Date(b.expiryDate).toLocaleDateString(undefined, {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                        {days != null && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            (
                            {isExpired
                              ? `${Math.abs(days)}d ago`
                              : `${days}d left`}
                            )
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">No expiry</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {formatNumber(b.qtyPieces)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {formatNumber(b.remainingPieces)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        empty
                          ? "bg-slate-200 text-slate-600"
                          : isExpired
                            ? "bg-rose-100 text-rose-700"
                            : isNear
                              ? "bg-amber-100 text-amber-700"
                              : b.expiryDate
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {empty
                        ? "Empty"
                        : isExpired
                          ? "Expired"
                          : isNear
                            ? "Near expiry"
                            : b.expiryDate
                              ? "OK"
                              : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
