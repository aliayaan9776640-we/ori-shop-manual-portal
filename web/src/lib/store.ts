import { create } from "zustand";
import type {
  ActivityLog,
  CreditApprovalStatus,
  CreditCustomer,
  CreditTransaction,
  DamagedItem,
  InventoryTx,
  Order,
  OrderItem,
  PaymentMethod,
  Product,
  Sale,
  SaleItem,
  StockBatch,
  Supplier,
  User,
} from "./types";
import { sortBatchesFifo } from "./expiry";
import {
  buildSeedSales,
  seedCreditTx,
  seedCustomers,
  seedDamaged,
  seedOrders,
  seedProducts,
  seedSuppliers,
  seedUsers,
} from "./seed";
import { supabase, isSupabaseConfigured } from "./supabase";
import type { PostgrestError } from "@supabase/supabase-js";
import { toast } from "sonner";

/* ----------------------------- helpers ------------------------------ */

export const landedCostPerPiece = (p: Product): number => {
  const total = p.purchasePrice + p.boatFee + p.otherCost;
  return total / Math.max(1, p.piecesPerCase || 1);
};

export const landedCostTotal = (p: Product): number =>
  p.purchasePrice + p.boatFee + p.otherCost;

export const suggestedSellingPrice = (p: Product): number => {
  const landed = landedCostTotal(p);
  return landed * (1 + p.marginPct / 100);
};

const localId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const logErr = (where: string, err: PostgrestError | Error | null): void => {
  if (!err) return;
  // eslint-disable-next-line no-console
  console.error(`[supabase][${where}]`, err.message ?? err);
};

/** Surface a Supabase write error to the user so silent failures stop happening. */
const notifyWriteError = (
  where: string,
  err: PostgrestError | { message?: string; code?: string } | null
): void => {
  if (!err) return;
  const msg = err.message ?? "Unknown error";
  const code = (err as { code?: string }).code;
  // eslint-disable-next-line no-console
  console.error(`[supabase][${where}]`, { message: msg, code });
  toast.error(`Save failed: ${where}`, {
    description: code ? `${code} — ${msg}` : msg,
  });
};

/* ------------------------- row <-> type mappers --------------------- */

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "storekeeper" | "cashier";
  active: boolean;
  created_at: string;
  is_purchasing_staff?: boolean | null;
}
const rowToUser = (r: ProfileRow): User => ({
  id: r.id,
  username: r.email,
  email: r.email,
  fullName: r.full_name ?? r.email,
  role: r.role,
  active: r.active,
  createdAt: r.created_at,
  isPurchasingStaff: r.is_purchasing_staff ?? false,
});

interface SupplierRow {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  viber: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}
const rowToSupplier = (r: SupplierRow): Supplier => ({
  id: r.id,
  name: r.name,
  contactPerson: r.contact_person ?? "",
  phone: r.phone ?? "",
  viber: r.viber ?? "",
  email: r.email ?? "",
  address: r.address ?? "",
  notes: r.notes ?? "",
});
const supplierToRow = (s: Partial<Supplier>): Partial<SupplierRow> => ({
  name: s.name,
  contact_person: s.contactPerson ?? null,
  phone: s.phone ?? null,
  viber: s.viber ?? null,
  email: s.email ?? null,
  address: s.address ?? null,
  notes: s.notes ?? null,
});

interface ProductRow {
  id: string;
  name: string;
  barcode: string | null;
  category: string | null;
  size: string | null;
  supplier_id: string | null;
  purchase_price: number;
  selling_price: number;
  margin_pct: number;
  unit_type: Product["unit"];
  pieces_per_case: number;
  stock_pieces: number;
  reorder_level: number;
  expiry_date: string | null;
  boat_fee: number;
  other_cost: number;
  photo_url: string | null;
  gst_applicable?: boolean | null;
  is_consignment?: boolean | null;
  publish_status?: "draft" | "pending" | "approved" | "rejected" | null;
  approved_by?: string | null;
  approved_at?: string | null;
  brand?: string | null;
  is_offer?: boolean | null;
  discount_pct?: number | null;
  offer_label?: string | null;
}
export const rowToProduct = (r: ProductRow): Product => ({
  id: r.id,
  name: r.name,
  barcode: r.barcode ?? "",
  category: r.category ?? "",
  size: r.size ?? undefined,
  supplierId: r.supplier_id ?? "",
  purchasePrice: Number(r.purchase_price),
  sellingPrice: Number(r.selling_price),
  marginPct: Number(r.margin_pct),
  unit: r.unit_type,
  piecesPerCase: r.pieces_per_case,
  stockPieces: r.stock_pieces,
  reorderLevel: r.reorder_level,
  expiryDate: r.expiry_date ?? undefined,
  boatFee: Number(r.boat_fee),
  otherCost: Number(r.other_cost),
  photo: r.photo_url ?? undefined,
  gstApplicable: r.gst_applicable === false ? false : true, // tolerated if column missing
  isConsignment: r.is_consignment === true,
  publishStatus: r.publish_status ?? "approved",
  approvedBy: r.approved_by ?? undefined,
  approvedAt: r.approved_at ?? undefined,
  brand: r.brand ?? undefined,
  isOffer: r.is_offer === true,
  discountPct: r.discount_pct != null ? Number(r.discount_pct) : 0,
  offerLabel: r.offer_label ?? undefined,
} as Product & { size?: string });
const productToRow = (
  p: Partial<Product> & { size?: string }
): Partial<ProductRow> => ({
  name: p.name,
  barcode: p.barcode || null,
  category: p.category || null,
  size: p.size || null,
  supplier_id: p.supplierId || null,
  purchase_price: p.purchasePrice,
  selling_price: p.sellingPrice,
  margin_pct: p.marginPct,
  unit_type: p.unit,
  pieces_per_case: p.piecesPerCase,
  stock_pieces: p.stockPieces,
  reorder_level: p.reorderLevel,
  expiry_date: p.expiryDate || null,
  boat_fee: p.boatFee,
  other_cost: p.otherCost,
  photo_url: p.photo || null,
  // gst_applicable column not present in DB schema yet — omitted to avoid PGRST204
  ...(p.publishStatus !== undefined ? { publish_status: p.publishStatus } : {}),
  ...(p.approvedBy !== undefined ? { approved_by: p.approvedBy } : {}),
  ...(p.approvedAt !== undefined ? { approved_at: p.approvedAt } : {}),
  ...(p.brand !== undefined ? { brand: p.brand || null } : {}),
  ...(p.isOffer !== undefined ? { is_offer: p.isOffer } : {}),
  ...(p.discountPct !== undefined ? { discount_pct: p.discountPct } : {}),
  ...(p.offerLabel !== undefined ? { offer_label: p.offerLabel || null } : {}),
});

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  opening_balance: number;
  credit_limit: number;
  balance: number;
  notes: string | null;
  requested_credit_limit?: number | null;
  approval_status?: "pending" | "approved" | "rejected" | null;
  approved_by?: string | null;
  approved_at?: string | null;
  public_token?: string | null;
  last_payment_at?: string | null;
}
const rowToCustomer = (r: CustomerRow): CreditCustomer => ({
  id: r.id,
  name: r.name,
  phone: r.phone ?? "",
  address: r.address ?? "",
  openingBalance: Number(r.opening_balance),
  creditLimit: Number(r.credit_limit),
  requestedCreditLimit: r.requested_credit_limit != null ? Number(r.requested_credit_limit) : undefined,
  balance: Number(r.balance),
  notes: r.notes ?? "",
  approvalStatus: r.approval_status ?? "approved",
  approvedBy: r.approved_by ?? undefined,
  approvedAt: r.approved_at ?? undefined,
  publicToken: r.public_token ?? undefined,
  lastPaymentAt: r.last_payment_at ?? undefined,
});

/* ------------------------------- store ------------------------------ */

interface AppState {
  // auth / hydration
  currentUserId: string | null;
  hydrated: boolean;
  bootstrapping: boolean;

  // data
  users: User[];
  products: Product[];
  suppliers: Supplier[];
  sales: Sale[];
  damaged: DamagedItem[];
  orders: Order[];
  customers: CreditCustomer[];
  creditTx: CreditTransaction[];
  inventoryTx: InventoryTx[];
  batches: StockBatch[];
  logs: ActivityLog[];

  // hydration
  bootstrap: () => Promise<void>;

  // auth actions (async with Supabase)
  login: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;

  // user mgmt
  addUser: (
    u: Omit<User, "id" | "createdAt"> & { password: string }
  ) => Promise<{ ok: boolean; error?: string }>;
  updateUser: (id: string, patch: Partial<User>) => void;
  deleteUser: (id: string) => void;

  // products
  addProduct: (p: Omit<Product, "id">, opts?: { buyingPersonId?: string }) => void;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  approveProduct: (id: string) => void;
  rejectProduct: (id: string) => void;
  adjustStock: (
    productId: string,
    deltaPieces: number,
    reason: string,
    opts?: { expiryDate?: string; purchaseDate?: string; batchNo?: string; buyingPersonId?: string }
  ) => void;

  // suppliers
  addSupplier: (s: Omit<Supplier, "id">) => string;
  updateSupplier: (id: string, patch: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;

  // sales
  addSale: (
    items: SaleItem[],
    paymentMethod: Sale["paymentMethod"],
    customerId?: string,
    change?: number,
    opts?: { bankTransferName?: string; bankTransferPhone?: string }
  ) => Sale;
  /** Admin-only. Voids a sale, restores stock, reverses credit, logs the action. */
  voidSale: (id: string, reason: string) => { ok: boolean; error?: string };
  /** Admin-only. Edits a sale's payment method or customer. Logs before/after. */
  editSale: (
    id: string,
    patch: { paymentMethod?: PaymentMethod; customerId?: string },
    reason: string
  ) => { ok: boolean; error?: string };

  // damaged
  addDamaged: (d: Omit<DamagedItem, "id" | "reportedBy" | "date">) => void;

  // orders
  addOrder: (supplierId: string, items: OrderItem[], notes?: string) => Order;
  updateOrder: (id: string, patch: Partial<Order>) => void;
  receiveOrderItem: (
    orderId: string,
    productId: string,
    receivedQtyPieces: number
  ) => void;
  markOrderReceived: (orderId: string) => void;

  // customers
  addCustomer: (
    c: Omit<CreditCustomer, "id" | "balance" | "approvalStatus"> & {
      approvalStatus?: CreditCustomer["approvalStatus"];
    }
  ) => Promise<{ ok: boolean; id?: string; error?: string }>;
  updateCustomer: (id: string, patch: Partial<CreditCustomer>) => void;
  deleteCustomer: (id: string) => void;
  addCreditPayment: (customerId: string, amount: number, note?: string) => void;
  approveCustomer: (id: string, finalLimit: number) => void;
  rejectCustomer: (id: string) => void;

  // logging
  log: (action: string, detail: string) => void;

  // reset (local only)
  resetData: () => void;
}

const seedSalesData = buildSeedSales(seedProducts);

/**
 * Consume `qty` pieces from a product's stock batches in FIFO order
 * (earliest expiry first, then oldest). Updates local store immediately and
 * persists `remaining_pieces` to Supabase. Best-effort: silently no-ops if
 * the table is missing (legacy DB) or there are no batches for the product.
 */
function consumeBatchesFifo(productId: string, qty: number): void {
  if (qty <= 0) return;
  const all = useStore.getState().batches;
  const candidates = sortBatchesFifo(
    all.filter((b) => b.productId === productId && b.remainingPieces > 0)
  );
  if (candidates.length === 0) return;
  let remaining = qty;
  const updated: { id: string; remainingPieces: number }[] = [];
  for (const b of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(b.remainingPieces, remaining);
    remaining -= take;
    updated.push({ id: b.id, remainingPieces: b.remainingPieces - take });
  }
  if (updated.length === 0) return;
  // Update local state
  useStore.setState({
    batches: useStore.getState().batches.map((b) => {
      const u = updated.find((x) => x.id === b.id);
      return u ? { ...b, remainingPieces: u.remainingPieces } : b;
    }),
  });
  if (!isSupabaseConfigured) return;
  // Persist each touched batch (best-effort)
  for (const u of updated) {
    void supabase
      .from("stock_batches")
      .update({ remaining_pieces: u.remainingPieces })
      .eq("id", u.id)
      .then(({ error }) => {
        if (error) {
          const code = (error as { code?: string }).code;
          const missing =
            code === "PGRST205" ||
            /schema cache|does not exist|relation .* does not exist/i.test(
              error.message
            );
          if (!missing) logErr("batch.update", error);
        }
      });
  }
}

const initial = {
  currentUserId: null as string | null,
  hydrated: false,
  bootstrapping: false,
  users: [] as User[],
  products: seedProducts,
  suppliers: seedSuppliers,
  sales: seedSalesData,
  damaged: seedDamaged,
  orders: seedOrders,
  customers: seedCustomers,
  creditTx: seedCreditTx,
  inventoryTx: [] as InventoryTx[],
  batches: [] as StockBatch[],
  logs: [] as ActivityLog[],
};

export const useStore = create<AppState>()((set, get) => ({
  ...initial,

  /* ------------------------- bootstrap ----------------------------- */
  bootstrap: async () => {
    if (window.location.pathname.includes("/reset-password")) {
      set({
        currentUserId: null,
        hydrated: true,
        bootstrapping: false,
      });
      return;
    }
    if (!isSupabaseConfigured) {
      set({ hydrated: true });
      return;
    }
    if (get().bootstrapping) return;
    set({ bootstrapping: true });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id ?? null;

      // Load profiles (needed for both auth + Users page)
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: true });
      logErr("profiles.select", pErr);
      const users: User[] = (profiles as ProfileRow[] | null)?.map(rowToUser) ?? [];

      // If the current session belongs to a deactivated user, sign them out
      // immediately so a previously-active token can no longer reach the app.
      if (uid) {
        const me = users.find((u) => u.id === uid);
        if (me && !me.active) {
          console.warn("[bootstrap] signing out inactive user", me.email);
          try {
            await supabase.auth.signOut();
          } catch (e) {
            console.warn("[bootstrap] signOut warning", e);
          }
          set({
            users,
            currentUserId: null,
            hydrated: true,
            bootstrapping: false,
          });
          return;
        }
      }
      let resolvedUid = uid;
      if (window.location.pathname === "/reset-password") {
        set({
          users,
          currentUserId: null,
          hydrated: true,
          bootstrapping: false,
        });
        return;
      }
      if (
        uid &&
        !users.find((u) => u.id === uid)
      ) {
        console.warn("[bootstrap] deleted/inactive employee tried login");

        try {
          await supabase.auth.signOut();
        } catch (e) {
          console.warn("[bootstrap] signOut warning", e);
        }

        set({
          users,
          currentUserId: null,
          hydrated: true,
          bootstrapping: false,
        });

        return;
      }

      const [
        suppliersRes,
        productsRes,
        customersRes,
        salesRes,
        saleItemsRes,
        ordersRes,
        orderItemsRes,
        damagedRes,
        creditTxRes,
        logsRes,
        invTxRes,
        batchesRes,
      ] = await Promise.all([
        supabase.from("suppliers").select("*").order("name"),
        supabase.from("products").select("*").order("name"),
        supabase.from("customers").select("*").order("name"),
        supabase
          .from("sales")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("sale_items").select("*"),
        supabase.from("orders").select("*").order("created_at", { ascending: false }),
        supabase.from("order_items").select("*"),
        supabase
          .from("damaged_items")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("credit_transactions")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("activity_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("inventory_transactions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("stock_batches")
          .select("*")
          .order("expiry_date", { ascending: true, nullsFirst: false }),
      ]);

      const suppliers: Supplier[] =
        (suppliersRes.data as SupplierRow[] | null)?.map(rowToSupplier) ?? [];
      const products: Product[] =
        (productsRes.data as ProductRow[] | null)?.map(rowToProduct) ?? [];
      // eslint-disable-next-line no-console
      console.log(
        `[bootstrap] loaded ${products.length} products, ${products.filter((p) => p.photo).length} with photo_url`,
        products.slice(0, 5).map((p) => ({ id: p.id, name: p.name, photo: p.photo ?? null }))
      );
      const customers: CreditCustomer[] =
        (customersRes.data as CustomerRow[] | null)?.map(rowToCustomer) ?? [];

      // sales + sale_items
      interface SaleRow {
        id: string;
        invoice_no: string | null;
        customer_id: string | null;
        payment_method: Sale["paymentMethod"];
        total: number;
        profit: number;
        user_id: string | null;
        drawer_id: string | null;
        change_given: number | string | null;
        bank_transfer_name?: string | null;
        bank_transfer_phone?: string | null;
        created_at: string;
        voided?: boolean | null;
        voided_at?: string | null;
        voided_by?: string | null;
        void_reason?: string | null;
        edited_at?: string | null;
        edited_by?: string | null;
      }
      interface SaleItemRow {
        id: string;
        sale_id: string;
        product_id: string;
        qty: number;
        unit_type: SaleItem["unit"];
        unit_price: number;
        landed_cost: number;
        line_total: number;
        line_profit: number;
      }
      const saleItemsByOrder: Record<string, SaleItemRow[]> = {};
      ((saleItemsRes.data as SaleItemRow[] | null) ?? []).forEach((si) => {
        if (!saleItemsByOrder[si.sale_id]) saleItemsByOrder[si.sale_id] = [];
        saleItemsByOrder[si.sale_id].push(si);
      });
      const sales: Sale[] = ((salesRes.data as SaleRow[] | null) ?? []).map((s) => {
        const items: SaleItem[] = (saleItemsByOrder[s.id] ?? []).map((si) => {
          const product = products.find((p) => p.id === si.product_id);
          return {
            productId: si.product_id,
            name: product?.name ?? "(deleted)",
            qty: si.qty,
            unit: si.unit_type,
            unitQty: si.qty,
            price: Number(si.unit_price),
            landedCost: Number(si.landed_cost),
            total: Number(si.line_total),
            profit: Number(si.line_profit),
          };
        });
        const voidedByUser = s.voided_by
          ? users.find((u) => u.id === s.voided_by)
          : undefined;
        const editedByUser = s.edited_by
          ? users.find((u) => u.id === s.edited_by)
          : undefined;
        return {
          id: s.id,
          date: s.created_at,
          items,
          total: Number(s.total),
          profit: Number(s.profit),
          paymentMethod: s.payment_method,
          customerId: s.customer_id ?? undefined,
          cashierId: s.user_id ?? "",
          drawerId: s.drawer_id ?? undefined,
          change: Number(s.change_given ?? 0) || 0,
          bankTransferName: s.bank_transfer_name ?? undefined,
          bankTransferPhone: s.bank_transfer_phone ?? undefined,
          voided: s.voided ?? undefined,
          voidedAt: s.voided_at ?? undefined,
          voidedBy: s.voided_by ?? undefined,
          voidedByName: voidedByUser?.fullName,
          voidReason: s.void_reason ?? undefined,
          editedAt: s.edited_at ?? undefined,
          editedBy: s.edited_by ?? undefined,
          editedByName: editedByUser?.fullName,
        };
      });

      // orders + order_items
      interface OrderRow {
        id: string;
        supplier_id: string;
        status: Order["status"];
        boat_name: string | null;
        boat_contact: string | null;
        loading_date: string | null;
        sent_date: string | null;
        expected_date: string | null;
        received_date: string | null;
        notes: string | null;
        created_at: string;
      }
      interface OrderItemRow {
        id: string;
        order_id: string;
        product_id: string;
        qty: number;
        unit_type: OrderItem["unit"];
        received_qty: number;
        notes: string | null;
      }
      const orderItemsByOrder: Record<string, OrderItemRow[]> = {};
      ((orderItemsRes.data as OrderItemRow[] | null) ?? []).forEach((oi) => {
        if (!orderItemsByOrder[oi.order_id]) orderItemsByOrder[oi.order_id] = [];
        orderItemsByOrder[oi.order_id].push(oi);
      });
      const orders: Order[] = ((ordersRes.data as OrderRow[] | null) ?? []).map((o) => {
        const items: OrderItem[] = (orderItemsByOrder[o.id] ?? []).map((oi) => {
          const p = products.find((x) => x.id === oi.product_id);
          return {
            productId: oi.product_id,
            name: p?.name ?? "(deleted)",
            currentStock: p?.stockPieces ?? 0,
            qty: oi.qty,
            unit: oi.unit_type,
            unitQty: oi.qty,
            receivedQty: oi.received_qty,
            notes: oi.notes ?? undefined,
          };
        });
        return {
          id: o.id,
          supplierId: o.supplier_id,
          date: o.created_at,
          items,
          status: o.status,
          boatName: o.boat_name ?? undefined,
          boatContact: o.boat_contact ?? undefined,
          loadingDate: o.loading_date ?? undefined,
          sentDate: o.sent_date ?? undefined,
          expectedDate: o.expected_date ?? undefined,
          receivedDate: o.received_date ?? undefined,
          notes: o.notes ?? undefined,
        };
      });

      // damaged
      interface DamageRow {
        id: string;
        product_id: string;
        qty: number;
        unit_type: DamagedItem["unit"];
        reason: string | null;
        landed_cost_per_unit: number;
        loss_amount: number;
        stock_before: number | null;
        stock_after: number | null;
        user_id: string | null;
        date: string;
        notes: string | null;
        created_at: string;
      }
      const damaged: DamagedItem[] = ((damagedRes.data as DamageRow[] | null) ?? []).map(
        (d) => {
          const p = products.find((x) => x.id === d.product_id);
          const u = users.find((x) => x.id === d.user_id);
          return {
            id: d.id,
            productId: d.product_id,
            name: p?.name ?? "(deleted)",
            qty: d.qty,
            unit: d.unit_type,
            unitQty: d.qty,
            reason: d.reason ?? "",
            date: d.created_at,
            valueLoss: Number(d.loss_amount),
            reportedBy: d.user_id ?? "",
            reportedByName: u?.fullName,
            landedCostPerPiece: Number(d.landed_cost_per_unit),
            stockBefore: d.stock_before ?? undefined,
            stockAfter: d.stock_after ?? undefined,
            notes: d.notes ?? undefined,
            barcode: p?.barcode,
          };
        }
      );

      interface CreditTxRow {
        id: string;
        customer_id: string;
        type: CreditTransaction["type"];
        amount: number;
        sale_id: string | null;
        note: string | null;
        user_id: string | null;
        created_at: string;
      }
      const creditTx: CreditTransaction[] = (
        (creditTxRes.data as CreditTxRow[] | null) ?? []
      ).map((c) => {
        const u = users.find((x) => x.id === c.user_id);
        return {
          id: c.id,
          customerId: c.customer_id,
          date: c.created_at,
          type: c.type === "payment" ? "payment" : "sale",
          amount: Number(c.amount),
          saleId: c.sale_id ?? undefined,
          note: c.note ?? undefined,
          userId: c.user_id ?? undefined,
          userName: u?.fullName,
        };
      });

      interface LogRow {
        id: string;
        user_id: string | null;
        action: string;
        entity: string | null;
        meta: { detail?: string } | null;
        created_at: string;
      }
      const logs: ActivityLog[] = ((logsRes.data as LogRow[] | null) ?? []).map((l) => {
        const u = users.find((x) => x.id === l.user_id);
        return {
          id: l.id,
          date: l.created_at,
          userId: l.user_id ?? "system",
          userName: u?.fullName ?? "System",
          action: l.action,
          detail: l.meta?.detail ?? "",
        };
      });

      interface InvTxRow {
        id: string;
        product_id: string;
        type: InventoryTx["type"];
        qty: number;
        note: string | null;
        user_id: string | null;
        buying_person_id: string | null;
        created_at: string;
      }
      const inventoryTx: InventoryTx[] = (
        (invTxRes.data as InvTxRow[] | null) ?? []
      ).map((t) => {
        const bp = t.buying_person_id
          ? users.find((u) => u.id === t.buying_person_id)
          : undefined;
        return {
          id: t.id,
          productId: t.product_id,
          type: t.type,
          qty: Number(t.qty),
          note: t.note ?? undefined,
          userId: t.user_id ?? undefined,
          buyingPersonId: t.buying_person_id ?? undefined,
          buyingPersonName: bp?.fullName,
          date: t.created_at,
        };
      });

      interface BatchRow {
        id: string;
        product_id: string;
        batch_no: string | null;
        qty_pieces: number;
        remaining_pieces: number;
        purchase_date: string;
        expiry_date: string | null;
        user_id: string | null;
        buying_person_id: string | null;
        note: string | null;
        created_at: string;
      }
      const batchData = (batchesRes.data as BatchRow[] | null) ?? null;
      const batchErr = batchesRes.error as { code?: string; message?: string } | null;
      const batchMissing = !!batchErr && (batchErr.code === "PGRST205" ||
        /schema cache|does not exist|relation .* does not exist/i.test(batchErr.message ?? ""));
      if (batchErr && !batchMissing) {
        logErr("stock_batches.select", batchErr as PostgrestError);
      }
      const batches: StockBatch[] = (batchData ?? []).map((b) => {
        const bp = b.buying_person_id
          ? users.find((u) => u.id === b.buying_person_id)
          : undefined;
        return {
          id: b.id,
          productId: b.product_id,
          batchNo: b.batch_no ?? undefined,
          qtyPieces: Number(b.qty_pieces),
          remainingPieces: Number(b.remaining_pieces),
          purchaseDate: b.purchase_date,
          expiryDate: b.expiry_date ?? undefined,
          userId: b.user_id ?? undefined,
          buyingPersonId: b.buying_person_id ?? undefined,
          buyingPersonName: bp?.fullName,
          note: b.note ?? undefined,
          createdAt: b.created_at,
        };
      });

      set({
        users: users.length ? users : get().users,
        suppliers,
        products,
        customers,
        sales,
        damaged,
        orders,
        creditTx,
        inventoryTx,
        batches,
        logs,
        currentUserId: resolvedUid,
        hydrated: true,
        bootstrapping: false,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[bootstrap]", e);
      set({ bootstrapping: false, hydrated: true });
    }
  },

  /* --------------------------- auth -------------------------------- */
  login: async (email, password) => {
    if (!isSupabaseConfigured) {
      console.error("[login] Supabase is not configured. Local/demo login is disabled.");
      return {
        ok: false,
        error: "Supabase is not configured. Contact your administrator.",
      };
    }
    // 1. Clear any previous session completely before logging in.
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("[login] pre-signOut warning", e);
    }
    set({
      currentUserId: null,
      hydrated: false,
      bootstrapping: false,
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.user) {
      const msg = error?.message ?? "Login failed";
      console.error("[login] signInWithPassword failed", {
        email: email.trim(),
        message: msg,
        status: error?.status,
      });
      const lower = msg.toLowerCase();
      if (lower.includes("not confirmed") || lower.includes("confirm")) {
        return {
          ok: false,
          error:
            "Email not confirmed. Ask your admin to resend the confirmation email, or disable \"Confirm email\" in Supabase Auth settings.",
        };
      }
      if (lower.includes("invalid login")) {
        return {
          ok: false,
          error:
            "Invalid email or password. If you were just created, your email may need confirmation first.",
        };
      }
      return { ok: false, error: msg };
    }

    // 2. Re-fetch the canonical current user from Supabase.
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      await supabase.auth.signOut();
      set({ currentUserId: null });
      return { ok: false, error: userErr?.message ?? "Failed to load session" };
    }
    const authUser = userData.user;

    // 3. Re-fetch the profile by user.id. We MUST be able to read it; if RLS
    // or a missing row blocks us, fail closed instead of allowing access.
    const { data: profileRow, error: profErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", authUser.id)
      .maybeSingle();
    if (profErr) {
      console.error("[login] profile fetch error", {
        userId: authUser.id,
        message: profErr.message,
        code: profErr.code,
      });
      await supabase.auth.signOut();
      set({ currentUserId: null });
      return {
        ok: false,
        error: "Could not verify your account. Please try again.",
      };
    }
    const profile = profileRow
      ? rowToUser(profileRow as ProfileRow)
      : null;

    let fixedProfile = profile;

    if (!fixedProfile) {
      const masterEmail = "sales@oribrothers.com";
      const isMaster =
        (authUser.email || "").trim().toLowerCase() === masterEmail;

      if (!isMaster) {
        await supabase.auth.signOut();
        set({ currentUserId: null, hydrated: true });
        return {
          ok: false,
          error: "This staff account was deleted. Contact an admin.",
        };
      }

      const { data: repairedProfile, error: repairErr } = await supabase
        .from("profiles")
        .upsert(
          {
            id: authUser.id,
            email: authUser.email || masterEmail,
            full_name: "ORI Brothers Master Admin",
            role: "admin",
            active: true,
          },
          { onConflict: "id" }
        )
        .select("*")
        .single();

      if (repairErr || !repairedProfile) {
        await supabase.auth.signOut();
        set({ currentUserId: null });
        return {
          ok: false,
          error: "Could not repair master admin profile. Please try again.",
        };
      }

      fixedProfile = rowToUser(repairedProfile as ProfileRow);
    }

    if (!fixedProfile.active) {
      console.warn("[login] blocked inactive user", fixedProfile.email);
      await supabase.auth.signOut();
      set({ currentUserId: null, hydrated: true });
      return { ok: false, error: "Account is deactivated. Contact an admin." };
    }

    // 4. Update app state with the new user BEFORE bootstrapping so any
    // role-gated UI renders correctly.
    set({ currentUserId: authUser.id });

    // 5. Logging.
    console.log("[login] success", {
      email: authUser.email,
      id: authUser.id,
      role: fixedProfile?.role ?? "(no profile)",
      fullName: fixedProfile?.fullName,
    });

    // 6. Reload all data for the new user.
    await get().bootstrap();

    return { ok: true };
  },

  logout: async () => {
    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn("[logout] signOut warning", e);
      }
    }
    // Wipe per-user state so the next login starts clean.
    set({
      currentUserId: null,
      hydrated: false,
      bootstrapping: false,
      users: [],
      suppliers: [],
      products: [],
      customers: [],
      sales: [],
      damaged: [],
      orders: [],
      creditTx: [],
      inventoryTx: [],
      logs: [],
    });
    console.log("[logout] session cleared");
  },

  /* ------------------------ user mgmt ------------------------------ */
  addUser: async (u) => {
    if (!isSupabaseConfigured) {
      const newU: User = {
        ...u,
        id: localId("u"),
        createdAt: new Date().toISOString(),
      };
      set({ users: [...get().users, newU] });
      return { ok: true };
    }

    const email = u.email.trim().toLowerCase();

    // Preferred permanent deployment path: create staff/admin with the
    // Supabase Edge Function `admin-create-user`. That function uses the
    // service role key server-side and creates the user as already confirmed,
    // so staff can login immediately even when customer email confirmation is ON.
    try {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke(
        "admin-create-user",
        {
          body: {
            email,
            password: u.password,
            fullName: u.fullName,
            role: u.role,
            active: u.active,
            isPurchasingStaff: u.isPurchasingStaff === true,
          },
        }
      );

      if (!fnErr && fnData?.user?.id) {
        const newU: User = {
          id: fnData.user.id,
          username: email,
          email,
          fullName: u.fullName,
          role: u.role,
          active: u.active,
          createdAt: new Date().toISOString(),
          isPurchasingStaff: u.isPurchasingStaff === true,
        };
        set({ users: [...get().users.filter((x) => x.id !== newU.id), newU] });
        get().log("user.create", `Created confirmed user ${email} (${u.role})`);
        return { ok: true };
      }

      // If the function is not deployed yet, fall back to the old signUp flow below.
      if (fnErr) {
        console.warn("[addUser] admin-create-user function unavailable, using fallback", fnErr.message);
      }
    } catch (e) {
      console.warn("[addUser] admin-create-user function failed, using fallback", e);
    }

    // Fallback path: works only when Confirm Email is OFF in Supabase Auth.
    // For production, deploy supabase/functions/admin-create-user/index.ts.

    // Force signUp-only flow: use a secondary Supabase client so the admin's
    // session in the main client is NOT replaced by the new user's session.
    // This works as long as "Confirm email" is disabled in the Supabase
    // Auth settings (Dashboard → Authentication → Providers → Email →
    // "Confirm email" = OFF).
    const { buildAdminSignupClient } = await import("./supabase");
    const tmp = buildAdminSignupClient();

    const { data, error } = await tmp.auth.signUp({
      email,
      password: u.password,
      options: {
        data: { full_name: u.fullName, role: u.role },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    console.log("[addUser] signUp result", {
      userId: data?.user?.id,
      hasSession: !!data?.session,
      identities: data?.user?.identities?.length,
      error: error?.message,
    });

    if (error || !data?.user) {
      return {
        ok: false,
        error:
          error?.message ??
          "Failed to create user. Make sure \"Confirm email\" is disabled in Supabase Auth settings.",
      };
    }

    // Supabase returns an existing user with empty identities[] when the
    // email is already registered (instead of an error). Detect that case.
    if (data.user.identities && data.user.identities.length === 0) {
      return {
        ok: false,
        error: "A user with this email already exists.",
      };
    }

    const newId = data.user.id;
    const needsEmailConfirm = !data.session;
    if (needsEmailConfirm) {
      console.warn(
        "[addUser] Supabase returned no session — \"Confirm email\" is ON. The user must confirm via email before they can log in."
      );
    }

    // The DB trigger `handle_new_user` may auto-insert a profile row with
    // role='cashier'. Upsert with the admin's authenticated session in the
    // main client to apply the requested role / full name / active status.
    const { error: pErr } = await supabase
      .from("profiles")
      .upsert(
        {
          id: newId,
          email,
          full_name: u.fullName,
          role: u.role,
          active: u.active,
        },
        { onConflict: "id" }
      );
    logErr("profiles.upsert", pErr);
    if (pErr) {
      return { ok: false, error: pErr.message };
    }

    const newU: User = {
      id: newId,
      username: email,
      email,
      fullName: u.fullName,
      role: u.role,
      active: u.active,
      createdAt: new Date().toISOString(),
      isPurchasingStaff: u.isPurchasingStaff === true,
    };
    set({ users: [...get().users, newU] });
    get().log("user.create", `Created user ${email} (${u.role})`);
    return {
      ok: true,
      error: needsEmailConfirm
        ? "created-pending-confirmation"
        : undefined,
    };
  },

  updateUser: (uid, patch) => {
    set({
      users: get().users.map((u) => (u.id === uid ? { ...u, ...patch } : u)),
    });
    if (isSupabaseConfigured) {
      const row: Record<string, unknown> = {};
      if (patch.fullName !== undefined) row.full_name = patch.fullName;
      if (patch.role !== undefined) row.role = patch.role;
      if (patch.active !== undefined) row.active = patch.active;
      if (patch.email !== undefined) row.email = patch.email;
      if (patch.isPurchasingStaff !== undefined)
        row.is_purchasing_staff = patch.isPurchasingStaff;
      if (Object.keys(row).length > 0) {
        supabase
          .from("profiles")
          .update(row)
          .eq("id", uid)
          .then(({ error }) => {
            // Tolerate missing is_purchasing_staff column (legacy DB)
            if (
              error &&
              !/is_purchasing_staff|column .* does not exist|schema cache/i.test(
                error.message
              )
            ) {
              logErr("profiles.update", error);
            }
          });
      }
    }
    get().log("user.update", `Updated user ${uid}`);
  },

  deleteUser: (uid) => {
    const target = get().users.find((u) => u.id === uid);

    if (target?.email?.trim().toLowerCase() === "sales@oribrothers.com") {
      toast.error("Master admin cannot be deleted");
      return;
    }

    if (uid === get().currentUserId) {
      toast.error("Cannot delete yourself");
      return;
    }

    if (isSupabaseConfigured) {
      supabase
        .rpc("admin_delete_staff_profile", { target_user_id: uid })
        .then(({ error }) => {
          if (error) {
            notifyWriteError("staff.delete", error);
            return;
          }

          set({ users: get().users.filter((u) => u.id !== uid) });
          get().log(
            "user.delete",
            `Permanently deleted staff user ${target?.email ?? uid}`
          );
          toast.success("Staff user deleted permanently");
        });
    } else {
      set({ users: get().users.filter((u) => u.id !== uid) });
      get().log("user.delete", `Deleted user ${uid}`);
    }
  },
  /* ------------------------ products ------------------------------- */
  addProduct: (p, addOpts) => {
    // De-duplicate: if a product with the same barcode (non-empty) or
    // case-insensitive name already exists, treat this as "new stock added"
    // for the existing product instead of creating a duplicate.
    const nameKey = (p.name ?? "").trim().toLowerCase();
    const barcodeKey = (p.barcode ?? "").trim().toLowerCase();
    const existing = get().products.find((x) => {
      const xb = (x.barcode ?? "").trim().toLowerCase();
      const xn = (x.name ?? "").trim().toLowerCase();
      if (barcodeKey && xb && xb === barcodeKey) return true;
      if (nameKey && xn === nameKey) return true;
      return false;
    });
    if (existing) {
      const delta = Math.max(0, (p.stockPieces ?? 0) - existing.stockPieces);
      if (delta > 0) {
        get().adjustStock(existing.id, delta, "New stock added", {
          expiryDate: p.expiryDate || undefined,
          buyingPersonId: addOpts?.buyingPersonId,
        });
      }
      get().log(
        "product.merge",
        `Existing item "${existing.name}" — added ${delta} pcs (no duplicate created)`
      );
      return;
    }
    const tempId = localId("p");
    // Default new products to 'pending' for online-shop approval workflow.
    // Inventory + POS ignore publishStatus, only /store filters on it.
    const withStatus: Omit<Product, "id"> = {
      ...p,
      publishStatus: p.publishStatus ?? "pending",
    };
    const newP: Product = { ...withStatus, id: tempId };
    console.log("[product.create] publish_status=", newP.publishStatus);
    set({ products: [...get().products, newP] });
    get().log("product.create", `Added product ${newP.name}`);
    if (!isSupabaseConfigured) return;
    console.log("[products.insert] payload", productToRow(withStatus), { photo_url: p.photo ?? null });
    supabase
      .from("products")
      .insert(productToRow(withStatus))
      .select()
      .single()
      .then(({ data, error }) => {
        if (error) {
          notifyWriteError("products.insert", error);
          // Roll back optimistic product so user sees it failed
          set({ products: get().products.filter((x) => x.id !== tempId) });
          return;
        }
        if (data) {
          const real = rowToProduct(data as ProductRow);
          set({
            products: get().products.map((x) => (x.id === tempId ? real : x)),
          });
          if ((p.stockPieces ?? 0) > 0) {
            // Record the initial stock as the first "in" transaction so it
            // appears in stock history with a date.
            if (p.expiryDate) {
              // Also create the first batch with expiry tracking
              void supabase
                .from("stock_batches")
                .insert({
                  product_id: real.id,
                  qty_pieces: p.stockPieces,
                  remaining_pieces: p.stockPieces,
                  purchase_date: new Date().toISOString().slice(0, 10),
                  expiry_date: p.expiryDate,
                  user_id: get().currentUserId,
                  buying_person_id: addOpts?.buyingPersonId ?? null,
                  note: "Initial stock",
                })
                .select()
                .single()
                .then(({ data, error }) => {
                  if (error) {
                    const code = (error as { code?: string }).code;
                    const missing =
                      code === "PGRST205" ||
                      /schema cache|does not exist|relation .* does not exist/i.test(
                        error.message
                      );
                    if (!missing) logErr("batch.insert.initial", error);
                    return;
                  }
                  if (data) {
                    const r = data as {
                      id: string;
                      created_at: string;
                      purchase_date: string;
                    };
                    set({
                      batches: [
                        {
                          id: r.id,
                          productId: real.id,
                          qtyPieces: p.stockPieces,
                          remainingPieces: p.stockPieces,
                          purchaseDate: r.purchase_date,
                          expiryDate: p.expiryDate,
                          userId: get().currentUserId ?? undefined,
                          note: "Initial stock",
                          createdAt: r.created_at,
                        },
                        ...get().batches,
                      ],
                    });
                  }
                });
            }
            void supabase
              .from("inventory_transactions")
              .insert({
                product_id: real.id,
                type: "in",
                qty: p.stockPieces,
                note: "Initial stock",
                user_id: get().currentUserId,
                buying_person_id: addOpts?.buyingPersonId ?? null,
              })
              .select()
              .single()
              .then(({ data: tx }) => {
                if (tx) {
                  const t = tx as { id: string; created_at: string };
                  set({
                    inventoryTx: [
                      {
                        id: t.id,
                        productId: real.id,
                        type: "in",
                        qty: p.stockPieces,
                        note: "Initial stock",
                        userId: get().currentUserId ?? undefined,
                        date: t.created_at,
                      },
                      ...get().inventoryTx,
                    ],
                  });
                }
              });
          }
        }
      });
  },
  updateProduct: (pid, patch) => {
    set({
      products: get().products.map((p) =>
        p.id === pid ? { ...p, ...patch } : p
      ),
    });
    get().log("product.update", `Updated product ${pid}`);
    if (!isSupabaseConfigured) return;
    console.log("[products.update] patch", { id: pid, ...productToRow(patch) }, { photo_url: patch.photo ?? null });
    supabase
      .from("products")
      .update(productToRow(patch))
      .eq("id", pid)
      .then(({ error }) => {
        if (error) notifyWriteError("products.update", error);
      });
  },
  deleteProduct: (pid) => {
    set({ products: get().products.filter((p) => p.id !== pid) });
    get().log("product.delete", `Deleted product ${pid}`);
    if (!isSupabaseConfigured) return;
    supabase
      .from("products")
      .delete()
      .eq("id", pid)
      .then(({ error }) => logErr("products.delete", error));
  },
  approveProduct: (pid) => {
    const uid = get().currentUserId ?? undefined;
    const nowIso = new Date().toISOString();
    set({
      products: get().products.map((p) =>
        p.id === pid
          ? { ...p, publishStatus: "approved", approvedBy: uid, approvedAt: nowIso }
          : p
      ),
    });
    get().log("product.approve", `Approved product ${pid} for online shop`);
    if (!isSupabaseConfigured) return;
    supabase
      .from("products")
      .update({
        publish_status: "approved",
        approved_by: uid ?? null,
        approved_at: nowIso,
      })
      .eq("id", pid)
      .then(({ error }) => {
        if (error) notifyWriteError("products.approve", error);
      });
  },
  rejectProduct: (pid) => {
    const uid = get().currentUserId ?? undefined;
    const nowIso = new Date().toISOString();
    set({
      products: get().products.map((p) =>
        p.id === pid
          ? { ...p, publishStatus: "rejected", approvedBy: uid, approvedAt: nowIso }
          : p
      ),
    });
    get().log("product.reject", `Rejected product ${pid} for online shop`);
    if (!isSupabaseConfigured) return;
    supabase
      .from("products")
      .update({
        publish_status: "rejected",
        approved_by: uid ?? null,
        approved_at: nowIso,
      })
      .eq("id", pid)
      .then(({ error }) => {
        if (error) notifyWriteError("products.reject", error);
      });
  },
  adjustStock: (pid, delta, reason, opts) => {
    const product = get().products.find((p) => p.id === pid);
    if (!product) return;
    const newStock = Math.max(0, product.stockPieces + delta);
    const tempTxId = localId("itx");
    const nowIso = new Date().toISOString();
    const optimisticTx: InventoryTx = {
      id: tempTxId,
      productId: pid,
      type: delta >= 0 ? "in" : "out",
      qty: Math.abs(delta),
      note: reason,
      userId: get().currentUserId ?? undefined,
      date: nowIso,
    };
    set({
      products: get().products.map((p) =>
        p.id === pid ? { ...p, stockPieces: newStock } : p
      ),
      inventoryTx: [optimisticTx, ...get().inventoryTx],
    });
    get().log("stock.adjust", `Adjusted ${pid} by ${delta} pcs (${reason})`);
    if (!isSupabaseConfigured) return;
    supabase
      .from("products")
      .update({ stock_pieces: newStock })
      .eq("id", pid)
      .then(({ error }) => {
        if (error) notifyWriteError("products.adjustStock", error);
      });
    const buyingPersonName = opts?.buyingPersonId
      ? get().users.find((u) => u.id === opts.buyingPersonId)?.fullName
      : undefined;
    if (opts?.buyingPersonId) {
      optimisticTx.buyingPersonId = opts.buyingPersonId;
      optimisticTx.buyingPersonName = buyingPersonName;
    }
    supabase
      .from("inventory_transactions")
      .insert({
        product_id: pid,
        type: delta >= 0 ? "in" : "out",
        qty: Math.abs(delta),
        note: reason,
        user_id: get().currentUserId,
        buying_person_id: opts?.buyingPersonId ?? null,
      })
      .select()
      .single()
      .then(({ data, error }) => {
        if (error) notifyWriteError("inventory_transactions.insert", error);
        if (data) {
          const t = data as { id: string; created_at: string };
          set({
            inventoryTx: get().inventoryTx.map((x) =>
              x.id === tempTxId
                ? { ...x, id: t.id, date: t.created_at }
                : x
            ),
          });
        }
      });

    // Stock IN with batch info (expiry/purchase date) → create stock_batches row
    if (delta > 0 && (opts?.expiryDate || opts?.purchaseDate || opts?.batchNo || opts?.buyingPersonId)) {
      const tempBatchId = localId("b");
      const purchaseDate = opts?.purchaseDate || nowIso.slice(0, 10);
      const optimistic: StockBatch = {
        id: tempBatchId,
        productId: pid,
        batchNo: opts?.batchNo,
        qtyPieces: delta,
        remainingPieces: delta,
        purchaseDate,
        expiryDate: opts?.expiryDate,
        userId: get().currentUserId ?? undefined,
        buyingPersonId: opts?.buyingPersonId,
        buyingPersonName: buyingPersonName,
        note: reason,
        createdAt: nowIso,
      };
      set({ batches: [optimistic, ...get().batches] });
      void supabase
        .from("stock_batches")
        .insert({
          product_id: pid,
          batch_no: opts?.batchNo ?? null,
          qty_pieces: delta,
          remaining_pieces: delta,
          purchase_date: purchaseDate,
          expiry_date: opts?.expiryDate ?? null,
          user_id: get().currentUserId,
          buying_person_id: opts?.buyingPersonId ?? null,
          note: reason || null,
        })
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) {
            // table missing → silently ignore (legacy DB)
            const code = (error as { code?: string }).code;
            const missing = code === "PGRST205" ||
              /schema cache|does not exist|relation .* does not exist/i.test(error.message);
            if (!missing) logErr("batch.insert", error);
            return;
          }
          if (data) {
            const r = data as { id: string; created_at: string };
            set({
              batches: get().batches.map((x) =>
                x.id === tempBatchId ? { ...x, id: r.id, createdAt: r.created_at } : x
              ),
            });
          }
        });
    }

    // Stock OUT (manual, e.g. adjustment) → consume FIFO batches if any
    if (delta < 0) {
      consumeBatchesFifo(pid, Math.abs(delta));
    }
  },

  /* ------------------------ suppliers ------------------------------ */
  addSupplier: (s) => {
    const tempId = localId("s");
    const ns: Supplier = { ...s, id: tempId };
    set({ suppliers: [...get().suppliers, ns] });
    get().log("supplier.create", `Added supplier ${ns.name}`);
    if (!isSupabaseConfigured) return tempId;
    supabase
      .from("suppliers")
      .insert(supplierToRow(s))
      .select()
      .single()
      .then(({ data, error }) => {
        logErr("suppliers.insert", error);
        if (data) {
          const real = rowToSupplier(data as SupplierRow);
          set({
            suppliers: get().suppliers.map((x) => (x.id === tempId ? real : x)),
          });
        }
      });
    return tempId;
  },
  updateSupplier: (sid, patch) => {
    set({
      suppliers: get().suppliers.map((s) =>
        s.id === sid ? { ...s, ...patch } : s
      ),
    });
    if (!isSupabaseConfigured) return;
    supabase
      .from("suppliers")
      .update(supplierToRow(patch))
      .eq("id", sid)
      .then(({ error }) => logErr("suppliers.update", error));
  },
  deleteSupplier: (sid) => {
    set({ suppliers: get().suppliers.filter((s) => s.id !== sid) });
    if (!isSupabaseConfigured) return;
    supabase
      .from("suppliers")
      .delete()
      .eq("id", sid)
      .then(({ error }) => logErr("suppliers.delete", error));
  },

  /* ------------------------ sales ---------------------------------- */
  addSale: (items, paymentMethod, customerId, change, opts) => {
    const total = items.reduce((s, x) => s + x.total, 0);
    const profit = items.reduce((s, x) => s + x.profit, 0);
    const localSaleId = localId("sl");
    const cashierId = get().currentUserId ?? "";
    // Link the sale to the cashier's currently-open cash drawer so reports
    // and Expected Drawer Cash always tie back to the correct shift.
    let drawerId: string | undefined;
    try {
      // Lazy require to avoid a circular dep between store and cashDrawer.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useCashDrawers } = require("./cashDrawer") as typeof import("./cashDrawer");
      // Shop-wide: link the sale to the single open drawer regardless of opener.
      const active = useCashDrawers.getState().currentOpenDrawer();
      drawerId = active?.id;
      void cashierId;
    } catch {
      drawerId = undefined;
    }
    const sale: Sale = {
      id: localSaleId,
      date: new Date().toISOString(),
      items,
      total,
      profit,
      paymentMethod,
      customerId,
      cashierId,
      drawerId,
      change: paymentMethod === "cash" && change && change > 0 ? +change.toFixed(2) : 0,
      bankTransferName:
        paymentMethod === "bank" ? opts?.bankTransferName?.trim() || undefined : undefined,
      bankTransferPhone:
        paymentMethod === "bank" ? opts?.bankTransferPhone?.trim() || undefined : undefined,
    };
    // Strict POS stock deduction.
    // Inventory is stored internally as TOTAL PIECES.
    // Case sales are already converted by Sales.tsx:
    // case qty × piecesPerCase = SaleItem.qty.
    const soldPiecesByProduct = new Map<string, number>();
    for (const it of items) {
      soldPiecesByProduct.set(
        it.productId,
        (soldPiecesByProduct.get(it.productId) ?? 0) + it.qty
      );
    }

    const stockAfterByProduct = new Map<string, number>();
    for (const [productId, soldPieces] of soldPiecesByProduct.entries()) {
      const p = get().products.find((x) => x.id === productId);
      if (!p) {
        throw new Error("Product not found in inventory");
      }
      if (p.stockPieces <= 0) {
        throw new Error(`${p.name} is out of stock`);
      }
      if (p.stockPieces < soldPieces) {
        throw new Error(
          `${p.name} has only ${p.stockPieces} pcs available. Requested ${soldPieces} pcs.`
        );
      }
      stockAfterByProduct.set(productId, p.stockPieces - soldPieces);
    }

    const products = get().products.map((p) => {
      const nextStock = stockAfterByProduct.get(p.id);
      return nextStock === undefined ? p : { ...p, stockPieces: nextStock };
    });

    let creditTx = get().creditTx;
    let customers = get().customers;
    if (paymentMethod === "credit" && customerId) {
      customers = customers.map((c) =>
        c.id === customerId ? { ...c, balance: c.balance + total } : c
      );
      const meNow = get().users.find((u) => u.id === get().currentUserId);
      creditTx = [
        ...creditTx,
        {
          id: localId("ct"),
          customerId,
          date: sale.date,
          type: "sale",
          amount: total,
          saleId: sale.id,
          userId: meNow?.id,
          userName: meNow?.fullName,
        },
      ];
    }
    set({
      sales: [sale, ...get().sales],
      products,
      customers,
      creditTx,
    });
    // FIFO-consume batches for each item (oldest expiry first)
    for (const it of items) {
      consumeBatchesFifo(it.productId, it.qty);
    }
    get().log(
      "sale.create",
      `Sale ${sale.id} total ${total.toFixed(2)} (${paymentMethod}${paymentMethod === "bank" && sale.bankTransferName ? ` · ${sale.bankTransferName}` : ""})`
    );

    if (isSupabaseConfigured) {
      void (async () => {
        const { data: saleRow, error: saleErr } = await supabase
          .from("sales")
          .insert({
            customer_id: customerId ?? null,
            payment_method: paymentMethod,
            total,
            profit,
            user_id: get().currentUserId,
            drawer_id: drawerId ?? null,
            change_given: sale.change ?? 0,
            bank_transfer_name: sale.bankTransferName ?? null,
            bank_transfer_phone: sale.bankTransferPhone ?? null,
          })
          .select()
          .single();
        logErr("sales.insert", saleErr);
        if (!saleRow) return;
        const realId = (saleRow as { id: string }).id;
        const itemsRows = items.map((it) => ({
          sale_id: realId,
          product_id: it.productId,
          qty: it.qty,
          unit_type: it.unit,
          unit_price: it.price,
          landed_cost: it.landedCost,
          line_total: it.total,
          line_profit: it.profit,
        }));
        const { error: siErr } = await supabase.from("sale_items").insert(itemsRows);
        logErr("sale_items.insert", siErr);
        // Persist exact POS stock balance to Supabase.
        // This writes the same balance already applied locally, so POS and
        // Inventory stay matched after refresh.
        for (const [productId, nextStock] of stockAfterByProduct.entries()) {
          const { error: stockErr } = await supabase
            .from("products")
            .update({ stock_pieces: nextStock })
            .eq("id", productId);

          if (stockErr) {
            notifyWriteError("products.stock_after_pos_sale", stockErr);
            console.error("[POS INVENTORY UPDATE FAILED]", {
              productId,
              nextStock,
              error: stockErr.message,
            });
          }
        }
        if (paymentMethod === "credit" && customerId) {
          const c = get().customers.find((x) => x.id === customerId);
          if (c) {
            await supabase
              .from("customers")
              .update({ balance: c.balance })
              .eq("id", customerId);
            await supabase.from("credit_transactions").insert({
              customer_id: customerId,
              type: "sale",
              amount: total,
              sale_id: realId,
              user_id: get().currentUserId,
            });
          }
        }
        // Mirror consignment products into consignment_sales so the
        // settlement ledger / owner payouts stay in sync regardless of
        // whether the sale was rung up from POS or from the Consignment
        // page. FIFO across multiple intakes for the same product.
        try {
          const { useConsignment } = await import("./consignment");
          const cState = useConsignment.getState();
          for (const it of items) {
            const candidates = cState.items
              .filter(
                (ci) =>
                  ci.inventoryProductId === it.productId &&
                  ci.active &&
                  ci.qtyReceived - ci.qtySold - ci.qtyReturned > 0
              )
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            if (candidates.length === 0) continue;
            let remaining = it.qty;
            for (const ci of candidates) {
              if (remaining <= 0) break;
              const balance = ci.qtyReceived - ci.qtySold - ci.qtyReturned;
              const take = Math.min(balance, remaining);
              if (take <= 0) continue;
              remaining -= take;
              const price = it.price;
              const ttl = take * price;
              const ownerPayout = ci.ownerPayout;
              const payable = take * ownerPayout;
              const commission =
                ci.commissionPct > 0
                  ? ttl * (ci.commissionPct / 100)
                  : Math.max(0, ttl - payable);
              const { error: csErr } = await supabase
                .from("consignment_sales")
                .insert({
                  item_id: ci.id,
                  owner_id: ci.ownerId,
                  qty: take,
                  unit_price: price,
                  owner_payout: ownerPayout,
                  total_amount: ttl,
                  payable_amount: payable,
                  commission,
                  customer_id: customerId ?? null,
                  user_id: get().currentUserId,
                  sale_id: realId,
                  notes: "Auto from POS sale",
                });
              if (csErr) {
                logErr("consignment_sales.auto.insert", csErr);
                continue;
              }
              const newSold = ci.qtySold + take;
              await supabase
                .from("consignment_items")
                .update({ qty_sold: newSold })
                .eq("id", ci.id);
              useConsignment.setState({
                items: useConsignment
                  .getState()
                  .items.map((x) =>
                    x.id === ci.id ? { ...x, qtySold: newSold } : x
                  ),
              });
            }
          }
          // Refresh consignment sales list so the Consignment tab shows them.
          void cState.load();
        } catch (e) {
          // Non-fatal — the regular sale already succeeded.
          // eslint-disable-next-line no-console
          console.warn("[addSale] consignment mirror skipped", e);
        }
        // swap local id for real id
        set({
          sales: get().sales.map((s) =>
            s.id === localSaleId ? { ...s, id: realId } : s
          ),
        });
      })();
    }
    return sale;
  },

  voidSale: (id, reason) => {
    const me = get().users.find((u) => u.id === get().currentUserId);
    if (!me || me.role !== "admin") {
      return { ok: false, error: "Only admin can void a sale" };
    }
    const sale = get().sales.find((s) => s.id === id);
    if (!sale) return { ok: false, error: "Sale not found" };
    if (sale.voided) return { ok: false, error: "Sale already voided" };
    const now = new Date().toISOString();
    // Reverse cash drawer change-given accumulator if the voided sale was cash
    // and the cashier's drawer is still open. Closed drawers are already
    // snapshotted so we leave them untouched.
    if (sale.paymentMethod === "cash" && (sale.change ?? 0) > 0 && sale.cashierId) {
      try {
        // Lazy import to avoid a circular dep between store and cashDrawer.
        import("./cashDrawer").then(({ useCashDrawers }) => {
          useCashDrawers.getState().reverseChangeGiven(
            sale.cashierId,
            sale.change ?? 0
          );
        });
      } catch {
        // non-fatal
      }
    }
    // Restore stock
    const products = get().products.map((p) => {
      const it = sale.items.find((x) => x.productId === p.id);
      if (!it) return p;
      return { ...p, stockPieces: p.stockPieces + it.qty };
    });
    // Reverse credit if needed
    let customers = get().customers;
    let creditTx = get().creditTx;
    if (sale.paymentMethod === "credit" && sale.customerId) {
      customers = customers.map((c) =>
        c.id === sale.customerId
          ? { ...c, balance: Math.max(0, c.balance - sale.total) }
          : c
      );
      creditTx = [
        ...creditTx,
        {
          id: localId("ct"),
          customerId: sale.customerId,
          date: now,
          type: "payment",
          amount: sale.total,
          saleId: sale.id,
          note: `Sale voided: ${reason}`,
        },
      ];
    }
    set({
      sales: get().sales.map((s) =>
        s.id === id
          ? {
            ...s,
            voided: true,
            voidedAt: now,
            voidedBy: me.id,
            voidedByName: me.fullName,
            voidReason: reason,
          }
          : s
      ),
      products,
      customers,
      creditTx,
    });
    get().log(
      "sale.void",
      `Voided sale #${id.slice(-8).toUpperCase()} — total ${sale.total.toFixed(2)} — reason: ${reason}`
    );
    if (isSupabaseConfigured) {
      // Persist void metadata on the sale itself (best-effort: columns may
      // not exist on every deployment, so we ignore PGRST204-style errors).
      void supabase
        .from("sales")
        .update({
          voided: true,
          voided_at: now,
          voided_by: me.id,
          void_reason: reason,
        })
        .eq("id", id)
        .then(({ error }) => {
          if (error && !/column .* does not exist|schema cache/i.test(error.message)) {
            logErr("sales.void", error);
          }
        });
      // Restore stock in DB
      void (async () => {
        for (const it of sale.items) {
          const p = get().products.find((pp) => pp.id === it.productId);
          if (!p) continue;
          await supabase
            .from("products")
            .update({ stock_pieces: p.stockPieces })
            .eq("id", it.productId);
        }
        if (sale.paymentMethod === "credit" && sale.customerId) {
          const c = get().customers.find((x) => x.id === sale.customerId);
          if (c) {
            await supabase
              .from("customers")
              .update({ balance: c.balance })
              .eq("id", sale.customerId);
            await supabase.from("credit_transactions").insert({
              customer_id: sale.customerId,
              type: "payment",
              amount: sale.total,
              sale_id: sale.id,
              note: `Sale voided: ${reason}`,
              user_id: me.id,
            });
          }
        }
        // Reverse consignment side so payable/qty_sold do not double-count.
        try {
          const { useConsignment } = await import("./consignment");
          const { data: csRows, error: csSelErr } = await supabase
            .from("consignment_sales")
            .select("id,item_id,qty")
            .eq("sale_id", sale.id);
          if (csSelErr) {
            logErr("consignment_sales.void.select", csSelErr);
          } else if (csRows && csRows.length > 0) {
            // Decrement qty_sold on each linked consignment_item, then delete
            // the consignment_sales rows so payable totals reverse cleanly.
            const byItem = new Map<string, number>();
            for (const r of csRows as { id: string; item_id: string; qty: number }[]) {
              byItem.set(r.item_id, (byItem.get(r.item_id) ?? 0) + Number(r.qty));
            }
            for (const [itemId, qtyBack] of byItem.entries()) {
              const ci = useConsignment.getState().items.find((x) => x.id === itemId);
              if (!ci) continue;
              const newSold = Math.max(0, ci.qtySold - qtyBack);
              const { error: upErr } = await supabase
                .from("consignment_items")
                .update({ qty_sold: newSold })
                .eq("id", itemId);
              if (upErr) logErr("consignment_items.void.update", upErr);
            }
            const { error: delErr } = await supabase
              .from("consignment_sales")
              .delete()
              .eq("sale_id", sale.id);
            if (delErr) logErr("consignment_sales.void.delete", delErr);
            void useConsignment.getState().load();
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("[voidSale] consignment reversal skipped", e);
        }
      })();
    }
    return { ok: true };
  },

  editSale: (id, patch, reason) => {
    const me = get().users.find((u) => u.id === get().currentUserId);
    if (!me || me.role !== "admin") {
      return { ok: false, error: "Only admin can edit a sale" };
    }
    const sale = get().sales.find((s) => s.id === id);
    if (!sale) return { ok: false, error: "Sale not found" };
    if (sale.voided) return { ok: false, error: "Cannot edit a voided sale" };
    const before: string[] = [];
    const after: string[] = [];
    if (
      patch.paymentMethod !== undefined &&
      patch.paymentMethod !== sale.paymentMethod
    ) {
      before.push(`payment=${sale.paymentMethod}`);
      after.push(`payment=${patch.paymentMethod}`);
    }
    if (
      patch.customerId !== undefined &&
      patch.customerId !== (sale.customerId ?? "")
    ) {
      before.push(`customer=${sale.customerId ?? "-"}`);
      after.push(`customer=${patch.customerId || "-"}`);
    }
    if (before.length === 0) return { ok: false, error: "No changes" };
    const now = new Date().toISOString();
    set({
      sales: get().sales.map((s) =>
        s.id === id
          ? {
            ...s,
            paymentMethod: patch.paymentMethod ?? s.paymentMethod,
            customerId:
              patch.customerId !== undefined
                ? patch.customerId || undefined
                : s.customerId,
            editedAt: now,
            editedBy: me.id,
            editedByName: me.fullName,
          }
          : s
      ),
    });
    get().log(
      "sale.edit",
      `Edited sale #${id.slice(-8).toUpperCase()} — ${before.join(", ")} → ${after.join(", ")} — reason: ${reason}`
    );
    if (isSupabaseConfigured) {
      const row: Record<string, unknown> = {};
      if (patch.paymentMethod !== undefined) row.payment_method = patch.paymentMethod;
      if (patch.customerId !== undefined) row.customer_id = patch.customerId || null;
      // Best-effort audit metadata; ignore if columns are not deployed.
      row.edited_at = now;
      row.edited_by = me.id;
      if (Object.keys(row).length > 0) {
        supabase
          .from("sales")
          .update(row)
          .eq("id", id)
          .then(({ error }) => {
            if (
              error &&
              !/column .* does not exist|schema cache/i.test(error.message)
            ) {
              logErr("sales.edit", error);
            }
          });
      }
    }
    return { ok: true };
  },

  /* ------------------------ damaged -------------------------------- */
  addDamaged: (d) => {
    const product = get().products.find((p) => p.id === d.productId);
    const stockBefore = product?.stockPieces ?? 0;
    const stockAfter = Math.max(0, stockBefore - d.qty);
    const lcpp = product ? landedCostPerPiece(product) : 0;
    const valueLoss = d.qty * lcpp;
    const userId = get().currentUserId ?? "";
    const userName =
      get().users.find((u) => u.id === userId)?.fullName ?? "System";
    const tempId = localId("d");
    const damaged: DamagedItem = {
      ...d,
      valueLoss,
      id: tempId,
      reportedBy: userId,
      reportedByName: userName,
      landedCostPerPiece: lcpp,
      stockBefore,
      stockAfter,
      barcode: product?.barcode,
      date: new Date().toISOString(),
    };
    set({
      damaged: [damaged, ...get().damaged],
      products: get().products.map((p) =>
        p.id === d.productId ? { ...p, stockPieces: stockAfter } : p
      ),
    });
    consumeBatchesFifo(d.productId, d.qty);
    get().log(
      "damage.create",
      `Reported ${d.qty} pcs damaged of ${d.name} \u2014 loss ${valueLoss.toFixed(2)}`
    );
    if (!isSupabaseConfigured) return;
    void (async () => {
      const { data, error } = await supabase
        .from("damaged_items")
        .insert({
          product_id: d.productId,
          qty: d.qty,
          unit_type: d.unit,
          reason: d.reason,
          landed_cost_per_unit: lcpp,
          loss_amount: valueLoss,
          stock_before: stockBefore,
          stock_after: stockAfter,
          user_id: userId || null,
          notes: d.notes ?? null,
        })
        .select()
        .single();
      logErr("damaged.insert", error);
      if (data) {
        const realId = (data as { id: string }).id;
        set({
          damaged: get().damaged.map((x) =>
            x.id === tempId ? { ...x, id: realId } : x
          ),
        });
      }
      await supabase
        .from("products")
        .update({ stock_pieces: stockAfter })
        .eq("id", d.productId);
    })();
  },

  /* ------------------------ orders --------------------------------- */
  addOrder: (supplierId, items, notes) => {
    const tempId = localId("o");
    const order: Order = {
      id: tempId,
      supplierId,
      date: new Date().toISOString(),
      items,
      status: "pending",
      notes,
    };
    set({ orders: [order, ...get().orders] });
    get().log("order.create", `Created order ${order.id}`);
    if (isSupabaseConfigured) {
      void (async () => {
        const { data, error } = await supabase
          .from("orders")
          .insert({ supplier_id: supplierId, notes: notes ?? null })
          .select()
          .single();
        logErr("orders.insert", error);
        if (!data) return;
        const realId = (data as { id: string }).id;
        const itemsRows = items.map((it) => ({
          order_id: realId,
          product_id: it.productId,
          qty: it.qty,
          unit_type: it.unit,
          received_qty: it.receivedQty,
          notes: it.notes ?? null,
        }));
        const { error: oiErr } = await supabase.from("order_items").insert(itemsRows);
        logErr("order_items.insert", oiErr);
        set({
          orders: get().orders.map((o) =>
            o.id === tempId ? { ...o, id: realId } : o
          ),
        });
      })();
    }
    return order;
  },
  updateOrder: (oid, patch) => {
    set({
      orders: get().orders.map((o) => (o.id === oid ? { ...o, ...patch } : o)),
    });
    if (!isSupabaseConfigured) return;
    const row: Record<string, unknown> = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.boatName !== undefined) row.boat_name = patch.boatName;
    if (patch.boatContact !== undefined) row.boat_contact = patch.boatContact;
    if (patch.loadingDate !== undefined) row.loading_date = patch.loadingDate;
    if (patch.sentDate !== undefined) row.sent_date = patch.sentDate;
    if (patch.expectedDate !== undefined) row.expected_date = patch.expectedDate;
    if (patch.receivedDate !== undefined) row.received_date = patch.receivedDate;
    if (patch.notes !== undefined) row.notes = patch.notes;
    if (Object.keys(row).length > 0) {
      supabase
        .from("orders")
        .update(row)
        .eq("id", oid)
        .then(({ error }) => logErr("orders.update", error));
    }
  },
  receiveOrderItem: (oid, pid, receivedQty) => {
    const order = get().orders.find((o) => o.id === oid);
    if (!order) return;
    const item = order.items.find((i) => i.productId === pid);
    if (!item) return;
    const delta = receivedQty - item.receivedQty;
    set({
      orders: get().orders.map((o) =>
        o.id === oid
          ? {
            ...o,
            items: o.items.map((i) =>
              i.productId === pid ? { ...i, receivedQty } : i
            ),
          }
          : o
      ),
      products: get().products.map((p) =>
        p.id === pid
          ? { ...p, stockPieces: Math.max(0, p.stockPieces + delta) }
          : p
      ),
    });
    get().log(
      "order.receive",
      `Received ${receivedQty} pcs of ${pid} on order ${oid}`
    );
    if (!isSupabaseConfigured) return;
    supabase
      .from("order_items")
      .update({ received_qty: receivedQty })
      .eq("order_id", oid)
      .eq("product_id", pid)
      .then(({ error }) => logErr("order_items.update", error));
    const newStock = get().products.find((p) => p.id === pid)?.stockPieces ?? 0;
    supabase
      .from("products")
      .update({ stock_pieces: newStock })
      .eq("id", pid)
      .then(({ error }) => logErr("products.stock", error));
  },
  markOrderReceived: (oid) => {
    const order = get().orders.find((o) => o.id === oid);
    if (!order) return;
    order.items.forEach((it) => {
      if (it.receivedQty < it.qty) {
        get().receiveOrderItem(oid, it.productId, it.qty);
      }
    });
    get().updateOrder(oid, {
      status: "received",
      receivedDate: new Date().toISOString(),
    });
  },

  /* ------------------------ customers ------------------------------ */
  addCustomer: async (c) => {
    const tempId = localId("c");
    const status: CreditApprovalStatus = c.approvalStatus ?? "pending";
    const isApproved = status === "approved";
    const me = get().users.find((u) => u.id === get().currentUserId);
    const nc: CreditCustomer = {
      name: c.name,
      phone: c.phone,
      address: c.address,
      notes: c.notes,
      openingBalance: c.openingBalance,
      requestedCreditLimit: c.requestedCreditLimit ?? c.creditLimit,
      creditLimit: isApproved ? c.creditLimit : 0,
      id: tempId,
      balance: c.openingBalance,
      approvalStatus: status,
      approvedBy: isApproved ? me?.id : undefined,
      approvedByName: isApproved ? me?.fullName : undefined,
      approvedAt: isApproved ? new Date().toISOString() : undefined,
    };
    // Generate a public token client-side as a fallback. The server will
    // overwrite it with its own gen_random_uuid() default if available.
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      nc.publicToken = crypto.randomUUID();
    }
    set({ customers: [...get().customers, nc] });
    if (c.openingBalance > 0) {
      set({
        creditTx: [
          ...get().creditTx,
          {
            id: localId("ct"),
            customerId: nc.id,
            date: new Date().toISOString(),
            type: "sale",
            amount: c.openingBalance,
            note: "Opening balance",
          },
        ],
      });
    }
    get().log(
      "customer.create",
      `Added customer ${nc.name} (status: ${status})`
    );
    if (!isSupabaseConfigured) {
      // eslint-disable-next-line no-console
      console.warn("[customers.insert] Supabase not configured — saved to local state only");
      return { ok: true, id: tempId };
    }
    const insertPayload: Record<string, unknown> = {
      name: c.name,
      phone: c.phone || null,
      address: c.address || null,
      opening_balance: c.openingBalance,
      credit_limit: nc.creditLimit,
      requested_credit_limit: nc.requestedCreditLimit ?? 0,
      balance: c.openingBalance,
      notes: c.notes || null,
      approval_status: status,
      approved_by: nc.approvedBy ?? null,
      approved_at: nc.approvedAt ?? null,
    };
    if (nc.publicToken) insertPayload.public_token = nc.publicToken;
    // eslint-disable-next-line no-console
    console.log("[customers.insert] INSERT PAYLOAD:", insertPayload);
    let { data, error } = await supabase
      .from("customers")
      .insert(insertPayload)
      .select()
      .single();
    // Retry without optional columns if migration not yet applied.
    if (error && /public_token|column .* does not exist|schema cache/i.test(error.message)) {
      // eslint-disable-next-line no-console
      console.warn("[customers.insert] retrying without public_token:", error.message);
      delete insertPayload.public_token;
      const retry = await supabase
        .from("customers")
        .insert(insertPayload)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[customers.insert] INSERT ERROR:", error);
      logErr("customers.insert", error);
      // roll back optimistic local row so the list reflects DB truth
      set({ customers: get().customers.filter((x) => x.id !== tempId) });
      return { ok: false, error: error.message || "Insert failed" };
    }
    // eslint-disable-next-line no-console
    console.log("[customers.insert] INSERT RESULT:", data);
    if (!data) {
      set({ customers: get().customers.filter((x) => x.id !== tempId) });
      return { ok: false, error: "No row returned from insert" };
    }
    const row = data as CustomerRow;
    const realId = row.id;
    // Refresh by replacing temp row with the canonical DB row
    set({
      customers: get().customers.map((x) =>
        x.id === tempId ? rowToCustomer(row) : x
      ),
    });
    if (c.openingBalance > 0) {
      const { error: txErr } = await supabase.from("credit_transactions").insert({
        customer_id: realId,
        type: "sale",
        amount: c.openingBalance,
        note: "Opening balance",
        user_id: get().currentUserId,
      });
      logErr("credit_transactions.insert", txErr);
    }
    // Pull authoritative list from Supabase to keep UI in sync.
    void (async () => {
      const { data: rows, error: listErr } = await supabase
        .from("customers")
        .select("*")
        .order("name");
      if (listErr) {
        logErr("customers.refresh", listErr);
        return;
      }
      if (rows) {
        set({ customers: (rows as CustomerRow[]).map(rowToCustomer) });
      }
    })();
    return { ok: true, id: realId };
  },

  approveCustomer: (cid, finalLimit) => {
    const me = get().users.find((u) => u.id === get().currentUserId);
    const approvedAt = new Date().toISOString();
    const before = get().customers.find((c) => c.id === cid);
    set({
      customers: get().customers.map((c) =>
        c.id === cid
          ? {
            ...c,
            approvalStatus: "approved",
            creditLimit: finalLimit,
            approvedBy: me?.id,
            approvedByName: me?.fullName,
            approvedAt,
          }
          : c
      ),
    });
    get().log(
      "customer.approve",
      `Approved credit customer ${cid} with limit ${finalLimit}`
    );
    void import("@/lib/audit").then(({ writeAudit }) =>
      writeAudit({
        entity: "credit_customer",
        entityId: cid,
        action: "approve",
        before: before
          ? {
            approvalStatus: before.approvalStatus,
            creditLimit: before.creditLimit,
          }
          : null,
        after: { approvalStatus: "approved", creditLimit: finalLimit },
      })
    );
    if (!isSupabaseConfigured) return;
    supabase
      .from("customers")
      .update({
        approval_status: "approved",
        credit_limit: finalLimit,
        approved_by: me?.id ?? null,
        approved_at: approvedAt,
      })
      .eq("id", cid)
      .then(({ error }) => logErr("customers.approve", error));
  },

  rejectCustomer: (cid) => {
    const me = get().users.find((u) => u.id === get().currentUserId);
    const approvedAt = new Date().toISOString();
    const before = get().customers.find((c) => c.id === cid);
    set({
      customers: get().customers.map((c) =>
        c.id === cid
          ? {
            ...c,
            approvalStatus: "rejected",
            creditLimit: 0,
            approvedBy: me?.id,
            approvedByName: me?.fullName,
            approvedAt,
          }
          : c
      ),
    });
    get().log("customer.reject", `Rejected credit customer ${cid}`);
    void import("@/lib/audit").then(({ writeAudit }) =>
      writeAudit({
        entity: "credit_customer",
        entityId: cid,
        action: "reject",
        before: before
          ? {
            approvalStatus: before.approvalStatus,
            creditLimit: before.creditLimit,
          }
          : null,
        after: { approvalStatus: "rejected", creditLimit: 0 },
      })
    );
    if (!isSupabaseConfigured) return;
    supabase
      .from("customers")
      .update({
        approval_status: "rejected",
        credit_limit: 0,
        approved_by: me?.id ?? null,
        approved_at: approvedAt,
      })
      .eq("id", cid)
      .then(({ error }) => logErr("customers.reject", error));
  },
  updateCustomer: (cid, patch) => {
    set({
      customers: get().customers.map((c) =>
        c.id === cid ? { ...c, ...patch } : c
      ),
    });
    if (!isSupabaseConfigured) return;
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.phone !== undefined) row.phone = patch.phone;
    if (patch.address !== undefined) row.address = patch.address;
    if (patch.creditLimit !== undefined) row.credit_limit = patch.creditLimit;
    if (patch.requestedCreditLimit !== undefined) row.requested_credit_limit = patch.requestedCreditLimit;
    if (patch.approvalStatus !== undefined) row.approval_status = patch.approvalStatus;
    if (patch.notes !== undefined) row.notes = patch.notes;
    if (patch.balance !== undefined) row.balance = patch.balance;
    if (Object.keys(row).length > 0) {
      supabase
        .from("customers")
        .update(row)
        .eq("id", cid)
        .then(({ error }) => logErr("customers.update", error));
    }
  },
  deleteCustomer: (cid) => {
    set({ customers: get().customers.filter((c) => c.id !== cid) });
    if (!isSupabaseConfigured) return;
    supabase
      .from("customers")
      .delete()
      .eq("id", cid)
      .then(({ error }) => logErr("customers.delete", error));
  },
  addCreditPayment: (cid, amount, note) => {
    const c = get().customers.find((x) => x.id === cid);
    const newBalance = Math.max(0, (c?.balance ?? 0) - amount);
    const me = get().users.find((u) => u.id === get().currentUserId);
    const nowIso = new Date().toISOString();
    set({
      customers: get().customers.map((cc) =>
        cc.id === cid
          ? { ...cc, balance: newBalance, lastPaymentAt: nowIso }
          : cc
      ),
      creditTx: [
        ...get().creditTx,
        {
          id: localId("ct"),
          customerId: cid,
          date: nowIso,
          type: "payment",
          amount,
          note,
          userId: me?.id,
          userName: me?.fullName,
        },
      ],
    });
    get().log("credit.payment", `Received ${amount.toFixed(2)} from ${cid}`);
    if (!isSupabaseConfigured) return;
    supabase
      .from("customers")
      .update({ balance: newBalance, last_payment_at: nowIso })
      .eq("id", cid)
      .then(({ error }) => {
        // ignore if last_payment_at column not yet deployed
        if (
          error &&
          !/column .* does not exist|schema cache/i.test(error.message)
        ) {
          logErr("customers.balance", error);
        }
      });
    supabase
      .from("credit_transactions")
      .insert({
        customer_id: cid,
        type: "payment",
        amount,
        note: note ?? null,
        user_id: get().currentUserId,
      })
      .then(({ error }) => logErr("credit_tx.insert", error));
  },

  /* ------------------------ logging -------------------------------- */
  log: (action, detail) => {
    const u = get().users.find((x) => x.id === get().currentUserId);
    const entry: ActivityLog = {
      id: localId("lg"),
      date: new Date().toISOString(),
      userId: u?.id ?? "system",
      userName: u?.fullName ?? "System",
      action,
      detail,
    };
    set({ logs: [entry, ...get().logs].slice(0, 500) });
    if (!isSupabaseConfigured) return;
    supabase
      .from("activity_logs")
      .insert({
        user_id: u?.id ?? null,
        action,
        entity: action.split(".")[0] ?? null,
        meta: { detail },
      })
      .then(({ error }) => logErr("activity_logs.insert", error));
  },

  resetData: () => set({ ...initial, currentUserId: get().currentUserId }),
}));

export const useCurrentUser = (): User | null => {
  const id = useStore((s) => s.currentUserId);
  const users = useStore((s) => s.users);
  return users.find((u) => u.id === id) ?? null;
};
