import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import NumInput from "@/components/NumInput";
import { useStore, useCurrentUser } from "@/lib/store";
import {
  usePurchaseOrders,
  PO_STATUS_COLOR,
  PO_STATUS_LABEL,
  PO_ITEM_COLOR,
  PO_ITEM_LABEL,
  type NewPOItemDraft,
  type BuyingEntry,
  type ReceiveEntry,
  type DraftItemPatch,
} from "@/lib/purchaseOrders";
import type { PurchaseOrder, PurchaseOrderItem, UnitType } from "@/lib/types";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import {
  Plus,
  Trash2,
  ClipboardCheck,
  PackageCheck,
  ShieldCheck,
  ShieldX,
  Anchor,
  AlertCircle,
  Send,
  ChevronDown,
  ChevronUp,
  Pencil,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function PurchaseOrders() {
  const me = useCurrentUser();
  const products = useStore((s) => s.products);
  const suppliers = useStore((s) => s.suppliers);
  const users = useStore((s) => s.users);

  const pos = usePurchaseOrders((s) => s.pos);
  const load = usePurchaseOrders((s) => s.load);
  const loaded = usePurchaseOrders((s) => s.loaded);

  const isAdmin = me?.role === "admin";
  const isStorekeeper = me?.role === "storekeeper";
  const isPurchaser = !!me?.isPurchasingStaff;

  useEffect(() => {
    if (!loaded) void load();
  }, [load, loaded]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editDraftFor, setEditDraftFor] = useState<PurchaseOrder | null>(null);
  const [buyingFor, setBuyingFor] = useState<PurchaseOrder | null>(null);
  const [receiveFor, setReceiveFor] = useState<PurchaseOrder | null>(null);
  const [loadFor, setLoadFor] = useState<PurchaseOrder | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<"all" | "mine" | "pending_approval" | "loaded" | "completed">(
    isAdmin ? "pending_approval" : "mine"
  );

  const filtered = useMemo(() => {
    return pos.filter((p) => {
      if (filter === "mine") return p.assignedTo === me?.id;
      if (filter === "pending_approval") return p.status === "waiting_approval";
      if (filter === "loaded") return p.status === "loaded" || p.status === "receiving";
      if (filter === "completed") return p.status === "completed";
      return true;
    });
  }, [pos, filter, me?.id]);

  const purchasingStaff = users.filter((u) => u.isPurchasingStaff && u.active);

  const pendingApprovalCount = pos.filter((p) => p.status === "waiting_approval").length;
  const myAssignedCount = pos.filter(
    (p) =>
      p.assignedTo === me?.id &&
      (p.status === "assigned" ||
        p.status === "buying_in_progress" ||
        p.items.some((i) => i.status === "needs_correction"))
  ).length;

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        description="Controlled buying workflow — raise, assign, approve, receive."
        actions={
          isAdmin || isStorekeeper ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={autoBusy}
                onClick={async () => {
                  setAutoBusy(true);
                  const po = await usePurchaseOrders.getState().generateFromLowStock();
                  setAutoBusy(false);
                  if (!po) {
                    toast.info("No low-stock items to draft");
                    return;
                  }
                  toast.success(`Auto-draft ${po.poNo ?? po.id.slice(-6)} (${po.items.length} items)`);
                  setEditDraftFor(po);
                }}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                {autoBusy ? "Generating…" : "Auto from Low Stock"}
              </Button>
              {isAdmin && (
                <Button onClick={() => setCreateOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" /> New PO
                </Button>
              )}
            </div>
          ) : null
        }
      />

      {/* Stat strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="All" value={pos.length} accent="slate" />
        <Stat label="Pending Approval" value={pendingApprovalCount} accent="orange" />
        <Stat label="My Assigned" value={myAssignedCount} accent="blue" />
        <Stat
          label="Completed"
          value={pos.filter((p) => p.status === "completed").length}
          accent="emerald"
        />
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["mine", "Assigned to me"],
            ["pending_approval", "Pending Approval"],
            ["loaded", "Loaded / Receiving"],
            ["completed", "Completed"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              filter === k
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-secondary"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            No purchase orders match this view.
          </div>
        )}
        {filtered.map((po) => {
          const sup = suppliers.find((s) => s.id === po.supplierId);
          const isOpen = expanded[po.id] ?? false;
          const canEnterBuying =
            (isAdmin || (isPurchaser && po.assignedTo === me?.id)) &&
            (po.status === "assigned" ||
              po.status === "buying_in_progress" ||
              po.items.some((i) => i.status === "needs_correction"));
          const canApprove = isAdmin && po.status === "waiting_approval";
          const canEditDraft =
            (isAdmin || isStorekeeper) &&
            (po.status === "auto_draft" ||
              po.status === "draft" ||
              po.status === "storekeeper_edited");
          const canMarkLoaded =
            (isAdmin || isPurchaser) &&
            (po.status === "approved" || po.status === "buying_in_progress");
          const canReceive =
            (isAdmin || isStorekeeper) &&
            (po.status === "loaded" || po.status === "receiving");

          return (
            <div
              key={po.id}
              className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
            >
              <div className="flex flex-col gap-3 border-b border-border bg-secondary/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <ClipboardCheck className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{po.poNo ?? po.id.slice(-6).toUpperCase()}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PO_STATUS_COLOR[po.status]}`}
                      >
                        {PO_STATUS_LABEL[po.status]}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {sup?.name ?? "—"} · {po.items.length} items
                      {!isStorekeeper && po.totalAmount > 0 && (
                        <> · {formatCurrency(po.totalAmount)}</>
                      )}
                      {po.assignedToName && <> · Buyer: {po.assignedToName}</>}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isAdmin &&
                    (po.status === "raised" ||
                      po.status === "draft" ||
                      po.status === "approved") && (
                      <AssignButton po={po} purchasingStaff={purchasingStaff} />
                    )}
                  {canEditDraft && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditDraftFor(po)}
                      className="gap-1.5"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit Draft
                    </Button>
                  )}
                  {canEnterBuying && (
                    <Button size="sm" onClick={() => setBuyingFor(po)} className="gap-1.5">
                      <Pencil className="h-3.5 w-3.5" /> Enter Buying
                    </Button>
                  )}
                  {canApprove && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          void usePurchaseOrders.getState().approvePO(po.id);
                          toast.success("Approved");
                        }}
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const reason = prompt("Rejection reason");
                          if (!reason) return;
                          void usePurchaseOrders.getState().rejectPO(po.id, reason);
                          toast.warning("Rejected");
                        }}
                        className="gap-1.5"
                      >
                        <ShieldX className="h-3.5 w-3.5 text-rose-500" /> Reject
                      </Button>
                    </>
                  )}
                  {canMarkLoaded && (
                    <Button size="sm" variant="outline" onClick={() => setLoadFor(po)} className="gap-1.5">
                      <Anchor className="h-3.5 w-3.5" /> Mark Loaded
                    </Button>
                  )}
                  {canReceive && (
                    <Button size="sm" onClick={() => setReceiveFor(po)} className="gap-1.5">
                      <PackageCheck className="h-3.5 w-3.5" /> Receive
                    </Button>
                  )}
                  <button
                    onClick={() => setExpanded((e) => ({ ...e, [po.id]: !isOpen }))}
                    className="rounded-md p-1.5 hover:bg-secondary"
                  >
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {isOpen && (
                <POItemsTable
                  po={po}
                  hideCost={isStorekeeper}
                  onCorrect={(itemId) => {
                    const note = prompt("Correction note for purchasing staff");
                    if (!note) return;
                    void usePurchaseOrders.getState().requestCorrection(po.id, itemId, note);
                    toast.warning("Sent back for correction");
                  }}
                  onComplete={
                    isAdmin || isStorekeeper
                      ? (itemId) => {
                          void usePurchaseOrders.getState().completeItem(po.id, itemId);
                          toast.success("Item completed — inventory updated");
                        }
                      : undefined
                  }
                />
              )}

              <div className="flex flex-wrap gap-3 border-t border-border bg-secondary/20 px-4 py-2 text-[11px] text-muted-foreground">
                <span>Raised by <b className="text-foreground">{po.raisedByName ?? "—"}</b> on {formatDateTime(po.raisedAt)}</span>
                {po.assignedToName && <span>· Assigned to {po.assignedToName}</span>}
                {po.buyingPersonName && <span>· Bought by {po.buyingPersonName}</span>}
                {po.approvedByName && <span>· Approved by {po.approvedByName} {po.approvedAt && `on ${formatDate(po.approvedAt)}`}</span>}
                {po.invoiceNo && <span>· Invoice: {po.invoiceNo}</span>}
                {po.boatName && <span>· Boat: {po.boatName}</span>}
                {po.rejectedReason && (
                  <span className="text-rose-600">· Rejected: {po.rejectedReason}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New PO dialog */}
      {isAdmin && (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Raise New Purchase Order</DialogTitle>
            </DialogHeader>
            <CreatePOForm
              onClose={() => setCreateOpen(false)}
              purchasingStaff={purchasingStaff}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Edit draft dialog */}
      <Dialog open={!!editDraftFor} onOpenChange={(o) => !o && setEditDraftFor(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Draft — {editDraftFor?.poNo}</DialogTitle>
          </DialogHeader>
          {editDraftFor && (
            <EditDraftForm po={editDraftFor} onDone={() => setEditDraftFor(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Enter buying dialog */}
      <Dialog open={!!buyingFor} onOpenChange={(o) => !o && setBuyingFor(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Enter Buying Details — {buyingFor?.poNo}</DialogTitle>
          </DialogHeader>
          {buyingFor && (
            <BuyingForm po={buyingFor} onDone={() => setBuyingFor(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Receive dialog */}
      <Dialog open={!!receiveFor} onOpenChange={(o) => !o && setReceiveFor(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Receive Goods — {receiveFor?.poNo}</DialogTitle>
          </DialogHeader>
          {receiveFor && (
            <ReceiveForm po={receiveFor} onDone={() => setReceiveFor(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Mark loaded dialog */}
      <Dialog open={!!loadFor} onOpenChange={(o) => !o && setLoadFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Loaded — {loadFor?.poNo}</DialogTitle>
          </DialogHeader>
          {loadFor && <LoadedForm po={loadFor} onDone={() => setLoadFor(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* -------------------------------------------------------------------- */

interface StatProps {
  label: string;
  value: number;
  accent: "slate" | "orange" | "blue" | "emerald";
}
function Stat({ label, value, accent }: StatProps) {
  const map: Record<StatProps["accent"], string> = {
    slate: "bg-slate-100 text-slate-700",
    orange: "bg-orange-100 text-orange-700",
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-emerald-100 text-emerald-700",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div
        className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${map[accent]}`}
      >
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

interface AssignButtonProps {
  po: PurchaseOrder;
  purchasingStaff: { id: string; fullName: string }[];
}
function AssignButton({ po, purchasingStaff }: AssignButtonProps) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
        <Send className="h-3.5 w-3.5" /> Assign
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Purchasing Staff</DialogTitle>
          </DialogHeader>
          {purchasingStaff.length === 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              No purchasing staff yet. Mark a user as &quot;Purchasing Staff&quot; in Users page.
            </div>
          ) : (
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className={inputCls}
            >
              <option value="">— Select staff —</option>
              {purchasingStaff.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!pick) return;
                void usePurchaseOrders.getState().assign(po.id, pick);
                toast.success("Assigned");
                setOpen(false);
              }}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------------- PO items table ---------------------- */

interface POItemsTableProps {
  po: PurchaseOrder;
  hideCost: boolean;
  onCorrect: (itemId: string) => void;
  onComplete?: (itemId: string) => void;
}
function POItemsTable({ po, hideCost, onCorrect, onComplete }: POItemsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">Item</th>
            <th className="px-4 py-2 text-right">Expected</th>
            <th className="px-4 py-2 text-right">Bought</th>
            {!hideCost && <th className="px-4 py-2 text-right">Total</th>}
            <th className="px-4 py-2 text-right">Received / Damaged</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {po.items.map((it) => (
            <tr key={it.id} className="border-t border-border align-top">
              <td className="px-4 py-2">
                <div className="font-medium">{it.productName}</div>
                <div className="text-xs text-muted-foreground">
                  {it.unitType} · {it.piecesPerCase} pcs/case
                </div>
                {it.expiryDate && (
                  <div className="text-[11px] text-muted-foreground">
                    Exp: {formatDate(it.expiryDate)}
                  </div>
                )}
                {it.batchNo && (
                  <div className="text-[11px] text-muted-foreground">
                    Batch: {it.batchNo}
                  </div>
                )}
                {it.correctionNote && (
                  <div className="mt-1 inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-700">
                    <AlertCircle className="h-3 w-3" /> {it.correctionNote}
                  </div>
                )}
              </td>
              <td className="px-4 py-2 text-right">
                {it.expectedQty} {it.unitType}
              </td>
              <td className="px-4 py-2 text-right">
                {it.buyingQty > 0 ? (
                  <>
                    {it.buyingQty} {it.unitType}
                    {!hideCost && it.buyingPriceCase > 0 && (
                      <div className="text-[11px] text-muted-foreground">
                        {formatCurrency(it.buyingPriceCase)} / {it.unitType}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              {!hideCost && (
                <td className="px-4 py-2 text-right font-medium">
                  {it.totalAmount > 0 ? formatCurrency(it.totalAmount) : "—"}
                </td>
              )}
              <td className="px-4 py-2 text-right">
                {it.receivedQty > 0 || it.damagedQty > 0 ? (
                  <>
                    <span className="font-medium">{it.receivedQty} pcs</span>
                    {it.damagedQty > 0 && (
                      <span className="ml-1 text-rose-600">(-{it.damagedQty})</span>
                    )}
                    {it.missingQty > 0 && (
                      <div className="text-[11px] text-amber-600">
                        Missing {it.missingQty} pcs
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PO_ITEM_COLOR[it.status]}`}
                >
                  {PO_ITEM_LABEL[it.status]}
                </span>
              </td>
              <td className="px-4 py-2 text-right">
                <div className="flex justify-end gap-1">
                  {it.status === "received" && (
                    <>
                      <button
                        onClick={() => onCorrect(it.id)}
                        className="rounded-md px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                      >
                        Send back
                      </button>
                      {onComplete && (
                        <button
                          onClick={() => onComplete(it.id)}
                          className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          Complete
                        </button>
                      )}
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------- Create PO form ---------------------- */

interface DraftRow extends NewPOItemDraft {
  rowId: string;
}

interface CreatePOFormProps {
  onClose: () => void;
  purchasingStaff: { id: string; fullName: string }[];
}
function CreatePOForm({ onClose, purchasingStaff }: CreatePOFormProps) {
  const products = useStore((s) => s.products);
  const suppliers = useStore((s) => s.suppliers);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [requiredDate, setRequiredDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([
    {
      rowId: "r0",
      productName: "",
      expectedQty: 1,
      unitType: "case",
      piecesPerCase: 12,
    },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const addRow = (): void => {
    setRows((r) => [
      ...r,
      {
        rowId: `r${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        productName: "",
        expectedQty: 1,
        unitType: "case",
        piecesPerCase: 12,
      },
    ]);
  };

  const submit = async (): Promise<void> => {
    if (!supplierId) return toast.error("Select supplier");
    const items = rows.filter((r) => r.productName.trim() && r.expectedQty > 0);
    if (items.length === 0) return toast.error("Add at least one item");
    setSubmitting(true);
    const po = await usePurchaseOrders.getState().createPO(
      supplierId,
      items.map(({ rowId: _r, ...rest }) => rest),
      { notes, requiredDate, assignedTo: assignedTo || undefined }
    );
    setSubmitting(false);
    if (po) {
      toast.success(`Created ${po.poNo}`);
      onClose();
    } else {
      toast.error("Failed to create PO");
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Supplier</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Required date</label>
          <input
            type="date"
            value={requiredDate}
            onChange={(e) => setRequiredDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Assign purchasing staff (optional)</label>
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={inputCls}>
            <option value="">— Unassigned (raised) —</option>
            {purchasingStaff.map((u) => (
              <option key={u.id} value={u.id}>{u.fullName}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-lg border border-input bg-background p-3 text-sm" />
        </div>
      </div>

      <div className="rounded-xl border border-border">
        <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</span>
          <Button size="sm" variant="outline" onClick={addRow} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add item
          </Button>
        </div>
        <div className="max-h-[40vh] overflow-y-auto p-3 space-y-2">
          {rows.map((r) => (
            <div key={r.rowId} className="grid grid-cols-12 gap-2">
              <div className="col-span-5">
                <input
                  list="po-products"
                  value={r.productName}
                  onChange={(e) => {
                    const v = e.target.value;
                    const match = products.find((p) => p.name.toLowerCase() === v.toLowerCase());
                    setRows((arr) =>
                      arr.map((x) =>
                        x.rowId === r.rowId
                          ? {
                              ...x,
                              productName: v,
                              productId: match?.id,
                              piecesPerCase: match?.piecesPerCase ?? x.piecesPerCase,
                              unitType: (match?.unit as UnitType | undefined) ?? x.unitType,
                            }
                          : x
                      )
                    );
                  }}
                  placeholder="Item name"
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <NumInput
                  value={r.expectedQty}
                  onChange={(n) =>
                    setRows((arr) => arr.map((x) => (x.rowId === r.rowId ? { ...x, expectedQty: n } : x)))
                  }
                  className={`${inputCls} text-right`}
                  min={0}
                />
              </div>
              <div className="col-span-2">
                <select
                  value={r.unitType}
                  onChange={(e) =>
                    setRows((arr) =>
                      arr.map((x) =>
                        x.rowId === r.rowId ? { ...x, unitType: e.target.value as UnitType } : x
                      )
                    )
                  }
                  className={inputCls}
                >
                  <option value="case">case</option>
                  <option value="box">box</option>
                  <option value="tin">tin</option>
                  <option value="piece">piece</option>
                  <option value="kg">kg</option>
                </select>
              </div>
              <div className="col-span-2">
                <NumInput
                  value={r.piecesPerCase}
                  onChange={(n) =>
                    setRows((arr) =>
                      arr.map((x) =>
                        x.rowId === r.rowId ? { ...x, piecesPerCase: Math.max(1, n) } : x
                      )
                    )
                  }
                  className={`${inputCls} text-right`}
                  min={1}
                />
              </div>
              <div className="col-span-1 flex items-center justify-center">
                <button
                  onClick={() => setRows((arr) => arr.filter((x) => x.rowId !== r.rowId))}
                  className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <datalist id="po-products">
        {products.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button onClick={() => void submit()} disabled={submitting}>
          {submitting ? "Creating..." : "Raise PO"}
        </Button>
      </DialogFooter>
    </div>
  );
}

/* ---------------------- Edit draft form ---------------------- */

interface EditDraftRow {
  rowId: string;
  id?: string;
  productId?: string;
  productName: string;
  expectedQty: number;
  unitType: UnitType;
  piecesPerCase: number;
  notes?: string;
}

interface EditDraftFormProps {
  po: PurchaseOrder;
  onDone: () => void;
}
function EditDraftForm({ po, onDone }: EditDraftFormProps) {
  const products = useStore((s) => s.products);
  const suppliers = useStore((s) => s.suppliers);
  const getLastBuyingInfo = usePurchaseOrders((s) => s.getLastBuyingInfo);
  const [supplierId, setSupplierId] = useState(po.supplierId ?? "");
  const [requiredDate, setRequiredDate] = useState(po.requiredDate?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(po.notes ?? "");
  const [transportFee, setTransportFee] = useState(po.transportFee ?? 0);
  const [rows, setRows] = useState<EditDraftRow[]>(() =>
    po.items.map((it, idx) => ({
      rowId: `e${idx}_${it.id}`,
      id: it.id,
      productId: it.productId,
      productName: it.productName,
      expectedQty: it.expectedQty,
      unitType: it.unitType,
      piecesPerCase: it.piecesPerCase,
      notes: it.notes,
    }))
  );
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const lineEstimate = (r: EditDraftRow): { value: number; last?: ReturnType<typeof getLastBuyingInfo> } => {
    const last = r.productId ? getLastBuyingInfo(r.productId) : undefined;
    if (!last) return { value: 0, last };
    if (r.unitType === "case" || r.unitType === "box" || r.unitType === "tin") {
      return { value: r.expectedQty * (last.lastBuyingPriceCase || last.lastBuyingPricePiece * r.piecesPerCase), last };
    }
    return { value: r.expectedQty * (last.lastBuyingPricePiece || last.lastBuyingPriceCase / Math.max(1, r.piecesPerCase)), last };
  };

  const itemsTotal = rows.reduce((s, r) => s + lineEstimate(r).value, 0);
  const grandTotal = itemsTotal + Number(transportFee || 0);

  const addRow = (): void => {
    setRows((arr) => [
      ...arr,
      {
        rowId: `n${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        productName: "",
        expectedQty: 1,
        unitType: "case",
        piecesPerCase: 12,
      },
    ]);
  };

  const submit = async (action: "save" | "submit"): Promise<void> => {
    setBusy(true);
    const drafts: DraftItemPatch[] = [];
    for (const r of rows) {
      if (!r.productName.trim() || r.expectedQty <= 0) continue;
      drafts.push({
        id: r.id,
        productId: r.productId,
        productName: r.productName,
        expectedQty: r.expectedQty,
        unitType: r.unitType,
        piecesPerCase: r.piecesPerCase,
        notes: r.notes,
      });
    }
    for (const id of removed) {
      drafts.push({
        id,
        productName: "",
        expectedQty: 0,
        unitType: "piece",
        piecesPerCase: 1,
        remove: true,
      });
    }
    await usePurchaseOrders.getState().updateDraftItems(po.id, drafts, {
      supplierId: supplierId || undefined,
      transportFee: Number(transportFee || 0),
      estimatedTotal: grandTotal,
      notes,
      requiredDate,
    });
    if (action === "submit") {
      await usePurchaseOrders.getState().submitDraft(po.id);
      toast.success("Submitted for admin approval");
    } else {
      toast.success("Draft saved");
    }
    setBusy(false);
    onDone();
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Supplier (optional at draft)</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls}>
            <option value="">— Choose later —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Required date</label>
          <input type="date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Boat / transport fee (estimate)</label>
          <NumInput value={transportFee} onChange={setTransportFee} className={inputCls} min={0} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="rounded-xl border border-border">
        <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</span>
          <Button size="sm" variant="outline" onClick={addRow} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add item
          </Button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-3 space-y-3">
          {rows.map((r) => {
            const { value, last } = lineEstimate(r);
            return (
              <div key={r.rowId} className="rounded-lg border border-border p-3">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-12 sm:col-span-5">
                    <input
                      list="po-edit-products"
                      value={r.productName}
                      onChange={(e) => {
                        const v = e.target.value;
                        const match = products.find((p) => p.name.toLowerCase() === v.toLowerCase());
                        setRows((arr) =>
                          arr.map((x) =>
                            x.rowId === r.rowId
                              ? {
                                  ...x,
                                  productName: v,
                                  productId: match?.id,
                                  piecesPerCase: match?.piecesPerCase ?? x.piecesPerCase,
                                  unitType: (match?.unit as UnitType | undefined) ?? x.unitType,
                                }
                              : x
                          )
                        );
                      }}
                      placeholder="Item name"
                      className={inputCls}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <NumInput
                      value={r.expectedQty}
                      onChange={(n) =>
                        setRows((arr) => arr.map((x) => (x.rowId === r.rowId ? { ...x, expectedQty: n } : x)))
                      }
                      className={`${inputCls} text-right`}
                      min={0}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <select
                      value={r.unitType}
                      onChange={(e) =>
                        setRows((arr) =>
                          arr.map((x) =>
                            x.rowId === r.rowId ? { ...x, unitType: e.target.value as UnitType } : x
                          )
                        )
                      }
                      className={inputCls}
                    >
                      <option value="case">case</option>
                      <option value="box">box</option>
                      <option value="tin">tin</option>
                      <option value="piece">piece</option>
                      <option value="kg">kg</option>
                    </select>
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <NumInput
                      value={r.piecesPerCase}
                      onChange={(n) =>
                        setRows((arr) =>
                          arr.map((x) =>
                            x.rowId === r.rowId ? { ...x, piecesPerCase: Math.max(1, n) } : x
                          )
                        )
                      }
                      className={`${inputCls} text-right`}
                      min={1}
                    />
                  </div>
                  <div className="col-span-1 flex items-center justify-center">
                    <button
                      onClick={() => {
                        if (r.id) {
                          setRemoved((s) => new Set(s).add(r.id as string));
                        }
                        setRows((arr) => arr.filter((x) => x.rowId !== r.rowId));
                      }}
                      className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  {last ? (
                    <span>
                      Last buy:&nbsp;
                      <b className="text-foreground">{formatCurrency(last.lastBuyingPriceCase)}</b>/case ·&nbsp;
                      <b className="text-foreground">{formatCurrency(last.lastBuyingPricePiece)}</b>/pc
                      {last.lastSupplierName && <> · {last.lastSupplierName}</>}
                      {last.lastPurchaseDate && <> · {formatDate(last.lastPurchaseDate)}</>}
                    </span>
                  ) : (
                    <span>No prior purchase data</span>
                  )}
                  <span className="font-medium text-foreground">
                    Est. {formatCurrency(value)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <datalist id="po-edit-products">
        {products.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>

      <div className="flex flex-col items-end gap-1 rounded-xl border border-border bg-secondary/30 p-3 text-sm">
        <div className="flex w-full justify-between">
          <span className="text-muted-foreground">Items estimate</span>
          <span>{formatCurrency(itemsTotal)}</span>
        </div>
        <div className="flex w-full justify-between">
          <span className="text-muted-foreground">Boat / transport</span>
          <span>{formatCurrency(Number(transportFee || 0))}</span>
        </div>
        <div className="flex w-full justify-between border-t border-border pt-1 text-base font-bold">
          <span>Estimated shipment value</span>
          <span>{formatCurrency(grandTotal)}</span>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={busy}>Cancel</Button>
        <Button variant="outline" onClick={() => void submit("save")} disabled={busy}>
          Save Draft
        </Button>
        <Button onClick={() => void submit("submit")} disabled={busy} className="gap-2">
          <Send className="h-4 w-4" />
          {busy ? "…" : "Submit for Admin Approval"}
        </Button>
      </DialogFooter>
    </div>
  );
}

/* ---------------------- Buying form ---------------------- */

interface BuyingFormProps {
  po: PurchaseOrder;
  onDone: () => void;
}
function BuyingForm({ po, onDone }: BuyingFormProps) {
  const suppliers = useStore((s) => s.suppliers);
  const addSupplier = useStore((s) => s.addSupplier);
  const allUsers = useStore((s) => s.users);
  const buyingPeople = allUsers.filter((u) => u.active);
  const [supplierId, setSupplierId] = useState(po.supplierId ?? "");
  const [buyingPersonId, setBuyingPersonId] = useState(
    po.buyingPersonId ?? po.assignedTo ?? ""
  );
  const [addSupOpen, setAddSupOpen] = useState(false);
  const [newSup, setNewSup] = useState({ name: "", phone: "", contactPerson: "" });
  const [entries, setEntries] = useState<Record<string, BuyingEntry>>(() => {
    const out: Record<string, BuyingEntry> = {};
    po.items.forEach((it) => {
      out[it.id] = {
        itemId: it.id,
        buyingQty: it.buyingQty || it.expectedQty,
        buyingPriceCase: it.buyingPriceCase,
        buyingPricePiece: it.buyingPricePiece,
        notes: it.notes,
      };
    });
    return out;
  });
  const [invoiceNo, setInvoiceNo] = useState(po.invoiceNo ?? "");
  const [invoiceUrl, setInvoiceUrl] = useState(po.invoiceUrl ?? "");
  const [boatName, setBoatName] = useState(po.boatName ?? "");
  const [loadingDate, setLoadingDate] = useState(po.loadingDate?.slice(0, 10) ?? "");
  const [processDate, setProcessDate] = useState(po.processDate?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(po.notes ?? "");
  const [busy, setBusy] = useState(false);

  const total = Object.values(entries).reduce((sum, e) => {
    const it = po.items.find((i) => i.id === e.itemId);
    if (!it) return sum;
    if (it.unitType === "case" || it.unitType === "box" || it.unitType === "tin") {
      return sum + e.buyingQty * e.buyingPriceCase;
    }
    return sum + e.buyingQty * (e.buyingPricePiece || e.buyingPriceCase);
  }, 0);

  const submit = async (): Promise<void> => {
    setBusy(true);
    if (supplierId && supplierId !== po.supplierId) {
      await usePurchaseOrders.getState().updatePO(po.id, { supplierId });
    }
    await usePurchaseOrders.getState().submitBuying(
      po.id,
      Object.values(entries),
      { invoiceNo, invoiceUrl, boatName, loadingDate, processDate, notes, buyingPersonId: buyingPersonId || undefined }
    );
    setBusy(false);
    toast.success("Submitted for admin approval");
    onDone();
  };

  const handleAddSupplier = (): void => {
    if (!newSup.name.trim()) {
      toast.error("Supplier name required");
      return;
    }
    const id = addSupplier({
      name: newSup.name.trim(),
      contactPerson: newSup.contactPerson,
      phone: newSup.phone,
      viber: "",
      email: "",
      address: "",
      notes: "",
    });
    setSupplierId(id);
    setAddSupOpen(false);
    setNewSup({ name: "", phone: "", contactPerson: "" });
    toast.success(`Added ${newSup.name.trim()}`);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Supplier / Vendor</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls}>
            <option value="">— Select supplier —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <Button variant="outline" onClick={() => setAddSupOpen(true)} className="gap-1.5">
          <UserPlus className="h-3.5 w-3.5" /> Add New Supplier
        </Button>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Buying person / Purchased by</label>
        <select value={buyingPersonId} onChange={(e) => setBuyingPersonId(e.target.value)} className={inputCls}>
          <option value="">— Select buying person —</option>
          {buyingPeople.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}{u.isPurchasingStaff ? " · Purchasing" : ""}
            </option>
          ))}
        </select>
        <div className="mt-1 text-[10px] text-muted-foreground">
          Person who physically bought / arranged the goods. Saved separately from “entered by”.
        </div>
      </div>

      <Dialog open={addSupOpen} onOpenChange={setAddSupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Name *">
              <input value={newSup.name} onChange={(e) => setNewSup((s) => ({ ...s, name: e.target.value }))} className={inputCls} autoFocus />
            </Field>
            <Field label="Phone">
              <input value={newSup.phone} onChange={(e) => setNewSup((s) => ({ ...s, phone: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Contact person">
              <input value={newSup.contactPerson} onChange={(e) => setNewSup((s) => ({ ...s, contactPerson: e.target.value }))} className={inputCls} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSupOpen(false)}>Cancel</Button>
            <Button onClick={handleAddSupplier}>Save Supplier</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-xl border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-right">Qty bought</th>
                <th className="px-3 py-2 text-right">Price / case</th>
                <th className="px-3 py-2 text-right">Price / piece</th>
                <th className="px-3 py-2 text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((it) => {
                const e = entries[it.id];
                const lineTotal =
                  it.unitType === "case" || it.unitType === "box" || it.unitType === "tin"
                    ? e.buyingQty * e.buyingPriceCase
                    : e.buyingQty * (e.buyingPricePiece || e.buyingPriceCase);
                return (
                  <tr key={it.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium">{it.productName}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Expected {it.expectedQty} {it.unitType} · {it.piecesPerCase} pcs/case
                      </div>
                      {it.correctionNote && (
                        <div className="mt-1 inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-700">
                          <AlertCircle className="h-3 w-3" /> {it.correctionNote}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <NumInput
                        value={e.buyingQty}
                        onChange={(n) =>
                          setEntries((s) => ({
                            ...s,
                            [it.id]: { ...s[it.id], buyingQty: n },
                          }))
                        }
                        className="h-9 w-24 rounded-md border border-input bg-background px-2 text-right text-sm"
                        min={0}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <NumInput
                        value={e.buyingPriceCase}
                        onChange={(n) =>
                          setEntries((s) => {
                            const piece = it.piecesPerCase > 0 ? n / it.piecesPerCase : 0;
                            return {
                              ...s,
                              [it.id]: {
                                ...s[it.id],
                                buyingPriceCase: n,
                                buyingPricePiece: piece,
                              },
                            };
                          })
                        }
                        className="h-9 w-28 rounded-md border border-input bg-background px-2 text-right text-sm"
                        min={0}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <NumInput
                        value={e.buyingPricePiece}
                        onChange={(n) =>
                          setEntries((s) => ({
                            ...s,
                            [it.id]: { ...s[it.id], buyingPricePiece: n },
                          }))
                        }
                        className="h-9 w-24 rounded-md border border-input bg-background px-2 text-right text-sm"
                        min={0}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatCurrency(lineTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-secondary/30">
                <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider">
                  Total
                </td>
                <td className="px-3 py-2 text-right text-base font-bold">
                  {formatCurrency(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Invoice / Bill #">
          <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Invoice URL (PDF / photo)">
          <input
            value={invoiceUrl}
            onChange={(e) => setInvoiceUrl(e.target.value)}
            placeholder="https://…"
            className={inputCls}
          />
        </Field>
        <Field label="Loading boat">
          <input value={boatName} onChange={(e) => setBoatName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Loading date">
          <input
            type="date"
            value={loadingDate}
            onChange={(e) => setLoadingDate(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Process date">
          <input
            type="date"
            value={processDate}
            onChange={(e) => setProcessDate(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Notes">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={busy}>Cancel</Button>
        <Button onClick={() => void submit()} disabled={busy} className="gap-2">
          <Send className="h-4 w-4" />
          {busy ? "Submitting…" : "Submit for Approval"}
        </Button>
      </DialogFooter>
    </div>
  );
}

/* ---------------------- Receive form ---------------------- */

interface ReceiveFormProps {
  po: PurchaseOrder;
  onDone: () => void;
}
function ReceiveForm({ po, onDone }: ReceiveFormProps) {
  const [drafts, setDrafts] = useState<Record<string, ReceiveEntry>>(() => {
    const out: Record<string, ReceiveEntry> = {};
    po.items.forEach((it) => {
      out[it.id] = {
        receivedQty: it.receivedQty || it.buyingQty * it.piecesPerCase,
        damagedQty: it.damagedQty,
        missingQty: it.missingQty,
        expiryDate: it.expiryDate,
        batchNo: it.batchNo,
        notes: it.notes,
      };
    });
    return out;
  });

  const save = async (it: PurchaseOrderItem): Promise<void> => {
    await usePurchaseOrders.getState().receiveItem(po.id, it.id, drafts[it.id]);
    toast.success(`${it.productName} recorded`);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Verify each item separately. Inventory updates only after Admin/Storekeeper marks it Complete.
      </p>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
        {po.items.map((it) => {
          const d = drafts[it.id];
          return (
            <div key={it.id} className="rounded-xl border border-border p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{it.productName}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Bought {it.buyingQty} {it.unitType} · {it.piecesPerCase} pcs/case
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PO_ITEM_COLOR[it.status]}`}
                >
                  {PO_ITEM_LABEL[it.status]}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="Received (pcs)">
                  <NumInput
                    value={d.receivedQty}
                    onChange={(n) =>
                      setDrafts((s) => ({ ...s, [it.id]: { ...s[it.id], receivedQty: n } }))
                    }
                    className={inputCls}
                    min={0}
                  />
                </Field>
                <Field label="Damaged (pcs)">
                  <NumInput
                    value={d.damagedQty}
                    onChange={(n) =>
                      setDrafts((s) => ({ ...s, [it.id]: { ...s[it.id], damagedQty: n } }))
                    }
                    className={inputCls}
                    min={0}
                  />
                </Field>
                <Field label="Missing (pcs)">
                  <NumInput
                    value={d.missingQty}
                    onChange={(n) =>
                      setDrafts((s) => ({ ...s, [it.id]: { ...s[it.id], missingQty: n } }))
                    }
                    className={inputCls}
                    min={0}
                  />
                </Field>
                <Field label="Expiry date (if applicable)">
                  <input
                    type="date"
                    value={d.expiryDate ?? ""}
                    onChange={(e) =>
                      setDrafts((s) => ({ ...s, [it.id]: { ...s[it.id], expiryDate: e.target.value } }))
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label="Batch / Lot #">
                  <input
                    value={d.batchNo ?? ""}
                    onChange={(e) =>
                      setDrafts((s) => ({ ...s, [it.id]: { ...s[it.id], batchNo: e.target.value } }))
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label="Notes">
                  <input
                    value={d.notes ?? ""}
                    onChange={(e) =>
                      setDrafts((s) => ({ ...s, [it.id]: { ...s[it.id], notes: e.target.value } }))
                    }
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="mt-2 flex justify-end">
                <Button size="sm" onClick={() => void save(it)}>Save item</Button>
              </div>
            </div>
          );
        })}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>Close</Button>
      </DialogFooter>
    </div>
  );
}

/* ---------------------- Loaded form ---------------------- */

interface LoadedFormProps {
  po: PurchaseOrder;
  onDone: () => void;
}
function LoadedForm({ po, onDone }: LoadedFormProps) {
  const [boatName, setBoatName] = useState(po.boatName ?? "");
  const [loadingDate, setLoadingDate] = useState(po.loadingDate?.slice(0, 10) ?? "");
  return (
    <div className="space-y-3">
      <Field label="Boat name">
        <input value={boatName} onChange={(e) => setBoatName(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Loading date">
        <input
          type="date"
          value={loadingDate}
          onChange={(e) => setLoadingDate(e.target.value)}
          className={inputCls}
        />
      </Field>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button
          onClick={async () => {
            await usePurchaseOrders.getState().markLoaded(po.id, { boatName, loadingDate });
            toast.success("Marked as loaded");
            onDone();
          }}
        >
          Save
        </Button>
      </DialogFooter>
    </div>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}
function Field({ label, children }: FieldProps) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
