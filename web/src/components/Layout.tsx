import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useStore, useCurrentUser } from "@/lib/store";
import { useCashDrawers } from "@/lib/cashDrawer";
import { useOnlineAdminStore } from "@/lib/onlineStore";
import { usePurchaseOrders } from "@/lib/purchaseOrders";
import { useGstPurchaseReport } from "@/lib/gstPurchaseReport";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  ClipboardList,
  ClipboardCheck,
  AlertTriangle,
  HandCoins,
  Send as SendIcon,
  Users,
  BarChart3,
  UserCog,
  Settings as SettingsIcon,
  FileText,
  Wallet,
  History,
  ShieldCheck,
  Bell,
  Store as StoreIcon,
  Megaphone,
  UserCheck,
  FileBarChart2,
  DatabaseBackup,
  LogOut,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  roles: Role[];
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "storekeeper", "cashier"] },
  { to: "/inventory", label: "Inventory", icon: Package, roles: ["admin", "storekeeper", "cashier"] },
  { to: "/sales", label: "Sales (POS)", icon: ShoppingCart, roles: ["admin", "cashier"] },
  { to: "/quotations", label: "Quotations", icon: FileText, roles: ["admin", "cashier"] },
  { to: "/bills", label: "Bill History", icon: History, roles: ["admin", "cashier"] },
  { to: "/cash-drawer", label: "Cash Drawer", icon: Wallet, roles: ["admin", "cashier"] },
  { to: "/suppliers", label: "Suppliers", icon: Truck, roles: ["admin", "storekeeper"] },
  { to: "/orders", label: "Orders", icon: ClipboardList, roles: ["admin", "storekeeper"] },
  { to: "/purchase-orders", label: "Purchase Orders", icon: ClipboardCheck, roles: ["admin", "storekeeper"] },
  { to: "/damaged", label: "Damaged", icon: AlertTriangle, roles: ["admin", "storekeeper"] },
  { to: "/customers", label: "Credit Customers", icon: Users, roles: ["admin", "cashier"] },
  { to: "/credit-sends", label: "Pending Sends", icon: SendIcon, roles: ["admin", "cashier"] },
  { to: "/online-orders", label: "Online Orders", icon: StoreIcon, roles: ["admin", "cashier"] },
  { to: "/online-shop", label: "Online Shop", icon: Megaphone, roles: ["admin"] },
  { to: "/customer-approvals", label: "Customer Approvals", icon: UserCheck, roles: ["admin", "cashier"] },
  { to: "/consignment", label: "Consignment", icon: HandCoins, roles: ["admin", "storekeeper", "cashier"] },
  { to: "/approvals", label: "Approvals", icon: Bell, roles: ["admin"] },
  { to: "/credit-approvals", label: "Credit Approvals", icon: ShieldCheck, roles: ["admin"] },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["admin"] },
  { to: "/gst-purchase-report", label: "GST Purchase Report", icon: FileBarChart2, roles: ["admin", "storekeeper"] },
  { to: "/users", label: "Users", icon: UserCog, roles: ["admin"] },
  { to: "/settings", label: "Settings", icon: SettingsIcon, roles: ["admin"] },
  { to: "/audit-logs", label: "Audit Logs", icon: History, roles: ["admin"] },
  { to: "/backup", label: "Backup", icon: DatabaseBackup, roles: ["admin"] },
];

export default function Layout() {
  const user = useCurrentUser();
  const logout = useStore((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar:collapsed") === "1";
  });
  useEffect(() => {
    window.localStorage.setItem("sidebar:collapsed", collapsed ? "1" : "0");
  }, [collapsed]);
  const drawers = useCashDrawers((s) => s.drawers);
  const customers = useStore((s) => s.customers);
  const pendingApprovals = customers.filter(
    (c) => c.approvalStatus === "pending"
  ).length;
  const pendingPOApprovals = usePurchaseOrders((s) =>
    s.pos.filter((p) => p.status === "waiting_approval").length
  );
  const pendingProductApprovals = useStore(
    (s) => s.products.filter((p) => p.publishStatus === "pending").length
  );
  const pendingGstBills = useGstPurchaseReport((s) =>
    s.uploads.filter((u) => u.status === "pending").length
  );
  const pendingOnlineOrders = useOnlineAdminStore((s) =>
    s.orders.filter((o) => o.status === "pending").length
  );
  const pendingCustomerApprovals = useOnlineAdminStore((s) =>
    s.customers.filter((c) => c.approvalStatus === "pending").length
  );
  const loadGstUploads = useGstPurchaseReport((s) => s.load);
  useEffect(() => {
    void loadGstUploads();
  }, [loadGstUploads]);

  if (!user) return null;
  const items = NAV.filter((n) => n.roles.includes(user.role));

  const handleLogout = async (): Promise<void> => {
    // Cashier must close their open drawer (daily closing) before signing out.
    if (user.role === "cashier") {
      // Shop-wide: any open drawer must be closed before cashier signs out.
      const openDrawer = drawers.find((d) => d.status === "open");
      if (openDrawer) {
        toast.error(
          "You must close the day before logout. Count cash, confirm expected vs actual, then close drawer.",
          { duration: 5000 }
        );
        setOpen(false);
        navigate("/cash-drawer");
        return;
      }
    }
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex h-screen overflow-hidden pos-surface">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 transform bg-sidebar text-sidebar-foreground transition-all duration-200 lg:relative lg:translate-x-0",
          collapsed ? "lg:w-16 w-64" : "w-64",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className={cn("flex h-20 items-center justify-between border-b border-sidebar-border", collapsed ? "lg:px-2 px-4" : "px-4") }>
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-md shrink-0 overflow-hidden ring-1 ring-black/5"
              aria-hidden="true"
            >
              <img
                src="https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/rviopax6xxp5mda1qhj7d.jpeg"
                alt="Ori Barakah"
                className="h-full w-full object-contain"
              />
            </div>
            <div className={cn("min-w-0", collapsed && "lg:hidden") }>
              <div className="text-sm font-extrabold tracking-tight text-white truncate">Ori Barakah</div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-amber-300">
                by Ori Brothers
              </div>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md p-1 hover:bg-sidebar-accent lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className={cn("flex flex-col gap-0.5 p-3 overflow-y-auto scrollbar-thin", "max-h-[calc(100vh-12rem)]")}>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={() => setOpen(false)}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                  collapsed && "lg:justify-center lg:px-2",
                  isActive
                    ? "bg-sidebar-primary text-white font-bold shadow-sm ring-1 ring-amber-300/50"
                    : "text-white/95 hover:bg-sidebar-accent hover:text-white"
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className={cn("flex-1", collapsed && "lg:hidden")}>{item.label}</span>
              {item.to === "/approvals" &&
                pendingApprovals + pendingPOApprovals + pendingProductApprovals > 0 && (
                  <span className={cn("ml-auto rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white animate-pulse", collapsed && "lg:hidden")}>
                    {pendingApprovals + pendingPOApprovals + pendingProductApprovals}
                  </span>
                )}
              {item.to === "/credit-approvals" && pendingApprovals > 0 && (
                <span className={cn("ml-auto rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white", collapsed && "lg:hidden")}>
                  {pendingApprovals}
                </span>
              )}
              {item.to === "/purchase-orders" && pendingPOApprovals > 0 && (
                <span className={cn("ml-auto rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white", collapsed && "lg:hidden")}>
                  {pendingPOApprovals}
                </span>
              )}
              {item.to === "/online-orders" && pendingOnlineOrders > 0 && (
                <span
                  className={cn(
                    "ml-auto rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white animate-pulse",
                    collapsed && "lg:hidden"
                  )}
                >
                  {pendingOnlineOrders}
                </span>
              )}
              {item.to === "/customer-approvals" &&
                pendingCustomerApprovals > 0 && (
                  <span
                    className={cn(
                      "ml-auto rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white",
                      collapsed && "lg:hidden"
                    )}
                  >
                    {pendingCustomerApprovals}
                  </span>
                )}
              {item.to === "/gst-purchase-report" &&
                user.role === "admin" &&
                pendingGstBills > 0 && (
                  <span
                    className={cn(
                      "ml-auto rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold text-white",
                      collapsed && "lg:hidden"
                    )}
                    title="Pending GST bill approvals"
                  >
                    {pendingGstBills}
                  </span>
                )}
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-sidebar-border p-3">
          <div className={cn("mb-2 flex items-center gap-3 rounded-lg bg-sidebar-accent/40 px-3 py-2", collapsed && "lg:px-2 lg:justify-center")}>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-sm font-bold shrink-0">
              {user.fullName.charAt(0)}
            </div>
            <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden") }>
              <div className="truncate text-sm font-semibold text-white">{user.fullName}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                {user.role}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title={collapsed ? "Sign out" : undefined}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-sm text-white/90 hover:bg-sidebar-accent hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            <span className={cn(collapsed && "lg:hidden")}>Sign out</span>
          </button>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="relative flex h-16 items-center gap-3 border-b border-sidebar-border bg-gradient-to-r from-sidebar via-sidebar to-sidebar-accent px-4 text-white shadow-sm lg:px-8">
          <button
            onClick={() => setOpen(true)}
            className="rounded-md p-1.5 text-white/90 hover:bg-white/10 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden rounded-md p-1.5 text-white/90 hover:bg-white/10 lg:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-amber-300">
                Welcome back
              </div>
              <div className="text-sm font-semibold text-white">{user.fullName}</div>
            </div>
          </div>
          <div className="flex-1" />
<div className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/15 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Live · {new Date().toLocaleDateString()}
          </div>
          {user.role === "admin" && (
            <Link
              to="/approvals"
              className="relative ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20"
              aria-label="Approvals"
            >
              <Bell className="h-4 w-4" />
              {pendingApprovals + pendingPOApprovals + pendingProductApprovals > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm">
                  {pendingApprovals + pendingPOApprovals + pendingProductApprovals}
                </span>
              )}
            </Link>
          )}
          <div className="ml-2 hidden rounded-full bg-amber-300/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-200 ring-1 ring-amber-300/30 sm:block">
            {user.role} POS
          </div>
        </header>
        <main className="flex-1 overflow-y-auto scrollbar-thin brand-watermark">
          <div className="relative z-10 mx-auto max-w-[1400px] p-4 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
