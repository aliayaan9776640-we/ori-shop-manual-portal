import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useStore, landedCostPerPiece } from "@/lib/store";
import type { UnitType } from "@/lib/types";
import { useDropdownGroup } from "@/lib/dropdowns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  Search,
  Package,
  TrendingDown,
  ArrowDown,
} from "lucide-react";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import { LOGO_URL } from "@/components/Logo";
import NumInput from "@/components/NumInput";

const UNIT_TO_PIECES = (unit: UnitType, unitQty: number, piecesPerCase: number): number => {
  const ppCase = Math.max(1, piecesPerCase || 1);
  if (unit === "case" || unit === "box") return Math.round(unitQty * ppCase);
  return Math.round(unitQty); // piece, kg, tin treated as base units
};

export default function Damaged() {
  const products = useStore((s) => s.products);
  const damaged = useStore((s) => s.damaged);
  const addDamaged = useStore((s) => s.addDamaged);
  const unitOptions = useDropdownGroup("damage_unit_type");
  const reasonOptions = useDropdownGroup("damage_reason");

  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [unit, setUnit] = useState<UnitType>("piece");
  const [unitQty, setUnitQty] = useState(1);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");

  const product = products.find((p) => p.id === productId);

  const previewPieces = product
    ? UNIT_TO_PIECES(unit, unitQty, product.piecesPerCase)
    : 0;
  const previewLcpp = product ? landedCostPerPiece(product) : 0;
  const previewLoss = previewPieces * previewLcpp;
  const previewStockAfter = product
    ? Math.max(0, product.stockPieces - previewPieces)
    : 0;

  const resetForm = (): void => {
    setProductId("");
    setUnit("piece");
    setUnitQty(1);
    setReason("");
    setNotes("");
  };

  const submit = (): void => {
    if (!product) return toast.error("Select a product");
    if (unitQty <= 0) return toast.error("Quantity must be > 0");
    if (!reason.trim()) return toast.error("Damage reason is required");
    if (previewPieces > product.stockPieces) {
      return toast.error(
        `Only ${product.stockPieces} pcs in stock. Reduce quantity.`
      );
    }
    addDamaged({
      productId: product.id,
      name: product.name,
      qty: previewPieces,
      unit,
      unitQty,
      reason: reason.trim(),
      notes: notes.trim() || undefined,
      valueLoss: 0, // recalculated in store
    });
    toast.success(`Damage recorded — loss ${formatCurrency(previewLoss)}`);
    setOpen(false);
    resetForm();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return damaged;
    return damaged.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.reason.toLowerCase().includes(q) ||
        (d.notes ?? "").toLowerCase().includes(q) ||
        (d.barcode ?? "").toLowerCase().includes(q) ||
        (d.reportedByName ?? "").toLowerCase().includes(q)
    );
  }, [damaged, search]);

  const totalLoss = filtered.reduce((s, d) => s + d.valueLoss, 0);
  const totalPieces = filtered.reduce((s, d) => s + d.qty, 0);

  const exportCSV = (): void => {
    const headers = [
      "Date",
      "Product",
      "Barcode",
      "Qty",
      "Unit",
      "Pieces",
      "Landed Cost/Pc",
      "Total Loss",
      "Reason",
      "Notes",
      "Stock Before",
      "Stock After",
      "Entered By",
    ];
    const rows = filtered.map((d) => [
      formatDateTime(d.date),
      d.name,
      d.barcode ?? "",
      d.unitQty,
      d.unit,
      d.qty,
      (d.landedCostPerPiece ?? 0).toFixed(4),
      d.valueLoss.toFixed(2),
      d.reason,
      d.notes ?? "",
      d.stockBefore ?? "",
      d.stockAfter ?? "",
      d.reportedByName ?? d.reportedBy,
    ]);
    const csv = [headers, ...rows]
      .map((r) =>
        r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `damaged_items_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported to Excel/CSV");
  };

  const exportPDF = (): void => {
    const w = window.open("", "_blank", "width=1000,height=720");
    if (!w) return toast.error("Popup blocked");
    const tableRows = filtered
      .map(
        (d) => `
      <tr>
        <td>${formatDateTime(d.date)}</td>
        <td><strong>${d.name}</strong>${d.barcode ? `<br/><span class="muted">${d.barcode}</span>` : ""}</td>
        <td>${d.unitQty} ${d.unit}<br/><span class="muted">${d.qty} pcs</span></td>
        <td class="num">${(d.landedCostPerPiece ?? 0).toFixed(2)}</td>
        <td class="num loss">-${d.valueLoss.toFixed(2)}</td>
        <td>${d.reason}${d.notes ? `<br/><span class="muted">${d.notes}</span>` : ""}</td>
        <td class="num">${d.stockBefore ?? "—"} → ${d.stockAfter ?? "—"}</td>
        <td>${d.reportedByName ?? "—"}</td>
      </tr>`
      )
      .join("");
    w.document.write(`<!doctype html><html><head><title>Damaged Items Report — Ori Barakah Store</title>
      <style>
        @page { size: A4; margin: 16mm; }
        body{font-family:-apple-system,Segoe UI,sans-serif;color:#1f2418;margin:0;padding:24px;position:relative}
        body::before{content:"";position:fixed;inset:0;background:url('${LOGO_URL}') center/45% no-repeat;opacity:.05;pointer-events:none}
        .header{display:flex;align-items:center;gap:16px;border-bottom:3px solid #d97a17;padding-bottom:12px;margin-bottom:16px}
        .header img{width:64px;height:64px;border-radius:50%;border:2px solid #1f2418}
        .header h1{margin:0;font-size:20px;color:#5a6b1f}
        .header .sub{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1.5px}
        .meta{display:flex;justify-content:space-between;font-size:11px;color:#666;margin-bottom:14px}
        .summary{display:flex;gap:12px;margin-bottom:14px}
        .stat{flex:1;border:1px solid #e3e3d8;border-radius:8px;padding:10px 14px;background:#faf8f1}
        .stat .l{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#888}
        .stat .v{font-size:18px;font-weight:700;color:#5a6b1f;margin-top:2px}
        .stat.loss .v{color:#c0392b}
        table{width:100%;border-collapse:collapse;font-size:11px;position:relative;z-index:1}
        th{background:#5a6b1f;color:#fff;text-transform:uppercase;letter-spacing:1px;font-size:9px;padding:8px;text-align:left}
        td{border:1px solid #e3e3d8;padding:8px;vertical-align:top}
        tr:nth-child(even) td{background:#faf8f1}
        .num{text-align:right;font-variant-numeric:tabular-nums}
        .loss{color:#c0392b;font-weight:600}
        .muted{color:#888;font-size:10px}
        .footer{margin-top:18px;font-size:10px;color:#888;text-align:center;border-top:1px solid #e3e3d8;padding-top:8px}
      </style></head><body>
      <div class="header">
        <img src="${LOGO_URL}" alt="logo"/>
        <div>
          <h1>Damaged Items Report</h1>
          <div class="sub">Ori Barakah Store · Ori Brothers</div>
        </div>
      </div>
      <div class="meta">
        <span>Generated: ${new Date().toLocaleString()}</span>
        <span>Records: ${filtered.length}</span>
      </div>
      <div class="summary">
        <div class="stat"><div class="l">Total Entries</div><div class="v">${filtered.length}</div></div>
        <div class="stat"><div class="l">Total Pieces Lost</div><div class="v">${totalPieces}</div></div>
        <div class="stat loss"><div class="l">Total Value Loss</div><div class="v">${formatCurrency(totalLoss)}</div></div>
      </div>
      <table>
        <thead><tr>
          <th>Date</th><th>Product</th><th>Qty</th><th>LC/Pc</th>
          <th>Loss</th><th>Reason / Notes</th><th>Stock</th><th>Entered By</th>
        </tr></thead>
        <tbody>${tableRows || `<tr><td colspan="8" style="text-align:center;padding:40px;color:#888">No records</td></tr>`}</tbody>
      </table>
      <div class="footer">© ${new Date().getFullYear()} Ori Barakah Store · Confidential — Internal Use Only</div>
      <script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <>
      <PageHeader
        title="Damaged Items"
        description="Auto loss calculation based on landed cost. Stock is reduced automatically."
        actions={
          <>
            <Button variant="outline" onClick={exportCSV} className="gap-2">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" onClick={exportPDF} className="gap-2">
              <FileText className="h-4 w-4" /> PDF
            </Button>
            <Button onClick={() => setOpen(true)} className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
              <Plus className="h-4 w-4" /> Record Damage
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<Package className="h-5 w-5" />}
          label="Total entries"
          value={String(filtered.length)}
          tone="neutral"
        />
        <StatCard
          icon={<ArrowDown className="h-5 w-5" />}
          label="Pieces lost"
          value={String(totalPieces)}
          tone="warning"
        />
        <StatCard
          icon={<TrendingDown className="h-5 w-5" />}
          label="Total value loss"
          value={formatCurrency(totalLoss)}
          tone="danger"
        />
      </div>

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by product, reason, notes, user..."
          className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-right">Damage Qty</th>
                <th className="px-4 py-3 text-right">LC / pc</th>
                <th className="px-4 py-3 text-right">Total Loss</th>
                <th className="px-4 py-3 text-left">Reason</th>
                <th className="px-4 py-3 text-right">Stock Before → After</th>
                <th className="px-4 py-3 text-left">Entered By</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-t border-border align-top">
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDateTime(d.date)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{d.name}</div>
                    {d.barcode && (
                      <div className="text-xs text-muted-foreground">{d.barcode}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-medium">
                      {d.unitQty} {d.unit}
                    </div>
                    <div className="text-xs text-muted-foreground">{d.qty} pcs</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {formatCurrency(d.landedCostPerPiece ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-destructive">
                    -{formatCurrency(d.valueLoss)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm">{d.reason}</div>
                    {d.notes && (
                      <div className="text-xs text-muted-foreground">{d.notes}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    <span className="text-muted-foreground">{d.stockBefore ?? "—"}</span>
                    <span className="mx-1">→</span>
                    <span className="font-medium">{d.stockAfter ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">{d.reportedByName ?? "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    <AlertTriangle className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    No damaged items recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Record Damaged Item</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product / Barcode" full>
              <select
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  const p = products.find((x) => x.id === e.target.value);
                  if (p) setUnit(p.unit);
                }}
                className={inputCls}
              >
                <option value="">— Select product —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.barcode ? `· ${p.barcode}` : ""} ({p.stockPieces} pcs in stock)
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Damage quantity">
              <NumInput
                value={unitQty}
                onChange={(n) => setUnitQty(n)}
                min={0}
                step={0.5}
                className={inputCls}
              />
            </Field>
            <Field label="Unit type">
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as UnitType)}
                className={inputCls}
              >
                {(unitOptions.length > 0
                  ? unitOptions
                  : [
                      { id: "u-piece", value: "piece", label: "Piece" },
                      { id: "u-kg", value: "kg", label: "KG" },
                      { id: "u-tin", value: "tin", label: "Tin" },
                      { id: "u-box", value: "box", label: "Box" },
                      { id: "u-case", value: "case", label: "Case" },
                    ]
                ).map((u) => (
                  <option key={u.id} value={u.value}>
                    {u.label}
                  </option>
                ))}
                {!unitOptions.some((u) => u.value === unit) && unitOptions.length > 0 && (
                  <option value={unit}>{unit} (legacy)</option>
                )}
              </select>
            </Field>
            <Field label="Damage reason" full>
              {reasonOptions.length > 0 ? (
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Select reason —</option>
                  {reasonOptions.map((r) => (
                    <option key={r.id} value={r.label}>
                      {r.label}
                    </option>
                  ))}
                  {reason &&
                    !reasonOptions.some((r) => r.label === reason) && (
                      <option value={reason}>{reason} (legacy)</option>
                    )}
                </select>
              ) : (
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Broken, expired, water damage, etc."
                  className={inputCls}
                />
              )}
            </Field>
            <Field label="Notes (optional)" full>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional details..."
                rows={2}
                className={`${inputCls} h-auto py-2`}
              />
            </Field>
          </div>

          {product && (
            <div className="mt-2 rounded-xl border border-border bg-secondary/40 p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Auto-calculated loss preview
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                <Detail k="Product" v={product.name} />
                <Detail k="Damage qty" v={`${unitQty} ${unit} (${previewPieces} pcs)`} />
                <Detail k="Landed cost / pc" v={formatCurrency(previewLcpp)} />
                <Detail k="Stock before" v={`${product.stockPieces} pcs`} />
                <Detail k="Stock after" v={`${previewStockAfter} pcs`} />
                <Detail k="Date" v={formatDate(new Date().toISOString())} />
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-destructive/10 px-4 py-3">
                <div className="text-sm font-medium text-destructive">Total loss amount</div>
                <div className="text-xl font-bold text-destructive">
                  -{formatCurrency(previewLoss)}
                </div>
              </div>
              {previewPieces > product.stockPieces && (
                <div className="mt-2 flex items-center gap-2 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Damage exceeds available stock ({product.stockPieces} pcs).
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} className="bg-accent text-accent-foreground hover:bg-accent/90">
              Record damage
            </Button>
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

interface DetailProps {
  k: string;
  v: string;
}
function Detail({ k, v }: DetailProps) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {k}
      </div>
      <div className="font-medium">{v}</div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "neutral" | "warning" | "danger";
}
function StatCard({ icon, label, value, tone }: StatCardProps) {
  const tones: Record<StatCardProps["tone"], string> = {
    neutral: "from-secondary to-card text-foreground",
    warning: "from-amber-50 to-orange-50 text-amber-900 border-amber-200",
    danger: "from-rose-50 to-red-50 text-rose-900 border-rose-200",
  };
  return (
    <div
      className={`flex items-center gap-4 rounded-2xl border border-border bg-gradient-to-br p-5 shadow-sm ${tones[tone]}`}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/70 backdrop-blur">
        {icon}
      </div>
      <div>
        <div className="text-xs uppercase tracking-widest opacity-70">{label}</div>
        <div className="mt-0.5 text-2xl font-bold">{value}</div>
      </div>
    </div>
  );
}
