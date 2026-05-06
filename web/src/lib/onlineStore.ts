import { create } from "zustand";
import {
  customerSupabase,
  customerEmailFromPhone,
  supabase,
  isSupabaseConfigured,
} from "./supabase";
import { toast } from "sonner";
import type { SaleItem } from "./types";

/* --------------------------------- types -------------------------------- */

export interface PublicCustomer {
  id: string;
  authUserId: string;
  name: string;
  phone: string;
  island: string;
  address: string;
  email: string;
  approvalStatus: "pending" | "approved" | "rejected";
  active: boolean;
  isCreditApproved: boolean;
  creditLimit: number;
  creditBalance: number;
  createdAt: string;
}

export type OnlineOrderStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "preparing"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export type OnlinePaymentMethod = "cash" | "bank" | "credit";

export interface OnlineOrderItem {
  id: string;
  orderId: string;
  productId: string | null;
  productName: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OnlineOrder {
  id: string;
  orderNo: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerIsland: string;
  deliveryAddress: string;
  status: OnlineOrderStatus;
  paymentMethod: OnlinePaymentMethod;
  paymentStatus: "unpaid" | "paid" | "failed";
  subtotal: number;
  total: number;
  notes: string;
  rejectionReason: string;
  deliveryTime: string | null;
  deliveryStaffId: string | null;
  deliveryStaffName: string;
  acceptedAt: string | null;
  acceptedByName: string;
  deliveredAt: string | null;
  saleId: string | null;
  createdAt: string;
  updatedAt: string;
  items: OnlineOrderItem[];
}

interface PublicCustomerRow {
  id: string;
  auth_user_id: string;
  name: string;
  phone: string;
  island: string | null;
  address: string | null;
  email: string | null;
  approval_status: PublicCustomer["approvalStatus"];
  active?: boolean | null;
  is_credit_approved: boolean;
  credit_limit: number;
  credit_balance: number;
  created_at: string;
}

const rowToCustomer = (r: PublicCustomerRow): PublicCustomer => ({
  id: r.id,
  authUserId: r.auth_user_id,
  name: r.name,
  phone: r.phone,
  island: r.island ?? "",
  address: r.address ?? "",
  email: r.email ?? "",
  approvalStatus: r.approval_status,
  active: r.active ?? true,
  isCreditApproved: r.is_credit_approved,
  creditLimit: r.credit_limit,
  creditBalance: r.credit_balance,
  createdAt: r.created_at,
});

interface OnlineOrderRow {
  id: string;
  order_no: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_island: string | null;
  delivery_address: string | null;
  status: OnlineOrderStatus;
  payment_method: OnlinePaymentMethod;
  payment_status: "unpaid" | "paid" | "failed";
  subtotal: number;
  total: number;
  notes: string | null;
  rejection_reason: string | null;
  delivery_time: string | null;
  delivery_staff_id: string | null;
  delivery_staff_name: string | null;
  accepted_at: string | null;
  accepted_by_name: string | null;
  delivered_at: string | null;
  sale_id: string | null;
  created_at: string;
  updated_at: string;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

const rowToOrder = (r: OnlineOrderRow, items: OrderItemRow[] = []): OnlineOrder => ({
  id: r.id,
  orderNo: r.order_no,
  customerId: r.customer_id,
  customerName: r.customer_name ?? "",
  customerPhone: r.customer_phone ?? "",
  customerIsland: r.customer_island ?? "",
  deliveryAddress: r.delivery_address ?? "",
  status: r.status,
  paymentMethod: r.payment_method,
  paymentStatus: r.payment_status,
  subtotal: Number(r.subtotal) || 0,
  total: Number(r.total) || 0,
  notes: r.notes ?? "",
  rejectionReason: r.rejection_reason ?? "",
  deliveryTime: r.delivery_time,
  deliveryStaffId: r.delivery_staff_id,
  deliveryStaffName: r.delivery_staff_name ?? "",
  acceptedAt: r.accepted_at,
  acceptedByName: r.accepted_by_name ?? "",
  deliveredAt: r.delivered_at,
  saleId: r.sale_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  items: items
    .filter((i) => i.order_id === r.id)
    .map((i) => ({
      id: i.id,
      orderId: i.order_id,
      productId: i.product_id,
      productName: i.product_name,
      qty: i.qty,
      unitPrice: Number(i.unit_price) || 0,
      lineTotal: Number(i.line_total) || 0,
    })),
});

/* ---------------------- customer-side store (storefront) -------------------- */

export interface CartLine {
  productId: string;
  productName: string;
  /** Price per piece (base unit). Cart total = qty (in pieces) * unitPrice. */
  unitPrice: number;
  /** Quantity in pieces (so stock_pieces deducts cleanly). */
  qty: number;
  /** Available stock in pieces. */
  available: number;
  /** How the line is shown to the buyer. "case" steps by piecesPerCase. */
  unitType: "piece" | "case";
  /** Pieces per case for this product (1 if sold only by piece). */
  piecesPerCase: number;
}

interface CustomerStoreState {
  customer: PublicCustomer | null;
  loading: boolean;
  cart: CartLine[];
  myOrders: OnlineOrder[];

  bootstrap: () => Promise<void>;
  signUp: (input: {
    name: string;
    phone: string;
    password: string;
    island: string;
    address: string;
    email?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  signIn: (phone: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;

  addToCart: (
    line: Omit<CartLine, "qty" | "unitType" | "piecesPerCase"> & {
      qty?: number;
      unitType?: "piece" | "case";
      piecesPerCase?: number;
    }
  ) => void;
  setQty: (productId: string, qty: number) => void;
  setUnitType: (productId: string, unitType: "piece" | "case") => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;

  placeOrder: (input: {
    paymentMethod: OnlinePaymentMethod;
    notes?: string;
    deliveryAddress?: string;
  }) => Promise<{ ok: boolean; orderId?: string; error?: string }>;
  loadMyOrders: () => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
}

export const useCustomerStore = create<CustomerStoreState>((set, get) => ({
  customer: null,
  loading: true,
  cart: [],
  myOrders: [],

  bootstrap: async () => {
    if (!isSupabaseConfigured) {
      set({ loading: false });
      return;
    }
    const { data } = await customerSupabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) {
      set({ customer: null, loading: false });
      return;
    }
    const { data: row, error } = await customerSupabase
      .from("public_customers")
      .select("*")
      .eq("auth_user_id", uid)
      .maybeSingle();
    if (error) {
      console.error("[onlineStore] customer fetch failed", error);
    }
    set({
      customer: row ? rowToCustomer(row as PublicCustomerRow) : null,
      loading: false,
    });
    if (row) await get().loadMyOrders();
  },

  signUp: async ({ name, phone, password, island, address, email }) => {
    if (!isSupabaseConfigured) return { ok: false, error: "Supabase not configured" };
    const cleanPhone = phone.replace(/\s+/g, "");
    if (!cleanPhone) return { ok: false, error: "Phone is required" };
    const synth = customerEmailFromPhone(cleanPhone);
    const { data, error } = await customerSupabase.auth.signUp({
      email: synth,
      password,
    });
    if (error) return { ok: false, error: error.message };
    const uid = data.user?.id;
    if (!uid) return { ok: false, error: "Signup failed" };
    const { data: row, error: insErr } = await customerSupabase
      .from("public_customers")
      .insert({
        auth_user_id: uid,
        name,
        phone: cleanPhone,
        island: island || null,
        address: address || null,
        email: email || null,
        // Customers are auto-approved on signup; ordering is instant.
        approval_status: "approved",
      })
      .select()
      .single();
    if (insErr) return { ok: false, error: insErr.message };
    set({ customer: rowToCustomer(row as PublicCustomerRow) });
    return { ok: true };
  },

  signIn: async (phone, password) => {
    if (!isSupabaseConfigured) return { ok: false, error: "Supabase not configured" };
    const synth = customerEmailFromPhone(phone.replace(/\s+/g, ""));
    const { error } = await customerSupabase.auth.signInWithPassword({
      email: synth,
      password,
    });
    if (error) return { ok: false, error: error.message };
    await get().bootstrap();
    return { ok: true };
  },

  signOut: async () => {
    if (isSupabaseConfigured) await customerSupabase.auth.signOut();
    set({ customer: null, myOrders: [], cart: [] });
  },

  addToCart: (line) => {
    const ppc = Math.max(1, line.piecesPerCase ?? 1);
    const unitType: "piece" | "case" = line.unitType ?? "piece";
    const step = unitType === "case" ? ppc : 1;
    const requested = line.qty && line.qty > 0 ? line.qty : 1;
    const addPieces = unitType === "case" ? requested * ppc : requested;
    const existing = get().cart.find((c) => c.productId === line.productId);
    if (existing) {
      const newQty = Math.min(line.available, existing.qty + addPieces);
      // Keep multiples of step so case-mode stays clean.
      const aligned =
        existing.unitType === "case"
          ? Math.floor(newQty / step) * step
          : newQty;
      set({
        cart: get().cart.map((c) =>
          c.productId === line.productId
            ? { ...c, qty: Math.max(step, aligned) }
            : c
        ),
      });
    } else {
      set({
        cart: [
          ...get().cart,
          {
            productId: line.productId,
            productName: line.productName,
            unitPrice: line.unitPrice,
            available: line.available,
            qty: Math.min(line.available, addPieces),
            unitType,
            piecesPerCase: ppc,
          },
        ],
      });
    }
  },

  setQty: (productId, qty) => {
    set({
      cart: get().cart
        .map((c) => {
          if (c.productId !== productId) return c;
          const step = c.unitType === "case" ? Math.max(1, c.piecesPerCase) : 1;
          const clamped = Math.max(0, Math.min(c.available, qty));
          // snap to step in case-mode so qty is always a whole number of cases
          const snapped =
            c.unitType === "case" ? Math.floor(clamped / step) * step : clamped;
          return { ...c, qty: snapped };
        })
        .filter((c) => c.qty > 0),
    });
  },

  setUnitType: (productId, unitType) => {
    set({
      cart: get().cart.map((c) => {
        if (c.productId !== productId) return c;
        if (c.unitType === unitType) return c;
        const ppc = Math.max(1, c.piecesPerCase);
        if (unitType === "case") {
          if (ppc <= 1) return c; // no case for this product
          // Round up to at least one case, capped by available pieces.
          const cases = Math.max(1, Math.ceil(c.qty / ppc));
          const pieces = Math.min(c.available, cases * ppc);
          // If even a single case won't fit in stock, ignore the toggle.
          if (pieces < ppc) return c;
          return { ...c, unitType, qty: pieces };
        }
        // switching back to pieces — keep current piece count
        return { ...c, unitType, qty: Math.max(1, c.qty) };
      }),
    });
  },

  removeFromCart: (productId) => {
    set({ cart: get().cart.filter((c) => c.productId !== productId) });
  },

  clearCart: () => set({ cart: [] }),

  placeOrder: async ({ paymentMethod, notes, deliveryAddress }) => {
    const c = get().customer;
    if (!c) {
      return {
        ok: false,
        error: "Please register and get approval before placing orders.",
      };
    }
    // Always re-check approval status against Supabase before inserting,
    // so a stale local state can never bypass the gate.
    const { data: fresh, error: freshErr } = await customerSupabase
      .from("public_customers")
      .select("approval_status,active")
      .eq("id", c.id)
      .maybeSingle();
    if (freshErr) {
      console.error("[onlineStore] approval recheck failed", freshErr);
      return { ok: false, error: freshErr.message };
    }
    const active = (fresh as { active?: boolean } | null)?.active ?? true;
    if (!active) {
      set({ customer: { ...c, active } });
      return {
        ok: false,
        error: "Your account is inactive. Please contact the shop.",
      };
    }
    if (paymentMethod === "credit" && !c.isCreditApproved) {
      return { ok: false, error: "Credit not approved for this account" };
    }
    const cart = get().cart;
    if (cart.length === 0) return { ok: false, error: "Cart is empty" };

    const subtotal = cart.reduce((s, x) => s + x.qty * x.unitPrice, 0);

    if (paymentMethod === "credit") {
      const projected = c.creditBalance + subtotal;
      if (projected > c.creditLimit) {
        return {
          ok: false,
          error: `Credit limit exceeded (limit MVR ${c.creditLimit.toFixed(2)})`,
        };
      }
    }

    const { data: orderRow, error: orderErr } = await customerSupabase
      .from("online_orders")
      .insert({
        customer_id: c.id,
        customer_name: c.name,
        customer_phone: c.phone,
        customer_island: c.island,
        delivery_address: deliveryAddress || c.address,
        status: "pending",
        payment_method: paymentMethod,
        payment_status: "unpaid",
        subtotal,
        total: subtotal,
        notes: notes || null,
      })
      .select()
      .single();
    if (orderErr) return { ok: false, error: orderErr.message };
    const orderId = (orderRow as { id: string }).id;

    const itemsRows = cart.map((line) => ({
      order_id: orderId,
      product_id: line.productId,
      product_name: line.productName,
      qty: line.qty,
      unit_price: line.unitPrice,
      line_total: line.qty * line.unitPrice,
    }));
    const { error: itemsErr } = await customerSupabase
      .from("online_order_items")
      .insert(itemsRows);
    if (itemsErr) {
      // rollback order so we don't leave a phantom
      await customerSupabase.from("online_orders").delete().eq("id", orderId);
      return { ok: false, error: itemsErr.message };
    }
    set({ cart: [] });
    await get().loadMyOrders();
    return { ok: true, orderId };
  },

  loadMyOrders: async () => {
    const c = get().customer;
    if (!c || !isSupabaseConfigured) return;
    const { data: orders } = await customerSupabase
      .from("online_orders")
      .select("*")
      .eq("customer_id", c.id)
      .order("created_at", { ascending: false });
    if (!orders) return;
    const ids = (orders as OnlineOrderRow[]).map((o) => o.id);
    let items: OrderItemRow[] = [];
    if (ids.length > 0) {
      const { data: itemsRows } = await customerSupabase
        .from("online_order_items")
        .select("*")
        .in("order_id", ids);
      items = (itemsRows as OrderItemRow[]) ?? [];
    }
    set({
      myOrders: (orders as OnlineOrderRow[]).map((o) => rowToOrder(o, items)),
    });
  },

  cancelOrder: async (orderId) => {
    const c = get().customer;
    if (!c) return;
    const { error } = await customerSupabase
      .from("online_orders")
      .update({ status: "cancelled" })
      .eq("id", orderId)
      .eq("customer_id", c.id)
      .eq("status", "pending");
    if (error) {
      toast.error("Could not cancel: " + error.message);
      return;
    }
    toast.success("Order cancelled");
    await get().loadMyOrders();
  },
}));

/* ---------------------- admin-side store (staff portal) -------------------- */

interface AdminOnlineState {
  orders: OnlineOrder[];
  customers: PublicCustomer[];
  loading: boolean;
  lastError: string | null;
  load: () => Promise<void>;
  acceptOrder: (
    orderId: string,
    opts: { adjustments?: { itemId: string; qty: number }[]; deliveryTime?: string }
  ) => Promise<{ ok: boolean; error?: string }>;
  rejectOrder: (orderId: string, reason: string) => Promise<void>;
  setStatus: (orderId: string, status: OnlineOrderStatus) => Promise<void>;
  assignDelivery: (
    orderId: string,
    staffId: string,
    staffName: string
  ) => Promise<void>;
  approveCustomer: (customerId: string, creditLimit?: number) => Promise<void>;
  rejectCustomer: (customerId: string) => Promise<void>;
  setCustomerCredit: (customerId: string, limit: number, approved: boolean) => Promise<void>;
  updateCustomer: (
    customerId: string,
    patch: {
      name?: string;
      phone?: string;
      island?: string;
      address?: string;
      email?: string;
    }
  ) => Promise<void>;
}

export const useOnlineAdminStore = create<AdminOnlineState>((set, get) => ({
  orders: [],
  customers: [],
  loading: false,
  lastError: null,
  load: async () => {
    if (!isSupabaseConfigured) return;
    set({ loading: true });
    const [ordersRes, itemsRes, customersRes] = await Promise.all([
      supabase
        .from("online_orders")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("online_order_items").select("*"),
      supabase
        .from("public_customers")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);
    const firstErr =
      ordersRes.error?.message ||
      itemsRes.error?.message ||
      customersRes.error?.message ||
      null;
    if (firstErr) {
      console.error("[onlineAdmin] load failed", {
        orders: ordersRes.error,
        items: itemsRes.error,
        customers: customersRes.error,
      });
    }
    set({
      orders: ((ordersRes.data as OnlineOrderRow[]) ?? []).map((o) =>
        rowToOrder(o, (itemsRes.data as OrderItemRow[]) ?? [])
      ),
      customers: ((customersRes.data as PublicCustomerRow[]) ?? []).map(
        rowToCustomer
      ),
      loading: false,
      lastError: firstErr,
    });
  },

  acceptOrder: async (orderId, { adjustments, deliveryTime }) => {
    const order = get().orders.find((o) => o.id === orderId);
    if (!order) return { ok: false, error: "Order not found" };

    // Apply qty adjustments first.
    if (adjustments && adjustments.length > 0) {
      for (const a of adjustments) {
        const it = order.items.find((i) => i.id === a.itemId);
        if (!it) continue;
        const newTotal = it.unitPrice * a.qty;
        await supabase
          .from("online_order_items")
          .update({ qty: a.qty, line_total: newTotal })
          .eq("id", a.itemId);
      }
      // recompute totals
      const newSub = order.items.reduce((s, x) => {
        const adj = adjustments.find((a) => a.itemId === x.id);
        const q = adj ? adj.qty : x.qty;
        return s + x.unitPrice * q;
      }, 0);
      await supabase
        .from("online_orders")
        .update({ subtotal: newSub, total: newSub })
        .eq("id", orderId);
    }

    // Get current user (staff)
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id ?? null;
    let staffName: string | null = null;
    if (uid) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name,email")
        .eq("id", uid)
        .maybeSingle();
      staffName =
        (prof as { full_name?: string; email?: string } | null)?.full_name ??
        (prof as { email?: string } | null)?.email ??
        null;
    }

    const { error } = await supabase
      .from("online_orders")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_by: uid,
        accepted_by_name: staffName,
        delivery_time: deliveryTime || null,
      })
      .eq("id", orderId);
    if (error) return { ok: false, error: error.message };

    await get().load();
    return { ok: true };
  },

  rejectOrder: async (orderId, reason) => {
    const { error } = await supabase
      .from("online_orders")
      .update({ status: "rejected", rejection_reason: reason || null })
      .eq("id", orderId);
    if (error) {
      toast.error("Reject failed: " + error.message);
      return;
    }
    await get().load();
  },

  setStatus: async (orderId, status) => {
    const patch: Record<string, unknown> = { status };
    if (status === "delivered") patch.delivered_at = new Date().toISOString();
    const { error } = await supabase
      .from("online_orders")
      .update(patch)
      .eq("id", orderId);
    if (error) {
      toast.error("Update failed: " + error.message);
      return;
    }
    await get().load();
  },

  assignDelivery: async (orderId, staffId, staffName) => {
    const { error } = await supabase
      .from("online_orders")
      .update({
        delivery_staff_id: staffId,
        delivery_staff_name: staffName,
      })
      .eq("id", orderId);
    if (error) {
      toast.error("Assign failed: " + error.message);
      return;
    }
    await get().load();
  },

  approveCustomer: async (customerId, creditLimit) => {
    const patch: Record<string, unknown> = { approval_status: "approved" };
    if (creditLimit && creditLimit > 0) {
      patch.is_credit_approved = true;
      patch.credit_limit = creditLimit;
    }
    const { error } = await supabase
      .from("public_customers")
      .update(patch)
      .eq("id", customerId);
    if (error) {
      toast.error("Approve failed: " + error.message);
      return;
    }
    await get().load();
  },

  rejectCustomer: async (customerId) => {
    const { error } = await supabase
      .from("public_customers")
      .update({ approval_status: "rejected" })
      .eq("id", customerId);
    if (error) {
      toast.error("Reject failed: " + error.message);
      return;
    }
    await get().load();
  },

  setCustomerCredit: async (customerId, limit, approved) => {
    const { error } = await supabase
      .from("public_customers")
      .update({ credit_limit: limit, is_credit_approved: approved })
      .eq("id", customerId);
    if (error) {
      toast.error("Save failed: " + error.message);
      return;
    }
    await get().load();
  },

  updateCustomer: async (customerId, patch) => {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.phone !== undefined) row.phone = patch.phone;
    if (patch.island !== undefined) row.island = patch.island || null;
    if (patch.address !== undefined) row.address = patch.address || null;
    if (patch.email !== undefined) row.email = patch.email || null;
    const { error } = await supabase
      .from("public_customers")
      .update(row)
      .eq("id", customerId);
    if (error) {
      toast.error("Update failed: " + error.message);
      return;
    }
    await get().load();
  },
}));

/* ----------------------- helpers shared with POS ------------------------ */

/**
 * Convert an accepted online order into POS sale items (pieces). Caller
 * must look up landed cost and call useStore.addSale().
 */
export const orderToSaleItems = (
  order: OnlineOrder,
  productLookup: (productId: string) => {
    sellingPrice: number;
    landedCost: number;
    unit: SaleItem["unit"];
    gstApplicable?: boolean;
  } | null
): SaleItem[] => {
  const items: SaleItem[] = [];
  for (const it of order.items) {
    if (!it.productId) continue;
    const p = productLookup(it.productId);
    if (!p) continue;
    const total = it.qty * it.unitPrice;
    items.push({
      productId: it.productId,
      name: it.productName,
      qty: it.qty,
      unit: p.unit,
      unitQty: it.qty,
      price: it.unitPrice,
      landedCost: p.landedCost,
      total,
      profit: total - it.qty * p.landedCost,
      gstApplicable: p.gstApplicable,
    });
  }
  return items;
};
