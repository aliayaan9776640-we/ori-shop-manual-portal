import { create } from "zustand";
import { supabase, isSupabaseConfigured } from "./supabase";
import { useStore } from "./store";
import type {
  LastBuyingInfo,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderItemStatus,
  PurchaseOrderStatus,
  UnitType,
} from "./types";

const localId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const isMissing = (err: { code?: string; message?: string } | null): boolean => {
  if (!err) return false;
  return (
    err.code === "PGRST205" ||
    /schema cache|does not exist|relation .* does not exist/i.test(err.message ?? "")
  );
};

interface PoRow {
  id: string;
  po_no: string | null;
  supplier_id: string | null;
  status: PurchaseOrderStatus;
  notes: string | null;
  required_date: string | null;
  invoice_no: string | null;
  invoice_url: string | null;
  boat_name: string | null;
  loading_date: string | null;
  process_date: string | null;
  total_amount: number;
  raised_by: string | null;
  raised_at: string;
  assigned_to: string | null;
  assigned_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  buying_person_id: string | null;
  transport_fee: number | null;
  estimated_total: number | null;
  created_at: string;
}

interface PoItemRow {
  id: string;
  po_id: string;
  product_id: string | null;
  product_name: string;
  expected_qty: number;
  unit_type: UnitType;
  pieces_per_case: number;
  buying_qty: number;
  buying_price_case: number;
  buying_price_piece: number;
  total_amount: number;
  received_qty: number;
  damaged_qty: number;
  missing_qty: number;
  expiry_date: string | null;
  batch_no: string | null;
  status: PurchaseOrderItemStatus;
  correction_note: string | null;
  notes: string | null;
  created_at: string;
}

const rowToItem = (r: PoItemRow): PurchaseOrderItem => ({
  id: r.id,
  poId: r.po_id,
  productId: r.product_id ?? undefined,
  productName: r.product_name,
  expectedQty: Number(r.expected_qty),
  unitType: r.unit_type,
  piecesPerCase: r.pieces_per_case,
  buyingQty: Number(r.buying_qty),
  buyingPriceCase: Number(r.buying_price_case),
  buyingPricePiece: Number(r.buying_price_piece),
  totalAmount: Number(r.total_amount),
  receivedQty: r.received_qty,
  damagedQty: r.damaged_qty,
  missingQty: r.missing_qty,
  expiryDate: r.expiry_date ?? undefined,
  batchNo: r.batch_no ?? undefined,
  status: r.status,
  correctionNote: r.correction_note ?? undefined,
  notes: r.notes ?? undefined,
});

const itemToRow = (
  i: Partial<PurchaseOrderItem>
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (i.productId !== undefined) out.product_id = i.productId || null;
  if (i.productName !== undefined) out.product_name = i.productName;
  if (i.expectedQty !== undefined) out.expected_qty = i.expectedQty;
  if (i.unitType !== undefined) out.unit_type = i.unitType;
  if (i.piecesPerCase !== undefined) out.pieces_per_case = i.piecesPerCase;
  if (i.buyingQty !== undefined) out.buying_qty = i.buyingQty;
  if (i.buyingPriceCase !== undefined) out.buying_price_case = i.buyingPriceCase;
  if (i.buyingPricePiece !== undefined) out.buying_price_piece = i.buyingPricePiece;
  if (i.totalAmount !== undefined) out.total_amount = i.totalAmount;
  if (i.receivedQty !== undefined) out.received_qty = i.receivedQty;
  if (i.damagedQty !== undefined) out.damaged_qty = i.damagedQty;
  if (i.missingQty !== undefined) out.missing_qty = i.missingQty;
  if (i.expiryDate !== undefined) out.expiry_date = i.expiryDate || null;
  if (i.batchNo !== undefined) out.batch_no = i.batchNo || null;
  if (i.status !== undefined) out.status = i.status;
  if (i.correctionNote !== undefined) out.correction_note = i.correctionNote || null;
  if (i.notes !== undefined) out.notes = i.notes || null;
  return out;
};

const poToRow = (p: Partial<PurchaseOrder>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (p.supplierId !== undefined) out.supplier_id = p.supplierId || null;
  if (p.status !== undefined) out.status = p.status;
  if (p.notes !== undefined) out.notes = p.notes || null;
  if (p.requiredDate !== undefined) out.required_date = p.requiredDate || null;
  if (p.invoiceNo !== undefined) out.invoice_no = p.invoiceNo || null;
  if (p.invoiceUrl !== undefined) out.invoice_url = p.invoiceUrl || null;
  if (p.boatName !== undefined) out.boat_name = p.boatName || null;
  if (p.loadingDate !== undefined) out.loading_date = p.loadingDate || null;
  if (p.processDate !== undefined) out.process_date = p.processDate || null;
  if (p.totalAmount !== undefined) out.total_amount = p.totalAmount;
  if (p.raisedBy !== undefined) out.raised_by = p.raisedBy || null;
  if (p.assignedTo !== undefined) out.assigned_to = p.assignedTo || null;
  if (p.assignedAt !== undefined) out.assigned_at = p.assignedAt || null;
  if (p.approvedBy !== undefined) out.approved_by = p.approvedBy || null;
  if (p.approvedAt !== undefined) out.approved_at = p.approvedAt || null;
  if (p.rejectedReason !== undefined) out.rejected_reason = p.rejectedReason || null;
  if (p.buyingPersonId !== undefined) out.buying_person_id = p.buyingPersonId || null;
  if (p.transportFee !== undefined) out.transport_fee = p.transportFee;
  if (p.estimatedTotal !== undefined) out.estimated_total = p.estimatedTotal;
  return out;
};

const enrichItems = (rows: PoItemRow[]): PurchaseOrderItem[] =>
  rows.map(rowToItem);

const buildPO = (
  r: PoRow,
  items: PurchaseOrderItem[],
  userName: (id: string | null) => string | undefined
): PurchaseOrder => ({
  id: r.id,
  poNo: r.po_no ?? undefined,
  supplierId: r.supplier_id ?? undefined,
  status: r.status,
  notes: r.notes ?? undefined,
  requiredDate: r.required_date ?? undefined,
  invoiceNo: r.invoice_no ?? undefined,
  invoiceUrl: r.invoice_url ?? undefined,
  boatName: r.boat_name ?? undefined,
  loadingDate: r.loading_date ?? undefined,
  processDate: r.process_date ?? undefined,
  totalAmount: Number(r.total_amount),
  raisedBy: r.raised_by ?? undefined,
  raisedByName: userName(r.raised_by),
  raisedAt: r.raised_at,
  assignedTo: r.assigned_to ?? undefined,
  assignedToName: userName(r.assigned_to),
  assignedAt: r.assigned_at ?? undefined,
  approvedBy: r.approved_by ?? undefined,
  approvedByName: userName(r.approved_by),
  approvedAt: r.approved_at ?? undefined,
  rejectedReason: r.rejected_reason ?? undefined,
  buyingPersonId: r.buying_person_id ?? undefined,
  buyingPersonName: userName(r.buying_person_id),
  transportFee: r.transport_fee != null ? Number(r.transport_fee) : 0,
  estimatedTotal: r.estimated_total != null ? Number(r.estimated_total) : 0,
  items,
  createdAt: r.created_at,
});

export interface NewPOItemDraft {
  productId?: string;
  productName: string;
  expectedQty: number;
  unitType: UnitType;
  piecesPerCase: number;
  notes?: string;
}

export interface BuyingEntry {
  itemId: string;
  buyingQty: number;
  buyingPriceCase: number;
  buyingPricePiece: number;
  notes?: string;
}

export interface ReceiveEntry {
  receivedQty: number;
  damagedQty: number;
  missingQty: number;
  expiryDate?: string;
  batchNo?: string;
  notes?: string;
}

interface PoState {
  pos: PurchaseOrder[];
  loading: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  /** Compute last buying price/supplier for a product from completed PO items. */
  getLastBuyingInfo: (productId: string) => LastBuyingInfo | undefined;
  /** Admin/Storekeeper: auto-generate a draft PO from low-stock products. */
  generateFromLowStock: () => Promise<PurchaseOrder | null>;
  /** Storekeeper/Admin: edit items on a draft PO. */
  updateDraftItems: (
    poId: string,
    items: DraftItemPatch[],
    poPatch: { supplierId?: string; transportFee?: number; estimatedTotal?: number; notes?: string; requiredDate?: string }
  ) => Promise<void>;
  /** Storekeeper: submit the edited draft for admin approval. */
  submitDraft: (poId: string) => Promise<void>;
  /** Admin only: create a new PO. */
  createPO: (
    supplierId: string,
    items: NewPOItemDraft[],
    opts: {
      requiredDate?: string;
      notes?: string;
      assignedTo?: string;
    }
  ) => Promise<PurchaseOrder | null>;
  assign: (poId: string, userId: string) => Promise<void>;
  /** Purchasing staff: enter buying details. Sets PO to waiting_approval. */
  submitBuying: (
    poId: string,
    entries: BuyingEntry[],
    poPatch: {
      invoiceNo?: string;
      invoiceUrl?: string;
      boatName?: string;
      loadingDate?: string;
      processDate?: string;
      notes?: string;
      buyingPersonId?: string;
    }
  ) => Promise<void>;
  approvePO: (poId: string) => Promise<void>;
  rejectPO: (poId: string, reason: string) => Promise<void>;
  markLoaded: (
    poId: string,
    opts: { boatName?: string; loadingDate?: string }
  ) => Promise<void>;
  /** Admin/Storekeeper: record receiving result for an item. */
  receiveItem: (
    poId: string,
    itemId: string,
    entry: ReceiveEntry
  ) => Promise<void>;
  requestCorrection: (poId: string, itemId: string, note: string) => Promise<void>;
  /** Admin/Storekeeper: approve receiving and update inventory. */
  completeItem: (poId: string, itemId: string) => Promise<void>;
  /** Re-checks PO-level status when all items are completed. */
  recomputePOStatus: (poId: string) => Promise<void>;
  updatePO: (poId: string, patch: Partial<PurchaseOrder>) => Promise<void>;
  deletePO: (poId: string) => Promise<void>;
}

export interface DraftItemPatch {
  /** Existing item id, or omitted to create a new item. */
  id?: string;
  productId?: string;
  productName: string;
  expectedQty: number;
  unitType: UnitType;
  piecesPerCase: number;
  notes?: string;
  /** Mark for deletion. */
  remove?: boolean;
}

export const usePurchaseOrders = create<PoState>()((set, get) => ({
  pos: [],
  loading: false,
  loaded: false,

  getLastBuyingInfo: (productId) => {
    const all = get().pos;
    let best: { date: string; item: PurchaseOrderItem; po: PurchaseOrder } | null = null;
    for (const po of all) {
      for (const it of po.items) {
        if (it.productId !== productId) continue;
        if (it.buyingPriceCase <= 0 && it.buyingPricePiece <= 0) continue;
        // Prefer completed/approved/buying_entered items
        if (
          it.status !== "completed" &&
          it.status !== "approved" &&
          it.status !== "received" &&
          it.status !== "loaded" &&
          it.status !== "buying_entered" &&
          it.status !== "waiting_approval"
        )
          continue;
        const date = po.processDate ?? po.loadingDate ?? po.approvedAt ?? po.raisedAt;
        if (!best || date > best.date) {
          best = { date, item: it, po };
        }
      }
    }
    if (!best) return undefined;
    const supplier = useStore.getState().suppliers.find((s) => s.id === best!.po.supplierId);
    return {
      productId,
      lastBuyingPriceCase: best.item.buyingPriceCase,
      lastBuyingPricePiece: best.item.buyingPricePiece,
      lastSupplierId: best.po.supplierId,
      lastSupplierName: supplier?.name,
      lastPurchaseDate: best.date,
    };
  },

  generateFromLowStock: async () => {
    if (!isSupabaseConfigured) return null;
    const products = useStore.getState().products;
    const me = useStore.getState().currentUserId;
    const candidates = products.filter(
      (p) => p.reorderLevel > 0 && p.stockPieces <= p.reorderLevel
    );
    if (candidates.length === 0) return null;

    let estimated = 0;
    const draftItems = candidates.map((p) => {
      const need = Math.max(1, p.reorderLevel - p.stockPieces);
      const useCases = (p.unit === "case" || p.unit === "box" || p.unit === "tin") && p.piecesPerCase > 1;
      const qty = useCases
        ? Math.max(1, Math.ceil(need / p.piecesPerCase))
        : need;
      const last = get().getLastBuyingInfo(p.id);
      const lineEst = useCases
        ? qty * (last?.lastBuyingPriceCase ?? p.purchasePrice)
        : qty * (last?.lastBuyingPricePiece ?? (p.piecesPerCase > 0 ? p.purchasePrice / p.piecesPerCase : p.purchasePrice));
      estimated += lineEst;
      return {
        productId: p.id,
        productName: p.name,
        expectedQty: qty,
        unitType: useCases ? p.unit : ("piece" as UnitType),
        piecesPerCase: p.piecesPerCase || 1,
      };
    });

    const insertPoFull = {
      status: "auto_draft" as const,
      raised_by: me,
      total_amount: 0,
      estimated_total: estimated,
      notes: "Auto-generated from low stock",
    };
    let { data: poData, error: poErr } = await supabase
      .from("purchase_orders")
      .insert(insertPoFull)
      .select()
      .single();
    // Fallback: migration 0006 not applied yet (no auto_draft status / estimated_total column).
    if (poErr) {
      const msg = poErr.message ?? "";
      const needFallback =
        /estimated_total|status_check|check constraint|column .* does not exist/i.test(msg);
      if (needFallback) {
        const insertPoLegacy = {
          status: "draft" as const,
          raised_by: me,
          total_amount: 0,
          notes: "Auto-generated from low stock",
        };
        const retry = await supabase
          .from("purchase_orders")
          .insert(insertPoLegacy)
          .select()
          .single();
        poData = retry.data;
        poErr = retry.error;
      }
    }
    if (poErr || !poData) {
      console.error("[po.autoDraft]", poErr?.message);
      return null;
    }
    const row = poData as PoRow;
    const itemsRows = draftItems.map((d) => ({
      po_id: row.id,
      product_id: d.productId || null,
      product_name: d.productName,
      expected_qty: d.expectedQty,
      unit_type: d.unitType,
      pieces_per_case: d.piecesPerCase,
    }));
    let items: PurchaseOrderItem[] = [];
    if (itemsRows.length > 0) {
      const { data: iData, error: iErr } = await supabase
        .from("purchase_order_items")
        .insert(itemsRows)
        .select();
      if (iErr) console.error("[po.autoDraft.items]", iErr.message);
      else items = enrichItems((iData as PoItemRow[] | null) ?? []);
    }
    const users = useStore.getState().users;
    const nameOf = (id: string | null): string | undefined =>
      id ? users.find((u) => u.id === id)?.fullName : undefined;
    const po = buildPO(row, items, nameOf);
    set({ pos: [po, ...get().pos] });
    useStore
      .getState()
      .log("po.autoDraft", `Auto-draft ${po.poNo ?? po.id} (${items.length} low-stock items)`);
    return po;
  },

  updateDraftItems: async (poId, drafts, poPatch) => {
    if (!isSupabaseConfigured) return;
    const po = get().pos.find((p) => p.id === poId);
    if (!po) return;
    if (po.status !== "auto_draft" && po.status !== "draft" && po.status !== "storekeeper_edited") {
      console.warn("[po.updateDraft] not a draft");
      return;
    }
    // Removals
    const removeIds = drafts.filter((d) => d.remove && d.id).map((d) => d.id as string);
    if (removeIds.length > 0) {
      await supabase.from("purchase_order_items").delete().in("id", removeIds);
    }
    // Updates
    const updates = drafts.filter((d) => d.id && !d.remove);
    for (const d of updates) {
      await supabase
        .from("purchase_order_items")
        .update({
          product_id: d.productId || null,
          product_name: d.productName,
          expected_qty: d.expectedQty,
          unit_type: d.unitType,
          pieces_per_case: d.piecesPerCase,
          notes: d.notes ?? null,
        })
        .eq("id", d.id as string);
    }
    // Inserts
    const inserts = drafts.filter((d) => !d.id && !d.remove);
    let newItems: PurchaseOrderItem[] = [];
    if (inserts.length > 0) {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .insert(
          inserts.map((d) => ({
            po_id: poId,
            product_id: d.productId || null,
            product_name: d.productName,
            expected_qty: d.expectedQty,
            unit_type: d.unitType,
            pieces_per_case: d.piecesPerCase,
            notes: d.notes ?? null,
          }))
        )
        .select();
      if (error) console.error("[po.draft.insert]", error.message);
      else newItems = enrichItems((data as PoItemRow[] | null) ?? []);
    }
    // PO patch
    const status: PurchaseOrderStatus = "storekeeper_edited";
    const patchRow = { ...poToRow({ ...poPatch, status }) };
    const { error: poErr } = await supabase
      .from("purchase_orders")
      .update(patchRow)
      .eq("id", poId);
    if (poErr) console.error("[po.draft.update]", poErr.message);

    // Refresh local state
    const updatedItems: PurchaseOrderItem[] = [
      ...po.items
        .filter((i) => !removeIds.includes(i.id))
        .map((i) => {
          const u = updates.find((x) => x.id === i.id);
          if (!u) return i;
          return {
            ...i,
            productId: u.productId,
            productName: u.productName,
            expectedQty: u.expectedQty,
            unitType: u.unitType,
            piecesPerCase: u.piecesPerCase,
            notes: u.notes ?? i.notes,
          };
        }),
      ...newItems,
    ];
    set({
      pos: get().pos.map((p) =>
        p.id === poId
          ? {
              ...p,
              ...poPatch,
              status,
              items: updatedItems,
            }
          : p
      ),
    });
    useStore.getState().log("po.draft.edit", `Edited draft ${po.poNo ?? poId.slice(-6)}`);
  },

  submitDraft: async (poId) => {
    if (!isSupabaseConfigured) return;
    const po = get().pos.find((p) => p.id === poId);
    if (!po) return;
    const { error } = await supabase
      .from("purchase_orders")
      .update({ status: "waiting_approval" })
      .eq("id", poId);
    if (error) console.error("[po.draft.submit]", error.message);
    set({
      pos: get().pos.map((p) =>
        p.id === poId ? { ...p, status: "waiting_approval" } : p
      ),
    });
    useStore.getState().log("po.draft.submit", `Submitted draft ${po.poNo ?? poId.slice(-6)} for approval`);
  },

  load: async () => {
    if (!isSupabaseConfigured) {
      set({ loaded: true });
      return;
    }
    if (get().loading) return;
    set({ loading: true });
    try {
      const [poRes, itemsRes] = await Promise.all([
        supabase
          .from("purchase_orders")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("purchase_order_items").select("*"),
      ]);
      if (poRes.error && isMissing(poRes.error)) {
        console.warn("[purchase_orders] table missing — run migration 0004");
        set({ loading: false, loaded: true });
        return;
      }
      if (poRes.error) {
        console.error("[purchase_orders.load]", poRes.error.message);
        set({ loading: false });
        return;
      }
      const itemRows = (itemsRes.data as PoItemRow[] | null) ?? [];
      const itemsByPo: Record<string, PurchaseOrderItem[]> = {};
      enrichItems(itemRows).forEach((it) => {
        if (!itemsByPo[it.poId]) itemsByPo[it.poId] = [];
        itemsByPo[it.poId].push(it);
      });
      const users = useStore.getState().users;
      const nameOf = (id: string | null): string | undefined =>
        id ? users.find((u) => u.id === id)?.fullName : undefined;
      const pos: PurchaseOrder[] = ((poRes.data as PoRow[] | null) ?? []).map(
        (r) => buildPO(r, itemsByPo[r.id] ?? [], nameOf)
      );
      set({ pos, loading: false, loaded: true });
    } catch (e) {
      console.error("[purchase_orders.load]", e);
      set({ loading: false });
    }
  },

  createPO: async (supplierId, draftItems, opts) => {
    if (!isSupabaseConfigured) return null;
    const me = useStore.getState().currentUserId;
    const insertPo = {
      supplier_id: supplierId || null,
      status: opts.assignedTo ? "assigned" : "raised",
      notes: opts.notes || null,
      required_date: opts.requiredDate || null,
      raised_by: me,
      assigned_to: opts.assignedTo || null,
      assigned_at: opts.assignedTo ? new Date().toISOString() : null,
      total_amount: 0,
    };
    const { data: poData, error: poErr } = await supabase
      .from("purchase_orders")
      .insert(insertPo)
      .select()
      .single();
    if (poErr || !poData) {
      console.error("[po.create]", poErr?.message);
      return null;
    }
    const row = poData as PoRow;
    const itemsRows = draftItems.map((d) => ({
      po_id: row.id,
      product_id: d.productId || null,
      product_name: d.productName,
      expected_qty: d.expectedQty,
      unit_type: d.unitType,
      pieces_per_case: d.piecesPerCase,
      notes: d.notes || null,
    }));
    let items: PurchaseOrderItem[] = [];
    if (itemsRows.length > 0) {
      const { data: iData, error: iErr } = await supabase
        .from("purchase_order_items")
        .insert(itemsRows)
        .select();
      if (iErr) {
        console.error("[po.items.create]", iErr.message);
      } else {
        items = enrichItems((iData as PoItemRow[] | null) ?? []);
      }
    }
    const users = useStore.getState().users;
    const nameOf = (id: string | null): string | undefined =>
      id ? users.find((u) => u.id === id)?.fullName : undefined;
    const po = buildPO(row, items, nameOf);
    set({ pos: [po, ...get().pos] });
    useStore
      .getState()
      .log("po.create", `Created ${po.poNo ?? po.id} (${items.length} items)`);
    return po;
  },

  assign: async (poId, userId) => {
    if (!isSupabaseConfigured) return;
    const at = new Date().toISOString();
    const { error } = await supabase
      .from("purchase_orders")
      .update({ assigned_to: userId, assigned_at: at, status: "assigned" })
      .eq("id", poId);
    if (error) {
      console.error("[po.assign]", error.message);
      return;
    }
    const users = useStore.getState().users;
    const name = users.find((u) => u.id === userId)?.fullName;
    set({
      pos: get().pos.map((p) =>
        p.id === poId
          ? {
              ...p,
              assignedTo: userId,
              assignedToName: name,
              assignedAt: at,
              status: "assigned",
            }
          : p
      ),
    });
    useStore.getState().log("po.assign", `Assigned ${poId.slice(-6)} to ${name ?? userId}`);
  },

  submitBuying: async (poId, entries, poPatch) => {
    if (!isSupabaseConfigured) return;
    const po = get().pos.find((p) => p.id === poId);
    if (!po) return;
    let total = 0;
    const updatedItems: PurchaseOrderItem[] = po.items.map((it) => {
      const e = entries.find((x) => x.itemId === it.id);
      if (!e) return it;
      const lineTotal =
        e.buyingQty *
        (it.unitType === "case"
          ? e.buyingPriceCase
          : e.buyingPricePiece || e.buyingPriceCase / Math.max(1, it.piecesPerCase));
      total += lineTotal;
      return {
        ...it,
        buyingQty: e.buyingQty,
        buyingPriceCase: e.buyingPriceCase,
        buyingPricePiece:
          e.buyingPricePiece ||
          (it.piecesPerCase > 0 ? e.buyingPriceCase / it.piecesPerCase : 0),
        totalAmount: lineTotal,
        notes: e.notes ?? it.notes,
        status:
          it.status === "needs_correction"
            ? "waiting_approval"
            : "buying_entered",
      };
    });
    // Persist items
    for (const it of updatedItems) {
      const e = entries.find((x) => x.itemId === it.id);
      if (!e) continue;
      const { error } = await supabase
        .from("purchase_order_items")
        .update({
          buying_qty: it.buyingQty,
          buying_price_case: it.buyingPriceCase,
          buying_price_piece: it.buyingPricePiece,
          total_amount: it.totalAmount,
          notes: it.notes ?? null,
          status: it.status,
          correction_note: null,
        })
        .eq("id", it.id);
      if (error) console.error("[po.item.buying]", error.message);
    }
    const patch = {
      ...poToRow(poPatch),
      status: "waiting_approval",
      total_amount: total,
    };
    const { error } = await supabase
      .from("purchase_orders")
      .update(patch)
      .eq("id", poId);
    if (error) console.error("[po.submitBuying]", error.message);
    set({
      pos: get().pos.map((p) =>
        p.id === poId
          ? {
              ...p,
              ...poPatch,
              items: updatedItems,
              totalAmount: total,
              status: "waiting_approval",
            }
          : p
      ),
    });
    useStore
      .getState()
      .log("po.buying", `Submitted buying details for ${po.poNo ?? poId.slice(-6)}`);
  },

  approvePO: async (poId) => {
    if (!isSupabaseConfigured) return;
    const me = useStore.getState().currentUserId;
    const at = new Date().toISOString();
    const po = get().pos.find((p) => p.id === poId);
    if (!po) return;
    // Move all waiting_approval items to approved
    for (const it of po.items.filter((i) => i.status === "waiting_approval" || i.status === "buying_entered")) {
      await supabase
        .from("purchase_order_items")
        .update({ status: "approved" })
        .eq("id", it.id);
    }
    const { error } = await supabase
      .from("purchase_orders")
      .update({
        status: "approved",
        approved_by: me,
        approved_at: at,
      })
      .eq("id", poId);
    if (error) console.error("[po.approve]", error.message);
    const users = useStore.getState().users;
    const name = users.find((u) => u.id === me)?.fullName;
    set({
      pos: get().pos.map((p) =>
        p.id === poId
          ? {
              ...p,
              status: "approved",
              approvedBy: me ?? undefined,
              approvedByName: name,
              approvedAt: at,
              items: p.items.map((i) =>
                i.status === "waiting_approval" || i.status === "buying_entered"
                  ? { ...i, status: "approved" }
                  : i
              ),
            }
          : p
      ),
    });
    useStore.getState().log("po.approve", `Approved ${po.poNo ?? poId.slice(-6)}`);
    void import("@/lib/audit").then(({ writeAudit }) =>
      writeAudit({
        entity: "purchase_order",
        entityId: poId,
        action: "approve",
        before: { status: po.status, totalAmount: po.totalAmount },
        after: { status: "approved", totalAmount: po.totalAmount },
      })
    );
  },

  rejectPO: async (poId, reason) => {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase
      .from("purchase_orders")
      .update({ status: "rejected", rejected_reason: reason })
      .eq("id", poId);
    if (error) console.error("[po.reject]", error.message);
    set({
      pos: get().pos.map((p) =>
        p.id === poId ? { ...p, status: "rejected", rejectedReason: reason } : p
      ),
    });
    useStore.getState().log("po.reject", `Rejected ${poId.slice(-6)}: ${reason}`);
    void import("@/lib/audit").then(({ writeAudit }) =>
      writeAudit({
        entity: "purchase_order",
        entityId: poId,
        action: "reject",
        reason,
        after: { status: "rejected", reason },
      })
    );
  },

  markLoaded: async (poId, opts) => {
    if (!isSupabaseConfigured) return;
    const patch = {
      status: "loaded",
      boat_name: opts.boatName ?? null,
      loading_date: opts.loadingDate ?? null,
    };
    const { error } = await supabase
      .from("purchase_orders")
      .update(patch)
      .eq("id", poId);
    if (error) console.error("[po.loaded]", error.message);
    // Update items: approved → loaded
    const po = get().pos.find((p) => p.id === poId);
    if (po) {
      for (const it of po.items.filter((i) => i.status === "approved")) {
        await supabase
          .from("purchase_order_items")
          .update({ status: "loaded" })
          .eq("id", it.id);
      }
    }
    set({
      pos: get().pos.map((p) =>
        p.id === poId
          ? {
              ...p,
              status: "loaded",
              boatName: opts.boatName,
              loadingDate: opts.loadingDate,
              items: p.items.map((i) =>
                i.status === "approved" ? { ...i, status: "loaded" } : i
              ),
            }
          : p
      ),
    });
    useStore.getState().log("po.loaded", `Loaded ${po?.poNo ?? poId.slice(-6)}`);
  },

  receiveItem: async (poId, itemId, entry) => {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase
      .from("purchase_order_items")
      .update({
        received_qty: entry.receivedQty,
        damaged_qty: entry.damagedQty,
        missing_qty: entry.missingQty,
        expiry_date: entry.expiryDate || null,
        batch_no: entry.batchNo || null,
        notes: entry.notes ?? null,
        status: "received",
      })
      .eq("id", itemId);
    if (error) console.error("[po.receive]", error.message);
    set({
      pos: get().pos.map((p) =>
        p.id === poId
          ? {
              ...p,
              status: p.status === "loaded" ? "receiving" : p.status,
              items: p.items.map((i) =>
                i.id === itemId
                  ? {
                      ...i,
                      receivedQty: entry.receivedQty,
                      damagedQty: entry.damagedQty,
                      missingQty: entry.missingQty,
                      expiryDate: entry.expiryDate,
                      batchNo: entry.batchNo,
                      notes: entry.notes ?? i.notes,
                      status: "received",
                    }
                  : i
              ),
            }
          : p
      ),
    });
    if (get().pos.find((p) => p.id === poId)?.status === "loaded") {
      await supabase
        .from("purchase_orders")
        .update({ status: "receiving" })
        .eq("id", poId);
    }
    useStore
      .getState()
      .log(
        "po.receive",
        `Recorded received for item ${itemId.slice(-6)} (${entry.receivedQty} pcs)`
      );
  },

  requestCorrection: async (poId, itemId, note) => {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase
      .from("purchase_order_items")
      .update({ status: "needs_correction", correction_note: note })
      .eq("id", itemId);
    if (error) console.error("[po.correct]", error.message);
    set({
      pos: get().pos.map((p) =>
        p.id === poId
          ? {
              ...p,
              items: p.items.map((i) =>
                i.id === itemId
                  ? { ...i, status: "needs_correction", correctionNote: note }
                  : i
              ),
            }
          : p
      ),
    });
    useStore
      .getState()
      .log("po.correct", `Sent item ${itemId.slice(-6)} back: ${note}`);
  },

  completeItem: async (poId, itemId) => {
    if (!isSupabaseConfigured) return;
    const po = get().pos.find((p) => p.id === poId);
    const item = po?.items.find((i) => i.id === itemId);
    if (!po || !item) return;
    if (item.status !== "received") {
      console.warn("[po.complete] item not in received status");
      return;
    }
    // Inventory update: received - damaged
    const addPieces = Math.max(0, item.receivedQty - item.damagedQty);
    if (addPieces > 0 && item.productId) {
      useStore.getState().adjustStock(item.productId, addPieces, `PO ${po.poNo ?? poId.slice(-6)} received`, {
        expiryDate: item.expiryDate,
        batchNo: item.batchNo,
        buyingPersonId: po.buyingPersonId,
      });
      // Also update product purchase price + supplier link if available
      const newPiecePrice = item.buyingPricePiece > 0
        ? item.buyingPricePiece
        : item.piecesPerCase > 0
        ? item.buyingPriceCase / item.piecesPerCase
        : 0;
      if (newPiecePrice > 0) {
        useStore.getState().updateProduct(item.productId, {
          purchasePrice: item.buyingPriceCase || newPiecePrice * item.piecesPerCase,
        });
      }
    }
    const { error } = await supabase
      .from("purchase_order_items")
      .update({ status: "completed" })
      .eq("id", itemId);
    if (error) console.error("[po.complete]", error.message);
    set({
      pos: get().pos.map((p) =>
        p.id === poId
          ? {
              ...p,
              items: p.items.map((i) =>
                i.id === itemId ? { ...i, status: "completed" } : i
              ),
            }
          : p
      ),
    });
    useStore
      .getState()
      .log("po.complete", `Completed item ${item.productName} (+${addPieces} pcs)`);
    await get().recomputePOStatus(poId);
  },

  recomputePOStatus: async (poId) => {
    const po = get().pos.find((p) => p.id === poId);
    if (!po) return;
    const allDone = po.items.length > 0 && po.items.every((i) => i.status === "completed");
    if (allDone && po.status !== "completed") {
      if (isSupabaseConfigured) {
        await supabase
          .from("purchase_orders")
          .update({ status: "completed" })
          .eq("id", poId);
      }
      set({
        pos: get().pos.map((p) =>
          p.id === poId ? { ...p, status: "completed" } : p
        ),
      });
      useStore.getState().log("po.completed", `${po.poNo ?? poId.slice(-6)} fully completed`);
    }
  },

  updatePO: async (poId, patch) => {
    set({
      pos: get().pos.map((p) => (p.id === poId ? { ...p, ...patch } : p)),
    });
    if (!isSupabaseConfigured) return;
    const row = poToRow(patch);
    if (Object.keys(row).length === 0) return;
    const { error } = await supabase.from("purchase_orders").update(row).eq("id", poId);
    if (error) console.error("[po.update]", error.message);
  },

  deletePO: async (poId) => {
    set({ pos: get().pos.filter((p) => p.id !== poId) });
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.from("purchase_orders").delete().eq("id", poId);
    if (error) console.error("[po.delete]", error.message);
  },
}));

export const PO_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  auto_draft: "Auto Draft",
  storekeeper_edited: "Storekeeper Edited",
  draft: "Draft",
  raised: "Raised",
  assigned: "Assigned",
  buying_in_progress: "Buying In Progress",
  waiting_approval: "Waiting Admin Approval",
  approved: "Approved",
  loaded: "Loaded",
  receiving: "Receiving",
  completed: "Completed",
  rejected: "Rejected",
};

export const PO_STATUS_COLOR: Record<PurchaseOrderStatus, string> = {
  auto_draft: "bg-purple-100 text-purple-700",
  storekeeper_edited: "bg-fuchsia-100 text-fuchsia-700",
  draft: "bg-slate-100 text-slate-700",
  raised: "bg-amber-100 text-amber-700",
  assigned: "bg-blue-100 text-blue-700",
  buying_in_progress: "bg-indigo-100 text-indigo-700",
  waiting_approval: "bg-orange-100 text-orange-700",
  approved: "bg-violet-100 text-violet-700",
  loaded: "bg-cyan-100 text-cyan-700",
  receiving: "bg-teal-100 text-teal-700",
  completed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
};

export const PO_ITEM_LABEL: Record<PurchaseOrderItemStatus, string> = {
  pending: "Pending",
  buying_entered: "Buying Entered",
  waiting_approval: "Waiting Approval",
  loaded: "Loaded",
  received: "Received",
  needs_correction: "Needs Correction",
  approved: "Approved",
  completed: "Completed",
};

export const PO_ITEM_COLOR: Record<PurchaseOrderItemStatus, string> = {
  pending: "bg-slate-100 text-slate-700",
  buying_entered: "bg-indigo-100 text-indigo-700",
  waiting_approval: "bg-orange-100 text-orange-700",
  loaded: "bg-cyan-100 text-cyan-700",
  received: "bg-teal-100 text-teal-700",
  needs_correction: "bg-rose-100 text-rose-700",
  approved: "bg-violet-100 text-violet-700",
  completed: "bg-emerald-100 text-emerald-700",
};
