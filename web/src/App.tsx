const PaymentSuccess = lazy(() => import("@/pages/PaymentSuccess"));
const PaymentFailed = lazy(() => import("@/pages/PaymentFailed"));
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const OrderAlertSystem = lazy(() => import("@/components/OrderAlertSystem"));
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useStore, useCurrentUser } from "@/lib/store";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
const Layout = lazy(() => import("@/components/Layout"));
import RoleGate from "@/components/RoleGate";
const Login = lazy(() => import("./pages/Login"));
const StoreLogin = lazy(() => import("./pages/StoreLogin"));
const CustomerLogin = lazy(() => import("./pages/CustomerLogin"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Sales = lazy(() => import("./pages/Sales"));
const SalesFinance = lazy(() => import("./pages/SalesFinance"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const Orders = lazy(() => import("./pages/Orders"));
const PurchaseOrders = lazy(() => import("./pages/PurchaseOrders"));
const Damaged = lazy(() => import("./pages/Damaged"));
const Customers = lazy(() => import("./pages/Customers"));
const CreditApprovals = lazy(() => import("./pages/CreditApprovals"));
const Approvals = lazy(() => import("./pages/Approvals"));
const CustomerDetail = lazy(() => import("./pages/CustomerDetail"));
const CreditSends = lazy(() => import("./pages/CreditSends"));
const PublicBill = lazy(() => import("./pages/PublicBill"));
const Reports = lazy(() => import("./pages/Reports"));
const Users = lazy(() => import("./pages/Users"));
const Settings = lazy(() => import("./pages/Settings"));
const Quotations = lazy(() => import("./pages/Quotations"));
const BillHistory = lazy(() => import("./pages/BillHistory"));
const CashDrawerPage = lazy(() => import("./pages/CashDrawer"));
const BackupPage = lazy(() => import("./pages/Backup"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const ConsignmentPage = lazy(() => import("./pages/Consignment"));
const GstPurchaseReport = lazy(() => import("./pages/GstPurchaseReport"));
const Store = lazy(() => import("@/pages/Store"));
const OnlineOrders = lazy(() => import("./pages/OnlineOrders"));
const OnlineShop = lazy(() => import("./pages/OnlineShop"));
const PreOrders = lazy(() => import("./pages/PreOrders"));
const PreorderAdmin = lazy(() => import("./pages/PreorderAdmin"));
const CustomerProfileDashboard = lazy(() => import("@/components/CustomerProfileDashboard"));
const CustomerApprovals = lazy(() => import("./pages/CustomerApprovals"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const DeleteAccount = lazy(() => import("./pages/DeleteAccount"));
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import Logo from "@/components/Logo";
const runDailyAutoBackupIfDue = () => { void import("@/lib/backup").then(m => m.runDailyAutoBackupIfDue()); };

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
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
            VITE_SUPABASE_URL
          </code>
          and
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
            VITE_SUPABASE_ANON_KEY
          </code>
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

  useEffect(() => {
    if (inactive) {
      if (isSupabaseConfigured) void supabase.auth.signOut();
      useStore.setState({ currentUserId: null });
    }
  }, [inactive]);

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

const isCustomerRoute = (path: string) => ['/store','/store-login','/customer-login','/profile','/customer-profile','/pre-orders','/privacy-policy','/delete-account','/payment-success','/payment-failed'].includes(path) || path.startsWith('/bill/');
function AuthBootstrap() {
  const location = useLocation();
  const customerRoute = isCustomerRoute(location.pathname);
  const bootstrap = useStore((s) => s.bootstrap);

  useEffect(() => {
    if (customerRoute) {
      void useSettings.getState().loadRemote().catch(() => {});
      return;
    }
    void bootstrap();

    if (isSupabaseConfigured) {
      void useSettings.getState().loadRemote().catch((e: unknown) => {
        console.warn("[settings] initial load failed", e);
      });
      void useDropdowns.getState().load().catch((e: unknown) => {
        console.warn("[dropdowns] initial load failed", e);
      });
      void useRoleSettings.getState().load().catch((e: unknown) => {
        console.warn("[role_settings] initial load failed", e);
      });
      void usePurchaseOrders.getState().load().catch((e: unknown) => {
        console.warn("[purchase_orders] initial load failed", e);
      });
      void useConsignment.getState().load().catch((e: unknown) => {
        console.warn("[consignment] initial load failed", e);
      });
      void useCashDrawers.getState().load().catch((e: unknown) => {
        console.warn("[cash_drawers] initial load failed", e);
      });
      void useOnlineAdminStore.getState().load().catch((e: unknown) => {
        console.warn("[online_orders] initial load failed", e);
      });
    }

    let backupInterval: number | null = null;
    let disposed = false;
    let stopDesktopBackup = () => {};
    if (window.oriDesktop?.isDesktop) void import("@/lib/desktopBackup").then(m => {
      if (!disposed) stopDesktopBackup = m.startDesktopAutoBackup();
    });
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

    let settingsChannel: ReturnType<typeof supabase.channel> | null = null;
    let settingsRefetchInterval: number | null = null;

    const refetchAllSettings = (notify: boolean): void => {
      void useSettings.getState().loadRemote().catch(() => { });
      void useDropdowns.getState().load().catch(() => { });
      void useRoleSettings.getState().load().catch(() => { });
      if (notify) {
        const me = useStore
          .getState()
          .users.find((u) => u.id === useStore.getState().currentUserId);
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

      settingsRefetchInterval = window.setInterval(
        () => refetchAllSettings(false),
        5 * 60 * 1000
      );

      const onSettingsFocus = (): void => refetchAllSettings(false);
      window.addEventListener("focus", onSettingsFocus);
      (window as unknown as { __oriSettingsFocusHandler?: () => void }).__oriSettingsFocusHandler =
        onSettingsFocus;
    }

    let approvalsChannel: ReturnType<typeof supabase.channel> | null = null;

    if (isSupabaseConfigured) {
      approvalsChannel = supabase
        .channel("approvals-feed")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "customers" },
          (payload) => {
            const me = useStore
              .getState()
              .users.find((u) => u.id === useStore.getState().currentUserId);

            void useStore.getState().refreshCredit();

            const newRow = payload.new as
              | { approval_status?: string; name?: string }
              | null;

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
            const me = useStore
              .getState()
              .users.find((u) => u.id === useStore.getState().currentUserId);

            void usePurchaseOrders.getState().load();

            const newRow = payload.new as
              | { status?: string; po_no?: string }
              | null;

            if (me?.role === "admin" && newRow?.status === "waiting_approval") {
              toast.info(
                `Purchase Order ${newRow.po_no ?? ""} is waiting your approval`,
                { duration: 5000 }
              );
            }
          }
        )
        .subscribe();
    }

    const creditChannel = !customerRoute && isSupabaseConfigured ? supabase.channel("credit-ledger-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "credit_transactions" }, () => void useStore.getState().refreshCredit())
      .subscribe(status => { if (status === "SUBSCRIBED") void useStore.getState().refreshCredit(); }) : null;
    const refreshCredit = () => { if (document.visibilityState !== "hidden") void useStore.getState().refreshCredit(); };
    const creditTimer = window.setInterval(refreshCredit, 15000);
    window.addEventListener("focus", refreshCredit);
    document.addEventListener("visibilitychange", refreshCredit);
    let productsChannel: ReturnType<typeof supabase.channel> | null = null;

    if (isSupabaseConfigured) {
      productsChannel = supabase
        .channel("products-approval-feed")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "products" },
          (payload) => {
            // Product rows are synchronized by products-live-stock.

            const me = useStore
              .getState()
              .users.find((u) => u.id === useStore.getState().currentUserId);

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

    let onlineOrdersChannel: ReturnType<typeof supabase.channel> | null = null;

    if (isSupabaseConfigured) {
      onlineOrdersChannel = supabase
        .channel("online-orders-feed")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "online_orders" },
          (payload) => {
            void useOnlineAdminStore.getState().load();

            const me = useStore
              .getState()
              .users.find((u) => u.id === useStore.getState().currentUserId);

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
                `New online order ${newRow.order_no ?? ""} from ${newRow.customer_name ?? "customer"
                }`,
                { duration: 6000 }
              );
            }
          }
        )
        .subscribe();
    }

    let preorderChannel: ReturnType<typeof supabase.channel> | null = null;

    if (isSupabaseConfigured) {
      preorderChannel = supabase
        .channel("preorder-global-feed")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "preorder_orders" },
          (payload) => {
            const me = useStore
              .getState()
              .users.find((u) => u.id === useStore.getState().currentUserId);

            if (!me) return;
            if (me.role !== "admin" && me.role !== "storekeeper") return;

            const newRow = payload.new as
              | { customer_name?: string; order_status?: string }
              | null;

            if (payload.eventType === "INSERT") {
              toast.info(
                `New pre-order from ${newRow?.customer_name ?? "customer"}`,
                { duration: 6000 }
              );
            }
          }
        )
        .subscribe();
    }

    let drawersChannel: ReturnType<typeof supabase.channel> | null = null;

    if (isSupabaseConfigured) {
      drawersChannel = supabase
        .channel("cash-drawers-feed")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cash_drawers" },
          (payload) => {
            void useCashDrawers.getState().load();

            const me = useStore
              .getState()
              .users.find((u) => u.id === useStore.getState().currentUserId);

            const newRow = payload.new as
              | {
                status?: string;
                opened_by_name?: string;
                cashier_name?: string;
                closed_by_name?: string;
              }
              | null;

            const oldRow = payload.old as { status?: string } | null;

            if (!me) return;

            if (payload.eventType === "INSERT" && newRow?.status === "open") {
              toast.info(
                `Cash drawer opened by ${newRow.opened_by_name ?? newRow.cashier_name ?? "a cashier"
                }`,
                { duration: 3000 }
              );
            } else if (
              payload.eventType === "UPDATE" &&
              oldRow?.status === "open" &&
              newRow?.status !== "open"
            ) {
              toast.info(
                `Cash drawer closed${newRow?.closed_by_name ? ` by ${newRow.closed_by_name}` : ""
                }`,
                { duration: 3000 }
              );
            }
          }
        )
        .subscribe();
    }

    const sub = isSupabaseConfigured
      ? supabase.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          console.log("[auth] password recovery session detected");
          if (!window.location.pathname.startsWith("/reset-password")) {
            window.location.replace("/reset-password");
          }
          return;
        }

        if (window.location.pathname.startsWith("/reset-password")) return;

        if (event === "SIGNED_OUT") {
          useStore.setState({ currentUserId: null });
          return;
        }

        if (session?.user) {
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
      disposed = true; stopDesktopBackup();
      if (settingsRefetchInterval !== null) {
        window.clearInterval(settingsRefetchInterval);
      }

      window.removeEventListener("focus", onFocus);

      const stash = window as unknown as {
        __oriSettingsFocusHandler?: () => void;
      };

      if (stash.__oriSettingsFocusHandler) {
        window.removeEventListener("focus", stash.__oriSettingsFocusHandler);
        stash.__oriSettingsFocusHandler = undefined;
      }

      window.clearInterval(creditTimer);
      window.removeEventListener("focus", refreshCredit);
      document.removeEventListener("visibilitychange", refreshCredit);
      if (creditChannel) void supabase.removeChannel(creditChannel);
      sub?.data.subscription.unsubscribe();

      if (approvalsChannel) void supabase.removeChannel(approvalsChannel);
      if (settingsChannel) void supabase.removeChannel(settingsChannel);
      if (drawersChannel) void supabase.removeChannel(drawersChannel);
      if (onlineOrdersChannel) void supabase.removeChannel(onlineOrdersChannel);
      if (productsChannel) void supabase.removeChannel(productsChannel);
      if (preorderChannel) void supabase.removeChannel(preorderChannel);
    };
  }, [bootstrap, customerRoute]);

  return null;
}
function AnimatedRoutes() {
  const location = useLocation();

  return (
    <Suspense fallback={<div role="status" className="p-6 text-center">Loading page…</div>}><AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<Login />} />
        <Route path="/store-login" element={<StoreLogin />} />
        <Route path="/customer-login" element={<CustomerLogin />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/delete-account" element={<DeleteAccount />} />
        <Route path="/bill/:token" element={<PublicBill />} />
        <Route path="/store" element={<Store />} />
        <Route path="/pre-orders" element={<PreOrders />} />
        <Route path="/payment-success" element={<PaymentSuccess />} />
        <Route path="/payment-failed" element={<PaymentFailed />} />
        <Route
          path="/profile"
          element={<CustomerProfileDashboard />}
        />

        <Route
          path="/customer-profile"
          element={<CustomerProfileDashboard />}
        />

        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/sales" element={<RoleGate roles={["admin", "cashier"]}><Sales /></RoleGate>} />
          <Route path="/bills" element={<RoleGate roles={["admin", "cashier"]}><BillHistory /></RoleGate>} />
          <Route path="/quotations" element={<RoleGate roles={["admin", "cashier"]}><Quotations /></RoleGate>} />
          <Route path="/sales-finance" element={<RoleGate roles={["admin"]}><SalesFinance /></RoleGate>} />
          <Route path="/cash-drawer" element={<RoleGate roles={["admin", "cashier"]}><CashDrawerPage /></RoleGate>} />
          <Route path="/suppliers" element={<RoleGate roles={["admin", "storekeeper"]}><Suppliers /></RoleGate>} />
          <Route path="/purchase-orders" element={<RoleGate roles={["admin", "storekeeper"]}><PurchaseOrders /></RoleGate>} />
          <Route path="/orders" element={<RoleGate roles={["admin", "storekeeper"]}><Orders /></RoleGate>} />
          <Route path="/damaged" element={<RoleGate roles={["admin", "storekeeper"]}><Damaged /></RoleGate>} />
          <Route path="/customers" element={<RoleGate roles={["admin", "cashier"]}><Customers /></RoleGate>} />
          <Route path="/credit-approvals" element={<RoleGate roles={["admin"]}><CreditApprovals /></RoleGate>} />
          <Route path="/approvals" element={<RoleGate roles={["admin"]}><Approvals /></RoleGate>} />
          <Route path="/credit-sends" element={<RoleGate roles={["admin", "cashier"]}><CreditSends /></RoleGate>} />
          <Route path="/customers/:id" element={<RoleGate roles={["admin", "cashier"]}><CustomerDetail /></RoleGate>} />
          <Route path="/reports" element={<RoleGate roles={["admin"]}><Reports /></RoleGate>} />
          <Route path="/users" element={<RoleGate roles={["admin"]}><Users /></RoleGate>} />
          <Route path="/settings" element={<RoleGate roles={["admin"]}><Settings /></RoleGate>} />
          <Route path="/consignment" element={<RoleGate roles={["admin", "storekeeper", "cashier"]}><ConsignmentPage /></RoleGate>} />
          <Route path="/gst-purchase-report" element={<RoleGate roles={["admin", "storekeeper"]}><GstPurchaseReport /></RoleGate>} />
          <Route path="/online-orders" element={<RoleGate roles={["admin", "cashier"]}><OnlineOrders /></RoleGate>} />
          <Route path="/online-shop" element={<RoleGate roles={["admin"]}><OnlineShop /></RoleGate>} />
          <Route path="/preorder-admin" element={<RoleGate roles={["admin", "storekeeper"]}><PreorderAdmin /></RoleGate>} />
          <Route path="/customer-approvals" element={<RoleGate roles={["admin", "cashier"]}><CustomerApprovals /></RoleGate>} />
          <Route path="/audit-logs" element={<RoleGate roles={["admin"]}><AuditLogs /></RoleGate>} />
          <Route path="/backup" element={<RoleGate roles={["admin"]}><BackupPage /></RoleGate>} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AnimatePresence></Suspense>
  );
}
function StaffAlerts() {
  const location = useLocation();
  return isCustomerRoute(location.pathname) ? null : <Suspense fallback={null}><OrderAlertSystem /></Suspense>;
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

          <StaffAlerts />

          <AnimatedRoutes />
        </BrowserRouter>

      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
