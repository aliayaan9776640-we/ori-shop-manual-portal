import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useStore, useCurrentUser } from "@/lib/store";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import Layout from "@/components/Layout";
import RoleGate from "@/components/RoleGate";
import Login from "./pages/Login";
import StoreLogin from "./pages/StoreLogin";
import CustomerLogin from "./pages/CustomerLogin";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Sales from "./pages/Sales";
import Suppliers from "./pages/Suppliers";
import Orders from "./pages/Orders";
import PurchaseOrders from "./pages/PurchaseOrders";
import Damaged from "./pages/Damaged";
import Customers from "./pages/Customers";
import CreditApprovals from "./pages/CreditApprovals";
import Approvals from "./pages/Approvals";
import CustomerDetail from "./pages/CustomerDetail";
import CreditSends from "./pages/CreditSends";
import PublicBill from "./pages/PublicBill";
import Reports from "./pages/Reports";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import Quotations from "./pages/Quotations";
import BillHistory from "./pages/BillHistory";
import CashDrawerPage from "./pages/CashDrawer";
import BackupPage from "./pages/Backup";
import AuditLogs from "./pages/AuditLogs";
import ConsignmentPage from "./pages/Consignment";
import GstPurchaseReport from "./pages/GstPurchaseReport";
import Store from "./pages/Store";
import OnlineOrders from "./pages/OnlineOrders";
import OnlineShop from "./pages/OnlineShop";
import CustomerApprovals from "./pages/CustomerApprovals";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";
import { useEffect, type ReactNode } from "react";
import Logo from "@/components/Logo";
import { runDailyAutoBackupIfDue } from "@/lib/backup";
import { useSettings } from "@/lib/settings";
import { useDropdowns } from "@/lib/dropdowns";
import { useRoleSettings } from "@/lib/roleSettings";
import { usePurchaseOrders } from "@/lib/purchaseOrders";
import { useConsignment } from "@/lib/consignment";
import { useCashDrawers } from "@/lib/cashDrawer";
import { useOnlineAdminStore } from "@/lib/onlineStore";
import { toast } from "sonner";

const queryClient = new QueryClient();

function NotConfiguredScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md w-full rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
        <Logo size={56} ring />
        <h1 className="mt-4 text-xl font-semibold text-destructive">
          System not configured
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Supabase credentials are missing. Set
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">VITE_SUPABASE_URL</code>
          and
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">VITE_SUPABASE_ANON_KEY</code>
          in your environment, then rebuild the app.
        </p>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const hydrated = useStore((s) => s.hydrated);
  const inactive = !!user && !user.active;
  // Side-effects (signOut, setState) must NEVER run during render.
  // Doing so previously caused a re-render loop (React error #185).
  useEffect(() => {
    if (inactive) {
      if (isSupabaseConfigured) void supabase.auth.signOut();
      useStore.setState({ currentUserId: null });
    }
  }, [inactive]);

  // Watchdog: if bootstrap is taking too long (stale token, slow network,
  // RLS issue on one table, etc.) force the gate open after 8s so the user
  // can still reach /login instead of staring at a forever-spinner.
  useEffect(() => {
    if (hydrated || !isSupabaseConfigured) return;
    const t = window.setTimeout(() => {
      if (!useStore.getState().hydrated) {
        console.warn("[RequireAuth] bootstrap watchdog fired, forcing hydrated=true");
        useStore.setState({ hydrated: true, bootstrapping: false });
      }
    }, 8000);
    return () => window.clearTimeout(t);
  }, [hydrated]);

  if (!hydrated && isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Logo size={56} ring />
          <div className="text-sm text-muted-foreground">Loading portal…</div>
          <button
            type="button"
            onClick={() => {
              useStore.setState({ hydrated: true, bootstrapping: false });
              window.location.assign("/login");
            }}
            className="mt-2 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Taking too long? Go to login
          </button>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (inactive) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AuthBootstrap() {
  const bootstrap = useStore((s) => s.bootstrap);
  useEffect(() => {
    void bootstrap();

    // Force fresh load of settings & dropdowns from Supabase on app start.
    if (isSupabaseConfigured) {
      void useSettings
        .getState()
        .loadRemote()
        .catch((e: unknown) => {
          // Already logged inside loadRemote; don't spam toasts on bootstrap.
          // (Common cause: app_settings table not yet created in Supabase.)
          console.warn("[settings] initial load failed", e);
        });
      void useDropdowns
        .getState()
        .load()
        .catch((e: unknown) => {
          // Already logged inside load(); avoid bootstrap toast spam.
          console.warn("[dropdowns] initial load failed", e);
        });
      void useRoleSettings
        .getState()
        .load()
        .catch((e: unknown) => {
          console.warn("[role_settings] initial load failed", e);
        });
      void usePurchaseOrders
        .getState()
        .load()
        .catch((e: unknown) => {
          console.warn("[purchase_orders] initial load failed", e);
        });
      void useConsignment
        .getState()
        .load()
        .catch((e: unknown) => {
          console.warn("[consignment] initial load failed", e);
        });
      void useCashDrawers
        .getState()
        .load()
        .catch((e: unknown) => {
          console.warn("[cash_drawers] initial load failed", e);
        });
      void useOnlineAdminStore
        .getState()
        .load()
        .catch((e: unknown) => {
          console.warn("[online_orders] initial load failed", e);
        });
    }

    // Daily automatic backup: runs once per session if 24h have elapsed,
    // and re-checks hourly + on window focus.
    let backupInterval: number | null = null;
    const onFocus = (): void => {
      runDailyAutoBackupIfDue();
    };
    try {
      runDailyAutoBackupIfDue();
      backupInterval = window.setInterval(() => {
        runDailyAutoBackupIfDue();
      }, 60 * 60 * 1000);
      window.addEventListener("focus", onFocus);
    } catch (e) {
      console.error("[backup] init failed", e);
    }

    // ---- Global settings live sync ----------------------------------
    // Settings, dropdowns and role rules are admin-controlled but apply
    // to every user. Subscribe to Supabase realtime so changes propagate
    // to all open sessions without a rebuild.
    let settingsChannel: ReturnType<typeof supabase.channel> | null = null;
    let settingsRefetchInterval: number | null = null;
    const refetchAllSettings = (notify: boolean): void => {
      void useSettings.getState().loadRemote().catch(() => {});
      void useDropdowns.getState().load().catch(() => {});
      void useRoleSettings.getState().load().catch(() => {});
      if (notify) {
        const me = useStore.getState().users.find(
          (u) => u.id === useStore.getState().currentUserId
        );
        if (me && me.role !== "admin") {
          toast.info("Settings updated by admin", { duration: 3000 });
        }
      }
    };
    if (isSupabaseConfigured) {
      settingsChannel = supabase
        .channel("global-settings-feed")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "app_settings" },
          () => refetchAllSettings(true)
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "dropdown_options" },
          () => refetchAllSettings(false)
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "role_settings" },
          () => refetchAllSettings(true)
        )
        .subscribe();
      // Periodic refetch as a safety net (every 5 minutes) plus on focus.
      settingsRefetchInterval = window.setInterval(
        () => refetchAllSettings(false),
        5 * 60 * 1000
      );
      const onSettingsFocus = (): void => refetchAllSettings(false);
      window.addEventListener("focus", onSettingsFocus);
      // Stash the listener so the cleanup below can remove it.
      (window as unknown as { __oriSettingsFocusHandler?: () => void }).__oriSettingsFocusHandler =
        onSettingsFocus;
    }

    // Realtime subscription: notify admins when a new approval-eligible
    // request is created (credit customer or purchase order).
    let approvalsChannel: ReturnType<typeof supabase.channel> | null = null;
    if (isSupabaseConfigured) {
      approvalsChannel = supabase
        .channel("approvals-feed")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "customers" },
          (payload) => {
            const me = useStore.getState().users.find(
              (u) => u.id === useStore.getState().currentUserId
            );
            void useStore.getState().bootstrap();
            const newRow = payload.new as { approval_status?: string; name?: string } | null;
            if (
              me?.role === "admin" &&
              payload.eventType === "INSERT" &&
              newRow?.approval_status === "pending"
            ) {
              toast.info(
                `New credit customer request: ${newRow.name ?? "unnamed"}`,
                { duration: 5000 }
              );
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "purchase_orders" },
          (payload) => {
            const me = useStore.getState().users.find(
              (u) => u.id === useStore.getState().currentUserId
            );
            void usePurchaseOrders.getState().load();
            const newRow = payload.new as { status?: string; po_no?: string } | null;
            if (
              me?.role === "admin" &&
              newRow?.status === "waiting_approval"
            ) {
              toast.info(
                `Purchase Order ${newRow.po_no ?? ""} is waiting your approval`,
                { duration: 5000 }
              );
            }
          }
        )
        .subscribe();
    }

    // ---- Product approval realtime alerts -------------------------
    // Notify admins when staff add a new product (defaults to pending)
    // and refresh the products list so the Approvals queue updates live.
    let productsChannel: ReturnType<typeof supabase.channel> | null = null;
    if (isSupabaseConfigured) {
      productsChannel = supabase
        .channel("products-approval-feed")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "products" },
          (payload) => {
            void useStore.getState().bootstrap();
            const me = useStore.getState().users.find(
              (u) => u.id === useStore.getState().currentUserId
            );
            if (me?.role !== "admin") return;
            const newRow = payload.new as
              | { publish_status?: string; name?: string }
              | null;
            if (
              payload.eventType === "INSERT" &&
              newRow?.publish_status === "pending"
            ) {
              toast.info(
                `New product pending approval: ${newRow.name ?? "unnamed"}`,
                { duration: 5000 }
              );
            }
          }
        )
        .subscribe();
    }

    // ---- Online orders realtime alerts ----------------------------
    let onlineOrdersChannel: ReturnType<typeof supabase.channel> | null = null;
    if (isSupabaseConfigured) {
      onlineOrdersChannel = supabase
        .channel("online-orders-feed")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "online_orders" },
          (payload) => {
            void useOnlineAdminStore.getState().load();
            const me = useStore.getState().users.find(
              (u) => u.id === useStore.getState().currentUserId
            );
            if (!me) return;
            if (me.role === "storekeeper") return;
            const newRow = payload.new as
              | { status?: string; order_no?: string; customer_name?: string }
              | null;
            if (
              payload.eventType === "INSERT" &&
              newRow?.status === "pending"
            ) {
              toast.info(
                `New online order ${newRow.order_no ?? ""} from ${
                  newRow.customer_name ?? "customer"
                }`,
                { duration: 6000 }
              );
              try {
                const ctx = new (window.AudioContext ||
                  (window as unknown as { webkitAudioContext: typeof AudioContext })
                    .webkitAudioContext)();
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = "sine";
                o.frequency.value = 880;
                g.gain.value = 0.08;
                o.connect(g);
                g.connect(ctx.destination);
                o.start();
                o.stop(ctx.currentTime + 0.25);
              } catch {
                // Browser blocked audio, ignore.
              }
            }
          }
        )
        .subscribe();
    }

    // ---- Cash drawer realtime sync --------------------------------
    // The shop has a single shared open drawer; every device must see
    // open/close updates immediately so POS lock state stays correct.
    let drawersChannel: ReturnType<typeof supabase.channel> | null = null;
    if (isSupabaseConfigured) {
      drawersChannel = supabase
        .channel("cash-drawers-feed")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cash_drawers" },
          (payload) => {
            void useCashDrawers.getState().load();
            const me = useStore.getState().users.find(
              (u) => u.id === useStore.getState().currentUserId
            );
            const newRow = payload.new as
              | { status?: string; opened_by_name?: string; cashier_name?: string; closed_by_name?: string }
              | null;
            const oldRow = payload.old as { status?: string } | null;
            if (!me) return;
            if (payload.eventType === "INSERT" && newRow?.status === "open") {
              toast.info(
                `Cash drawer opened by ${newRow.opened_by_name ?? newRow.cashier_name ?? "a cashier"}`,
                { duration: 3000 }
              );
            } else if (
              payload.eventType === "UPDATE" &&
              oldRow?.status === "open" &&
              newRow?.status !== "open"
            ) {
              toast.info(
                `Cash drawer closed${newRow?.closed_by_name ? ` by ${newRow.closed_by_name}` : ""}`,
                { duration: 3000 }
              );
            }
          }
        )
        .subscribe();
    }

    const sub = isSupabaseConfigured
      ? supabase.auth.onAuthStateChange((event, session) => {
          // Don't hijack a password-recovery session as a normal login.
          if (event === "PASSWORD_RECOVERY") {
            console.log("[auth] password recovery session detected");
            if (!window.location.pathname.startsWith("/reset-password")) {
              window.location.replace("/reset-password");
            }
            return;
          }
          if (window.location.pathname.startsWith("/reset-password")) {
            return;
          }
          if (event === "SIGNED_OUT") {
            useStore.setState({ currentUserId: null });
            return;
          }
          if (session?.user) {
            // If the user has been deactivated, immediately revoke the session
            // even if it was restored from storage.
            const me = useStore
              .getState()
              .users.find((u) => u.id === session.user.id);
            if (me && !me.active) {
              console.warn("[auth] inactive user detected, signing out", me.email);
              void supabase.auth.signOut();
              useStore.setState({ currentUserId: null });
              return;
            }
            useStore.setState({ currentUserId: session.user.id });
          }
        })
      : null;

    return () => {
      if (backupInterval !== null) window.clearInterval(backupInterval);
      if (settingsRefetchInterval !== null) window.clearInterval(settingsRefetchInterval);
      window.removeEventListener("focus", onFocus);
      const stash = window as unknown as { __oriSettingsFocusHandler?: () => void };
      if (stash.__oriSettingsFocusHandler) {
        window.removeEventListener("focus", stash.__oriSettingsFocusHandler);
        stash.__oriSettingsFocusHandler = undefined;
      }
      sub?.data.subscription.unsubscribe();
      if (approvalsChannel) {
        void supabase.removeChannel(approvalsChannel);
      }
      if (settingsChannel) {
        void supabase.removeChannel(settingsChannel);
      }
      if (drawersChannel) {
        void supabase.removeChannel(drawersChannel);
      }
      if (onlineOrdersChannel) {
        void supabase.removeChannel(onlineOrdersChannel);
      }
      if (productsChannel) {
        void supabase.removeChannel(productsChannel);
      }
    };
  }, [bootstrap]);
  return null;
}

const App = () => {
  if (!isSupabaseConfigured) {
    console.error(
      "[App] Supabase env missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    );
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner position="top-right" richColors />
          <NotConfiguredScreen />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }
  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-right" richColors />
      <BrowserRouter>
        <AuthBootstrap />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/store-login" element={<StoreLogin />} />
          <Route path="/customer-login" element={<CustomerLogin />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/bill/:token" element={<PublicBill />} />
          <Route path="/store" element={<Store />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route
              path="/sales"
              element={
                <RoleGate roles={["admin", "cashier"]}>
                  <Sales />
                </RoleGate>
              }
            />
            <Route
              path="/bills"
              element={
                <RoleGate roles={["admin", "cashier"]}>
                  <BillHistory />
                </RoleGate>
              }
            />
            <Route
              path="/quotations"
              element={
                <RoleGate roles={["admin", "cashier"]}>
                  <Quotations />
                </RoleGate>
              }
            />
            <Route
              path="/cash-drawer"
              element={
                <RoleGate roles={["admin", "cashier"]}>
                  <CashDrawerPage />
                </RoleGate>
              }
            />
            <Route
              path="/suppliers"
              element={
                <RoleGate roles={["admin", "storekeeper"]}>
                  <Suppliers />
                </RoleGate>
              }
            />
            <Route
              path="/purchase-orders"
              element={
                <RoleGate roles={["admin", "storekeeper"]}>
                  <PurchaseOrders />
                </RoleGate>
              }
            />
            <Route
              path="/orders"
              element={
                <RoleGate roles={["admin", "storekeeper"]}>
                  <Orders />
                </RoleGate>
              }
            />
            <Route
              path="/damaged"
              element={
                <RoleGate roles={["admin", "storekeeper"]}>
                  <Damaged />
                </RoleGate>
              }
            />
            <Route
              path="/customers"
              element={
                <RoleGate roles={["admin", "cashier"]}>
                  <Customers />
                </RoleGate>
              }
            />
            <Route
              path="/credit-approvals"
              element={
                <RoleGate roles={["admin"]}>
                  <CreditApprovals />
                </RoleGate>
              }
            />
            <Route
              path="/approvals"
              element={
                <RoleGate roles={["admin"]}>
                  <Approvals />
                </RoleGate>
              }
            />
            <Route
              path="/credit-sends"
              element={
                <RoleGate roles={["admin", "cashier"]}>
                  <CreditSends />
                </RoleGate>
              }
            />
            <Route
              path="/customers/:id"
              element={
                <RoleGate roles={["admin", "cashier"]}>
                  <CustomerDetail />
                </RoleGate>
              }
            />
            <Route
              path="/reports"
              element={
                <RoleGate roles={["admin"]}>
                  <Reports />
                </RoleGate>
              }
            />
            <Route
              path="/users"
              element={
                <RoleGate roles={["admin"]}>
                  <Users />
                </RoleGate>
              }
            />
            <Route
              path="/settings"
              element={
                <RoleGate roles={["admin"]}>
                  <Settings />
                </RoleGate>
              }
            />
            <Route
              path="/consignment"
              element={
                <RoleGate roles={["admin", "storekeeper", "cashier"]}>
                  <ConsignmentPage />
                </RoleGate>
              }
            />
            <Route
              path="/gst-purchase-report"
              element={
                <RoleGate roles={["admin", "storekeeper"]}>
                  <GstPurchaseReport />
                </RoleGate>
              }
            />
            <Route
              path="/online-orders"
              element={
                <RoleGate roles={["admin", "cashier"]}>
                  <OnlineOrders />
                </RoleGate>
              }
            />
            <Route
              path="/online-shop"
              element={
                <RoleGate roles={["admin"]}>
                  <OnlineShop />
                </RoleGate>
              }
            />
            <Route
              path="/customer-approvals"
              element={
                <RoleGate roles={["admin", "cashier"]}>
                  <CustomerApprovals />
                </RoleGate>
              }
            />
            <Route
              path="/audit-logs"
              element={
                <RoleGate roles={["admin"]}>
                  <AuditLogs />
                </RoleGate>
              }
            />
            <Route
              path="/backup"
              element={
                <RoleGate roles={["admin"]}>
                  <BackupPage />
                </RoleGate>
              }
            />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
