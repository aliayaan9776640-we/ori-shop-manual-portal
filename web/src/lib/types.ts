export type Role = "admin" | "storekeeper" | "cashier";

export interface User {
  id: string;
  /** Email — used as the login identifier (was "username" before Supabase). */
  username: string;
  email: string;
  /** Only present in legacy local-only mode. Never read from Supabase. */
  password?: string;
  fullName: string;
  role: Role;
  active: boolean;
  createdAt: string;
  /** Admin-assigned flag: this user can be assigned to attend purchase orders. */
  isPurchasingStaff?: boolean;
}

export type UnitType = "piece" | "kg" | "tin" | "box" | "case";

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  viber: string;
  email: string;
  address: string;
  notes: string;
}

export interface Product {
  id: string;
  name: string;
  barcode: string;
  category: string;
  supplierId: string;
  purchasePrice: number;
  sellingPrice: number;
  marginPct: number; // editable
  unit: UnitType;
  piecesPerCase: number;
  stockPieces: number;
  reorderLevel: number; // pieces
  expiryDate?: string;
  boatFee: number;
  otherCost: number;
  photo?: string;
  /** Whether GST should be charged on this product when sold. Defaults to true if undefined. */
  gstApplicable?: boolean;
  /** True when this product was created from a consignment intake. */
  isConsignment?: boolean;
  /** Online shop publishing workflow. Inventory/POS ignore this; only /store filters on it. */
  publishStatus?: "draft" | "pending" | "approved" | "rejected";
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  /** Brand name (admin-managed list). */
  brand?: string;
  /** Whether the product is on offer. Used for the "Offers" filter on /store. */
  isOffer?: boolean;
  /** Discount percentage shown on the storefront (0–100). */
  discountPct?: number;
  /** Optional label rendered on the offer badge (e.g. "-25%", "Hot Deal"). */
  offerLabel?: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  qty: number; // in pieces
  unit: UnitType;
  unitQty: number; // qty in displayed unit
  price: number; // selling price per piece
  landedCost: number; // per piece
  total: number;
  profit: number;
  gstApplicable?: boolean;
}

export type PaymentMethod = "cash" | "card" | "bank" | "credit";

export interface Sale {
  id: string;
  date: string; // ISO
  items: SaleItem[];
  total: number;
  profit: number;
  paymentMethod: PaymentMethod;
  customerId?: string;
  cashierId: string;
  /** Cash given to drawer (only for cash payments where customer overpaid). Used to reverse drawer state on void. */
  change?: number;
  /** Active cash drawer session id at time of sale (linked at POS). */
  drawerId?: string;
  /** Admin-only protection fields */
  voided?: boolean;
  voidedAt?: string;
  voidedBy?: string;
  voidedByName?: string;
  voidReason?: string;
  editedAt?: string;
  editedBy?: string;
  editedByName?: string;
}

export interface DamagedItem {
  id: string;
  productId: string;
  name: string;
  qty: number; // pieces
  unit: UnitType;
  unitQty: number;
  reason: string;
  date: string;
  valueLoss: number;
  reportedBy: string;
  reportedByName?: string;
  landedCostPerPiece?: number;
  stockBefore?: number;
  stockAfter?: number;
  notes?: string;
  barcode?: string;
}

export type OrderStatus = "pending" | "loaded" | "received" | "partial" | "cancelled";

export interface OrderItem {
  productId: string;
  name: string;
  currentStock: number;
  qty: number; // pieces
  unit: UnitType;
  unitQty: number;
  receivedQty: number; // pieces
  notes?: string;
}

export interface Order {
  id: string;
  supplierId: string;
  date: string;
  items: OrderItem[];
  status: OrderStatus;
  boatName?: string;
  boatContact?: string;
  loadingDate?: string;
  sentDate?: string;
  expectedDate?: string;
  receivedDate?: string;
  notes?: string;
}

export type CreditApprovalStatus = "pending" | "approved" | "rejected";

export interface CreditCustomer {
  id: string;
  name: string;
  phone: string;
  address: string;
  openingBalance: number;
  /** Final approved credit limit. 0 until admin approves. */
  creditLimit: number;
  /** Limit requested by cashier when creating the customer. */
  requestedCreditLimit?: number;
  notes: string;
  balance: number; // current outstanding
  approvalStatus: CreditApprovalStatus;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  /** Secure UUID used for the customer-facing public bill link. */
  publicToken?: string;
  /** Last payment timestamp (ISO). Updated on every payment. */
  lastPaymentAt?: string;
}

export interface CreditTransaction {
  id: string;
  customerId: string;
  date: string;
  type: "sale" | "payment";
  amount: number;
  saleId?: string;
  note?: string;
  /** Cashier / admin who recorded this entry. */
  userId?: string;
  userName?: string;
}

export interface InventoryTx {
  id: string;
  productId: string;
  type: "in" | "out" | "adjust" | "damage" | "sale" | "receive";
  qty: number;
  note?: string;
  userId?: string;
  /** Person who physically bought / arranged the goods (separate from entered-by). */
  buyingPersonId?: string;
  buyingPersonName?: string;
  date: string;
}

export interface StockBatch {
  id: string;
  productId: string;
  batchNo?: string;
  qtyPieces: number;       // original qty added
  remainingPieces: number; // current remaining
  purchaseDate: string;    // ISO date
  expiryDate?: string;     // ISO date (optional)
  userId?: string;
  /** Person who physically bought / arranged the goods (separate from entered-by). */
  buyingPersonId?: string;
  buyingPersonName?: string;
  note?: string;
  createdAt: string;
}

export type ExpiryStatus = "none" | "ok" | "near" | "expired";

/* ----------------------- Purchase Orders ----------------------- */

export type PurchaseOrderStatus =
  | "auto_draft"
  | "storekeeper_edited"
  | "draft"
  | "raised"
  | "assigned"
  | "buying_in_progress"
  | "waiting_approval"
  | "approved"
  | "loaded"
  | "receiving"
  | "completed"
  | "rejected";

export type PurchaseOrderItemStatus =
  | "pending"
  | "buying_entered"
  | "waiting_approval"
  | "loaded"
  | "received"
  | "needs_correction"
  | "approved"
  | "completed";

export interface PurchaseOrderItem {
  id: string;
  poId: string;
  productId?: string;
  productName: string;
  expectedQty: number; // unit qty (case/piece/etc)
  unitType: UnitType;
  piecesPerCase: number;
  buyingQty: number; // unit qty bought
  buyingPriceCase: number;
  buyingPricePiece: number;
  totalAmount: number;
  receivedQty: number; // pieces
  damagedQty: number;
  missingQty: number;
  expiryDate?: string;
  batchNo?: string;
  status: PurchaseOrderItemStatus;
  correctionNote?: string;
  notes?: string;
}

export interface PurchaseOrder {
  id: string;
  poNo?: string;
  supplierId?: string;
  status: PurchaseOrderStatus;
  notes?: string;
  requiredDate?: string;
  invoiceNo?: string;
  invoiceUrl?: string;
  boatName?: string;
  loadingDate?: string;
  processDate?: string;
  totalAmount: number;
  raisedBy?: string;
  raisedByName?: string;
  raisedAt: string;
  assignedTo?: string;
  assignedToName?: string;
  assignedAt?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectedReason?: string;
  /** Person who physically bought / arranged the goods (separate from assignedTo / raisedBy). */
  buyingPersonId?: string;
  buyingPersonName?: string;
  /** Optional boat/transport fee included in the shipment value estimate. */
  transportFee?: number;
  /** Estimated total based on last buying prices (set on auto-draft). */
  estimatedTotal?: number;
  items: PurchaseOrderItem[];
  createdAt: string;
}

export interface LastBuyingInfo {
  productId: string;
  lastBuyingPriceCase: number;
  lastBuyingPricePiece: number;
  lastSupplierId?: string;
  lastSupplierName?: string;
  lastPurchaseDate?: string;
}

export interface ActivityLog {
  id: string;
  date: string;
  userId: string;
  userName: string;
  action: string;
  detail: string;
}
