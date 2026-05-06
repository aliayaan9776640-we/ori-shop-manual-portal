import { create } from "zustand";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";

export type CreditSendKind = "bill" | "statement" | "reminder";
export type CreditSendStatus = "pending" | "sent" | "failed" | "skipped";

export interface CreditSendItem {
  id: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  amount: number;
  kind: CreditSendKind;
  message: string;
  link: string | null;
  status: CreditSendStatus;
  periodStart: string | null;
  periodEnd: string | null;
  sentAt: string | null;
  sentBy: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface SendsState {
  items: CreditSendItem[];
  loading: boolean;
  tableMissing: boolean;
  load: () => Promise<void>;
  enqueue: (
    payload: Omit<
      CreditSendItem,
      "id" | "status" | "sentAt" | "sentBy" | "createdBy" | "createdAt" | "periodStart" | "periodEnd"
    > & { periodStart?: string; periodEnd?: string }
  ) => Promise<{ ok: boolean; id?: string }>;
  markSent: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

interface Row {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  amount: number | null;
  kind: CreditSendKind;
  message: string | null;
  link: string | null;
  status: CreditSendStatus;
  period_start: string | null;
  period_end: string | null;
  sent_at: string | null;
  sent_by: string | null;
  created_by: string | null;
  created_at: string;
}

const fromRow = (r: Row): CreditSendItem => ({
  id: r.id,
  customerId: r.customer_id,
  customerName: r.customer_name ?? "",
  customerPhone: r.customer_phone,
  amount: Number(r.amount ?? 0),
  kind: r.kind,
  message: r.message ?? "",
  link: r.link,
  status: r.status,
  periodStart: r.period_start,
  periodEnd: r.period_end,
  sentAt: r.sent_at,
  sentBy: r.sent_by,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

const TABLE_MISSING = /credit_send_queue|schema cache|relation .* does not exist/i;

export const useCreditSends = create<SendsState>()((set, get) => ({
  items: [],
  loading: false,
  tableMissing: false,
  load: async () => {
    if (!isSupabaseConfigured) return;
    set({ loading: true });
    const { data, error } = await supabase
      .from("credit_send_queue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    set({ loading: false });
    if (error) {
      if (TABLE_MISSING.test(error.message)) {
        console.warn("[credit_send_queue] table missing — apply migration 0009");
        set({ tableMissing: true });
        return;
      }
      console.error("[credit_send_queue] load error", error);
      return;
    }
    set({ items: (data as Row[] | null)?.map(fromRow) ?? [], tableMissing: false });
  },
  enqueue: async (payload) => {
    if (!isSupabaseConfigured) {
      toast.error("Cannot queue — Supabase not configured");
      return { ok: false };
    }
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id ?? null;
    const insert = {
      customer_id: payload.customerId,
      customer_name: payload.customerName,
      customer_phone: payload.customerPhone,
      amount: payload.amount,
      kind: payload.kind,
      message: payload.message,
      link: payload.link,
      status: "pending" as CreditSendStatus,
      period_start: payload.periodStart ?? null,
      period_end: payload.periodEnd ?? null,
      created_by: uid,
    };
    const { data, error } = await supabase
      .from("credit_send_queue")
      .insert(insert)
      .select()
      .single();
    if (error) {
      if (TABLE_MISSING.test(error.message)) {
        set({ tableMissing: true });
        toast.error("Run migration 0009_credit_billing.sql in Supabase first");
      } else {
        console.error("[credit_send_queue] insert error", error);
        toast.error("Could not queue send");
      }
      return { ok: false };
    }
    const row = fromRow(data as Row);
    set({ items: [row, ...get().items] });
    return { ok: true, id: row.id };
  },
  markSent: async (id) => {
    if (!isSupabaseConfigured) return;
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id ?? null;
    const sentAt = new Date().toISOString();
    set({
      items: get().items.map((x) =>
        x.id === id ? { ...x, status: "sent", sentAt, sentBy: uid } : x
      ),
    });
    const { error } = await supabase
      .from("credit_send_queue")
      .update({ status: "sent", sent_at: sentAt, sent_by: uid })
      .eq("id", id);
    if (error) console.error("[credit_send_queue] markSent error", error);
  },
  remove: async (id) => {
    set({ items: get().items.filter((x) => x.id !== id) });
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.from("credit_send_queue").delete().eq("id", id);
    if (error) console.error("[credit_send_queue] delete error", error);
  },
}));
