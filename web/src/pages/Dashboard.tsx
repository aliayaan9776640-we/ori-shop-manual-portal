import { useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import Logo from "@/components/Logo";
import { useStore, useCurrentUser, landedCostPerPiece } from "@/lib/store";
import { useCreditSends } from "@/lib/creditSends";
import { useGstPurchaseReport } from "@/lib/gstPurchaseReport";
import { formatCurrency, formatNumber, isSameDay } from "@/lib/format";
import { productExpiryStatus } from "@/lib/expiry";
import {
  Coins,
  TrendingUp,
  Boxes,
  AlertTriangle,
  PackageX,
  Flame,
  ShipWheel,
  CreditCard,
  Wallet,
  CalendarClock,
  ShoppingCart,
  Search,
  ScanLine,
  PackagePlus,
  ClipboardList,
  Truck,
  Receipt,
  Activity,
  Users,
  CheckCircle2,
  ArrowRight,
  Send as SendIcon,
  FileBarChart2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { Button } from "@/components/ui/button";
import type { Product, Sale } from "@/lib/types";
import { useSettings } from "@/lib/settings";
import { Percent } from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Shared helpers                                                            */
/* -------------------------------------------------------------------------- */

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: React.ElementType;
  tone?: "default" | "success" | "warning" | "danger" | "gold" | "primary";
}

function KpiCard({ label, value, hint, icon: Icon, tone = "default" }: KpiCardProps) {
  const toneClass: Record<string, string> = {
    default: "from-white to-slate-50 text-slate-900",
    primary: "from-[hsl(75,40%,28%)] to-[hsl(75,42%,22%)] text-white",
    success: "from-emerald-50 to-emerald-100 text-emerald-900",
    warning: "from-amber-50 to-amber-100 text-amber-900",
    danger: "from-rose-50 to-rose-100 text-rose-900",
    gold: "from-[hsl(25,90%,55%)] to-[hsl(22,88%,48%)] text-white",
  };
  const iconBg: Record<string, string> = {
    default: "bg-primary/10 text-primary",
    primary: "bg-white/15 text-white",
    success: "bg-emerald-600/15 text-emerald-700",
    warning: "bg-amber-600/15 text-amber-700",
    danger: "bg-rose-600/15 text-rose-700",
    gold: "bg-white/15 text-white",
  };
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${toneClass[tone]} p-5 shadow-sm transition hover:shadow-md`}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-widest opacity-70">
            {label}
          </div>
          <div className="mt-2 truncate text-2xl font-bold tracking-tight lg:text-3xl">
            {value}
          </div>
          {hint && <div className="mt-1 text-xs opacity-70">{hint}</div>}
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg[tone]}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between">
      <div>
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

function useDashboardData() {
  const products = useStore((s) => s.products);
  const sales = useStore((s) => s.sales);
  const damaged = useStore((s) => s.damaged);
  const orders = useStore((s) => s.orders);
  const customers = useStore((s) => s.customers);
  const users = useStore((s) => s.users);
  const logs = useStore((s) => s.logs);
  const gstEnabled = useSettings((s) => s.gstEnabled);
  const gstPercent = useSettings((s) => s.gstPercent);
  const nearExpiryDays = useSettings((s) => s.nearExpiryDays);
  const batches = useStore((s) => s.batches);

  return useMemo(() => {
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - today.getDay());
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    const sumRange = (from: Date): { revenue: number; profit: number; count: number } => {
      const f = from.getTime();
      let revenue = 0, profit = 0, count = 0;
      for (const s of sales) {
        if (new Date(s.date).getTime() >= f) {
          revenue += s.total; profit += s.profit; count += 1;
        }
      }
      return { revenue, profit, count };
    };

    const todays = sales.filter((s) => isSameDay(s.date, now));
    const todayTotals = { revenue: todays.reduce((a, x) => a + x.total, 0), profit: todays.reduce((a, x) => a + x.profit, 0), count: todays.length };
    const week = sumRange(startOfWeek);
    const month = sumRange(startOfMonth);
    const year = sumRange(startOfYear);

    const stockValue = products.reduce((s, p) => s + landedCostPerPiece(p) * p.stockPieces, 0);
    const lowStock = products.filter((p) => p.stockPieces > 0 && p.stockPieces <= p.reorderLevel);
    const outOfStock = products.filter((p) => p.stockPieces === 0);
    const readyToSell = products.filter((p) => p.stockPieces > p.reorderLevel);
    const damagedValue = damaged.reduce((s, d) => s + d.valueLoss, 0);
    const pendingOrders = orders.filter((o) => o.status === "pending" || o.status === "loaded" || o.status === "partial");
    const creditTotal = customers.reduce((s, c) => s + c.balance, 0);

    // Expiry — batch-aware (uses next-to-expire batch with stock; falls back
    // to product-level expiryDate for legacy items without batches).
    const groups = { expired: [] as Product[], d7: [] as Product[], d15: [] as Product[], d30: [] as Product[] };
    products.forEach((p) => {
      const exp = productExpiryStatus(p, batches, nearExpiryDays);
      if (exp.days === null) return;
      if (exp.days < 0) groups.expired.push(p);
      else if (exp.days <= 7) groups.d7.push(p);
      else if (exp.days <= 15) groups.d15.push(p);
      else if (exp.days <= 30) groups.d30.push(p);
    });

    // 7-day chart
    const last7: { day: string; revenue: number; profit: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = sales.filter((s) => isSameDay(s.date, d));
      last7.push({
        day: d.toLocaleDateString("en-US", { weekday: "short" }),
        revenue: ds.reduce((s, x) => s + x.total, 0),
        profit: ds.reduce((s, x) => s + x.profit, 0),
      });
    }

    // Fast moving (last 7 days)
    const cutoff = Date.now() - 7 * 86400000;
    const map = new Map<string, { name: string; qty: number; total: number; profit: number; productId: string }>();
    sales
      .filter((s) => new Date(s.date).getTime() >= cutoff)
      .forEach((s) =>
        s.items.forEach((it) => {
          const cur = map.get(it.productId) ?? { name: it.name, qty: 0, total: 0, profit: 0, productId: it.productId };
          cur.qty += it.qty; cur.total += it.total; cur.profit += it.profit;
          map.set(it.productId, cur);
        })
      );
    const fastMoving = Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 6);

    // Profit by item (top 5, this month)
    const monthMap = new Map<string, { name: string; profit: number; qty: number }>();
    sales
      .filter((s) => new Date(s.date).getTime() >= startOfMonth.getTime())
      .forEach((s) => s.items.forEach((it) => {
        const cur = monthMap.get(it.productId) ?? { name: it.name, profit: 0, qty: 0 };
        cur.profit += it.profit; cur.qty += it.qty;
        monthMap.set(it.productId, cur);
      }));
    const profitByItem = Array.from(monthMap.values()).sort((a, b) => b.profit - a.profit).slice(0, 5);

    // Cashier summary
    const cashierMap = new Map<string, { name: string; total: number; count: number }>();
    todays.forEach((s) => {
      const u = users.find((x) => x.id === s.cashierId);
      const name = u?.fullName ?? "Unknown";
      const cur = cashierMap.get(s.cashierId) ?? { name, total: 0, count: 0 };
      cur.total += s.total; cur.count += 1;
      cashierMap.set(s.cashierId, cur);
    });
    const cashierSummary = Array.from(cashierMap.values()).sort((a, b) => b.total - a.total);

    // GST collected (approx) — derive from totals using configured GST rate
    const gstFactor = gstEnabled && gstPercent > 0 ? gstPercent / (100 + gstPercent) : 0;
    const gstCollectedMonth = month.revenue * gstFactor;
    const gstCollectedToday = todayTotals.revenue * gstFactor;

    return {
      products, sales, damaged, orders, customers, users, logs,
      todayTotals, week, month, year,
      stockValue, lowStock, outOfStock, readyToSell, damagedValue, pendingOrders, creditTotal,
      expiry: groups, batches, nearExpiryDays,
      last7, fastMoving, profitByItem, cashierSummary,
      todaysSales: todays,
      gstEnabled, gstPercent, gstCollectedMonth, gstCollectedToday,
    };
  }, [products, sales, damaged, orders, customers, users, logs, gstEnabled, gstPercent, batches, nearExpiryDays]);
}

/* -------------------------------------------------------------------------- */
/*  Hero                                                                      */
/* -------------------------------------------------------------------------- */

function HeroBanner({ title, subtitle, primary, secondary }: {
  title: string; subtitle: string;
  primary?: { to: string; label: string; icon: React.ElementType };
  secondary?: { to: string; label: string; icon: React.ElementType };
}) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-3xl border border-border gradient-brand text-white shadow-md">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: `url('https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/33rbc3xbwihdsvk0yelbx.jpeg')`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right -40px center",
          backgroundSize: "320px",
        }}
      />
      <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/60">
              Ori Barakah · POS Portal
            </div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
            <p className="mt-1 max-w-xl text-sm text-white/75">{subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {primary && (
            <Link to={primary.to}>
              <Button size="lg" className="h-12 gap-2 bg-[hsl(25,90%,55%)] px-5 text-base font-semibold text-white hover:bg-[hsl(22,88%,48%)]">
                <primary.icon className="h-5 w-5" /> {primary.label}
              </Button>
            </Link>
          )}
          {secondary && (
            <Link to={secondary.to}>
              <Button size="lg" variant="outline" className="h-12 gap-2 border-white/30 bg-white/5 px-5 text-base font-semibold text-white hover:bg-white/10">
                <secondary.icon className="h-5 w-5" /> {secondary.label}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Ready to Sell                                                             */
/* -------------------------------------------------------------------------- */

function ReadyToSellPanel({ data }: { data: ReturnType<typeof useDashboardData> }) {
  const totalAvailablePieces = data.products.reduce((s, p) => s + p.stockPieces, 0);
  const expiringSoon = data.expiry.d7.length + data.expiry.d15.length + data.expiry.d30.length;

  const tiles = [
    { label: "Available stock", value: formatNumber(totalAvailablePieces) + " pcs", icon: Boxes, tone: "primary" as const, hint: `${data.products.length} SKUs` },
    { label: "Ready for sale", value: String(data.readyToSell.length), icon: CheckCircle2, tone: "success" as const, hint: "above reorder" },
    { label: "Low stock", value: String(data.lowStock.length), icon: AlertTriangle, tone: "warning" as const, hint: "reorder soon" },
    { label: "Out of stock", value: String(data.outOfStock.length), icon: PackageX, tone: "danger" as const },
    { label: "Expiring soon", value: String(expiringSoon), icon: CalendarClock, tone: "warning" as const, hint: "within 30 days" },
    { label: "Fast movers", value: String(data.fastMoving.length), icon: Flame, tone: "gold" as const, hint: "last 7 days" },
    { label: "Damaged value", value: formatCurrency(data.damagedValue), icon: AlertTriangle, tone: "danger" as const },
  ];

  return (
    <div className="pos-card p-5">
      <SectionTitle
        title="Ready to Sell"
        hint="Live snapshot of what's on the shelf"
        action={
          <Link to="/inventory" className="text-xs font-medium text-primary hover:underline">
            View inventory →
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {tiles.map((t) => (
          <KpiCard key={t.label} label={t.label} value={t.value} hint={t.hint} icon={t.icon} tone={t.tone} />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Charts & lists                                                            */
/* -------------------------------------------------------------------------- */

function SalesChart({ last7 }: { last7: { day: string; revenue: number; profit: number }[] }) {
  return (
    <div className="pos-card p-5 lg:col-span-2">
      <SectionTitle title="Sales — Last 7 days" hint="Revenue and profit per day" />
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={last7} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(75 40% 28%)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="hsl(75 40% 28%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="prof" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(25 90% 55%)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="hsl(25 90% 55%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <RTooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
              formatter={(v: number) => formatCurrency(v)}
            />
            <Area type="monotone" dataKey="revenue" stroke="hsl(75 40% 28%)" strokeWidth={2.5} fill="url(#rev)" />
            <Area type="monotone" dataKey="profit" stroke="hsl(25 90% 50%)" strokeWidth={2.5} fill="url(#prof)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function FastMoversList({ items }: { items: { name: string; qty: number; total: number; profit: number }[] }) {
  return (
    <div className="pos-card p-5">
      <SectionTitle title="Fast Movers" hint="Top sellers · last 7 days" action={<Flame className="h-5 w-5 text-amber-500" />} />
      <div className="space-y-3">
        {items.length === 0 && <p className="text-sm text-muted-foreground">No sales yet.</p>}
        {items.map((f, i) => (
          <div key={f.name} className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-xs font-bold">
              {i + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{f.name}</div>
              <div className="text-xs text-muted-foreground">
                {formatNumber(f.qty)} pcs · {formatCurrency(f.total)}
              </div>
            </div>
            <div className="text-right text-xs font-semibold text-success">
              +{formatCurrency(f.profit)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentMixChart({ todaysSales }: { todaysSales: Sale[] }) {
  return (
    <div className="pos-card p-5">
      <SectionTitle title="Today's Payment Mix" action={<Wallet className="h-5 w-5 text-primary" />} />
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={(["cash", "card", "bank", "credit"] as const).map((m) => ({
              method: m.toUpperCase(),
              amount: todaysSales.filter((s) => s.paymentMethod === m).reduce((s, x) => s + x.total, 0),
            }))}
            margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="method" tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <RTooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
              formatter={(v: number) => formatCurrency(v)}
            />
            <Bar dataKey="amount" fill="hsl(25 90% 55%)" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function StockAlertsList({ low, out }: { low: Product[]; out: Product[] }) {
  const items = [...out, ...low].slice(0, 6);
  return (
    <div className="pos-card p-5">
      <SectionTitle
        title="Stock Alerts"
        action={<Link to="/inventory" className="text-xs font-medium text-primary hover:underline">View →</Link>}
      />
      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground">All stock levels are healthy.</p>}
        {items.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{p.name}</div>
              <div className="text-xs text-muted-foreground">Reorder at {p.reorderLevel} pcs</div>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                p.stockPieces === 0 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {p.stockPieces === 0 ? "Out" : `${p.stockPieces} left`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExpiryAlertsList({ data }: { data: ReturnType<typeof useDashboardData> }) {
  const alerts = [
    ...data.expiry.expired.map((p) => ({ p, label: "Expired", tone: "danger" as const })),
    ...data.expiry.d7.map((p) => ({ p, label: "≤ 7 days", tone: "danger" as const })),
    ...data.expiry.d15.map((p) => ({ p, label: "≤ 15 days", tone: "warning" as const })),
    ...data.expiry.d30.map((p) => ({ p, label: "≤ 30 days", tone: "warning" as const })),
  ];
  return (
    <div className="pos-card p-5">
      <SectionTitle title="Expiry Alerts" action={<CalendarClock className="h-5 w-5 text-amber-500" />} />
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {alerts.length === 0 && <p className="text-sm text-muted-foreground">No items expiring within 30 days.</p>}
        {alerts.slice(0, 8).map(({ p, label, tone }) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{p.name}</div>
              <div className="text-xs text-muted-foreground">
                Expires {p.expiryDate ? new Date(p.expiryDate).toLocaleDateString("en-GB") : "—"}
              </div>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone === "danger" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentSalesList({ sales, limit = 6 }: { sales: Sale[]; limit?: number }) {
  const items = [...sales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, limit);
  return (
    <div className="pos-card p-5">
      <SectionTitle
        title="Recent Sales"
        hint="Latest transactions"
        action={<Receipt className="h-5 w-5 text-muted-foreground" />}
      />
      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground">No sales yet today.</p>}
        {items.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {s.items.length} item{s.items.length > 1 ? "s" : ""} · {s.items[0]?.name}
                {s.items.length > 1 ? ` +${s.items.length - 1}` : ""}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(s.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} ·{" "}
                <span className="uppercase">{s.paymentMethod}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold">{formatCurrency(s.total)}</div>
              <div className="text-[11px] text-success">+{formatCurrency(s.profit)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityLogList({ logs, limit = 8 }: { logs: ReturnType<typeof useDashboardData>["logs"]; limit?: number }) {
  const items = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, limit);
  return (
    <div className="pos-card p-5">
      <SectionTitle title="Staff Activity" action={<Activity className="h-5 w-5 text-primary" />} />
      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {items.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
        {items.map((l) => (
          <div key={l.id} className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{l.action}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {new Date(l.date).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{l.userName}</span> · {l.detail}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  POS Quick Bar (cashier)                                                   */
/* -------------------------------------------------------------------------- */

function PosQuickBar() {
  return (
    <div className="pos-card mb-6 bg-card p-5">
      <SectionTitle title="Quick POS" hint="Search, scan, or open a new sale" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_auto]">
        <Link to="/sales" className="group relative">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-primary">
            <Search className="h-4 w-4" />
          </div>
          <div className="flex h-12 w-full items-center rounded-xl border border-input bg-background pl-10 pr-3 text-sm font-medium text-foreground transition group-hover:border-primary group-hover:bg-secondary">
            Search product by name…
          </div>
        </Link>
        <Link to="/sales" className="group relative">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-primary">
            <ScanLine className="h-4 w-4" />
          </div>
          <div className="flex h-12 w-full items-center rounded-xl border border-dashed border-input bg-background pl-10 pr-3 text-sm font-medium text-foreground transition group-hover:border-primary group-hover:bg-secondary">
            Scan or type barcode…
          </div>
        </Link>
        <Link to="/sales">
          <Button size="lg" className="h-12 w-full gap-2 bg-[hsl(25,90%,55%)] px-6 text-base font-semibold text-white hover:bg-[hsl(22,88%,48%)] lg:w-auto">
            <ShoppingCart className="h-5 w-5" /> New Sale
          </Button>
        </Link>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  ADMIN dashboard                                                           */
/* -------------------------------------------------------------------------- */

function AdminDashboard({ data }: { data: ReturnType<typeof useDashboardData> }) {
  const pendingApprovals = data.customers.filter(
    (c) => c.approvalStatus === "pending"
  ).length;
  const sendItems = useCreditSends((s) => s.items);
  const loadSends = useCreditSends((s) => s.load);
  const sendsTableMissing = useCreditSends((s) => s.tableMissing);
  const gstUploads = useGstPurchaseReport((s) => s.uploads);
  const loadGst = useGstPurchaseReport((s) => s.load);
  const gstTableMissing = useGstPurchaseReport((s) => s.tableMissing);
  useEffect(() => { void loadSends(); void loadGst(); }, [loadSends, loadGst]);
  const pendingGstBills = gstUploads.filter((u) => u.status === "pending").length;
  const pendingSends = sendItems.filter((x) => x.status === "pending").length;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const monthlyGenerated = sendItems.filter(
    (x) => x.kind === "statement" && new Date(x.createdAt).getTime() >= monthStart
  ).length;
  return (
    <>
      <HeroBanner
        title="Welcome back, boss."
        subtitle="Full overview of sales, inventory, suppliers, and credit across the shop."
        primary={{ to: "/sales", label: "New Sale", icon: ShoppingCart }}
        secondary={{ to: "/reports", label: "Open Reports", icon: ClipboardList }}
      />

      {gstTableMissing && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-900 shadow-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div className="text-sm">
            <div className="font-bold">GST Purchase Report tables are missing</div>
            <div className="mt-0.5">
              Run migration file: <code className="rounded bg-rose-100 px-1">web/supabase/migrations/0010_gst_purchase_report.sql</code> in the Supabase SQL editor to enable the GST Purchase Report module.
            </div>
          </div>
        </div>
      )}

      {sendsTableMissing && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-900 shadow-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div className="text-sm">
            <div className="font-bold">Credit billing migration not applied</div>
            <div className="mt-0.5">
              Run <code className="rounded bg-rose-100 px-1">web/supabase/migrations/0009_credit_billing.sql</code> in Supabase to enable the credit send queue and monthly statements.
            </div>
          </div>
        </div>
      )}

      {(data.expiry.expired.length > 0 || data.expiry.d7.length > 0) && (
        <Link
          to="/inventory"
          className={`mb-6 flex items-center justify-between rounded-2xl border px-5 py-4 shadow-sm transition ${
            data.expiry.expired.length > 0
              ? "border-rose-300 bg-gradient-to-r from-rose-50 to-rose-100 hover:from-rose-100 hover:to-rose-200"
              : "border-amber-300 bg-gradient-to-r from-amber-50 to-amber-100 hover:from-amber-100 hover:to-amber-200"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl text-white ${
                data.expiry.expired.length > 0 ? "bg-rose-600" : "bg-amber-500"
              }`}
            >
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <div
                className={`text-sm font-bold ${
                  data.expiry.expired.length > 0 ? "text-rose-900" : "text-amber-900"
                }`}
              >
                {data.expiry.expired.length > 0 && (
                  <>
                    {data.expiry.expired.length} expired item
                    {data.expiry.expired.length === 1 ? "" : "s"}
                  </>
                )}
                {data.expiry.expired.length > 0 && data.expiry.d7.length > 0 && " · "}
                {data.expiry.d7.length > 0 && (
                  <>
                    {data.expiry.d7.length} expiring within {data.nearExpiryDays}d
                  </>
                )}
              </div>
              <div
                className={`text-xs ${
                  data.expiry.expired.length > 0
                    ? "text-rose-800/80"
                    : "text-amber-800/80"
                }`}
              >
                Review batches in inventory and act before further loss.
              </div>
            </div>
          </div>
          <ArrowRight
            className={`h-5 w-5 ${
              data.expiry.expired.length > 0 ? "text-rose-700" : "text-amber-700"
            }`}
          />
        </Link>
      )}

      {pendingApprovals > 0 && (
        <Link
          to="/credit-approvals"
          className="mb-6 flex items-center justify-between rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-amber-100 px-5 py-4 shadow-sm transition hover:from-amber-100 hover:to-amber-200"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-amber-900">
                {pendingApprovals} pending credit customer
                {pendingApprovals === 1 ? "" : "s"} need approval
              </div>
              <div className="text-xs text-amber-800/80">
                Review and approve credit limits before they can be used in POS.
              </div>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-amber-700" />
        </Link>
      )}

      {/* Period sales */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Today" value={formatCurrency(data.todayTotals.revenue)} hint={`${data.todayTotals.count} sales`} icon={Coins} tone="gold" />
        <KpiCard label="This Week" value={formatCurrency(data.week.revenue)} hint={`${data.week.count} sales`} icon={TrendingUp} tone="primary" />
        <KpiCard label="This Month" value={formatCurrency(data.month.revenue)} hint={`profit ${formatCurrency(data.month.profit)}`} icon={TrendingUp} tone="success" />
        <KpiCard label="This Year" value={formatCurrency(data.year.revenue)} hint={`profit ${formatCurrency(data.year.profit)}`} icon={TrendingUp} />
      </div>

      {/* GST Purchase summary */}
      <Link
        to="/gst-purchase-report"
        className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm transition hover:shadow-md"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white">
            <FileBarChart2 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-sky-900">
              Pending GST Bill Approvals
              {pendingGstBills > 0 && (
                <span className="ml-2 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  {pendingGstBills}
                </span>
              )}
            </div>
            <div className="text-xs text-sky-800/80">
              Review supplier bill uploads, approve or reject, and export the GST purchase ledger.
            </div>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 text-sky-700" />
      </Link>

      {/* Credit sends summary */}
      <div className="mt-4 rounded-2xl border border-border bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white">
              <SendIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-amber-900">Credit Statements &amp; Sends</div>
              <div className="text-xs text-amber-800/80">Track outstanding credit and queued statement messages.</div>
            </div>
          </div>
          <Link to="/credit-sends">
            <Button size="sm" className="gap-2 bg-amber-600 text-white hover:bg-amber-700">
              Open Pending Sends <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <KpiCard label="Pending Sends" value={String(pendingSends)} hint="queued statements/bills" icon={SendIcon} tone="warning" />
          <KpiCard label="Outstanding Credit" value={formatCurrency(data.creditTotal)} hint={`${data.customers.length} customers`} icon={CreditCard} tone="primary" />
          <KpiCard label="Statements (this month)" value={String(monthlyGenerated)} hint="generated" icon={ClipboardList} tone="success" />
        </div>
      </div>

      {/* Operations KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="Total Profit (Mo)" value={formatCurrency(data.month.profit)} hint="this month" icon={TrendingUp} tone="success" />
        <KpiCard label="GST Collected (Mo)" value={formatCurrency(data.gstCollectedMonth)} hint={data.gstEnabled ? `${data.gstPercent}% applied` : "GST disabled"} icon={Percent} tone="primary" />
        <KpiCard label="Stock Value" value={formatCurrency(data.stockValue)} hint={`${data.products.length} products`} icon={Boxes} />
        <KpiCard label="Credit Balance" value={formatCurrency(data.creditTotal)} hint={`${data.customers.length} customers`} icon={CreditCard} />
        <KpiCard label="Damaged Loss" value={formatCurrency(data.damagedValue)} hint={`${data.damaged.length} entries`} icon={AlertTriangle} tone="danger" />
      </div>

      {/* Ready to Sell */}
      <div className="mt-6">
        <ReadyToSellPanel data={data} />
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SalesChart last7={data.last7} />
        <FastMoversList items={data.fastMoving} />
      </div>

      {/* Profit by item, payment mix, expiry */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="pos-card p-5">
          <SectionTitle title="Profit by Item" hint="Top 5 · this month" action={<TrendingUp className="h-5 w-5 text-success" />} />
          <div className="space-y-3">
            {data.profitByItem.length === 0 && <p className="text-sm text-muted-foreground">No data this month yet.</p>}
            {data.profitByItem.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-xs font-bold">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{formatNumber(p.qty)} pcs sold</div>
                </div>
                <div className="text-right text-sm font-semibold text-success">+{formatCurrency(p.profit)}</div>
              </div>
            ))}
          </div>
        </div>
        <PaymentMixChart todaysSales={data.todaysSales} />
        <ExpiryAlertsList data={data} />
      </div>

      {/* Stock alerts + cashier summary + activity */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <StockAlertsList low={data.lowStock} out={data.outOfStock} />
        <div className="pos-card p-5">
          <SectionTitle title="Cashier Summary · Today" action={<Users className="h-5 w-5 text-primary" />} />
          <div className="space-y-2">
            {data.cashierSummary.length === 0 && <p className="text-sm text-muted-foreground">No cashier activity today.</p>}
            {data.cashierSummary.map((c) => (
              <div key={c.name} className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2">
                <div>
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.count} transaction{c.count > 1 ? "s" : ""}</div>
                </div>
                <div className="text-sm font-semibold">{formatCurrency(c.total)}</div>
              </div>
            ))}
          </div>
        </div>
        <ActivityLogList logs={data.logs} />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  CASHIER dashboard                                                         */
/* -------------------------------------------------------------------------- */

function CashierDashboard({ data }: { data: ReturnType<typeof useDashboardData> }) {
  return (
    <>
      <HeroBanner
        title="Ready when you are."
        subtitle="Open a new sale, scan a barcode, or look up a product. Stay fast at the counter."
        primary={{ to: "/sales", label: "New Sale", icon: ShoppingCart }}
        secondary={{ to: "/customers", label: "Credit Customers", icon: CreditCard }}
      />

      <PosQuickBar />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="Today's Sales" value={formatCurrency(data.todayTotals.revenue)} hint={`${data.todayTotals.count} transactions`} icon={Coins} tone="gold" />
        <KpiCard label="Items Sold" value={formatNumber(data.todaysSales.reduce((s, x) => s + x.items.reduce((a, i) => a + i.qty, 0), 0))} icon={Boxes} />
        <KpiCard label="Cash" value={formatCurrency(data.todaysSales.filter((s) => s.paymentMethod === "cash").reduce((a, s) => a + s.total, 0))} icon={Wallet} tone="success" />
        <KpiCard label="Card" value={formatCurrency(data.todaysSales.filter((s) => s.paymentMethod === "card").reduce((a, s) => a + s.total, 0))} icon={CreditCard} tone="primary" />
        <KpiCard label="Credit" value={formatCurrency(data.todaysSales.filter((s) => s.paymentMethod === "credit").reduce((a, s) => a + s.total, 0))} icon={CreditCard} tone="warning" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <RecentSalesList sales={data.todaysSales} />
        <PaymentMixChart todaysSales={data.todaysSales} />
        <div className="pos-card p-5">
          <SectionTitle title="Quick Actions" />
          <div className="grid grid-cols-2 gap-3">
            <Link to="/sales" className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-secondary/40 p-4 transition hover:border-primary hover:bg-secondary">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <div className="text-sm font-semibold">New Sale</div>
              <div className="text-xs text-muted-foreground">Cash, card, transfer or credit</div>
            </Link>
            <Link to="/inventory" className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-secondary/40 p-4 transition hover:border-primary hover:bg-secondary">
              <Search className="h-5 w-5 text-primary" />
              <div className="text-sm font-semibold">Find Product</div>
              <div className="text-xs text-muted-foreground">Check stock & price</div>
            </Link>
            <Link to="/customers" className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-secondary/40 p-4 transition hover:border-primary hover:bg-secondary">
              <CreditCard className="h-5 w-5 text-primary" />
              <div className="text-sm font-semibold">Credit Sale</div>
              <div className="text-xs text-muted-foreground">Use approved customers</div>
            </Link>
            <Link to="/sales" className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-secondary/40 p-4 transition hover:border-primary hover:bg-secondary">
              <Receipt className="h-5 w-5 text-primary" />
              <div className="text-sm font-semibold">Print Receipt</div>
              <div className="text-xs text-muted-foreground">From last sale</div>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  STOREKEEPER dashboard                                                     */
/* -------------------------------------------------------------------------- */

function StorekeeperDashboard({ data }: { data: ReturnType<typeof useDashboardData> }) {
  return (
    <>
      <HeroBanner
        title="Keep the shelves moving."
        subtitle="Manage inventory, prepare supplier orders, receive boats, and track damaged stock."
        primary={{ to: "/inventory", label: "Manage Inventory", icon: PackagePlus }}
        secondary={{ to: "/orders", label: "Supplier Orders", icon: Truck }}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Stock Value" value={formatCurrency(data.stockValue)} hint={`${data.products.length} products`} icon={Boxes} tone="primary" />
        <KpiCard label="Low Stock" value={String(data.lowStock.length)} icon={AlertTriangle} tone="warning" />
        <KpiCard label="Out of Stock" value={String(data.outOfStock.length)} icon={PackageX} tone="danger" />
        <KpiCard label="Pending Orders" value={String(data.pendingOrders.length)} hint="suppliers" icon={ShipWheel} />
      </div>

      <div className="mt-6">
        <ReadyToSellPanel data={data} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <StockAlertsList low={data.lowStock} out={data.outOfStock} />
        <ExpiryAlertsList data={data} />
        <div className="pos-card p-5">
          <SectionTitle title="Quick Actions" />
          <div className="grid grid-cols-2 gap-3">
            {[
              { to: "/inventory", label: "Stock In/Out", icon: PackagePlus, hint: "Add or adjust stock" },
              { to: "/damaged", label: "Damaged", icon: AlertTriangle, hint: "Report loss" },
              { to: "/orders", label: "New Order", icon: ClipboardList, hint: "Send via Viber" },
              { to: "/orders", label: "Receive Stock", icon: Truck, hint: "Boat loading" },
            ].map((q) => (
              <Link
                key={q.label}
                to={q.to}
                className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-secondary/40 p-4 transition hover:border-primary hover:bg-secondary"
              >
                <q.icon className="h-5 w-5 text-primary" />
                <div className="text-sm font-semibold">{q.label}</div>
                <div className="text-xs text-muted-foreground">{q.hint}</div>
                <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground transition group-hover:text-primary" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ActivityLogList logs={data.logs.filter((l) => /stock|damag|order|receive/i.test(l.action))} />
        <div className="pos-card p-5">
          <SectionTitle title="Damaged Summary" action={<AlertTriangle className="h-5 w-5 text-rose-600" />} />
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Total loss" value={formatCurrency(data.damagedValue)} icon={AlertTriangle} tone="danger" />
            <KpiCard label="Entries" value={String(data.damaged.length)} icon={ClipboardList} />
          </div>
          <div className="mt-3 space-y-2">
            {data.damaged.slice(0, 4).map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{d.name}</div>
                  <div className="text-xs text-muted-foreground">{d.reason || "—"}</div>
                </div>
                <div className="text-sm font-semibold text-rose-700">-{formatCurrency(d.valueLoss)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Entry                                                                     */
/* -------------------------------------------------------------------------- */

export default function Dashboard() {
  const user = useCurrentUser();
  const data = useDashboardData();

  if (!user) return null;

  const subtitle =
    user.role === "admin"
      ? "Full operational overview of Ori Barakah Store."
      : user.role === "cashier"
      ? "Your POS workspace — fast sales and clear summaries."
      : "Stock, suppliers, and damaged items at a glance.";

  return (
    <>
      <PageHeader title={`${user.role.charAt(0).toUpperCase()}${user.role.slice(1)} Dashboard`} description={subtitle} />
      {user.role === "admin" && <AdminDashboard data={data} />}
      {user.role === "cashier" && <CashierDashboard data={data} />}
      {user.role === "storekeeper" && <StorekeeperDashboard data={data} />}
    </>
  );
}
