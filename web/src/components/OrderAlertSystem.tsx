import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, ShoppingBag, PackageCheck, Volume2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

type Counts = {
  online: number;
  preorder: number;
};

const ALERT_SOUND_PATH = "/sounds/order-alert.mp3";

export default function OrderAlertSystem() {
  const [counts, setCounts] = useState<Counts>({ online: 0, preorder: 0 });
  const [muted, setMuted] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [lastChecked, setLastChecked] = useState<string>("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);

  const location = useLocation();
  const navigate = useNavigate();

  const hasPending = counts.online > 0 || counts.preorder > 0;

  const stopSoundLoop = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const playSound = async () => {
    if (muted) return;

    try {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.volume = 0.9;
        await audioRef.current.play();
        setAudioReady(true);
        return;
      }
    } catch {
      setAudioReady(false);
    }

    // Browser fallback beep if MP3 cannot play
    try {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

  const startSoundLoop = () => {
    if (muted || intervalRef.current) return;

    void playSound();

    intervalRef.current = window.setInterval(() => {
      void playSound();
    }, 7000);
  };

  const unlockAudio = async () => {
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

    for (const status of statuses) {
      const res = await supabase
        .from("online_orders")
        .select("id", { count: "exact", head: true })
        .eq("status", status);

      if (!res.error && typeof res.count === "number" && res.count > 0) {
        return res.count;
      }
    }

    const fallback = await supabase
      .from("online_orders")
      .select("id", { count: "exact", head: true })
      .not("status", "in", "(accepted,rejected,delivered,cancelled)");

    return fallback.count ?? 0;
  };

  const countPreOrders = async (): Promise<number> => {
    const tables = ["preorder_orders", "pre_orders", "pre_orders_orders"];

    for (const table of tables) {
      const exactPending = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("payment_status", "pending");

      if (!exactPending.error) {
        return exactPending.count ?? 0;
      }

      const orderPending = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("order_status", "pending");

      if (!orderPending.error) {
        return orderPending.count ?? 0;
      }

      const trackingPending = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("tracking_status", "pending");

      if (!trackingPending.error) {
        return trackingPending.count ?? 0;
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
    if (!isSupabaseConfigured) return;

    const [online, preorder] = await Promise.all([
      countOnlineOrders(),
      countPreOrders(),
    ]);

    setCounts({ online, preorder });
    setLastChecked(new Date().toLocaleTimeString());
  };

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    void loadCounts();

    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel("order-alerts-all-tables")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "online_orders" },
        (payload) => {
          void loadCounts();

          if (payload.eventType === "INSERT") {
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
            toast.success("New Pre-Order Received", {
              description: "Open Pre-Order Admin to attend.",
            });
            void playSound();
          }
        }
      )
      .subscribe();

    // Polling fallback. This works even if Supabase realtime is not enabled.
    const refreshTimer = window.setInterval(() => {
      void loadCounts();
    }, 5000);

    return () => {
      window.clearInterval(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const onOnlineOrdersPage = location.pathname.includes("online-orders");
    const onPreorderPage = location.pathname.includes("preorder-admin");

    if (onOnlineOrdersPage || onPreorderPage) {
      stopSoundLoop();
      void loadCounts();
      return;
    }

    if (hasPending && !muted) {
      startSoundLoop();
    } else {
      stopSoundLoop();
    }
  }, [counts.online, counts.preorder, muted, location.pathname]);

  if (!hasPending) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] w-[340px] overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-2xl">
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
            {muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
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
             void navigate("/online-orders");
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
              void navigate("/preorder-admin");
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