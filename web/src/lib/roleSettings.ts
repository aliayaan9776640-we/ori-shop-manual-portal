import { create } from "zustand";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Role } from "@/lib/types";

export interface RolePermissions {
  can_create_purchase: boolean;
  can_create_stock_entry: boolean;
  can_request_approval: boolean;
  can_approve: boolean;
  can_override_limits: boolean;
  can_view_reports: boolean;
  can_edit_after_approval: boolean;
}

export interface RoleSetting {
  role: Role;
  permissions: RolePermissions;
  approvalLimit: number; // 0 = unlimited (admin) or no permission (cashier)
  updatedAt?: string;
}

const DEFAULTS: Record<Role, RoleSetting> = {
  admin: {
    role: "admin",
    permissions: {
      can_create_purchase: true,
      can_create_stock_entry: true,
      can_request_approval: true,
      can_approve: true,
      can_override_limits: true,
      can_view_reports: true,
      can_edit_after_approval: true,
    },
    approvalLimit: 0,
  },
  storekeeper: {
    role: "storekeeper",
    permissions: {
      can_create_purchase: true,
      can_create_stock_entry: true,
      can_request_approval: true,
      can_approve: false,
      can_override_limits: false,
      can_view_reports: false,
      can_edit_after_approval: false,
    },
    approvalLimit: 5000,
  },
  cashier: {
    role: "cashier",
    permissions: {
      can_create_purchase: false,
      can_create_stock_entry: false,
      can_request_approval: true,
      can_approve: false,
      can_override_limits: false,
      can_view_reports: false,
      can_edit_after_approval: false,
    },
    approvalLimit: 0,
  },
};

interface Row {
  role: string;
  permissions: Partial<RolePermissions> | null;
  approval_limit: number | null;
  updated_at?: string;
}

interface State {
  settings: Record<Role, RoleSetting>;
  loaded: boolean;
  load: () => Promise<void>;
  save: (role: Role, patch: Partial<RoleSetting>) => Promise<void>;
  /** Returns true if the given role can self-approve `amount`. */
  canApprove: (role: Role, amount: number) => boolean;
}

export const useRoleSettings = create<State>((set, get) => ({
  settings: { ...DEFAULTS },
  loaded: false,
  load: async () => {
    if (!isSupabaseConfigured) {
      set({ loaded: true });
      return;
    }
    const { data, error } = await supabase
      .from("role_settings")
      .select("role, permissions, approval_limit, updated_at");
    if (error) {
      console.warn("[role_settings.load]", error.message);
      set({ loaded: true });
      return;
    }
    const out = { ...DEFAULTS };
    (data as Row[] | null ?? []).forEach((r) => {
      const role = r.role as Role;
      if (!out[role]) return;
      out[role] = {
        role,
        permissions: { ...DEFAULTS[role].permissions, ...(r.permissions ?? {}) },
        approvalLimit: Number(r.approval_limit ?? DEFAULTS[role].approvalLimit),
        updatedAt: r.updated_at,
      };
    });
    set({ settings: out, loaded: true });
  },
  save: async (role, patch) => {
    const current = get().settings[role];
    const next: RoleSetting = {
      ...current,
      ...patch,
      permissions: { ...current.permissions, ...(patch.permissions ?? {}) },
      role,
    };
    set({ settings: { ...get().settings, [role]: next } });
    if (!isSupabaseConfigured) return;
    const { error } = await supabase
      .from("role_settings")
      .upsert({
        role,
        permissions: next.permissions,
        approval_limit: next.approvalLimit,
        updated_at: new Date().toISOString(),
      });
    if (error) console.warn("[role_settings.save]", error.message);
  },
  canApprove: (role, amount) => {
    const s = get().settings[role];
    if (!s?.permissions.can_approve) return false;
    // 0 = unlimited
    if (s.approvalLimit === 0) return true;
    return amount <= s.approvalLimit;
  },
}));
