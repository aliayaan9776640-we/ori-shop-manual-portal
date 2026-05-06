import { create } from "zustand";
import { supabase, isSupabaseConfigured } from "./supabase";
import { useStore, rowToProduct } from "./store";
import type { Product, UnitType, SaleItem } from "./types";

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
  id: string;
  itemId: string;
  ownerId: string;
  qty: number;
  notes?: string;
  userId?: string;
  createdAt: string;
}

export interface ConsignmentSettlement {
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

/* Map ConsignmentUnit (which has 'packet') down to the inventory UnitType. */
const toInventoryUnit = (u: ConsignmentUnit): UnitType =>
  u === "packet" ? "piece" : (u as UnitType);

interface ProductInsertRow {
  name: string;
  barcode: string | null;
  category: string;
  supplier_id: string | null;
  purchase_price: number;
  selling_price: number;
  margin_pct: number;
  unit_type: UnitType;
  pieces_per_case: number;
  stock_pieces: number;
  reorder_level: number;
  expiry_date: string | null;
  boat_fee: number;
  other_cost: number;
  photo_url: string | null;
  is_consignment?: boolean;
}

/**
 * Find an existing consignment-flagged product by name (case-insensitive)
 * or create a new one. Keeps the local store in sync and records an
 * inventory_transactions row for the intake.
 */
async function ensureConsignmentProduct(
  itemName: string,
  ownerName: string,
  unitType: ConsignmentUnit,
  sellingPrice: number,
  ownerPayout: number,
  qtyToAdd: number,
): Promise<Product | null> {
  if (!isSupabaseConfigured) return null;
  const nameKey = itemName.trim().toLowerCase();
  const existing = useStore
    .getState()
    .products.find(
      (p) => p.isConsignment === true && p.name.trim().toLowerCase() === nameKey,
    );
  if (existing) {
    if (qtyToAdd > 0) {
      useStore
        .getState()
        .adjustStock(existing.id, qtyToAdd, "Consignment intake - " + ownerName);
    }
    if (sellingPrice > 0 && existing.sellingPrice !== sellingPrice) {
      useStore.getState().updateProduct(existing.id, { sellingPrice });
    }
    return existing;
  }
  const baseRow: ProductInsertRow = {
    name: itemName,
    barcode: null,
    category: ownerName ? "Consignment - " + ownerName : "Consignment",
    supplier_id: null,
    purchase_price: ownerPayout,
    selling_price: sellingPrice,
    margin_pct: 0,
    unit_type: toInventoryUnit(unitType),
    pieces_per_case: 1,
    stock_pieces: qtyToAdd,
    reorder_level: 0,
    expiry_date: null,
    boat_fee: 0,
    other_cost: 0,
    photo_url: null,
    is_consignment: true,
  };
  let { data, error } = await supabase
    .from("products")
    .insert(baseRow)
    .select()
    .single();
  if (error) {
    const code = (error as { code?: string }).code;
    const missingCol =
      code === "PGRST204" ||
      /is_consignment|column .* does not exist|schema cache/i.test(error.message ?? "");
    if (missingCol) {
      console.warn(
        "[consignment] products.is_consignment missing - run migration 0014_consignment_inventory_integration.sql",
      );
      const fallbackRow: Omit<ProductInsertRow, "is_consignment"> = {
        name: baseRow.name,
        barcode: baseRow.barcode,
        category: baseRow.category,
        supplier_id: baseRow.supplier_id,
        purchase_price: baseRow.purchase_price,
        selling_price: baseRow.selling_price,
        margin_pct: baseRow.margin_pct,
        unit_type: baseRow.unit_type,
        pieces_per_case: baseRow.pieces_per_case,
        stock_pieces: baseRow.stock_pieces,
        reorder_level: baseRow.reorder_level,
        expiry_date: baseRow.expiry_date,
        boat_fee: baseRow.boat_fee,
        other_cost: baseRow.other_cost,
        photo_url: baseRow.photo_url,
      };
      const retry = await supabase
        .from("products")
        .insert(fallbackRow)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }
  }
  if (error || !data) {
    logErr("products.consignment.insert", error);
    return null;
  }
  const product = rowToProduct(data as Parameters<typeof rowToProduct>[0]);
  // Force the flag locally even if the column was missing on the server.
  product.isConsignment = true;
  useStore.setState({ products: [...useStore.getState().products, product] });
  if (qtyToAdd > 0) {
    void supabase.from("inventory_transactions").insert({
      product_id: product.id,
      type: "in",
      qty: qtyToAdd,
      note: "Consignment intake - " + ownerName,
      user_id: useStore.getState().currentUserId,
    });
  }
  return product;
}

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
  notes: string | null;
  created_at: string;
}
const rowToSale = (r: SaleRow, userName?: string): ConsignmentSale => ({
  id: r.id,
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
  id: string;
  item_id: string;
  owner_id: string;
  qty: number;
  notes: string | null;
  user_id: string | null;
  created_at: string;
}
const rowToReturn = (r: ReturnRow): ConsignmentReturn => ({
  id: r.id,
  itemId: r.item_id,
  ownerId: r.owner_id,
  qty: Number(r.qty),
  notes: r.notes ?? undefined,
  userId: r.user_id ?? undefined,
  createdAt: r.created_at,
});

interface SettlementRow {
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
    itemId: string;
    qty: number;
    notes?: string;
  }) => Promise<ConsignmentReturn | null>;

  recordSettlement: (input: {
    ownerId: string;
    amount: number;
    paymentMethod?: string;
    periodFrom?: string;
    periodTo?: string;
    notes?: string;
  }) => Promise<ConsignmentSettlement | null>;
}

export const useConsignment = create<ConsignmentState>()((set, get) => ({
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
      const [ownersRes, itemsRes, salesRes, returnsRes, settlementsRes] = await Promise.all([
        supabase.from("consignment_owners").select("*").order("name"),
        supabase.from("consignment_items").select("*").order("created_at", { ascending: false }),
        supabase.from("consignment_sales").select("*").order("created_at", { ascending: false }).limit(2000),
        supabase.from("consignment_returns").select("*").order("created_at", { ascending: false }),
        supabase.from("consignment_settlements").select("*").order("created_at", { ascending: false }),
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

      set({
        owners: ((ownersRes.data as OwnerRow[] | null) ?? []).map(rowToOwner),
        items: ((itemsRes.data as ItemRow[] | null) ?? []).map(rowToItem),
        sales: ((salesRes.data as SaleRow[] | null) ?? []).map((s) =>
          rowToSale(s, nameOf(s.user_id))
        ),
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
    set({ owners: get().owners.filter((o) => o.id !== id) });
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.from("consignment_owners").delete().eq("id", id);
    logErr("owners.delete", error);
  },

  /* ---------- items ---------- */
  addItem: async (i) => {
    if (!isSupabaseConfigured) return null;
    const { data, error } = await supabase
      .from("consignment_items")
      .insert({
        owner_id: i.ownerId,
        name: i.name,
        unit_type: i.unitType,
        qty_received: i.qtyReceived,
        selling_price: i.sellingPrice,
        owner_payout: i.ownerPayout,
        commission_pct: i.commissionPct,
        received_date: i.receivedDate,
        notes: i.notes ?? null,
      })
      .select()
      .single();
    if (error) {
      logErr("items.insert", error);
      return null;
    }
    const item = rowToItem(data as ItemRow);

    // Mirror to inventory products so this stock is visible + sellable in POS.
    const owner = get().owners.find((o) => o.id === i.ownerId);
    const product = await ensureConsignmentProduct(
      i.name,
      owner?.name ?? "",
      i.unitType,
      i.sellingPrice,
      i.ownerPayout,
      i.qtyReceived,
    );
    if (product) {
      const { error: linkErr } = await supabase
        .from("consignment_items")
        .update({ inventory_product_id: product.id })
        .eq("id", item.id);
      if (linkErr) {
        const code = (linkErr as { code?: string }).code;
        const missing =
          code === "PGRST204" ||
          /inventory_product_id|column .* does not exist|schema cache/i.test(
            linkErr.message ?? "",
          );
        if (!missing) logErr("items.link", linkErr);
        else
          console.warn(
            "[consignment] consignment_items.inventory_product_id missing - run migration 0014_consignment_inventory_integration.sql",
          );
      }
      item.inventoryProductId = product.id;
    }

    set({ items: [item, ...get().items] });
    useStore.getState().log(
      "consignment.item.create",
      `Received ${item.qtyReceived} ${item.unitType} ${item.name}` +
        (product ? " (linked to inventory)" : ""),
    );
    return item;
  },

  updateItem: async (id, patch) => {
    const before = get().items.find((x) => x.id === id);
    set({ items: get().items.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
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
    logErr("items.update", error);

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
    set({ items: get().items.filter((x) => x.id !== id) });
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.from("consignment_items").delete().eq("id", id);
    logErr("items.delete", error);
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
    const payable = qty * ownerPayout;
    const landedCost = ownerPayout; // cost to shop = what we owe the consignor
    const commission =
      item.commissionPct > 0
        ? total * (item.commissionPct / 100)
        : Math.max(0, total - payable);
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
      items: get().items.map((x) =>
        x.id === itemId ? { ...x, qtySold: x.qtySold + qty } : x,
      ),
    });
    useStore.getState().log(
      "consignment.sale",
      `Sold ${qty} x ${item.name} (owner payable ${payable.toFixed(2)})`,
    );
    return synthetic;
  },

  /* ---------- return ---------- */
  recordReturn: async ({ itemId, qty, notes }) => {
    if (!isSupabaseConfigured) return null;
    if (qty <= 0) return null;
    const item = get().items.find((x) => x.id === itemId);
    if (!item) return null;
    const balance = item.qtyReceived - item.qtySold - item.qtyReturned;
    if (qty > balance) return null;
    const me = useStore.getState().currentUserId;
    const { data, error } = await supabase
      .from("consignment_returns")
      .insert({
        item_id: itemId,
        owner_id: item.ownerId,
        qty,
        notes: notes ?? null,
        user_id: me,
      })
      .select()
      .single();
    if (error) {
      logErr("returns.insert", error);
      return null;
    }
    const newReturned = item.qtyReturned + qty;
    const { error: uErr } = await supabase
      .from("consignment_items")
      .update({ qty_returned: newReturned })
      .eq("id", itemId);
    logErr("items.qtyReturned", uErr);
    const ret = rowToReturn(data as ReturnRow);
    set({
      returns: [ret, ...get().returns],
      items: get().items.map((x) =>
        x.id === itemId ? { ...x, qtyReturned: newReturned } : x
      ),
    });
    useStore.getState().log(
      "consignment.return",
      `Returned ${qty} × ${item.name}`
    );
    return ret;
  },

  /* ---------- settlement ---------- */
  recordSettlement: async ({ ownerId, amount, paymentMethod, periodFrom, periodTo, notes }) => {
    if (!isSupabaseConfigured) return null;
    if (amount <= 0) return null;
    const me = useStore.getState().currentUserId;
    const { data, error } = await supabase
      .from("consignment_settlements")
      .insert({
        owner_id: ownerId,
        amount,
        payment_method: paymentMethod ?? null,
        period_from: periodFrom ?? null,
        period_to: periodTo ?? null,
        notes: notes ?? null,
        user_id: me,
      })
      .select()
      .single();
    if (error) {
      logErr("settlements.insert", error);
      return null;
    }
    const users = useStore.getState().users;
    const userName = me ? users.find((u) => u.id === me)?.fullName : undefined;
    const s = rowToSettlement(data as SettlementRow, userName);
    set({ settlements: [s, ...get().settlements] });
    useStore.getState().log(
      "consignment.settle",
      `Paid ${amount.toFixed(2)} to consignment owner`
    );
    return s;
  },
}));

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
    remainingPayable: Math.max(0, totalPayable - totalPaid),
    qtyReceived,
    qtySold,
    qtyReturned,
    qtyBalance: qtyReceived - qtySold - qtyReturned,
  };
};

export const itemBalance = (i: ConsignmentItem): number =>
  i.qtyReceived - i.qtySold - i.qtyReturned;
