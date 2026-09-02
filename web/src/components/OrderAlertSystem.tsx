import { useEffect, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  Minus,
  PackageCheck,
  ShoppingBag,
  Volume2,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/store";

type Counts = {
  online: number;
  preorder: number;
};

const ALERT_SOUND_PATH = "/sounds/order-alert.mp3";

export default function OrderAlertSystem() {
  const me = useCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();

  const [counts, setCounts] = useState<Counts>({ online: 0, preorder: 0 });
  const [muted, setMuted] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [lastChecked, setLastChecked] = useState<string>("");
  const [minimized, setMinimized] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onlineAcknowledgedRef = useRef(false);
  const preorderAcknowledgedRef = useRef(false);

  const totalPending = counts.online + counts.preorder;
  const hasPending = totalPending > 0;

  // Staff only. Customers/public pages will not see or hear this alert.
  const isStaffAllowed =
    me?.active === true && (me.role === "cashier" || me.role === "admin");

  const isCustomerOrPublicPage =
    location.pathname === "/" ||
    location.pathname.startsWith("/store") ||
    location.pathname.startsWith("/pre-orders") ||
    location.pathname.startsWith("/customer-login") ||
    location.pathname.startsWith("/profile") ||
    location.pathname.startsWith("/customer-profile") ||
    location.pathname.startsWith("/payment-success") ||
    location.pathname.startsWith("/payment-failed") ||
    location.pathname.startsWith("/bill/");

  const stopSoundLoop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };
  useEffect(() => {
    const handleOrderOpened = (event: Event) => {
      const customEvent = event as CustomEvent<{ type?: string }>;
      const type = customEvent.detail?.type;

      stopSoundLoop();

      if (type === "online") {
        onlineAcknowledgedRef.current = true;
        setCounts((prev) => ({ ...prev, online: 0 }));
      }

      if (type === "preorder") {
        preorderAcknowledgedRef.current = true;
        setCounts((prev) => ({ ...prev, preorder: 0 }));
      }

      setMinimized(true);
    };

    window.addEventListener("ori:order-opened", handleOrderOpened);

    return () => {
      window.removeEventListener("ori:order-opened", handleOrderOpened);
    };
  }, []);
  const playSound = async () => {
    if (muted || !isStaffAllowed || isCustomerOrPublicPage) return;

    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(ALERT_SOUND_PATH);
      }

      audioRef.current.currentTime = 0;
      audioRef.current.volume = 0.9;
      await audioRef.current.play();
      setAudioReady(true);
      return;
    } catch {
      setAudioReady(false);
    }

    // Browser fallback beep if MP3 cannot play
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;

      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.value = 0.15;

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.35);
    } catch {
      // ignore
    }
  };

  const unlockAudio = async () => {
    if (!isStaffAllowed || isCustomerOrPublicPage) return;

    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(ALERT_SOUND_PATH);
      }

      audioRef.current.volume = 0.9;
      await audioRef.current.play();
      audioRef.current.pause();
      audioRef.current.currentTime = 0;

      setAudioReady(true);
      toast.success("Alert sound enabled");
    } catch {
      setAudioReady(false);
      toast.message("Browser blocked sound", {
        description: "Click again or interact with the page once.",
      });
    }
  };

  const countOnlineOrders = async (): Promise<number> => {
    const statuses = ["pending", "new", "submitted"];
    const result = await supabase
      .from("online_orders")
      .select("id", { count: "exact", head: true })
      .in("status", statuses);

    return result.error ? 0 : result.count ?? 0;
  };

  const countPreOrders = async (): Promise<number> => {
    const tables = ["preorder_orders", "pre_orders"];

    for (const table of tables) {
      const orderPending = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("order_status", "pending");

      if (!orderPending.error) {
        return orderPending.count ?? 0;
      }

      const statusPending = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      if (!statusPending.error) {
        return statusPending.count ?? 0;
      }
    }

    return 0;
  };

  const loadCounts = async () => {
    if (!isSupabaseConfigured || !isStaffAllowed || isCustomerOrPublicPage) {
      return;
    }

    const [online, preorder] = await Promise.all([
      countOnlineOrders(),
      countPreOrders(),
    ]);

    setCounts({
      online: onlineAcknowledgedRef.current ? 0 : online,
      preorder: preorderAcknowledgedRef.current ? 0 : preorder,
    });
    setLastChecked(new Date().toLocaleTimeString());
  };

  useEffect(() => {
    if (!isStaffAllowed || isCustomerOrPublicPage) {
      stopSoundLoop();
      return;
    }

    audioRef.current = new Audio(ALERT_SOUND_PATH);

    const enableAudio = () => {
      void unlockAudio();
      window.removeEventListener("click", enableAudio);
      window.removeEventListener("keydown", enableAudio);
    };

    window.addEventListener("click", enableAudio);
    window.addEventListener("keydown", enableAudio);

    return () => {
      window.removeEventListener("click", enableAudio);
      window.removeEventListener("keydown", enableAudio);
      stopSoundLoop();
    };
  }, [isStaffAllowed, isCustomerOrPublicPage]);

  useEffect(() => {
    if (!isSupabaseConfigured || !isStaffAllowed || isCustomerOrPublicPage) {
      stopSoundLoop();
      return;
    }

    void loadCounts();

    const channel = supabase
      .channel("staff-order-alerts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "online_orders" },
        (payload) => {
          void loadCounts();

          if (payload.eventType === "INSERT") {
            onlineAcknowledgedRef.current = false;
            setMinimized(true);
            toast.success("New Online Order Received", {
              description: "Open Online Orders to attend.",
            });
            void playSound();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "preorder_orders" },
        (payload) => {
          void loadCounts();

          if (payload.eventType === "INSERT") {
            preorderAcknowledgedRef.current = false;
            setMinimized(true);
            toast.success("New Pre-Order Received", {
              description: "Open Pre-Order Admin to attend.",
            });
            void playSound();
          }
        }
      )
      .subscribe();

    const refreshTimer = window.setInterval(() => {
      void loadCounts();
    }, 5000);

    return () => {
      window.clearInterval(refreshTimer);
      void supabase.removeChannel(channel);
      stopSoundLoop();
    };
  }, [isStaffAllowed, isCustomerOrPublicPage]);

  useEffect(() => {
    if (!isStaffAllowed || isCustomerOrPublicPage) {
      stopSoundLoop();
      return;
    }

    const onOnlineOrdersPage = location.pathname.includes("online-orders");
    const onPreorderPage =
      location.pathname.includes("preorder-admin") ||
      location.pathname.includes("pre-order-admin");

    if (muted || onOnlineOrdersPage || onPreorderPage) {
      stopSoundLoop();
      if (onOnlineOrdersPage || onPreorderPage) void loadCounts();
    }
  }, [
    muted,
    location.pathname,
    isStaffAllowed,
    isCustomerOrPublicPage,
  ]);

  const isPosPage = location.pathname === "/sales";

  if (!isStaffAllowed || isCustomerOrPublicPage || isPosPage || !hasPending) {
    return null;
  }

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => {
          stopSoundLoop();
          if (counts.online > 0) {
            onlineAcknowledgedRef.current = true;
            setCounts((prev) => ({ ...prev, online: 0 }));
            navigate("/online-orders");
          } else {
            preorderAcknowledgedRef.current = true;
            setCounts((prev) => ({ ...prev, preorder: 0 }));
            navigate("/preorder-admin");
          }
        }}
        className="fixed left-2 right-2 top-[4.5rem] z-[9999] flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-700 to-orange-500 px-4 py-2 text-sm font-extrabold text-white shadow-xl ring-2 ring-white hover:opacity-95 sm:left-auto sm:right-6 sm:w-auto sm:min-w-72"
        title="Open and attend pending orders"
      >
        <Bell className="h-5 w-5 shrink-0" />
        <span>{counts.online > 0 ? "Online order alert" : "Pre-order alert"}</span>
        <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-extrabold text-white">
          {counts.online > 0 ? counts.online : counts.preorder}
        </span>
        <span className="text-xs font-semibold text-white/90">Open &amp; attend</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9999] max-h-[calc(100dvh-2rem)] overflow-auto rounded-2xl border border-orange-200 bg-white shadow-2xl sm:left-auto sm:right-6 sm:w-[340px]">
      <div className="flex items-center justify-between bg-gradient-to-r from-emerald-700 to-orange-500 px-4 py-3 text-white">
        <div className="flex items-center gap-2 text-sm font-extrabold">
          <Bell className="h-5 w-5 animate-pulse" />
          Order Alerts
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void playSound()}
            className="rounded-full bg-white/20 p-1.5 hover:bg-white/30"
            title="Test sound"
          >
            <Volume2 className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setMuted((v) => !v)}
            className="rounded-full bg-white/20 p-1.5 hover:bg-white/30"
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? (
              <BellOff className="h-4 w-4" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="rounded-full bg-white/20 p-1.5 hover:bg-white/30"
            title="Minimize"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {!audioReady && !muted && (
          <button
            type="button"
            onClick={() => void unlockAudio()}
            className="w-full rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 ring-1 ring-amber-200"
          >
            Click to enable alert sound
          </button>
        )}

        {counts.online > 0 && (
          <button
            type="button"
            onClick={() => {
              stopSoundLoop();
              navigate("/online-orders");
            }}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left hover:bg-orange-50"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <ShoppingBag className="h-5 w-5 text-orange-500" />
              Online Orders
            </span>

            <span className="rounded-full bg-orange-500 px-2.5 py-1 text-xs font-extrabold text-white">
              {counts.online}
            </span>
          </button>
        )}

        {counts.preorder > 0 && (
          <button
            type="button"
            onClick={() => {
              stopSoundLoop();
              navigate("/preorder-admin");
            }}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left hover:bg-emerald-50"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <PackageCheck className="h-5 w-5 text-emerald-600" />
              Pre-Orders
            </span>

            <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-extrabold text-white">
              {counts.preorder}
            </span>
          </button>
        )}

        <div className="text-center text-[11px] text-slate-400">
          Last checked: {lastChecked || "checking..."}
        </div>
      </div>
    </div>
  );
}
