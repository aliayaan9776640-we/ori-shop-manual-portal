import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { customerSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { Lock, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { toast } from "sonner";

type Status = "checking" | "ready" | "invalid" | "saving" | "done";

type RecoveryTokens = {
  access_token: string;
  refresh_token: string;
};

const RECOVERY_TOKENS_KEY = "ori-customer-password-recovery-tokens";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const recoveryTokensRef = useRef<RecoveryTokens | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setStatus("invalid");
      setError("Supabase is not configured.");
      return;
    }

    let cancelled = false;

    const finishCheck = (hasSession: boolean, errMsg?: string): void => {
      if (cancelled) return;
      if (hasSession) {
        setStatus("ready");
      } else {
        setStatus("invalid");
        setError(errMsg ?? "This password reset link is invalid or has expired.");
      }
    };

    const saveRecoveryTokens = (tokens: RecoveryTokens): void => {
      recoveryTokensRef.current = tokens;
      try {
        sessionStorage.setItem(RECOVERY_TOKENS_KEY, JSON.stringify(tokens));
      } catch {
        /* ignore */
      }
    };

    const parseHashTokens = (): {
      access_token?: string;
      refresh_token?: string;
      type?: string;
      error_description?: string;
    } => {
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const params = new URLSearchParams(hash);
      return {
        access_token: params.get("access_token") ?? undefined,
        refresh_token: params.get("refresh_token") ?? undefined,
        type: params.get("type") ?? undefined,
        error_description: params.get("error_description") ?? undefined,
      };
    };

    const init = async (): Promise<void> => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const tokenHash = url.searchParams.get("token_hash");
        const type = url.searchParams.get("type");
        const queryError =
          url.searchParams.get("error_description") ??
          url.searchParams.get("error");
        const hashTokens = parseHashTokens();

        if (queryError || hashTokens.error_description) {
          finishCheck(false, queryError ?? hashTokens.error_description);
          return;
        }

        if (tokenHash) {
          const otpType = (type ?? "recovery") as
            | "recovery"
            | "email"
            | "magiclink"
            | "signup"
            | "invite";

          const { data, error: otpErr } = await customerSupabase.auth.verifyOtp({
            type: otpType,
            token_hash: tokenHash,
          });

          console.log("[reset-password] verifyOtp", {
            ok: !otpErr,
            user: data.session?.user?.email,
            type: otpType,
          });

          if (otpErr) {
            finishCheck(false, otpErr.message);
            return;
          }

          if (data.session?.access_token && data.session?.refresh_token) {
            saveRecoveryTokens({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
            });
          }

          window.history.replaceState({}, document.title, "/reset-password");
          finishCheck(!!data.session);
          return;
        }

        if (code) {
          const { data, error: exErr } =
            await customerSupabase.auth.exchangeCodeForSession(code);

          console.log("[reset-password] exchangeCodeForSession", {
            ok: !exErr,
            user: data.session?.user?.email,
          });

          if (exErr) {
            finishCheck(false, exErr.message);
            return;
          }

          if (data.session?.access_token && data.session?.refresh_token) {
            saveRecoveryTokens({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
            });
          }

          window.history.replaceState({}, document.title, "/reset-password");
          finishCheck(!!data.session);
          return;
        }

        if (hashTokens.access_token && hashTokens.refresh_token) {
          const tokens = {
            access_token: hashTokens.access_token,
            refresh_token: hashTokens.refresh_token,
          };

          const { data, error: setErr } = await customerSupabase.auth.setSession(tokens);

          console.log("[reset-password] setSession from hash", {
            ok: !setErr,
            user: data.session?.user?.email,
          });

          if (setErr) {
            finishCheck(false, setErr.message);
            return;
          }

          saveRecoveryTokens(tokens);
          window.history.replaceState({}, document.title, "/reset-password");
          finishCheck(!!data.session);
          return;
        }

        const { data } = await customerSupabase.auth.getSession();

        if (data.session?.access_token && data.session?.refresh_token) {
          saveRecoveryTokens({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
        }

        console.log("[reset-password] existing session", {
          user: data.session?.user?.email,
        });

        finishCheck(!!data.session);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to verify reset link.";
        finishCheck(false, msg);
      }
    };

    void init();

    const sub = customerSupabase.auth.onAuthStateChange((event, session) => {
      console.log("[reset-password] auth event", event, session?.user?.email);

      if (session?.access_token && session?.refresh_token) {
        saveRecoveryTokens({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
      }

      if (event === "PASSWORD_RECOVERY" && session) {
        if (!cancelled) setStatus("ready");
      }
    });

    return () => {
      cancelled = true;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  const getSavedRecoveryTokens = (): RecoveryTokens | null => {
    if (recoveryTokensRef.current) return recoveryTokensRef.current;

    try {
      const raw = sessionStorage.getItem(RECOVERY_TOKENS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<RecoveryTokens>;
      if (parsed.access_token && parsed.refresh_token) {
        return {
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
        };
      }
    } catch {
      /* ignore */
    }

    return null;
  };

  const ensureRecoverySession = async (): Promise<boolean> => {
    const { data } = await customerSupabase.auth.getSession();
    if (data.session) return true;

    const tokens = getSavedRecoveryTokens();
    if (!tokens) return false;

    const { data: restored, error: restoreErr } =
      await customerSupabase.auth.setSession(tokens);

    if (restoreErr) {
      console.error("[reset-password] restore recovery session failed", restoreErr);
      return false;
    }

    return !!restored.session;
  };

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setStatus("saving");

    const hasSession = await ensureRecoverySession();

    if (!hasSession) {
      setError("Auth session missing. Please request a new reset email and open the latest link.");
      setStatus("ready");
      return;
    }
    const { data: sessionData } = await customerSupabase.auth.getSession();

    if (!sessionData.session) {
      setError("Reset session missing. Please open the latest reset email link again.");
      setStatus("ready");
      return;
    }
    const { error: updErr } = await customerSupabase.auth.updateUser({
      password,
    });

    if (updErr) {
      console.error("[reset-password] updateUser failed", updErr);
      setError(updErr.message);
      setStatus("ready");
      return;
    }

    console.log("[reset-password] password updated successfully");
    setStatus("done");
    toast.success("Password updated. Please sign in.");

    try {
      sessionStorage.removeItem(RECOVERY_TOKENS_KEY);
    } catch {
      /* ignore */
    }

    await customerSupabase.auth.signOut();

    setTimeout(() => {
      navigate("/customer-login", { replace: true });
    }, 1200);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <Logo size={48} ring />
          <div>
            <div className="font-bold">Ori Barakah Store</div>
            <div className="text-xs text-muted-foreground">Reset your password</div>
          </div>
        </div>

        {status === "checking" && (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Verifying reset link…
          </div>
        )}

        {status === "invalid" && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6">
            <div className="mb-2 flex items-center gap-2 font-semibold text-destructive">
              <AlertCircle className="h-4 w-4" />
              Link invalid or expired
            </div>
            <p className="text-sm text-destructive/90">
              {error ?? "Please request a new password reset email."}
            </p>
            <Button onClick={() => navigate("/customer-login")} className="mt-4 w-full">
              Back to sign in
            </Button>
          </div>
        )}

        {status === "done" && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6">
            <div className="mb-2 flex items-center gap-2 font-semibold text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              Password updated
            </div>
            <p className="text-sm text-emerald-700">Redirecting to sign in…</p>
          </div>
        )}

        {(status === "ready" || status === "saving") && (
          <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6">
            <h2 className="text-xl font-bold tracking-tight">Set a new password</h2>
            <p className="text-sm text-muted-foreground">
              Choose a strong password you haven't used before.
            </p>

            <div>
              <label className="mb-1.5 block text-sm font-medium">New password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Confirm password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  required
                  minLength={6}
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
              disabled={status === "saving"}
              className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {status === "saving" ? "Updating…" : "Update password"}
            </Button>

            <button
              type="button"
              onClick={() => navigate("/customer-login")}
              className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel and return to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
