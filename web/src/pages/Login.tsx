import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/lib/store";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  Lock,
  Mail,
  AlertCircle,
  Briefcase,
  ShoppingBag,
  ArrowRight,
  UserPlus,
  Store as StoreIcon,
  LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Mode = "choose" | "employee";

export default function Login() {
  const login = useStore((s) => s.login);
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await login(email.trim(), password);
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "Login failed");
      return;
    }
    navigate("/");
  };

  const onForgot = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      toast.error("Supabase is not configured.");
      return;
    }
    const target = (
      email ||
      window.prompt("Enter your account email to receive a reset link:") ||
      ""
    ).trim();
    if (!target) return;
    const redirectTo = `${window.location.origin}/reset-password`;
    console.log("[forgot-password] sending reset for", target, "redirectTo", redirectTo);
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(target, {
      redirectTo,
    });
    if (resetErr) {
      toast.error(resetErr.message);
      return;
    }
    toast.success(`Reset link sent to ${target}. Check your inbox.`);
  };

  const watermarkUrl = `/icon.png`;

  return (
    <div className="relative grid min-h-screen lg:grid-cols-2">
      {/* Centered watermark across the whole login screen */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
      >
        <img
          src={watermarkUrl}
          alt=""
          className="w-[70%] max-w-[520px] opacity-10 mix-blend-multiply select-none"
          draggable={false}
        />
      </div>
      {/* Left brand panel */}
      <div className="relative hidden overflow-hidden bg-[hsl(80,25%,10%)] text-white lg:block">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, hsl(25 90% 55% / 0.35), transparent 45%), radial-gradient(circle at 80% 80%, hsl(75 50% 35% / 0.35), transparent 45%)",
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,hsl(80,25%,7%)_100%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500 text-white shadow-lg">
              <Briefcase className="h-6 w-6" />
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight">Ori Barakah Store</div>
              <div className="text-xs uppercase tracking-widest text-white/60">
                Ori Brothers · Since 2025
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h1 className="text-4xl font-bold leading-tight">
              Run your shop with{" "}
              <span className="bg-gradient-to-r from-orange-300 to-orange-500 bg-clip-text text-transparent">
                clarity & barakah.
              </span>
            </h1>
            <p className="max-w-md text-base text-white/70">
              Inventory, sales, supplier orders, boat loading, and credit customers — one
              secure portal for the whole team.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {[
                { k: "Live", v: "Stock tracking" },
                { k: "1-Tap", v: "Viber orders" },
                { k: "Auto", v: "Profit calc" },
                { k: "Role", v: "Based access" },
              ].map((b) => (
                <div
                  key={b.v}
                  className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur"
                >
                  <div className="text-2xl font-bold text-orange-400">{b.k}</div>
                  <div className="text-sm text-white/70">{b.v}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-white/50">
            © {new Date().getFullYear()} Ori Barakah Store · Ori Brothers
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="relative z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 rounded-2xl border border-orange-100 bg-[hsl(80,25%,10%)] p-5 text-white lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-white shadow">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold">Ori Barakah Store</div>
              <div className="text-xs uppercase tracking-widest text-white/60">
                Ori Brothers · Portal
              </div>
            </div>
          </div>

          {mode === "choose" ? (
            <ChooseAccess onEmployee={() => setMode("employee")} />
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setMode("choose");
                  setError(null);
                }}
                className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                ← Back
              </button>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                <Briefcase className="h-3.5 w-3.5" />
                Employee Portal
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Sign in to your account</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                For Admin, Cashier, Storekeeper and Delivery staff.
              </p>

              <form onSubmit={onSubmit} className="mt-8 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@oribrothers.com"
                      autoComplete="email"
                      className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Briefcase className="mr-2 h-4 w-4" />
                  {loading ? "Signing in..." : "Login as Employee"}
                </Button>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={onForgot}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              </form>

              {!isSupabaseConfigured && (
                <div className="mt-8 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  Supabase is not configured. Login is disabled until
                  <code className="mx-1 rounded bg-destructive/20 px-1 py-0.5 text-xs">
                    VITE_SUPABASE_URL
                  </code>
                  and
                  <code className="mx-1 rounded bg-destructive/20 px-1 py-0.5 text-xs">
                    VITE_SUPABASE_ANON_KEY
                  </code>
                  are set.
                </div>
              )}
              {isSupabaseConfigured && (
                <p className="mt-6 text-xs text-muted-foreground">
                  Connected to Supabase · ask your admin to create your account.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Access chooser: separates Employee vs. Customer entry points.       */
/* ------------------------------------------------------------------ */

function ChooseAccess({ onEmployee }: { onEmployee: () => void }) {
  const navigate = useNavigate();
  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight">Welcome 👋</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose how you want to continue.
      </p>

      <div className="mt-8 grid gap-4">
        {/* Employee card */}
        <button
          type="button"
          onClick={onEmployee}
          className={cn(
            "group relative overflow-hidden rounded-2xl border-2 border-transparent bg-gradient-to-br from-[hsl(80,25%,10%)] to-[hsl(80,25%,16%)]",
            "p-5 text-left text-white shadow-lg transition",
            "hover:-translate-y-0.5 hover:border-orange-400 hover:shadow-xl",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
          )}
        >
          <div
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "radial-gradient(circle at 90% 10%, hsl(25 90% 55% / 0.35), transparent 50%)",
            }}
          />
          <div className="relative flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-500/90 text-white shadow-inner">
              <Briefcase className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-orange-300">
                Staff
              </div>
              <div className="mt-0.5 text-lg font-bold">Employee Login</div>
              <div className="mt-1 text-sm text-white/70">
                Admin · Cashier · Storekeeper · Delivery
              </div>
            </div>
            <ArrowRight className="mt-2 h-5 w-5 text-white/60 transition group-hover:translate-x-0.5 group-hover:text-white" />
          </div>
        </button>

        {/* Customer card */}
        <div className="rounded-2xl border-2 border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-emerald-700">
                Customer
              </div>
              <div className="mt-0.5 text-lg font-bold text-emerald-900">
                Customer / Online Store
              </div>
              <div className="mt-1 text-sm text-emerald-800/70">
                Browse products, place orders, and track delivery.
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            <Button
              onClick={() => navigate("/store")}
              className="h-11 w-full bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <StoreIcon className="mr-2 h-4 w-4" />
              Enter Online Store
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => navigate("/customer-login")}
                className="h-10 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
              >
                <LogIn className="mr-1.5 h-4 w-4" />
                Customer Login
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/customer-login?mode=signup")}
                className="h-10 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
              >
                <UserPlus className="mr-1.5 h-4 w-4" />
                Register
              </Button>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Employees and customers use separate accounts.
      </p>
    </div>
  );
}
