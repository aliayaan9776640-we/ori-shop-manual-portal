import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";

/** Invalidate authorized credit reads on foreground and polling. */
export function useCreditRefresh(enabled: boolean) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled || !isSupabaseConfigured) return;
    let active = true;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (!active || document.visibilityState === "hidden") return;
      clearTimeout(debounce);
      debounce = setTimeout(() => { if (active) setRevision(v => v + 1); }, 150);
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false; clearTimeout(debounce); clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);

    };
  }, [enabled]);
  return revision;
}
