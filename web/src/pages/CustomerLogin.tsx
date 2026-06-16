import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { LOGO_URL, LOGO_URL_BROTHERS } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ShoppingBag,
  ArrowRight,
  ArrowLeft,
  Mail,
  MessageCircle,
  Phone,
  Sparkles,
  ShieldCheck,
  Lock,
  UserPlus,
  LogIn,
  Store as StoreIcon,
} from "lucide-react";
import { useCustomerStore } from "@/lib/onlineStore";
import { customerSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup" | "verify";

const STORE_ID_KEY = "oriStoreId";

export default function CustomerLogin() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const customer = useCustomerStore((s) => s.customer);
  const bootstrap = useCustomerStore((s) => s.bootstrap);
  const signIn = useCustomerStore((s) => s.signIn);
  const signUp = useCustomerStore((s) => s.signUp);

  const next = params.get("next") || "/store";
  const initialMode: Mode = params.get("mode") === "signup" ? "signup" : "signin";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [loginEmail, setLoginEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [island, setIsland] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const verifySignupOtp = useCustomerStore((s) => s.verifySignupOtp);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORE_ID_KEY);
      if (v && !loginEmail) setLoginEmail(v);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (customer) navigate(next, { replace: true });
  }, [customer, navigate, next]);

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);

    if (!isSupabaseConfigured) {
      setError("Online store is not configured. Please contact the shop.");
      return;
    }

    setBusy(true);

    try {
      if (mode === "signin") {
        if (!loginEmail.trim() || !password) {
          setError("Email and password are required.");
          return;
        }

        const r = await signIn(loginEmail.trim().toLowerCase(), password);

        if (!r.ok) {
          setError(r.error ?? "Sign-in failed");
          return;
        }

        try {
          localStorage.setItem(STORE_ID_KEY, loginEmail.trim().toLowerCase());
        } catch {
          /* ignore */
        }

        toast.success("Welcome back!");
        navigate(next, { replace: true });
      } else {
        if (!name.trim() || !phone.trim() || !email.trim() || !password) {
          setError("Name, mobile number, email and password are required.");
          return;
        }

        if (password.length < 6) {
          setError("Password must be at least 6 characters.");
          return;
        }
        const cleanEmail = email.trim().toLowerCase();

        const { data: emailExists, error: emailCheckError } =
          await customerSupabase.rpc("email_already_registered", {
            p_email: cleanEmail,
          });
        console.log("[customer-login] duplicate email check:", cleanEmail, emailExists, emailCheckError);
        if (emailCheckError) {
          setError(emailCheckError.message);
          return;
        }

        if (emailExists) {
          setError("This email is already registered. Please sign in or use forgot password.");
          return;
        }
        const r = await signUp({
          name: name.trim(),
          phone: phone.trim(),
          password,
          island: island.trim(),
          address: address.trim(),
          email: cleanEmail,
        });

        if (!r.ok) {
          setError(r.error ?? "Sign-up failed");
          return;
        }

        setPendingEmail(cleanEmail);
        toast.success("OTP sent to your email.");
        setMode("verify");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!pendingEmail || !otp.trim()) {
      setError("Enter OTP code.");
      return;
    }

    setBusy(true);

    try {
      const r = await verifySignupOtp(
        pendingEmail,
        otp.trim()
      );

      if (!r.ok) {
        setError(r.error ?? "OTP verification failed");
        return;
      }

      toast.success("Email verified successfully.");
      setMode("signin");
      setOtp("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20"
        style={{
          background:
            "radial-gradient(120% 80% at 0% 0%, hsl(95 55% 92%) 0%, transparent 55%), radial-gradient(120% 80% at 100% 100%, hsl(28 95% 92%) 0%, transparent 55%), linear-gradient(180deg, #ffffff 0%, hsl(60 30% 98%) 100%)",
        }}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center"
      >
        <img
          src={LOGO_URL_BROTHERS}
          alt=""
          className="w-[68%] max-w-[560px] opacity-[0.05] mix-blend-multiply select-none"
          draggable={false}
        />
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 -z-10 h-72 w-72 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, hsl(95 55% 55% / 0.35), transparent)",
          filter: "blur(20px)",
        }}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -right-24 -z-10 h-80 w-80 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, hsl(28 95% 60% / 0.35), transparent)",
          filter: "blur(20px)",
        }}
      />

      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-5 py-8">
        <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-emerald-200/70 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-emerald-700 shadow-sm backdrop-blur">
          <Sparkles className="h-3 w-3" />
          Customer Account
        </div>

        <div className="relative w-full overflow-hidden rounded-3xl border border-black/5 bg-white/90 p-6 shadow-[0_20px_60px_-20px_rgba(20,80,30,0.25)] backdrop-blur sm:p-7">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-1.5"
            style={{
              background:
                "linear-gradient(90deg, hsl(95 55% 38%) 0%, hsl(95 50% 50%) 50%, hsl(28 95% 55%) 100%)",
            }}
          />

          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <div
                aria-hidden
                className="absolute -inset-2 rounded-full"
                style={{
                  background:
                    "conic-gradient(from 180deg at 50% 50%, hsl(95 55% 50% / 0.35), hsl(28 95% 60% / 0.35), hsl(95 55% 50% / 0.35))",
                  filter: "blur(8px)",
                }}
              />

              <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white shadow-md ring-4 ring-white">
                <img
                  src={LOGO_URL}
                  alt="Ori Barakah Store"
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </div>
            </div>

            <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-[hsl(95_45%_18%)]">
              {mode === "signin" ? "Customer Login" : mode === "verify" ? "Verify Your Email" : "Create Customer Account"}
            </h1>

            <p className="mt-1 text-sm text-[hsl(95_15%_35%)]">
              {mode === "signin"
                ? "Sign in to place orders & track deliveries."
                : "Register to shop online with Ori Barakah Store."}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-emerald-50/70 p-1 ring-1 ring-emerald-100">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
              }}
              className={cn(
                "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition",
                mode === "signin"
                  ? "bg-white text-emerald-800 shadow-sm"
                  : "text-emerald-700/70 hover:text-emerald-800"
              )}
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign in
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
              className={cn(
                "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition",
                mode === "signup"
                  ? "bg-white text-emerald-800 shadow-sm"
                  : "text-emerald-700/70 hover:text-emerald-800"
              )}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Register
            </button>
          </div>

          {mode === "verify" ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
                We sent an OTP code to {pendingEmail || "your email"}. Enter the code below to verify your email.
              </div>

              <div>
                <Label
                  htmlFor="cl-otp"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(95_25%_25%)]"
                >
                  Email OTP *
                </Label>
                <Input
                  id="cl-otp"
                  value={otp}
                  onChange={(e) => {
                    setOtp(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Enter OTP code"
                  className="h-11 border-emerald-200 bg-white"
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  {error}
                </div>
              )}

              <Button
                type="button"
                onClick={handleVerifyOtp}
                disabled={busy}
                className="h-12 w-full rounded-xl text-sm font-bold text-white"
                style={{
                  background:
                    "linear-gradient(95deg, hsl(95 55% 38%) 0%, hsl(95 50% 45%) 45%, hsl(28 95% 55%) 100%)",
                }}
              >
                {busy ? "Verifying…" : "Verify Email"}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setOtp("");
                  setError(null);
                }}
                className="block w-full text-center text-xs font-semibold text-emerald-800 hover:underline"
              >
                Back to registration
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-5 space-y-3.5">
              {mode === "signup" && (
                <div>
                  <Label
                    htmlFor="cl-name"
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(95_25%_25%)]"
                  >
                    Full name *
                  </Label>
                  <Input
                    id="cl-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="h-11 border-emerald-200 bg-white focus-visible:ring-emerald-300"
                    required
                  />
                </div>
              )}

              <div>
                <Label
                  htmlFor="cl-phone"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(95_25%_25%)]"
                >
                  {mode === "signin" ? "Email *" : "Mobile number *"}
                </Label>

                <div className="relative">
                  {mode === "signin" ? (
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(28,85%,50%)]" />
                  ) : (
                    <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(28,85%,50%)]" />
                  )}

                  <input
                    id="cl-phone"
                    name={mode === "signin" ? "email" : "phone"}
                    type={mode === "signin" ? "email" : "tel"}
                    inputMode={mode === "signin" ? "email" : "tel"}
                    autoComplete={mode === "signin" ? "email" : "tel"}
                    value={mode === "signin" ? loginEmail : phone}
                    onChange={(e) => {
                      if (mode === "signin") setLoginEmail(e.target.value);
                      else setPhone(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder={mode === "signin" ? "you@example.com" : "7771234"}
                    className="h-11 w-full rounded-xl border border-emerald-200 bg-white pl-10 pr-3 text-sm font-medium text-emerald-950 outline-none transition placeholder:text-emerald-900/40 focus:border-[hsl(28_95%_55%)] focus:ring-2 focus:ring-[hsl(28_95%_55%/0.3)]"
                    required
                  />
                </div>
              </div>

              <div>
                <Label
                  htmlFor="cl-password"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(95_25%_25%)]"
                >
                  Password *
                </Label>

                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(28_85%_50%)]" />
                  <input
                    id="cl-password"
                    name="password"
                    type="password"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="••••••••"
                    className="h-11 w-full rounded-xl border border-emerald-200 bg-white pl-10 pr-3 text-sm font-medium text-emerald-950 outline-none transition placeholder:text-emerald-900/40 focus:border-[hsl(28_95%_55%)] focus:ring-2 focus:ring-[hsl(28_95%_55%/0.3)]"
                    required
                    minLength={mode === "signup" ? 6 : undefined}
                  />
                </div>
              </div>

              {mode === "signin" && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={async () => {
                      const emailValue = loginEmail.trim().toLowerCase();

                      if (!emailValue) {
                        setError("Enter your email first.");
                        return;
                      }

                      const { error } = await customerSupabase.auth.resetPasswordForEmail(
                        emailValue,
                        {
                          redirectTo: window.location.origin + "/reset-password",
                        }
                      );

                      if (error) {
                        setError(error.message);
                        return;
                      }

                      toast.success("Password reset email sent. Please check your inbox.");
                    }}
                    className="text-xs font-semibold text-emerald-800 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {mode === "signup" && (
                <>
                  <div>
                    <Label
                      htmlFor="cl-island"
                      className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(95_25%_25%)]"
                    >
                      Island
                    </Label>
                    <Input
                      id="cl-island"
                      value={island}
                      onChange={(e) => setIsland(e.target.value)}
                      placeholder="e.g. Malé"
                      className="h-11 border-emerald-200 bg-white"
                    />
                  </div>

                  <div>
                    <Label
                      htmlFor="cl-address"
                      className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(95_25%_25%)]"
                    >
                      Delivery address
                    </Label>
                    <Textarea
                      id="cl-address"
                      rows={2}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="House, street, ward"
                      className="border-emerald-200 bg-white"
                    />
                  </div>

                  <div>
                    <Label
                      htmlFor="cl-email"
                      className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(95_25%_25%)]"
                    >
                      Email *
                    </Label>
                    <Input
                      id="cl-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="h-11 border-emerald-200 bg-white"
                      required
                    />
                  </div>
                </>
              )}

              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={busy}
                className="group relative h-12 w-full overflow-hidden rounded-xl text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition hover:-translate-y-0.5 hover:shadow-xl"
                style={{
                  background:
                    "linear-gradient(95deg, hsl(95 55% 38%) 0%, hsl(95 50% 45%) 45%, hsl(28 95% 55%) 100%)",
                }}
              >
                <span className="relative z-10 inline-flex items-center justify-center gap-2">
                  {busy
                    ? mode === "signin"
                      ? "Signing in…"
                      : "Creating account…"
                    : mode === "signin"
                      ? "Continue to Store"
                      : "Register as Customer"}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Button>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/store")}
                  className="h-10 border-emerald-200 text-emerald-800 hover:bg-emerald-50"
                >
                  <StoreIcon className="mr-1.5 h-4 w-4" />
                  Browse Store
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate("/login")}
                  className="h-10 text-emerald-800 hover:bg-emerald-50"
                >
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                  Back
                </Button>
              </div>

              <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-[hsl(95_20%_35%)]">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Instant access — register and order in seconds.
              </div>
            </form>
          )}

          <div className="mt-5 flex items-center justify-center gap-2 border-t border-emerald-100/80 pt-4">
            <img
              src={LOGO_URL_BROTHERS}
              alt="Ori Brothers"
              className="h-6 w-6 rounded-full bg-white object-cover ring-1 ring-black/10"
            />
            <span className="text-[11px] font-medium uppercase tracking-widest text-[hsl(95_15%_35%)]">
              Powered by Ori Brothers
            </span>
          </div>
        </div>

        <section className="mt-5 w-full">
          <div className="rounded-2xl border border-emerald-100 bg-white/70 p-3.5 shadow-sm backdrop-blur">
            <div className="mb-2 text-center text-[10px] font-bold uppercase tracking-widest text-[hsl(95_25%_30%)]">
              Need help? Get in touch
            </div>

            <div className="grid gap-2">
              <a
                href="mailto:sales@oribrother.com"
                className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-white px-3 py-2 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Mail className="h-4 w-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                    Email
                  </div>
                  <div className="truncate text-sm font-medium text-emerald-950">
                    sales@oribrother.com
                  </div>
                </div>
              </a>

              <div className="grid grid-cols-2 gap-2">
                <a
                  href="https://wa.me/9609778840"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2 transition hover:border-emerald-300 hover:bg-emerald-50"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <MessageCircle className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                      WhatsApp
                    </div>
                    <div className="truncate text-sm font-medium text-emerald-950">
                      +960 977-8840
                    </div>
                  </div>
                </a>

                <a
                  href="viber://chat?number=%2B9609778840"
                  className="flex items-center gap-2 rounded-xl border border-orange-100 bg-white px-3 py-2 transition hover:border-orange-300 hover:bg-orange-50"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-orange-700">
                    <ShoppingBag className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-orange-700">
                      Viber
                    </div>
                    <div className="truncate text-sm font-medium text-orange-950">
                      +960 977-8840
                    </div>
                  </div>
                </a>
              </div>
            </div>
          </div>

          <div className="mt-4 text-center text-[11px] text-[hsl(95_15%_40%)]">
            Employees:{" "}
            <Link to="/login" className="font-semibold text-emerald-800 hover:underline">
              go to staff login
            </Link>
            <span className="mx-1.5 text-emerald-300">·</span>©{" "}
            {new Date().getFullYear()} Ori Barakah Store
          </div>
        </section>
      </main>
    </div>
  );
}