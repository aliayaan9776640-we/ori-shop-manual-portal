import { create } from "zustand";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useStore } from "@/lib/store";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "approve"
  | "reject"
  | "other";

export interface AuditLog {
  id: string;
  entity: string;
  entityId: string | null;
  action: AuditAction;
  performedBy: string | null;
  performedByName: string | null;
  beforeValue: unknown;
  afterValue: unknown;
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditRow {
  id: string;
  entity: string;
  entity_id: string | null;
  action: string;
  performed_by: string | null;
  performed_by_name: string | null;
  before_value: unknown;
  after_value: unknown;
  reason: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

const fromRow = (r: AuditRow): AuditLog => ({
  id: r.id,
  entity: r.entity,
  entityId: r.entity_id,
  action: (r.action as AuditAction) ?? "other",
  performedBy: r.performed_by,
  performedByName: r.performed_by_name,
  beforeValue: r.before_value,
  afterValue: r.after_value,
  reason: r.reason,
  ip: r.ip,
  userAgent: r.user_agent,
  createdAt: r.created_at,
});

interface AuditState {
  logs: AuditLog[];
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  loadFor: (entity: string, entityId: string) => Promise<AuditLog[]>;
}

export const useAuditLogs = create<AuditState>((set) => ({
  logs: [],
  loaded: false,
  loading: false,
  load: async () => {
    if (!isSupabaseConfigured) {
      set({ loaded: true });
      return;
    }
    set({ loading: true });
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      console.warn("[audit_logs.load]", error.message);
      set({ loading: false, loaded: true });
      return;
    }
    set({
      logs: (data as AuditRow[] | null ?? []).map(fromRow),
      loaded: true,
      loading: false,
    });
  },
  loadFor: async (entity, entityId) => {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("entity", entity)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[audit_logs.loadFor]", error.message);
      return [];
    }
    return (data as AuditRow[] | null ?? []).map(fromRow);
  },
}));

interface WriteArgs {
  entity: string;
  entityId?: string | null;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

/**
 * Append an audit entry. Append-only — no updates allowed by RLS.
 * Failures are logged to console; never throw to caller.
 */
export const writeAudit = (args: WriteArgs): void => {
  const me = useStore
    .getState()
    .users.find((u) => u.id === useStore.getState().currentUserId);
  const ua =
    typeof navigator !== "undefined" ? navigator.userAgent ?? null : null;
  if (!isSupabaseConfigured) return;
  void supabase
    .from("audit_logs")
    .insert({
      entity: args.entity,
      entity_id: args.entityId ?? null,
      action: args.action,
      performed_by: me?.id ?? null,
      performed_by_name: me?.fullName ?? null,
      before_value: args.before ?? null,
      after_value: args.after ?? null,
      reason: args.reason ?? null,
      user_agent: ua,
    })
    .then(({ error }) => {
      if (error) console.warn("[audit_logs.insert]", error.message);
    });
};
