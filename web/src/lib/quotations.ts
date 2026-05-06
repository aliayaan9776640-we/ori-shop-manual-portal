import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface QuotationItem {
  productId?: string;
  name: string;
  code?: string;
  unit?: string;
  description?: string;
  qty: number;
  price: number;
  total: number;
  gstApplicable?: boolean;
}

export type QuotationStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "sent"
  | "accepted"
  | "expired"
  | "converted";

export interface Quotation {
  id: string;
  number: string;
  date: string; // ISO
  validUntil: string; // ISO date string (yyyy-mm-dd)
  preparedBy: string;
  preparedById: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  items: QuotationItem[];
  subtotal: number;
  discount: number;
  gstPercent: number;
  gstAmount: number;
  total: number;
  notes?: string;
  status: QuotationStatus;
  convertedToSaleId?: string;
  approvedBy?: string;
  approvedById?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
}

interface QuotationsState {
  quotations: Quotation[];
  add: (
    q: Omit<Quotation, "id" | "number" | "date" | "status">,
    initialStatus?: QuotationStatus
  ) => Quotation;
  update: (id: string, patch: Partial<Quotation>) => void;
  approve: (id: string, approverName: string, approverId: string) => void;
  reject: (id: string, approverName: string, reason?: string) => void;
  remove: (id: string) => void;
}

const nextNumber = (existing: Quotation[]): string => {
  const yr = new Date().getFullYear();
  const prefix = `Q-${yr}-`;
  const used = existing
    .map((q) => q.number)
    .filter((n) => n.startsWith(prefix))
    .map((n) => parseInt(n.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
};

export const useQuotations = create<QuotationsState>()(
  persist(
    (set, get) => ({
      quotations: [],
      add: (q, initialStatus = "draft") => {
        const id = `qt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const number = nextNumber(get().quotations);
        const full: Quotation = {
          ...q,
          id,
          number,
          date: new Date().toISOString(),
          status: initialStatus,
        };
        set({ quotations: [full, ...get().quotations] });
        return full;
      },
      update: (id, patch) =>
        set({
          quotations: get().quotations.map((q) =>
            q.id === id ? { ...q, ...patch } : q
          ),
        }),
      approve: (id, approverName, approverId) =>
        set({
          quotations: get().quotations.map((q) =>
            q.id === id
              ? {
                  ...q,
                  status: "approved",
                  approvedBy: approverName,
                  approvedById: approverId,
                  approvedAt: new Date().toISOString(),
                  rejectedBy: undefined,
                  rejectionReason: undefined,
                }
              : q
          ),
        }),
      reject: (id, approverName, reason) =>
        set({
          quotations: get().quotations.map((q) =>
            q.id === id
              ? {
                  ...q,
                  status: "rejected",
                  rejectedBy: approverName,
                  rejectionReason: reason,
                  approvedBy: undefined,
                  approvedById: undefined,
                  approvedAt: undefined,
                }
              : q
          ),
        }),
      remove: (id) =>
        set({ quotations: get().quotations.filter((q) => q.id !== id) }),
    }),
    { name: "ori-quotations" }
  )
);
