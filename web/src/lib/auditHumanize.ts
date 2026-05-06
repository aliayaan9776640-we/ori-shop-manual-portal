import type { AuditLog } from "@/lib/audit";

const ENTITY_LABELS: Record<string, string> = {
  credit_customer: "Credit Customer",
  purchase_order: "Purchase Order",
  stock_batch: "Stock Batch",
  consignment_item: "Consignment Item",
  sale: "Sale",
  user: "User",
  supplier: "Supplier",
  cash_drawer: "Cash Drawer",
  product: "Product",
  inventory: "Inventory",
  setting: "Settings",
};

const MODULE_LABELS: Record<string, string> = {
  ...ENTITY_LABELS,
  cash_drawer: "Cash Drawer",
  sale: "POS Sales",
  purchase_order: "Purchasing",
  stock_batch: "Inventory",
  consignment_item: "Consignment",
  credit_customer: "Credit",
  user: "Users",
  supplier: "Suppliers",
  product: "Products",
  setting: "Settings",
};

export const moduleLabel = (entity: string): string =>
  MODULE_LABELS[entity] ?? prettify(entity);

export const entityLabel = (entity: string): string =>
  ENTITY_LABELS[entity] ?? prettify(entity);

const prettify = (s: string): string =>
  s
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
};

const money = (v: unknown, currency = "MVR"): string | null => {
  const n = num(v);
  if (n === null) return null;
  return `${currency} ${n.toFixed(2)}`;
};

const pick = (...vals: unknown[]): unknown => {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
};

const shortId = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  return v.length > 8 ? v.slice(-8) : v;
};

/**
 * Returns a human, non-technical sentence describing what happened.
 * Falls back to a generic phrase when shape is unknown.
 */
export function humanizeAudit(l: AuditLog): string {
  const who = l.performedByName ?? "System";
  const before = isObj(l.beforeValue) ? l.beforeValue : null;
  const after = isObj(l.afterValue) ? l.afterValue : null;
  const data = after ?? before ?? {};
  const entity = l.entity;
  const action = l.action;

  // ----- Cash Drawer -----
  if (entity === "cash_drawer") {
    const opening = money(pick(data.openingCash, data.opening_cash));
    const counted = money(pick(data.actualCash, data.actual_cash, data.countedCash));
    const expected = money(pick(data.expectedCash, data.expected_cash));
    const diff = num(pick(data.shortageExcess, data.shortage_excess));
    if (action === "create") {
      return `${who} opened cash drawer${opening ? ` with ${opening}` : ""}.`;
    }
    if (action === "approve") {
      return `${who} approved drawer closing${counted ? ` (counted ${counted})` : ""}.`;
    }
    if (action === "delete") {
      return `${who} removed a drawer record.`;
    }
    if (action === "update") {
      const status = String(pick(data.status, "") ?? "");
      if (status === "closed") {
        const parts: string[] = [];
        if (counted) parts.push(`counted ${counted}`);
        if (expected) parts.push(`expected ${expected}`);
        if (diff !== null && diff !== 0) {
          parts.push(`${diff > 0 ? "excess" : "shortage"} ${Math.abs(diff).toFixed(2)}`);
        }
        return `${who} closed cash drawer${parts.length ? ` — ${parts.join(", ")}` : ""}.`;
      }
      return `${who} updated cash drawer.`;
    }
  }

  // ----- Sale / POS -----
  if (entity === "sale") {
    const inv = pick(data.invoiceNo, data.invoice_no, data.billNo, data.bill_no, l.entityId);
    const total = money(pick(data.total, data.totalAmount, data.total_amount, data.amount));
    if (action === "create") {
      return `${who} created sale invoice #${inv ?? shortId(l.entityId) ?? "—"}${total ? ` for ${total}` : ""}.`;
    }
    if (action === "delete") {
      return `${who} voided sale #${inv ?? shortId(l.entityId) ?? "—"}.`;
    }
    if (action === "update") {
      return `${who} edited sale #${inv ?? shortId(l.entityId) ?? "—"}.`;
    }
  }

  // ----- Purchase Order -----
  if (entity === "purchase_order") {
    const poNo = pick(data.poNo, data.po_no, l.entityId);
    const total = money(pick(data.totalAmount, data.total_amount, data.total));
    if (action === "create") return `${who} created purchase order ${poNo ?? ""}${total ? ` (${total})` : ""}.`;
    if (action === "approve") return `${who} approved purchase order ${poNo ?? ""}.`;
    if (action === "reject") return `${who} rejected purchase order${l.reason ? ` — ${l.reason}` : ""}.`;
    if (action === "update") return `${who} updated purchase order ${poNo ?? ""}.`;
    if (action === "delete") return `${who} deleted purchase order ${poNo ?? ""}.`;
  }

  // ----- Stock / Inventory -----
  if (entity === "stock_batch" || entity === "inventory") {
    const product = pick(data.productName, data.product_name, data.name);
    const qty = num(pick(data.quantity, data.qty, data.count));
    if (action === "create") {
      return `${who} added${qty !== null ? ` ${qty} pcs of` : ""} ${product ?? "stock"} to inventory.`;
    }
    if (action === "update") {
      return `${who} updated ${product ?? "stock"}${qty !== null ? ` (qty ${qty})` : ""}.`;
    }
    if (action === "delete") return `${who} removed ${product ?? "stock item"} from inventory.`;
  }

  // ----- Credit customer -----
  if (entity === "credit_customer") {
    const name = pick(data.name, data.customerName);
    const limit = money(pick(data.creditLimit, data.credit_limit));
    if (action === "approve") {
      return `${who} approved credit customer${name ? ` ${name}` : ""}${limit ? ` (limit ${limit})` : ""}.`;
    }
    if (action === "reject") return `${who} rejected credit customer${name ? ` ${name}` : ""}.`;
    if (action === "create") return `${who} added credit customer${name ? ` ${name}` : ""}.`;
    if (action === "update") return `${who} updated credit customer${name ? ` ${name}` : ""}.`;
  }

  // ----- User -----
  if (entity === "user") {
    const name = pick(data.fullName, data.name, data.email);
    if (action === "create") return `${who} created user${name ? ` ${name}` : ""}.`;
    if (action === "update") return `${who} updated user${name ? ` ${name}` : ""}.`;
    if (action === "delete") return `${who} removed user${name ? ` ${name}` : ""}.`;
  }

  // ----- Settings -----
  if (entity === "setting") {
    const key = pick(data.key, data.name, l.entityId);
    const beforeVal = before ? pick(before.value, before.amount, before.rate) : null;
    const afterVal = after ? pick(after.value, after.amount, after.rate) : null;
    if (action === "update" && key) {
      if (beforeVal !== null && afterVal !== null) {
        return `${who} changed ${key} from ${String(beforeVal)} to ${String(afterVal)}.`;
      }
      return `${who} updated setting ${key}.`;
    }
  }

  // ----- Generic field-diff for updates -----
  if (action === "update" && before && after) {
    const changed: string[] = [];
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const k of keys) {
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
        changed.push(prettify(k));
        if (changed.length >= 3) break;
      }
    }
    if (changed.length > 0) {
      return `${who} updated ${entityLabel(entity)} — changed ${changed.join(", ")}.`;
    }
  }

  // ----- Fallback -----
  const verb = action === "create"
    ? "created"
    : action === "update"
    ? "updated"
    : action === "delete"
    ? "deleted"
    : action === "approve"
    ? "approved"
    : action === "reject"
    ? "rejected"
    : "performed action on";
  return `${who} ${verb} ${entityLabel(entity).toLowerCase()}${l.reason ? ` — ${l.reason}` : ""}.`;
}

export function statusForAudit(l: AuditLog): {
  label: string;
  tone: string;
} {
  switch (l.action) {
    case "create":
      return { label: "Created", tone: "bg-blue-100 text-blue-700" };
    case "update":
      return { label: "Updated", tone: "bg-amber-100 text-amber-700" };
    case "delete":
      return { label: "Deleted", tone: "bg-rose-100 text-rose-700" };
    case "approve":
      return { label: "Approved", tone: "bg-emerald-100 text-emerald-700" };
    case "reject":
      return { label: "Rejected", tone: "bg-rose-100 text-rose-700" };
    default:
      return { label: "Logged", tone: "bg-slate-100 text-slate-700" };
  }
}
