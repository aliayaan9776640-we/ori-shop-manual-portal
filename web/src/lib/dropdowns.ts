import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/**
 * Admin-managed dropdown lists. Stored in Supabase `dropdown_options`,
 * cached locally so the app continues to work offline.
 */
export type DropdownGroup =
  // Product
  | "product_category"
  | "unit_type"
  | "gst_applicable"
  | "supplier"
  // Sales / POS
  | "payment_method"
  | "discount_reason"
  | "plastic_bag_option"
  // Damage
  | "damage_reason"
  | "damage_unit_type"
  // Orders
  | "order_status"
  | "boat_name"
  | "supplier_order_status"
  // Credit Customers
  | "customer_status"
  | "credit_approval_status"
  | "credit_payment_type";

export interface DropdownOption {
  id: string;
  groupKey: DropdownGroup;
  label: string;
  value: string;
  sortOrder: number;
  active: boolean;
}

export interface DropdownState {
  options: DropdownOption[];
  loaded: boolean;
  loadError: string | null;
  load: () => Promise<void>;
  add: (groupKey: DropdownGroup, label: string, value?: string) => Promise<void>;
  update: (id: string, patch: Partial<Pick<DropdownOption, "label" | "value" | "sortOrder" | "active">>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  byGroup: (groupKey: DropdownGroup) => DropdownOption[];
}

export const DEFAULTS: Record<DropdownGroup, { label: string; value: string }[]> = {
  product_category: [
    { label: "Grocery", value: "grocery" },
    { label: "Beverages", value: "beverages" },
    { label: "Frozen", value: "frozen" },
    { label: "Household", value: "household" },
  ],
  unit_type: [
    { label: "Piece", value: "piece" },
    { label: "Kilogram", value: "kg" },
    { label: "Tin", value: "tin" },
    { label: "Box", value: "box" },
    { label: "Case", value: "case" },
  ],
  gst_applicable: [
    { label: "Yes", value: "yes" },
    { label: "No", value: "no" },
  ],
  supplier: [],
  payment_method: [
    { label: "Cash", value: "cash" },
    { label: "Card", value: "card" },
    { label: "Bank Transfer", value: "bank" },
    { label: "Credit", value: "credit" },
  ],
  discount_reason: [
    { label: "Loyal Customer", value: "loyal" },
    { label: "Bulk Purchase", value: "bulk" },
    { label: "Damaged Packaging", value: "damaged" },
    { label: "Promotion", value: "promotion" },
  ],
  plastic_bag_option: [
    { label: "Small Bag", value: "small" },
    { label: "Large Bag", value: "large" },
    { label: "No Bag", value: "none" },
  ],
  damage_reason: [
    { label: "Expired", value: "expired" },
    { label: "Broken", value: "broken" },
    { label: "Spoiled", value: "spoiled" },
    { label: "Lost", value: "lost" },
  ],
  damage_unit_type: [
    { label: "Piece", value: "piece" },
    { label: "Kilogram", value: "kg" },
    { label: "Box", value: "box" },
    { label: "Case", value: "case" },
  ],
  order_status: [
    { label: "Pending", value: "pending" },
    { label: "Loaded", value: "loaded" },
    { label: "Received", value: "received" },
    { label: "Partial", value: "partial" },
    { label: "Cancelled", value: "cancelled" },
  ],
  boat_name: [],
  supplier_order_status: [
    { label: "Sent", value: "sent" },
    { label: "Acknowledged", value: "acknowledged" },
    { label: "Shipped", value: "shipped" },
    { label: "Delivered", value: "delivered" },
  ],
  customer_status: [
    { label: "Active", value: "active" },
    { label: "Inactive", value: "inactive" },
    { label: "Blocked", value: "blocked" },
  ],
  credit_approval_status: [
    { label: "Pending", value: "pending" },
    { label: "Approved", value: "approved" },
    { label: "Rejected", value: "rejected" },
  ],
  credit_payment_type: [
    { label: "Cash", value: "cash" },
    { label: "Bank Transfer", value: "bank" },
    { label: "Card", value: "card" },
  ],
};

const slug = (s: string): string =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const seedDefaults = (): DropdownOption[] => {
  const out: DropdownOption[] = [];
  let i = 0;
  (Object.keys(DEFAULTS) as DropdownGroup[]).forEach((g) => {
    DEFAULTS[g].forEach((o, idx) => {
      out.push({
        id: `local-${g}-${idx}`,
        groupKey: g,
        label: o.label,
        value: o.value,
        sortOrder: idx,
        active: true,
      });
      i += 1;
    });
  });
  console.log(`[dropdowns] seeded ${i} default options`);
  return out;
};

export const useDropdowns = create<DropdownState>()(
  persist(
    (set, get) => ({
      options: seedDefaults(),
      loaded: false,
      loadError: null,
      load: async () => {
        if (!isSupabaseConfigured) {
          set({ loaded: true, loadError: "Supabase not configured" });
          throw new Error("Supabase not configured");
        }
        try {
          const { data, error } = await supabase
            .from("dropdown_options")
            .select("id, group_key, label, value, sort_order, active")
            .order("group_key", { ascending: true })
            .order("sort_order", { ascending: true });
          if (error) {
            // Treat "table missing" (PGRST205 / 404) as non-fatal: app keeps
            // working with seeded defaults until the migration is applied.
            const code = (error as { code?: string }).code;
            const missing = code === "PGRST205" || /schema cache|does not exist|relation .* does not exist/i.test(error.message);
            if (missing) {
              console.warn("[dropdowns] dropdown_options table missing \u2014 using seeded defaults");
              set({ loaded: true, loadError: "dropdown_options table missing" });
              return;
            }
            console.error("[dropdowns] load error", error);
            set({ loadError: error.message });
            throw error;
          }
          if (data && data.length > 0) {
            const mapped: DropdownOption[] = data.map((r) => ({
              id: String(r.id),
              groupKey: r.group_key as DropdownGroup,
              label: String(r.label),
              value: String(r.value),
              sortOrder: Number(r.sort_order ?? 0),
              active: Boolean(r.active),
            }));
            set({ options: mapped, loaded: true, loadError: null });
          } else {
            // No remote rows yet — keep seeded defaults but mark loaded.
            set({ loaded: true, loadError: null });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[dropdowns] load exception", e);
          set({ loadError: msg });
          throw e;
        }
      },
      add: async (groupKey, label, value) => {
        const v = (value && value.length > 0 ? value : slug(label)) || label;
        const sortOrder =
          get().options.filter((o) => o.groupKey === groupKey).length;
        if (!isSupabaseConfigured) {
          set((s) => ({
            options: [
              ...s.options,
              {
                id: `local-${Date.now()}`,
                groupKey,
                label,
                value: v,
                sortOrder,
                active: true,
              },
            ],
          }));
          return;
        }
        const { data, error } = await supabase
          .from("dropdown_options")
          .insert({ group_key: groupKey, label, value: v, sort_order: sortOrder, active: true })
          .select("id, group_key, label, value, sort_order, active")
          .single();
        if (error) {
          console.error("[dropdowns] add error", error);
          throw error;
        }
        if (data) {
          set((s) => ({
            options: [
              ...s.options,
              {
                id: String(data.id),
                groupKey: data.group_key as DropdownGroup,
                label: String(data.label),
                value: String(data.value),
                sortOrder: Number(data.sort_order ?? 0),
                active: Boolean(data.active),
              },
            ],
          }));
        }
        // Refresh from DB to keep local state authoritative.
        await get().load();
      },
      update: async (id, patch) => {
        if (!isSupabaseConfigured || id.startsWith("local-")) {
          set((s) => ({
            options: s.options.map((o) => (o.id === id ? { ...o, ...patch } : o)),
          }));
          return;
        }
        const dbPatch: Record<string, unknown> = {};
        if (patch.label !== undefined) dbPatch.label = patch.label;
        if (patch.value !== undefined) dbPatch.value = patch.value;
        if (patch.sortOrder !== undefined) dbPatch.sort_order = patch.sortOrder;
        if (patch.active !== undefined) dbPatch.active = patch.active;
        const { error } = await supabase
          .from("dropdown_options")
          .update(dbPatch)
          .eq("id", id);
        if (error) {
          console.error("[dropdowns] update error", error);
          throw error;
        }
        set((s) => ({
          options: s.options.map((o) => (o.id === id ? { ...o, ...patch } : o)),
        }));
        await get().load();
      },
      remove: async (id) => {
        if (!isSupabaseConfigured || id.startsWith("local-")) {
          set((s) => ({ options: s.options.filter((o) => o.id !== id) }));
          return;
        }
        const { error } = await supabase
          .from("dropdown_options")
          .delete()
          .eq("id", id);
        if (error) {
          console.error("[dropdowns] remove error", error);
          throw error;
        }
        set((s) => ({ options: s.options.filter((o) => o.id !== id) }));
        await get().load();
      },
      byGroup: (groupKey) =>
        get()
          .options.filter((o) => o.groupKey === groupKey && o.active)
          .sort((a, b) => a.sortOrder - b.sortOrder),
    }),
    { name: "ori-dropdown-options", version: 1 }
  )
);

/**
 * Reactive hook that returns the active options of a dropdown group sorted by
 * `sortOrder`. The returned array is memoised against the underlying options
 * store reference so React doesn't see a new array each render (which would
 * trigger error #185).
 */
export function useDropdownGroup(group: DropdownGroup): DropdownOption[] {
  const all = useDropdowns((s) => s.options);
  return useMemo(
    () =>
      all
        .filter((o) => o.groupKey === group && o.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [all, group]
  );
}

/**
 * Reactive helper for status/label resolution. Returns the active label for a
 * stored value, falling back to the value itself so that records saved with a
 * since-renamed/disabled option still render correctly.
 */
export function useDropdownLabel(group: DropdownGroup, value: string | undefined | null): string {
  const all = useDropdowns((s) => s.options);
  return useMemo(() => {
    if (!value) return "";
    const match = all.find((o) => o.groupKey === group && o.value === value);
    return match?.label ?? value;
  }, [all, group, value]);
}
