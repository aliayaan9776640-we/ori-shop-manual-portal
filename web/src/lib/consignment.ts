import { create } from "zustand";
import { supabase, isSupabaseConfigured } from "./supabase";
import { fetchAllRows } from "./fetchAllRows";
import { useCashDrawers } from "./cashDrawer";
import { useStore } from "./store";
import type { SaleItem } from "./types";

/* ---------------------------- types ---------------------------- */

export type ConsignmentUnit = "piece" | "kg" | "tin" | "box" | "case" | "packet";

export interface ConsignmentOwner {
  id: string;
  name: string;
  phone: string;
  address: string;
  paymentMethod: string;
  notes: string;
  active: boolean;
  createdAt: string;
}

export interface ConsignmentItem {
  id: string;
  ownerId: string;
  name: string;
  unitType: ConsignmentUnit;
  qtyReceived: number;
  qtySold: number;
  qtyReturned: number;
  sellingPrice: number;
  ownerPayout: number;
  commissionPct: number;
  receivedDate: string;
  notes: string;
  active: boolean;
  createdAt: string;
  /** Linked product id in the main inventory `products` table. */
  inventoryProductId?: string;
}

export interface ConsignmentSale {
  id: string;
  saleId?: string;
  itemId: string;
  ownerId: string;
  qty: number;
  unitPrice: number;
  ownerPayout: number;
  totalAmount: number;
  payableAmount: number;
  commission: number;
  customerId?: string;
  userId?: string;
  userName?: string;
  notes?: string;
  createdAt: string;
}

export interface ConsignmentReturn {
  returnValue?: number;
  id: string;
  itemId: string;
  ownerId: string;
  qty: number;
  notes?: string;
  userId?: string;
  createdAt: string;
}

export interface ConsignmentSettlement {
  drawerId?: string;
  adjustsId?: string;
  id: string;
  ownerId: string;
  amount: number;
  paymentMethod?: string;
  periodFrom?: string;
  periodTo?: string;
  paidAt: string;
  notes?: string;
  userId?: string;
  userName?: string;
  createdAt: string;
}

/* ---------------------------- helpers ---------------------------- */

const isMissing = (err: { code?: string; message?: string } | null): boolean => {
  if (!err) return false;
  return (
    err.code === "PGRST205" ||
    /schema cache|does not exist|relation .* does not exist/i.test(err.message ?? "")
  );
};

const logErr = (where: string, err: { message?: string } | null): void => {
  if (!err) return;
  // eslint-disable-next-line no-console
  console.error(`[consignment][${where}]`, err.message ?? err);
};

/* row mappers */
interface OwnerRow {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  payment_method: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
}
const rowToOwner = (r: OwnerRow): ConsignmentOwner => ({
  id: r.id,
  name: r.name,
  phone: r.phone ?? "",
  address: r.address ?? "",
  paymentMethod: r.payment_method ?? "",
  notes: r.notes ?? "",
  active: r.active,
  createdAt: r.created_at,
});

interface ItemRow {
  id: string;
  owner_id: string;
  name: string;
  unit_type: ConsignmentUnit;
  qty_received: number;
  qty_sold: number;
  qty_returned: number;
  selling_price: number;
  owner_payout: number;
  commission_pct: number;
  received_date: string;
  notes: string | null;
  active: boolean;
  created_at: string;
  inventory_product_id?: string | null;
}
const rowToItem = (r: ItemRow): ConsignmentItem => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  unitType: r.unit_type,
  qtyReceived: Number(r.qty_received),
  qtySold: Number(r.qty_sold),
  qtyReturned: Number(r.qty_returned),
  sellingPrice: Number(r.selling_price),
  ownerPayout: Number(r.owner_payout),
  commissionPct: Number(r.commission_pct),
  receivedDate: r.received_date,
  notes: r.notes ?? "",
  active: r.active,
  createdAt: r.created_at,
  inventoryProductId: r.inventory_product_id ?? undefined,
});

interface SaleRow {
  id: string;
  item_id: string;
  owner_id: string;
  qty: number;
  unit_price: number;
  owner_payout: number;
  total_amount: number;
  payable_amount: number;
  commission: number;
  customer_id: string | null;
  user_id: string | null;
  sale_id: string | null;
  notes: string | null;
  created_at: string;
}
const rowToSale = (r: SaleRow, userName?: string): ConsignmentSale => ({
  id: r.id,
  saleId: r.sale_id ?? undefined,
  itemId: r.item_id,
  ownerId: r.owner_id,
  qty: Number(r.qty),
  unitPrice: Number(r.unit_price),
  ownerPayout: Number(r.owner_payout),
  totalAmount: Number(r.total_amount),
  payableAmount: Number(r.payable_amount),
  commission: Number(r.commission),
  customerId: r.customer_id ?? undefined,
  userId: r.user_id ?? undefined,
  userName,
  notes: r.notes ?? undefined,
  createdAt: r.created_at,
});

interface ReturnRow {
  return_value?: number | null;
  id: string;
  item_id: string;
  owner_id: string;
  qty: number;
  notes: string | null;
  user_id: string | null;
  created_at: string;
}
const rowToReturn = (r: ReturnRow): ConsignmentReturn => ({
  returnValue: r.return_value == null ? undefined : Number(r.return_value),
  id: r.id,
  itemId: r.item_id,
  ownerId: r.owner_id,
  qty: Number(r.qty),
  notes: r.notes ?? undefined,
  userId: r.user_id ?? undefined,
  createdAt: r.created_at,
});

interface SettlementRow {
  drawer_id?: string | null;
  adjusts_id?: string | null;
  id: string;
  owner_id: string;
  amount: number;
  payment_method: string | null;
  period_from: string | null;
  period_to: string | null;
  paid_at: string;
  notes: string | null;
  user_id: string | null;
  created_at: string;
}
const rowToSettlement = (r: SettlementRow, userName?: string): ConsignmentSettlement => ({
  drawerId: r.drawer_id ?? undefined,
  adjustsId: r.adjusts_id ?? undefined,
  id: r.id,
  ownerId: r.owner_id,
  amount: Number(r.amount),
  paymentMethod: r.payment_method ?? undefined,
  periodFrom: r.period_from ?? undefined,
  periodTo: r.period_to ?? undefined,
  paidAt: r.paid_at,
  notes: r.notes ?? undefined,
  userId: r.user_id ?? undefined,
  userName,
  createdAt: r.created_at,
});

/* ---------------------------- store ---------------------------- */

export interface NewOwnerDraft {
  name: string;
  phone?: string;
  address?: string;
  paymentMethod?: string;
  notes?: string;
}

export interface NewItemDraft {
  requestId?: string;
  ownerId: string;
  name: string;
  unitType: ConsignmentUnit;
  qtyReceived: number;
  sellingPrice: number;
  ownerPayout: number;
  commissionPct: number;
  receivedDate: string;
  notes?: string;
}

interface ConsignmentState {
  receipts: ConsignmentReceipt[];
  restock: (input: { requestId: string; itemId: string; qty: number; date: string; notes: string; sellingPrice: number }) => Promise<void>;
  owners: ConsignmentOwner[];
  items: ConsignmentItem[];
  sales: ConsignmentSale[];
  returns: ConsignmentReturn[];
  settlements: ConsignmentSettlement[];
  loaded: boolean;
  loading: boolean;
  missing: boolean;

  load: () => Promise<void>;

  addOwner: (o: NewOwnerDraft) => Promise<ConsignmentOwner | null>;
  updateOwner: (id: string, patch: Partial<ConsignmentOwner>) => Promise<void>;
  deleteOwner: (id: string) => Promise<void>;

  addItem: (i: NewItemDraft) => Promise<ConsignmentItem | null>;
  updateItem: (id: string, patch: Partial<ConsignmentItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;

  recordSale: (input: {
    itemId: string;
    qty: number;
    unitPrice?: number;
    customerId?: string;
    notes?: string;
  }) => Promise<ConsignmentSale | null>;

  recordReturn: (input: {
    requestId: string;
    itemId: string;
    qty: number;
    notes?: string;
  }) => Promise<ConsignmentReturn | null>;

  recordSettlement: (input: {
    requestId: string;
    adjustsId?: string;
    cashAction?: string;
    ownerId: string;
    amount: number;
    paymentMethod?: string;
    periodFrom?: string;
    periodTo?: string;
    notes?: string;
  }) => Promise<ConsignmentSettlement | null>;
}

export const useConsignment = create<ConsignmentState>()((set, get) => ({
  receipts: [],
  owners: [],
  items: [],
  sales: [],
  returns: [],
  settlements: [],
  loaded: false,
  loading: false,
  missing: false,

  load: async () => {
    if (!isSupabaseConfigured) {
      set({ loaded: true });
      return;
    }
    if (get().loading) return;
    set({ loading: true });
    try {
      const [ownersRes, itemsRes, salesRes, returnsRes, settlementsRes, receiptsRes] = await Promise.all([
        fetchAllRows((from, to) => supabase.from("consignment_owners").select("*").order("name").range(from, to)),
        fetchAllRows((from, to) => supabase.from("consignment_items").select("*").order("created_at", { ascending: false }).range(from, to)),
        fetchAllRows((from, to) => supabase.from("consignment_sales").select("*").order("created_at", { ascending: false }).range(from, to)),
        fetchAllRows((from, to) => supabase.from("consignment_returns").select("*").order("created_at", { ascending: false }).range(from, to)),
        fetchAllRows((from, to) => supabase.from("consignment_settlements").select("*").order("created_at", { ascending: false }).range(from, to)),
        fetchAllRows((from, to) => supabase.from("consignment_receipts").select("*").order("received_date", { ascending: false }).range(from, to)),
      ]);
      if (ownersRes.error && isMissing(ownersRes.error)) {
        console.warn("[consignment] tables missing — run migration 0005_consignment.sql");
        set({ loading: false, loaded: true, missing: true });
        return;
      }
      if (ownersRes.error) logErr("owners.select", ownersRes.error);
      if (itemsRes.error) logErr("items.select", itemsRes.error);
      if (salesRes.error) logErr("sales.select", salesRes.error);
      if (returnsRes.error) logErr("returns.select", returnsRes.error);
      if (settlementsRes.error) logErr("settlements.select", settlementsRes.error);

      const users = useStore.getState().users;
      const nameOf = (id: string | null | undefined): string | undefined =>
        id ? users.find((u) => u.id === id)?.fullName : undefined;

      const loadedSales = ((salesRes.data as SaleRow[] | null) ?? []).map((s) =>
        rowToSale(s, nameOf(s.user_id))
      );
      // Sale rows are the auditable source of truth. Reconcile the displayed
      // sold/balance figures from them so an interrupted legacy qty_sold update
      // cannot leave Stock showing zero while Sales already contains the sale.
      const soldByItem = new Map<string, number>();
      for (const sale of loadedSales) {
        soldByItem.set(sale.itemId, (soldByItem.get(sale.itemId) ?? 0) + sale.qty);
      }
      const loadedItems = ((itemsRes.data as ItemRow[] | null) ?? []).map(rowToItem);
      const reconciledItems = loadedItems.map((item) => ({
        ...item,
        qtySold: salesRes.error ? item.qtySold : (soldByItem.get(item.id) ?? 0),
        qtyReturned: returnsRes.error ? item.qtyReturned : ((returnsRes.data as ReturnRow[] | null) ?? []).filter(r => r.item_id === item.id).reduce((sum, r) => sum + Number(r.qty), 0),
      }));

      set({
        receipts: (receiptsRes.data ?? []) as ConsignmentReceipt[],
        owners: ((ownersRes.data as OwnerRow[] | null) ?? []).map(rowToOwner),
        items: reconciledItems,
        sales: loadedSales,
        returns: ((returnsRes.data as ReturnRow[] | null) ?? []).map(rowToReturn),
        settlements: ((settlementsRes.data as SettlementRow[] | null) ?? []).map((r) =>
          rowToSettlement(r, nameOf(r.user_id))
        ),
        loading: false,
        loaded: true,
        missing: false,
      });
    } catch (e) {
      console.error("[consignment.load]", e);
      set({ loading: false });
    }
  },

  /* ---------- owners ---------- */
  addOwner: async (o) => {
    if (!isSupabaseConfigured) return null;
    const { data, error } = await supabase
      .from("consignment_owners")
      .insert({
        name: o.name,
        phone: o.phone ?? null,
        address: o.address ?? null,
        payment_method: o.paymentMethod ?? null,
        notes: o.notes ?? null,
      })
      .select()
      .single();
    if (error) {
      logErr("owners.insert", error);
      return null;
    }
    const owner = rowToOwner(data as OwnerRow);
    set({ owners: [owner, ...get().owners] });
    useStore.getState().log("consignment.owner.create", `Added consignment owner ${owner.name}`);
    return owner;
  },

  updateOwner: async (id, patch) => {
    set({
      owners: get().owners.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    });
    if (!isSupabaseConfigured) return;
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.phone !== undefined) row.phone = patch.phone || null;
    if (patch.address !== undefined) row.address = patch.address || null;
    if (patch.paymentMethod !== undefined) row.payment_method = patch.paymentMethod || null;
    if (patch.notes !== undefined) row.notes = patch.notes || null;
    if (patch.active !== undefined) row.active = patch.active;
    if (Object.keys(row).length === 0) return;
    const { error } = await supabase.from("consignment_owners").update(row).eq("id", id);
    logErr("owners.update", error);
  },

  deleteOwner: async (id) => {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.from("consignment_owners").update({ active: false }).eq("id", id);
    if (error) throw new Error(error.message);
    set({ owners: get().owners.map(o => o.id === id ? {...o,active:false} : o) });
  },

  /* ---------- items ---------- */
  addItem: async (i) => {
    if (!isSupabaseConfigured) return null;
    const {data,error}=await supabase.rpc("receive_consignment",{
      p_request_id:i.requestId ?? crypto.randomUUID(),p_owner_id:i.ownerId,p_name:i.name,
      p_unit:i.unitType,p_qty:i.qtyReceived,p_price:i.sellingPrice,p_payout:i.ownerPayout,
      p_commission:i.commissionPct,p_date:i.receivedDate,p_notes:i.notes ?? null,
    });
    if(error)throw new Error(error.message);
    const item=rowToItem(data as ItemRow);
    await Promise.all([get().load(),useStore.getState().bootstrap()]);
    return item;
  },

  updateItem: async (id, patch) => {
    const before = get().items.find((x) => x.id === id);
    if (before && patch.qtyReceived !== undefined && patch.qtyReceived !== before.qtyReceived) throw new Error("Use dated Restock or Return to change stock quantities");
    if (!isSupabaseConfigured) return;
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.unitType !== undefined) row.unit_type = patch.unitType;
    if (patch.qtyReceived !== undefined) row.qty_received = patch.qtyReceived;
    if (patch.sellingPrice !== undefined) row.selling_price = patch.sellingPrice;
    if (patch.ownerPayout !== undefined) row.owner_payout = patch.ownerPayout;
    if (patch.commissionPct !== undefined) row.commission_pct = patch.commissionPct;
    if (patch.receivedDate !== undefined) row.received_date = patch.receivedDate;
    if (patch.notes !== undefined) row.notes = patch.notes || null;
    if (patch.active !== undefined) row.active = patch.active;
    if (Object.keys(row).length === 0) return;
    const { error } = await supabase.from("consignment_items").update(row).eq("id", id);
    if (error) throw new Error(error.message);
    set({ items: get().items.map((x) => (x.id === id ? { ...x, ...patch } : x)) });

    // Sync stock delta into linked inventory product when qtyReceived changes.
    if (
      before &&
      before.inventoryProductId &&
      patch.qtyReceived !== undefined &&
      patch.qtyReceived !== before.qtyReceived
    ) {
      const delta = patch.qtyReceived - before.qtyReceived;
      if (delta !== 0) {
        const owner = get().owners.find((o) => o.id === before.ownerId);
        useStore
          .getState()
          .adjustStock(
            before.inventoryProductId,
            delta,
            "Consignment qty correction - " + (owner?.name ?? ""),
          );
      }
    }
    if (
      before &&
      before.inventoryProductId &&
      patch.sellingPrice !== undefined &&
      patch.sellingPrice !== before.sellingPrice
    ) {
      useStore
        .getState()
        .updateProduct(before.inventoryProductId, { sellingPrice: patch.sellingPrice });
    }
  },

  deleteItem: async (id) => {
    if (!isSupabaseConfigured) return;
    const item = get().items.find(i=>i.id===id);
    if (item && itemBalance(item) > 0) throw new Error("Return or sell the remaining stock before archiving this item");
    const { error } = await supabase.from("consignment_items").update({ active: false }).eq("id", id);
    if (error) throw new Error(error.message);
    set({ items: get().items.map(i=>i.id===id ? {...i,active:false} : i) });
  },

  /* ---------- sale ----------
   * Single source of truth: route through useStore.addSale so the canonical
   * `sales` / `sale_items` rows are created, inventory is reduced, and the
   * sale shows up in Sales reports. The store's addSale will detect the
   * consignment-linked product and auto-create the matching consignment_sales
   * row, so we deliberately do NOT insert into consignment_sales here. */
  recordSale: async ({ itemId, qty, unitPrice, customerId, notes }) => {
    if (!isSupabaseConfigured) return null;
    if (qty <= 0) return null;
    const item = get().items.find((x) => x.id === itemId);
    if (!item) return null;
    const balance = item.qtyReceived - item.qtySold - item.qtyReturned;
    if (qty > balance) {
      console.warn("[consignment.sale] insufficient stock");
      return null;
    }
    if (!item.inventoryProductId) {
      console.error(
        "[consignment.sale] item is not linked to an inventory product. Run migration 0014_consignment_inventory_integration.sql then re-add this consignment intake.",
      );
      return null;
    }
    const product = useStore
      .getState()
      .products.find((p) => p.id === item.inventoryProductId);
    if (!product) {
      console.error("[consignment.sale] linked product not found in store");
      return null;
    }
    const price = unitPrice && unitPrice > 0 ? unitPrice : item.sellingPrice;
    const total = qty * price;
    const ownerPayout = item.ownerPayout;
    const commission =
      item.commissionPct > 0
        ? total * (item.commissionPct / 100)
        : Math.max(0, total - qty * ownerPayout);
    const payable =
      item.commissionPct > 0
        ? Math.max(0, total - commission)
        : qty * ownerPayout;
    const landedCost = qty > 0 ? payable / qty : 0;
    const profit = total - landedCost * qty;
    const saleItem: SaleItem = {
      productId: product.id,
      name: product.name,
      qty,
      unit: product.unit,
      unitQty: qty,
      price,
      landedCost,
      total,
      profit,
    };
    // addSale will write `sales`, `sale_items`, reduce stock, and (via the
    // consignment-mirror block) insert into consignment_sales + bump
    // consignment_items.qty_sold.
    const created = useStore
      .getState()
      .addSale([saleItem], customerId ? "credit" : "cash", customerId);
    // Build a synthetic ConsignmentSale for immediate UI feedback. The real
    // row will arrive on next load() refresh triggered by addSale.
    const me = useStore.getState().currentUserId;
    const users = useStore.getState().users;
    const userName = me ? users.find((u) => u.id === me)?.fullName : undefined;
    const synthetic: ConsignmentSale = {
      id: "pending_" + created.id,
      itemId,
      ownerId: item.ownerId,
      qty,
      unitPrice: price,
      ownerPayout,
      totalAmount: total,
      payableAmount: payable,
      commission,
      customerId,
      userId: me ?? undefined,
      userName,
      notes,
      createdAt: new Date().toISOString(),
    };
    set({
      sales: [synthetic, ...get().sales],
    });
    useStore.getState().log(
      "consignment.sale",
      `Sold ${qty} x ${item.name} (owner payable ${payable.toFixed(2)})`,
    );
    return synthetic;
  },

  /* ---------- return ---------- */
  recordReturn: async ({ requestId, itemId, qty, notes }) => {
    if (!isSupabaseConfigured) return null;
    if (qty <= 0) return null;
    const item = get().items.find((x) => x.id === itemId);
    if (!item) return null;
    const balance = item.qtyReceived - item.qtySold - item.qtyReturned;
    if (qty > balance) return null;
    if (!item.inventoryProductId) {
      console.error("[consignment.return] item is not linked to inventory");
      return null;
    }
    const { data, error } = await supabase.rpc("return_consignment_once", {
      p_request_id: requestId,
      p_item_id: itemId,
      p_qty: qty,
      p_notes: notes ?? null,
    });
    if (error) {
      throw new Error(error.message);
    }
    const returnRow = (Array.isArray(data) ? data[0] : data) as ReturnRow | null;
    if (!returnRow) return null;
    const ret = rowToReturn(returnRow);
    await Promise.all([get().load(), useStore.getState().bootstrap()]);
    useStore.getState().log(
      "consignment.return",
      `Returned ${qty} × ${item.name}`
    );
    return ret;
  },

  /* ---------- settlement ---------- */
  recordSettlement: async ({ requestId, adjustsId, cashAction, ownerId, amount, paymentMethod, periodFrom, periodTo, notes }) => {
    if (!isSupabaseConfigured) return null;
    if (!Number.isFinite(amount) || amount === 0 || (!adjustsId && amount < 0)) return null;
    const me = useStore.getState().currentUserId;
    const { data, error } = await supabase.rpc("post_consignment_settlement", {
      p_request_id: requestId, p_owner_id: ownerId, p_amount: amount,
      p_method: paymentMethod ?? "cash", p_from: periodFrom ?? null,
      p_to: periodTo ?? null, p_notes: notes ?? null, p_adjusts_id: adjustsId ?? null,
      p_cash_action: cashAction ?? "linked_drawer",
    });
    if (error) {
      throw new Error(error.message);
    }
    const users = useStore.getState().users;
    const userName = me ? users.find((u) => u.id === me)?.fullName : undefined;
    const s = rowToSettlement(data as SettlementRow, userName);
    set({ settlements: [s, ...get().settlements.filter(entry => entry.id !== s.id)] });
    await useCashDrawers.getState().load();
    useStore.getState().log(
      "consignment.settle",
      `Paid ${amount.toFixed(2)} to consignment owner`
    );
    return s;
  },
  restock: async ({ requestId, itemId, qty, date, notes, sellingPrice }) => {
    const { error } = await supabase.rpc("restock_consignment_with_price", {
      p_request_id: requestId, p_item_id: itemId, p_qty: qty, p_date: date, p_notes: notes, p_price: sellingPrice,
    });
    if (error) throw new Error(error.message);
    await Promise.all([get().load(), useStore.getState().bootstrap()]);
  },
}));

export interface ConsignmentReceipt {
  id: string; item_id: string; owner_id: string; qty: number;
  received_date: string; notes?: string; created_at: string;
}

/* ---------------------------- selectors ---------------------------- */

export interface OwnerBalance {
  ownerId: string;
  totalSalesAmount: number;
  totalPayable: number;
  totalCommission: number;
  totalPaid: number;
  remainingPayable: number;
  qtyReceived: number;
  qtySold: number;
  qtyReturned: number;
  qtyBalance: number;
}

export const computeOwnerBalance = (
  ownerId: string,
  items: ConsignmentItem[],
  sales: ConsignmentSale[],
  settlements: ConsignmentSettlement[]
): OwnerBalance => {
  const ownerItems = items.filter((i) => i.ownerId === ownerId);
  const ownerSales = sales.filter((s) => s.ownerId === ownerId);
  const ownerPaid = settlements.filter((s) => s.ownerId === ownerId);
  const totalSalesAmount = ownerSales.reduce((a, s) => a + s.totalAmount, 0);
  const totalPayable = ownerSales.reduce((a, s) => a + s.payableAmount, 0);
  const totalCommission = ownerSales.reduce((a, s) => a + s.commission, 0);
  const totalPaid = ownerPaid.reduce((a, s) => a + s.amount, 0);
  const qtyReceived = ownerItems.reduce((a, i) => a + i.qtyReceived, 0);
  const qtySold = ownerItems.reduce((a, i) => a + i.qtySold, 0);
  const qtyReturned = ownerItems.reduce((a, i) => a + i.qtyReturned, 0);
  return {
    ownerId,
    totalSalesAmount,
    totalPayable,
    totalCommission,
    totalPaid,
    remainingPayable: Math.round((totalPayable - totalPaid) * 100) / 100,
    qtyReceived,
    qtySold,
    qtyReturned,
    qtyBalance: qtyReceived - qtySold - qtyReturned,
  };
};

export const itemBalance = (i: ConsignmentItem): number =>
  i.qtyReceived - i.qtySold - i.qtyReturned;
