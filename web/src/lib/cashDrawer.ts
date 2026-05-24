import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { writeAudit } from "@/lib/audit";

export type DrawerStatus = "open" | "closed" | "approved";

export interface DenominationCount {
  /** denomination value (e.g. 1000) */
  value: number;
  /** how many notes/coins counted */
  count: number;
}

export type CashOutStatus = "pending" | "approved" | "rejected";

export interface CashOutRequest {
  id: string;
  drawerId: string;
  amount: number;
  purpose: string;
  status: CashOutStatus;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedByName?: string | null;
  rejectedAt?: string | null;
  adminNote?: string | null;
}

export interface CashDrawer {
  id: string;
  cashierId: string;
  cashierName: string;
  openedAt: string; // ISO
  closedAt?: string; // ISO
  status: DrawerStatus;
  openingCash: number;
  // recorded sale aggregates at close (snapshot)
  cashSales?: number;
  cardSales?: number;
  bankSales?: number;
  creditSales?: number;
  totalSales?: number;
  changeGiven?: number;
  cashUsed?: number;
  gstCollected?: number;
  bagFeesCollected?: number;
  cardFeesCollected?: number;
  discountsGiven?: number;
  expectedCash?: number;
  countedCash?: number;
  difference?: number;
  denominations?: DenominationCount[];
  notes?: string;
  adminNotes?: string;
  approvedByAdmin?: boolean;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  /** User id of the cashier who opened the drawer (== cashierId for legacy). */
  openedBy?: string | null;
  openedByName?: string | null;
  /** User id of the cashier who closed the drawer — may differ from opener. */
  closedBy?: string | null;
  closedByName?: string | null;
  /** Cash taken out from drawer. Pending requests do NOT reduce expected cash. */
  cashOutRequests?: CashOutRequest[];
}

interface CashDrawerState {
  drawers: CashDrawer[];
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  open: (
    cashierId: string,
    cashierName: string,
    openingCash: number
  ) => Promise<CashDrawer>;
  close: (
    id: string,
    patch: Partial<CashDrawer>,
    closer?: { id: string; name: string; reason?: string }
  ) => Promise<void>;
  approve: (id: string, adminNotes?: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Accumulate change given for the cashier's currently-open drawer */
  addChangeGiven: (cashierId: string, amount: number) => void;
  /** Reverse change given (e.g. on voided cash sale). Clamped at 0. */
  reverseChangeGiven: (cashierId: string, amount: number) => void;
  /** Legacy direct cash used method; kept for old callers. Prefer requestCashOut + approveCashOut. */
  addCashUsed: (cashierId: string, amount: number) => void;
  requestCashOut: (args: {
    drawerId: string;
    amount: number;
    purpose: string;
    requestedBy: string;
    requestedByName: string;
  }) => Promise<CashOutRequest>;
  approveCashOut: (
    drawerId: string,
    requestId: string,
    admin: { id: string; name: string; note?: string }
  ) => Promise<void>;
  rejectCashOut: (
    drawerId: string,
    requestId: string,
    admin: { id: string; name: string; note?: string }
  ) => Promise<void>;
  /** Currently open drawer for a given cashier (legacy lookup). */
  currentForCashier: (cashierId: string) => CashDrawer | undefined;
  /** Currently open drawer for the shop (shared across all cashiers). */
  currentOpenDrawer: () => CashDrawer | undefined;
}

export const DEFAULT_DENOMINATIONS: DenominationCount[] = [
  { value: 1000, count: 0 },
  { value: 500, count: 0 },
  { value: 100, count: 0 },
  { value: 50, count: 0 },
  { value: 20, count: 0 },
  { value: 10, count: 0 },
  { value: 5, count: 0 },
  { value: 2, count: 0 },
  { value: 1, count: 0 },
];

export const sumDenominations = (d: DenominationCount[]): number =>
  d.reduce((s, x) => s + x.value * Math.max(0, x.count), 0);

// ---------------------------------------------------------------------------
// Supabase row <-> CashDrawer mapping
// ---------------------------------------------------------------------------
interface CashDrawerRow {
  id: string;
  cashier_id: string | null;
  cashier_name: string | null;
  status: string;
  opening_cash: number | string;
  cash_sales: number | string | null;
  card_sales: number | string | null;
  bank_sales: number | string | null;
  credit_sales: number | string | null;
  total_sales: number | string | null;
  change_given: number | string | null;
  cash_used: number | string | null;
  expected_cash: number | string | null;
  counted_cash: number | string | null;
  difference: number | string | null;
  denominations: DenominationCount[] | null;
  notes: string | null;
  admin_notes: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  opened_at: string;
  closed_at: string | null;
  opened_by: string | null;
  opened_by_name: string | null;
  closed_by: string | null;
  closed_by_name: string | null;
  cash_out_requests?: CashOutRequest[] | null;
}

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fromRow = (r: CashDrawerRow): CashDrawer => ({
  id: r.id,
  cashierId: r.cashier_id ?? "",
  cashierName: r.cashier_name ?? "",
  openedAt: r.opened_at,
  closedAt: r.closed_at ?? undefined,
  status:
    r.status === "open"
      ? "open"
      : r.status === "approved"
        ? "approved"
        : "closed",
  openingCash: num(r.opening_cash),
  cashSales: num(r.cash_sales),
  cardSales: num(r.card_sales),
  bankSales: num(r.bank_sales),
  creditSales: num(r.credit_sales),
  totalSales: num(r.total_sales),
  changeGiven: num(r.change_given),
  cashUsed: num(r.cash_used),
  expectedCash: num(r.expected_cash),
  countedCash: num(r.counted_cash),
  difference: num(r.difference),
  denominations: Array.isArray(r.denominations) ? r.denominations : [],
  notes: r.notes ?? undefined,
  adminNotes: r.admin_notes ?? undefined,
  approvedByAdmin: r.status === "approved" || r.approved_at !== null,
  approvedBy: r.approved_by,
  approvedByName: r.approved_by_name,
  approvedAt: r.approved_at,
  openedBy: r.opened_by ?? r.cashier_id,
  openedByName: r.opened_by_name ?? r.cashier_name,
  closedBy: r.closed_by,
  closedByName: r.closed_by_name,
  cashOutRequests: Array.isArray(r.cash_out_requests) ? r.cash_out_requests : [],
});

const toInsertRow = (d: CashDrawer): Record<string, unknown> => ({
  id: d.id,
  cashier_id: d.cashierId || null,
  cashier_name: d.cashierName,
  status: d.status,
  opening_cash: d.openingCash,
  cash_sales: d.cashSales ?? 0,
  card_sales: d.cardSales ?? 0,
  bank_sales: d.bankSales ?? 0,
  credit_sales: d.creditSales ?? 0,
  total_sales: d.totalSales ?? 0,
  change_given: d.changeGiven ?? 0,
  cash_used: d.cashUsed ?? 0,
  expected_cash: d.expectedCash ?? 0,
  counted_cash: d.countedCash ?? 0,
  difference: d.difference ?? 0,
  denominations: d.denominations ?? [],
  notes: d.notes ?? null,
  admin_notes: d.adminNotes ?? null,
  opened_at: d.openedAt,
  closed_at: d.closedAt ?? null,
  opened_by: d.openedBy ?? d.cashierId ?? null,
  opened_by_name: d.openedByName ?? d.cashierName ?? null,
  closed_by: d.closedBy ?? null,
  closed_by_name: d.closedByName ?? null,
  cash_out_requests: d.cashOutRequests ?? [],
});

/**
 * Best-effort persist a drawer row. Upserts by primary key so retries
 * are safe. Errors are surfaced via console + toast at call site.
 */
const persistDrawer = async (
  d: CashDrawer
): Promise<{ ok: boolean; error?: string }> => {
  if (!isSupabaseConfigured) return { ok: true };

  const fullRow = toInsertRow(d);
  const { error } = await supabase
    .from("cash_drawers")
    .upsert(fullRow, { onConflict: "id" });

  if (!error) return { ok: true };

  // Backward-compatible fallback: if your Supabase table does not yet have
  // cash_out_requests JSONB column, save all existing drawer fields and keep
  // requests in local persisted state. Add the SQL column later for multi-device permanence.
  const missingColumn =
    (error as { code?: string }).code === "PGRST204" ||
    /cash_out_requests|schema cache|column/i.test(error.message);

  if (missingColumn) {
    const legacyRow = { ...fullRow };
    delete legacyRow.cash_out_requests;
    const retry = await supabase
      .from("cash_drawers")
      .upsert(legacyRow, { onConflict: "id" });
    if (!retry.error) {
      console.warn(
        "[cash_drawers.upsert] cash_out_requests column missing; drawer saved without server-side cash-out requests"
      );
      return { ok: true };
    }
    console.warn("[cash_drawers.upsert.retry]", retry.error.message);
    return { ok: false, error: retry.error.message };
  }

  console.warn("[cash_drawers.upsert]", error.message);
  return { ok: false, error: error.message };
};

export const useCashDrawers = create<CashDrawerState>()(
  persist(
    (set, get) => ({
      drawers: [],
      loaded: false,
      loading: false,
      load: async () => {
        if (!isSupabaseConfigured) {
          set({ loaded: true });
          return;
        }
        set({ loading: true });
        const { data, error } = await supabase
          .from("cash_drawers")
          .select("*")
          .order("opened_at", { ascending: false })
          .limit(1000);
        if (error) {
          console.warn("[cash_drawers.load]", error.message);
          set({ loading: false, loaded: true });
          return;
        }
        const rows = (data as CashDrawerRow[] | null) ?? [];
        set({
          drawers: rows.map(fromRow),
          loaded: true,
          loading: false,
        });
      },
      open: async (cashierId, cashierName, openingCash) => {
        // Shop-wide rule: only ONE open drawer at a time.
        // Authoritative check via Supabase; local cache may be stale.
        if (isSupabaseConfigured) {
          const { data, error } = await supabase
            .from("cash_drawers")
            .select("id, cashier_id, cashier_name, opened_by_name, opened_at")
            .eq("status", "open")
            .limit(1)
            .maybeSingle();
          if (!error && data) {
            // Permanent refresh-safe fix:
            // If this same cashier already has an open drawer, return that
            // drawer instead of creating a duplicate or blocking after refresh.
            await get().load().catch(() => {});
            const existingDrawer = get().drawers.find(
              (d) => d.id === data.id && d.status === "open"
            );

            if (existingDrawer && existingDrawer.cashierId === cashierId) {
              return existingDrawer;
            }

            throw new Error(
              "A cash drawer is already open. Close it before opening a new one."
            );
          }
        } else {
          const existing = get().drawers.find((d) => d.status === "open");
          if (existing) {
            // Same cashier refresh-safe fix for local persisted state.
            if (existing.cashierId === cashierId) {
              return existing;
            }

            throw new Error(
              "A cash drawer is already open. Close it before opening a new one."
            );
          }
        }
        const id = `cd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const drawer: CashDrawer = {
          id,
          cashierId,
          cashierName,
          openedBy: cashierId,
          openedByName: cashierName,
          openedAt: new Date().toISOString(),
          status: "open",
          openingCash,
          cashOutRequests: [],
        };
        const r = await persistDrawer(drawer);
        if (!r.ok) {
          // Most likely cause: the partial unique index rejected a second
          // open drawer (race with another device). Reload to surface the
          // existing one and bubble a friendly error.
          await get().load().catch(() => {});
          const existing = get().drawers.find(
            (d) => d.status === "open" && d.cashierId === cashierId
          );
          throw new Error(
            existing
              ? "You already have an open drawer. Close it before opening a new one."
              : (r.error ?? "Failed to open drawer")
          );
        }
        set({ drawers: [drawer, ...get().drawers.filter((d) => d.id !== id)] });
        writeAudit({
          entity: "cash_drawer",
          entityId: drawer.id,
          action: "create",
          after: drawer,
          reason: `Drawer opened by ${cashierName}`,
        });
        return drawer;
      },
      close: async (id, patch, closer) => {
        const existing = get().drawers.find((d) => d.id === id);
        if (!existing) return;
        const pendingCashOut = (existing.cashOutRequests ?? []).filter(
          (r) => r.status === "pending"
        );
        if (pendingCashOut.length > 0) {
          throw new Error(
            "Pending cash out approval exists. Drawer cannot be closed until admin approves or rejects."
          );
        }
        const updated: CashDrawer = {
          ...existing,
          ...patch,
          status: "closed",
          closedAt: patch.closedAt ?? new Date().toISOString(),
          closedBy: closer?.id ?? patch.closedBy ?? existing.closedBy ?? existing.cashierId,
          closedByName:
            closer?.name ?? patch.closedByName ?? existing.closedByName ?? existing.cashierName,
        };
        set({
          drawers: get().drawers.map((d) => (d.id === id ? updated : d)),
        });
        const r = await persistDrawer(updated);
        if (!r.ok) {
          throw new Error(r.error ?? "Failed to save closing record");
        }
        const byOther =
          closer && existing.cashierId && closer.id !== existing.cashierId;
        writeAudit({
          entity: "cash_drawer",
          entityId: id,
          action: "update",
          before: existing,
          after: updated,
          reason: byOther
            ? `Drawer closed by ${closer?.name} (opened by ${existing.openedByName ?? existing.cashierName})`
            : "Drawer closed (end of day)",
        });
      },
      approve: async (id, adminNotes) => {
        const existing = get().drawers.find((d) => d.id === id);
        if (!existing) return;
        const updated: CashDrawer = {
          ...existing,
          status: "approved",
          approvedByAdmin: true,
          adminNotes: adminNotes ?? existing.adminNotes,
          approvedAt: new Date().toISOString(),
        };
        set({
          drawers: get().drawers.map((d) => (d.id === id ? updated : d)),
        });
        if (isSupabaseConfigured) {
          const { error } = await supabase
            .from("cash_drawers")
            .update({
              status: "approved",
              admin_notes: updated.adminNotes ?? null,
              approved_at: updated.approvedAt,
            })
            .eq("id", id);
          if (error) {
            console.warn("[cash_drawers.approve]", error.message);
            throw new Error(error.message);
          }
        }
        writeAudit({
          entity: "cash_drawer",
          entityId: id,
          action: "approve",
          before: existing,
          after: updated,
          reason: "Admin approved drawer closing",
        });
      },
      remove: async (id) => {
        const existing = get().drawers.find((d) => d.id === id);
        set({ drawers: get().drawers.filter((d) => d.id !== id) });
        if (isSupabaseConfigured) {
          const { error } = await supabase
            .from("cash_drawers")
            .delete()
            .eq("id", id);
          if (error) {
            console.warn("[cash_drawers.delete]", error.message);
            throw new Error(error.message);
          }
        }
        if (existing) {
          writeAudit({
            entity: "cash_drawer",
            entityId: id,
            action: "delete",
            before: existing,
            reason: "Drawer record deleted",
          });
        }
      },
      addChangeGiven: (_cashierId, amount) => {
        if (!amount || amount <= 0) return;
        // Shop-wide: update the single open drawer regardless of cashier.
        const next = get().drawers.map((d) =>
          d.status === "open"
            ? { ...d, changeGiven: +(((d.changeGiven ?? 0) + amount)).toFixed(2) }
            : d
        );
        set({ drawers: next });
        const updated = next.find((d) => d.status === "open");
        if (updated) void persistDrawer(updated);
      },
      reverseChangeGiven: (_cashierId, amount) => {
        if (!amount || amount <= 0) return;
        const next = get().drawers.map((d) =>
          d.status === "open"
            ? {
                ...d,
                changeGiven: +Math.max(
                  0,
                  (d.changeGiven ?? 0) - amount
                ).toFixed(2),
              }
            : d
        );
        set({ drawers: next });
        const updated = next.find((d) => d.status === "open");
        if (updated) void persistDrawer(updated);
      },
      addCashUsed: (_cashierId, amount) => {
        if (!amount || amount <= 0) return;
        const next = get().drawers.map((d) =>
          d.status === "open"
            ? { ...d, cashUsed: +(((d.cashUsed ?? 0) + amount)).toFixed(2) }
            : d
        );
        set({ drawers: next });
        const updated = next.find((d) => d.status === "open");
        if (updated) void persistDrawer(updated);
      },
      requestCashOut: async ({ drawerId, amount, purpose, requestedBy, requestedByName }) => {
        if (!amount || amount <= 0) throw new Error("Enter a valid cash-out amount");
        if (!purpose.trim()) throw new Error("Purpose/reason is required");

        const existing = get().drawers.find((d) => d.id === drawerId);
        if (!existing || existing.status !== "open") {
          throw new Error("No open drawer found for this cash-out request");
        }

        const req: CashOutRequest = {
          id: `co_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          drawerId,
          amount: +amount.toFixed(2),
          purpose: purpose.trim(),
          status: "pending",
          requestedBy,
          requestedByName,
          requestedAt: new Date().toISOString(),
        };

        const updated: CashDrawer = {
          ...existing,
          cashOutRequests: [req, ...(existing.cashOutRequests ?? [])],
        };

        set({ drawers: get().drawers.map((d) => (d.id === drawerId ? updated : d)) });
        const r = await persistDrawer(updated);
        if (!r.ok) throw new Error(r.error ?? "Failed to save cash-out request");

        writeAudit({
          entity: "cash_drawer",
          entityId: drawerId,
          action: "update",
          before: existing,
          after: updated,
          reason: `${requestedByName} requested ${req.amount.toFixed(2)} cash out: ${req.purpose}`,
        });

        return req;
      },
      approveCashOut: async (drawerId, requestId, admin) => {
        const existing = get().drawers.find((d) => d.id === drawerId);
        if (!existing) throw new Error("Drawer not found");

        const requests = existing.cashOutRequests ?? [];
        const target = requests.find((r) => r.id === requestId);
        if (!target) throw new Error("Cash-out request not found");
        if (target.status !== "pending") throw new Error("This request is already decided");

        const updatedRequests = requests.map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: "approved" as const,
                approvedBy: admin.id,
                approvedByName: admin.name,
                approvedAt: new Date().toISOString(),
                adminNote: admin.note ?? r.adminNote ?? null,
              }
            : r
        );

        const approvedTotal = updatedRequests
          .filter((r) => r.status === "approved")
          .reduce((sum, r) => sum + r.amount, 0);

        const updated: CashDrawer = {
          ...existing,
          cashOutRequests: updatedRequests,
          cashUsed: +approvedTotal.toFixed(2),
        };

        set({ drawers: get().drawers.map((d) => (d.id === drawerId ? updated : d)) });
        const save = await persistDrawer(updated);
        if (!save.ok) throw new Error(save.error ?? "Failed to approve cash-out request");

        writeAudit({
          entity: "cash_drawer",
          entityId: drawerId,
          action: "update",
          before: existing,
          after: updated,
          reason: `${admin.name} approved cash-out ${target.amount.toFixed(2)}: ${target.purpose}`,
        });
      },
      rejectCashOut: async (drawerId, requestId, admin) => {
        const existing = get().drawers.find((d) => d.id === drawerId);
        if (!existing) throw new Error("Drawer not found");

        const requests = existing.cashOutRequests ?? [];
        const target = requests.find((r) => r.id === requestId);
        if (!target) throw new Error("Cash-out request not found");
        if (target.status !== "pending") throw new Error("This request is already decided");

        const updatedRequests = requests.map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: "rejected" as const,
                rejectedBy: admin.id,
                rejectedByName: admin.name,
                rejectedAt: new Date().toISOString(),
                adminNote: admin.note ?? r.adminNote ?? null,
              }
            : r
        );

        const approvedTotal = updatedRequests
          .filter((r) => r.status === "approved")
          .reduce((sum, r) => sum + r.amount, 0);

        const updated: CashDrawer = {
          ...existing,
          cashOutRequests: updatedRequests,
          cashUsed: +approvedTotal.toFixed(2),
        };

        set({ drawers: get().drawers.map((d) => (d.id === drawerId ? updated : d)) });
        const save = await persistDrawer(updated);
        if (!save.ok) throw new Error(save.error ?? "Failed to reject cash-out request");

        writeAudit({
          entity: "cash_drawer",
          entityId: drawerId,
          action: "update",
          before: existing,
          after: updated,
          reason: `${admin.name} rejected cash-out ${target.amount.toFixed(2)}: ${target.purpose}`,
        });
      },
      currentForCashier: (cashierId) =>
        get().drawers.find(
          (d) => d.cashierId === cashierId && d.status === "open"
        ),
      currentOpenDrawer: () =>
        get().drawers.find((d) => d.status === "open"),
    }),
    {
      name: "ori-cash-drawers",
      partialize: (state) => ({ drawers: state.drawers }),
    }
  )
);
