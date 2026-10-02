import { useEffect, useState } from "react";
import { customerSupabase, isSupabaseConfigured } from "@/lib/supabase";

type Credit = { id: string; credit_limit: number; balance: number };
export function useCheckoutCredit(open: boolean, name?: string, phone?: string) {
  const [state, setState] = useState<{ credit: Credit | null; error: string | null; checking: boolean }>({ credit: null, error: null, checking: true });
  useEffect(() => {
    let active = true;
    let running = false;
    let queued = false;
    let channel: ReturnType<typeof customerSupabase.channel> | undefined;
    let subscribedId: string | undefined;
    setState({ credit: null, error: null, checking: open });
    if (!open || !name || !phone || !isSupabaseConfigured) return;
    const refresh = async () => {
      if (!active || document.visibilityState === "hidden") return;
      if (running) { queued = true; return; }
      running = true;
      try {
        const { data, error } = await customerSupabase.rpc("match_approved_credit_customer", { p_name: name, p_phone: phone });
        if (!active) return;
        if (error) throw error;
        const credit = Array.isArray(data) ? data[0] as Credit | undefined : undefined;
        setState({ credit: credit ?? null, error: null, checking: false });
        if (credit?.id && credit.id !== subscribedId) {
          if (channel) void customerSupabase.removeChannel(channel);
          subscribedId = credit.id;
          channel = customerSupabase.channel(`checkout-credit-${crypto.randomUUID()}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "credit_refresh_signals", filter: `customer_id=eq.${credit.id}` }, () => void refresh())
            .subscribe(status => { if (status === "SUBSCRIBED") void refresh(); });
        }
      } catch {
        if (active) setState({ credit: null, error: "Unable to refresh credit. Check your connection; retrying automatically.", checking: false });
      } finally {
        running = false;
        if (active && queued) { queued = false; void refresh(); }
      }
    };
    void refresh();
    const onResume = () => { void refresh(); };
    const timer = window.setInterval(onResume, 5000);
    window.addEventListener("focus", onResume);
    window.addEventListener("online", onResume);
    document.addEventListener("visibilitychange", onResume);
    return () => {
      active = false; window.clearInterval(timer);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("online", onResume);
      document.removeEventListener("visibilitychange", onResume);
      if (channel) void customerSupabase.removeChannel(channel);
    };
  }, [open, name, phone]);
  return state;
}
