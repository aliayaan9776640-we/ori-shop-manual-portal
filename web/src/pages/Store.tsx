import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { customerSupabase, supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useCustomerStore } from "@/lib/onlineStore";
import { useShopContent, isAdActive } from "@/lib/shopContent";
import { daysUntilExpiry } from "@/lib/expiry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  PackageCheck,
  Truck,
  LogOut,
  Receipt,
  DoorOpen,
  User as UserIcon,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  RotateCcw,
  Award,
  Headphones,
  Home as HomeIcon,
  Tag,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Apple,
  Tv,
  Shirt,
  Heart,
  Baby,
  Trophy,
  BookOpen,
  Car,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LOGO_URL, LOGO_URL_BROTHERS } from "@/components/Logo";

interface PublicProduct {
  id: string;
  name: string;
  category: string;
  /** Base price stored on products. Treated as price per piece below. */
  selling_price: number;
  stock_pieces: number;
  photo_url: string | null;
  expiry_date: string | null;
  pieces_per_case: number | null;
  created_at?: string | null;
  brand?: string | null;
  is_offer?: boolean | null;
  discount_pct?: number | null;
  offer_label?: string | null;
}

type NavFilter =
  | "home"
  | "shop"
  | "categories"
  | "offers"
  | "new"
  | "brands"
  | "contact";

const MVR = (n: number): string =>
  `MVR ${Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Map common category keywords to icons for the sidebar.
const CAT_ICONS: { match: RegExp; icon: typeof Apple }[] = [
  { match: /grocer|food|rice|oil|sugar|spice/i, icon: Apple },
  { match: /electronic|tv|phone|laptop/i, icon: Tv },
  { match: /fashion|cloth|shirt|dress/i, icon: Shirt },
  { match: /home|living|kitchen|household/i, icon: HomeIcon },
  { match: /beauty|care|cosmetic/i, icon: Heart },
  { match: /baby|kid|child/i, icon: Baby },
  { match: /sport|outdoor/i, icon: Trophy },
  { match: /book|stationer/i, icon: BookOpen },
  { match: /auto|car|vehicle/i, icon: Car },
];

const iconForCategory = (name: string): typeof Apple => {
  for (const m of CAT_ICONS) {
    if (m.match.test(name)) return m.icon;
  }
  return Package;
};

export default function Store() {
  const customer = useCustomerStore((s) => s.customer);
  const loading = useCustomerStore((s) => s.loading);
  const cart = useCustomerStore((s) => s.cart);
  const myOrders = useCustomerStore((s) => s.myOrders);
  const bootstrap = useCustomerStore((s) => s.bootstrap);
  const addToCart = useCustomerStore((s) => s.addToCart);
  const setQty = useCustomerStore((s) => s.setQty);
  const setUnitType = useCustomerStore((s) => s.setUnitType);
  const removeFromCart = useCustomerStore((s) => s.removeFromCart);
  const clearCart = useCustomerStore((s) => s.clearCart);
  const placeOrder = useCustomerStore((s) => s.placeOrder);
  const signOut = useCustomerStore((s) => s.signOut);
  const cancelOrder = useCustomerStore((s) => s.cancelOrder);
  const loadMyOrders = useCustomerStore((s) => s.loadMyOrders);

  const banners = useShopContent((s) => s.banners);
  const ads = useShopContent((s) => s.ads);
  const sections = useShopContent((s) => s.sections);
  const featured = useShopContent((s) => s.featured);
  const loadShopContent = useShopContent((s) => s.loadPublic);
  const [bannerIdx, setBannerIdx] = useState<number>(0);

  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState<boolean>(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [brand, setBrand] = useState<string>("all");
  const [navFilter, setNavFilter] = useState<NavFilter>("home");
  const [authOpen, setAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<"signin" | "signup">("signin");
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [cartOpen, setCartOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const exitStore = async (): Promise<void> => {
    try {
      if (customer) {
        await signOut();
      } else {
        clearCart();
      }
    } catch (e) {
      console.error("[store] exit failed", e);
    }
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    void loadShopContent();
    if (!isSupabaseConfigured) return;
    const ch = customerSupabase
      .channel("public-store-content")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_banners" },
        () => loadShopContent()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_ads" },
        () => loadShopContent()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_sections" },
        () => loadShopContent()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_featured_products" },
        () => loadShopContent()
      )
      .subscribe();
    return () => {
      void customerSupabase.removeChannel(ch);
    };
  }, [loadShopContent]);

  const activeBanners = useMemo(
    () => {
      const filtered = banners
        .filter((b) => b.active && b.imageUrl)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      console.log(
        "[store] banners fetched count:",
        banners.length,
        "active with image:",
        filtered.length
      );
      return filtered;
    },
    [banners]
  );
  const topAds = useMemo(
    () => ads.filter((a) => a.position === "top" && isAdActive(a)).sort((a, b) => a.sortOrder - b.sortOrder),
    [ads]
  );
  const middleAds = useMemo(
    () => ads.filter((a) => a.position === "middle" && isAdActive(a)).sort((a, b) => a.sortOrder - b.sortOrder),
    [ads]
  );
  const sidebarAds = useMemo(
    () => ads.filter((a) => a.position === "sidebar" && isAdActive(a)).sort((a, b) => a.sortOrder - b.sortOrder),
    [ads]
  );
  const activeSections = useMemo(
    () => sections.filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [sections]
  );

  useEffect(() => {
    if (activeBanners.length <= 1) return;
    const t = window.setInterval(() => {
      setBannerIdx((i) => (i + 1) % activeBanners.length);
    }, 5000);
    return () => window.clearInterval(t);
  }, [activeBanners.length]);

  useEffect(() => {
    const a = searchParams.get("auth");
    if (a === "signin" || a === "signup") {
      if (!customer) {
        setAuthInitialMode(a);
        setAuthOpen(true);
      }
      const next = new URLSearchParams(searchParams);
      next.delete("auth");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, customer]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setProductsLoading(false);
      setProductsError("Supabase is not configured");
      return;
    }
    let cancelled = false;

    const SELECT_COLS =
      "id,name,category,selling_price,stock_pieces,photo_url,expiry_date,pieces_per_case,created_at,brand,is_offer,discount_pct,offer_label";

    const loadProducts = async (): Promise<void> => {
      console.log("STORE LOADED");
      console.log("[store] Fetching products…");
      setProductsLoading(true);
      let rows: PublicProduct[] | null = null;
      let lastError: string | null = null;

      // 1) Try the public_products view via the customer/anon client.
      //    NOTE: no client-side filters — show every row the view returns.
      const viewRes = await customerSupabase
        .from("public_products")
        .select(SELECT_COLS)
        .order("name");
      if (!viewRes.error) {
        rows = (viewRes.data as PublicProduct[]) ?? [];
        console.log("[store] public_products view rows:", rows.length);
      } else {
        lastError = viewRes.error.message;
        console.warn(
          "[store] public_products view unavailable, trying products table (customer client)",
          viewRes.error
        );
      }

      // 2) If view returned 0 rows OR errored, try direct products table
      //    with the customer client (no stock filter — show everything).
      if (!rows || rows.length === 0) {
        const tableRes = await customerSupabase
          .from("products")
          .select(SELECT_COLS)
          .order("name");
        if (!tableRes.error) {
          const tableRows = (tableRes.data as PublicProduct[]) ?? [];
          console.log(
            "[store] products table (customer) rows:",
            tableRows.length
          );
          if (tableRows.length > 0) {
            rows = tableRows;
            lastError = null;
          } else if (!rows) {
            rows = tableRows;
          }
        } else {
          console.warn(
            "[store] customer products read failed, trying staff client",
            tableRes.error
          );
          // 3) Last resort: staff supabase client (works when staff is logged in).
          const staffRes = await supabase
            .from("products")
            .select(SELECT_COLS)
            .order("name");
          if (!staffRes.error) {
            rows = (staffRes.data as PublicProduct[]) ?? [];
            console.log(
              "[store] products table (staff) rows:",
              rows.length
            );
            lastError = null;
          } else {
            lastError = tableRes.error.message;
            console.error("[store] all product fetch attempts failed", {
              view: viewRes.error,
              customer: tableRes.error,
              staff: staffRes.error,
            });
          }
        }
      }

      if (cancelled) return;
      if (rows) {
        console.log("Products fetched:", rows);
        console.log("Product count:", rows.length);
        setProducts(rows);
        setProductsError(null);
      } else if (lastError) {
        console.error("[store] products fetch error:", lastError);
        setProductsError(lastError);
      }
      setProductsLoading(false);
    };
    void loadProducts();

    const onVisible = (): void => {
      if (document.visibilityState === "visible") void loadProducts();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    const channel = customerSupabase
      .channel("public-store-products")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "products" },
        () => loadProducts()
      )
      .subscribe();
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      void customerSupabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!customer) return;
    const channel = customerSupabase
      .channel(`customer-orders-${customer.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "online_orders",
          filter: `customer_id=eq.${customer.id}`,
        },
        () => loadMyOrders()
      )
      .subscribe();
    return () => {
      void customerSupabase.removeChannel(channel);
    };
  }, [customer, loadMyOrders]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.category && set.add(p.category));
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = products.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q)
      );
    });

    if (brand !== "all") {
      list = list.filter((p) => (p.brand || "").toLowerCase() === brand.toLowerCase());
    }

    // Apply nav filter
    if (navFilter === "offers") {
      list = list.filter(
        (p) => p.is_offer === true || (p.discount_pct ?? 0) > 0
      );
    } else if (navFilter === "new") {
      list = [...list].sort((a, b) => {
        const at = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bt - at;
      });
    }

    console.log(
      "[store] active filter:",
      navFilter,
      "category:",
      category,
      "brand:",
      brand,
      "results:",
      list.length
    );
    return list;
  }, [products, search, category, brand, navFilter]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.brand && set.add(p.brand));
    return Array.from(set).sort();
  }, [products]);

  const cartTotal = cart.reduce((s, c) => s + c.unitPrice * c.qty, 0);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  const handleAdd = (
    p: PublicProduct,
    unitType: "piece" | "case" = "piece"
  ): void => {
    if (!customer) {
      setAuthOpen(true);
      return;
    }
    const ppc = Math.max(1, p.pieces_per_case ?? 1);
    // products.selling_price is stored as the price per displayed unit (case
    // when piecesPerCase>1). Per-piece price = selling_price / piecesPerCase.
    const piecePrice = p.selling_price / ppc;
    const casePrice = piecePrice * ppc;
    console.log("[store] price used:", {
      id: p.id,
      name: p.name,
      piecePrice,
      casePrice,
      piecesPerCase: ppc,
      unitType,
    });
    if (unitType === "case" && p.stock_pieces < ppc) {
      toast.error(`Not enough stock to sell a full case (${ppc} pcs).`);
      return;
    }
    addToCart({
      productId: p.id,
      productName: p.name,
      unitPrice: piecePrice,
      available: p.stock_pieces,
      unitType: ppc > 1 ? unitType : "piece",
      piecesPerCase: ppc,
    });
    toast.success(
      `${p.name} added to cart${unitType === "case" ? ` (1 case = ${ppc} pcs)` : ""}`
    );
  };

  const storeIdShort = customer
    ? `ORI-${customer.id.replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase()}`
    : "Guest";

  return (
    <div
      className="relative min-h-screen w-full overflow-x-hidden text-slate-800"
      style={{
        backgroundImage:
          "linear-gradient(180deg, #ffffff 0%, #fffdf6 35%, #f1faf3 70%, #e6f5ea 100%)",
      }}
    >
      {/* Subtle abstract texture overlay (very light, behind content) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          opacity: 0.04,
          backgroundImage:
            "radial-gradient(circle at 1px 1px, #065f46 1px, transparent 0)",
          backgroundSize: "22px 22px",
          zIndex: 0,
        }}
      />
      {/* Soft green glow accents */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "radial-gradient(60% 40% at 10% 0%, rgba(16,185,129,0.08) 0%, transparent 60%), radial-gradient(50% 35% at 95% 100%, rgba(16,185,129,0.06) 0%, transparent 60%)",
          zIndex: 0,
        }}
      />
      <div className="relative" style={{ zIndex: 1 }}>
      {/* ============================ TOP HEADER =========================== */}
      <header className="sticky top-0 z-30 border-b-2 border-orange-200 bg-gradient-to-r from-emerald-50/95 via-white/95 to-orange-50/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-screen-2xl items-center gap-4 px-3 py-3 sm:px-6">
          {/* Logo */}
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCategory("all");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="flex shrink-0 items-center gap-2"
          >
            <img
              src={LOGO_URL}
              alt="Ori Barakah Store"
              className="h-10 w-10 rounded-full object-cover ring-2 ring-orange-300"
            />
            <div className="hidden text-left sm:block">
              <div className="text-lg font-extrabold leading-none tracking-tight text-orange-500">
                ORI
              </div>
              <div className="text-[10px] font-bold tracking-[0.18em] text-emerald-700">
                BARAKAH STORE
              </div>
            </div>
          </button>

          {/* Search bar (desktop) */}
          <div className="hidden flex-1 md:block">
            <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-200 bg-slate-50 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-200">
              <div className="flex flex-1 items-center gap-2 px-3">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search for products, brands and more..."
                  className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-10 w-44 rounded-none border-0 border-l border-slate-200 bg-white text-sm focus:ring-0">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                aria-label="Search"
                className="flex h-10 w-12 items-center justify-center bg-orange-500 text-white transition hover:bg-orange-600"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Store ID pill */}
          <div className="hidden items-center gap-2 rounded-lg px-2 py-1.5 lg:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <UserIcon className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="text-[11px] text-slate-500">My Store</div>
              <div className="text-xs font-bold text-slate-800">
                ID: {storeIdShort}
              </div>
            </div>
          </div>

          {/* Cart */}
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 transition hover:border-orange-300 hover:bg-orange-50"
          >
            <div className="relative">
              <ShoppingCart className="h-6 w-6 text-slate-700" />
              {cartCount > 0 && (
                <span className="absolute -right-2 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white shadow">
                  {cartCount}
                </span>
              )}
            </div>
            <div className="hidden text-left leading-tight sm:block">
              <div className="text-[11px] text-slate-500">Cart</div>
              <div className="text-xs font-bold text-slate-800">
                {MVR(cartTotal).replace("MVR ", "MVR ")}
              </div>
            </div>
          </button>

          {/* Account / Exit */}
          {customer ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOrdersOpen(true)}
                className="hidden text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 sm:inline-flex"
              >
                <Receipt className="mr-1 h-4 w-4" />
                Orders
                {myOrders.filter((o) =>
                  ["pending", "accepted", "preparing", "out_for_delivery"].includes(
                    o.status
                  )
                ).length > 0 && (
                  <span className="ml-1 rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">
                    {myOrders.filter((o) =>
                      ["pending", "accepted", "preparing", "out_for_delivery"].includes(
                        o.status
                      )
                    ).length}
                  </span>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void signOut()}
                title="Sign out"
                className="text-slate-600"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAuthOpen(true)}
              disabled={loading}
              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            >
              Sign in
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void exitStore()}
            title="Exit store"
            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          >
            <DoorOpen className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Exit</span>
          </Button>
        </div>

        {/* Search bar (mobile) */}
        <div className="border-t border-slate-100 px-3 py-2 md:hidden">
          <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            <div className="flex flex-1 items-center gap-2 px-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products..."
                className="h-9 w-full bg-transparent text-sm outline-none"
              />
            </div>
            <button
              type="button"
              aria-label="Search"
              className="flex h-9 w-11 items-center justify-center bg-orange-500 text-white"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Nav strip */}
        <div className="border-t border-orange-100 bg-gradient-to-r from-emerald-600 via-emerald-600 to-orange-500">
          <div className="mx-auto flex max-w-screen-2xl items-center gap-1 overflow-x-auto px-3 py-2 sm:px-6">
            <button
              type="button"
              onClick={() => {
                setNavFilter("categories");
                setCategory("all");
                if (typeof window !== "undefined" && window.innerWidth < 1024) {
                  document
                    .getElementById("top-picks")
                    ?.scrollIntoView({ behavior: "smooth" });
                } else {
                  document
                    .querySelector("aside")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition",
                navFilter === "categories"
                  ? "bg-white text-emerald-700 ring-1 ring-orange-200"
                  : "bg-white/90 text-emerald-700 hover:bg-orange-50"
              )}
            >
              <span className="grid grid-cols-2 gap-0.5">
                <span className="h-1 w-1 rounded-sm bg-orange-500" />
                <span className="h-1 w-1 rounded-sm bg-emerald-600" />
                <span className="h-1 w-1 rounded-sm bg-emerald-600" />
                <span className="h-1 w-1 rounded-sm bg-orange-500" />
              </span>
              All Categories
            </button>
            {([
              { key: "home", label: "Home", icon: HomeIcon },
              { key: "shop", label: "Shop", icon: Package },
              { key: "offers", label: "Offers", icon: Tag },
              { key: "new", label: "New Arrivals", icon: Sparkles },
              { key: "brands", label: "Brands", icon: ShieldCheck },
              { key: "contact", label: "Contact Us", icon: Phone },
            ] as { key: NavFilter; label: string; icon: typeof HomeIcon }[]).map((n) => {
              const Icon = n.icon;
              const active = navFilter === n.key;
              return (
                <button
                  key={n.key}
                  type="button"
                  onClick={() => {
                    console.log("[store] nav click:", n.key);
                    setNavFilter(n.key);
                    if (n.key === "home") {
                      setCategory("all");
                      setSearch("");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    } else if (n.key === "shop") {
                      setCategory("all");
                      document
                        .getElementById("top-picks")
                        ?.scrollIntoView({ behavior: "smooth" });
                    } else if (n.key === "contact") {
                      const el = document.getElementById("contact-section");
                      el?.scrollIntoView({ behavior: "smooth" });
                    } else if (n.key === "brands") {
                      setCategory("all");
                      document
                        .getElementById("brands-section")
                        ?.scrollIntoView({ behavior: "smooth" });
                    } else {
                      // offers / new
                      document
                        .getElementById("top-picks")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }
                  }}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition",
                    active
                      ? "bg-white text-emerald-700 shadow-sm ring-1 ring-orange-200"
                      : "text-white/90 hover:bg-white/15 hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {n.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ============================ DEBUG BANNER ========================= */}
      <div className="mx-auto max-w-screen-2xl px-3 pt-3 sm:px-6">
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-mono text-emerald-900">
          <div><strong>STORE COMPONENT LOADED</strong></div>
          <div>PRODUCT COUNT: {products.length}</div>
          <div>
            STATE:{" "}
            {productsLoading
              ? "loading"
              : productsError
              ? `error → ${productsError}`
              : "ok"}
          </div>
          <div>CUSTOMER: {customer ? `${customer.name} (${customer.approvalStatus})` : "guest"}</div>
        </div>
      </div>

      {/* ============================ TOP ADS ============================== */}
      {topAds.length > 0 && (
        <div className="mx-auto max-w-screen-2xl space-y-2 px-3 pt-3 sm:px-6">
          {topAds.map((a) => (
            <AdCard key={a.id} ad={a} />
          ))}
        </div>
      )}

      {/* ============================ STATUS BANNERS ======================= */}
      <div className="mx-auto max-w-screen-2xl space-y-2 px-3 pt-3 sm:px-6">
        {!customer && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            <strong>Browsing as guest.</strong> Sign in or register to place orders.
          </div>
        )}
        {customer && customer.active === false && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-900">
            Your account is inactive. Please contact the shop.
          </div>
        )}
      </div>

      {/* ============================ MAIN GRID ============================ */}
      <div className="mx-auto grid w-full max-w-screen-2xl gap-4 px-3 py-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_260px] lg:grid-cols-[230px_minmax(0,1fr)_280px]">
        {/* ----------- LEFT SIDEBAR: Categories ------------ */}
        <aside className="hidden space-y-4 lg:block">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-base font-bold text-slate-800">
              Shop By Categories
            </div>
            <ul className="space-y-1">
              <li>
                <button
                  type="button"
                  onClick={() => setCategory("all")}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm transition",
                    category === "all"
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-slate-700 hover:bg-slate-50"
                  )}
                >
                  <Package className="h-4 w-4 text-emerald-600" />
                  <span className="flex-1 text-left">All Products</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                </button>
              </li>
              {categories.length === 0 ? (
                <li className="px-2 py-2 text-xs text-slate-400">
                  No categories yet
                </li>
              ) : (
                categories.map((c) => {
                  const Icon = iconForCategory(c);
                  const active = category === c;
                  return (
                    <li key={c}>
                      <button
                        type="button"
                        onClick={() => setCategory(c)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm transition",
                          active
                            ? "bg-emerald-50 text-emerald-700"
                            : "text-slate-700 hover:bg-slate-50"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4",
                            active ? "text-emerald-600" : "text-orange-500"
                          )}
                        />
                        <span className="flex-1 text-left capitalize">{c}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>

          {/* Special offer card */}
          <div className="overflow-hidden rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-emerald-50 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-orange-600">
              Special Offers
            </div>
            <div className="mt-1 text-2xl font-extrabold leading-tight text-slate-800">
              Up to 25% OFF
            </div>
            <div className="mt-0.5 text-xs text-slate-500">on selected items</div>
            <button
              type="button"
              onClick={() =>
                document
                  .getElementById("best-selling")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              className="mt-3 inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-orange-500 to-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-orange-600 hover:to-emerald-700"
            >
              Shop Now
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </aside>

        {/* ----------- CENTER: Hero + Products ------------ */}
        <main className="min-w-0 space-y-5">
          {/* Hero banner / admin slider */}
          {activeBanners.length > 0 ? (
            <BannerSlider
              banners={activeBanners}
              index={bannerIdx}
              setIndex={setBannerIdx}
            />
          ) : (
          <section className="relative overflow-hidden rounded-2xl border-2 border-orange-200 bg-gradient-to-br from-emerald-100 via-white to-orange-100 p-6 shadow-sm sm:p-8">
            <div className="relative z-10 max-w-md">
              <h1 className="text-2xl font-extrabold leading-tight text-slate-900 sm:text-3xl">
                Everything You Need,
                <br />
                <span className="bg-gradient-to-r from-emerald-700 to-orange-600 bg-clip-text text-transparent">All in One Store</span>
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Shop groceries, electronics, fashion, home essentials and much more.
              </p>
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById("top-picks")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-600 to-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-emerald-700 hover:to-orange-600"
              >
                Shop Now
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {/* decorative orange blob */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-orange-200/40 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute right-2 top-2 hidden opacity-90 sm:block"
            >
              <img
                src={LOGO_URL}
                alt=""
                className="h-32 w-32 rounded-full object-cover shadow-xl ring-4 ring-white"
              />
            </div>
          </section>
          )}

          {/* Category tiles */}
          {categories.length > 0 && (
            <section className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {categories.slice(0, 6).map((c) => {
                const Icon = iconForCategory(c);
                const active = category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(active ? "all" : c)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border bg-white px-2 py-3 text-center transition",
                      active
                        ? "border-emerald-400 ring-2 ring-emerald-200"
                        : "border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/40"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-7 w-7",
                        active ? "text-emerald-600" : "text-orange-500"
                      )}
                    />
                    <span className="line-clamp-1 text-[11px] font-semibold capitalize text-slate-700">
                      {c}
                    </span>
                  </button>
                );
              })}
            </section>
          )}

          {/* Featured sections (admin-managed) */}
          {activeSections.map((sec) => {
            const pinned = featured
              .filter((f) => f.sectionId === sec.id)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .slice(0, sec.maxItems)
              .map((f) => products.find((p) => p.id === f.productId))
              .filter((p): p is PublicProduct => !!p);
            if (pinned.length === 0) return null;
            return (
              <section key={sec.id} id={sec.key}>
                <SectionHeader title={sec.title} />
                {sec.subtitle && (
                  <div className="mb-3 -mt-2 text-xs text-slate-500">
                    {sec.subtitle}
                  </div>
                )}
                <ProductGrid products={pinned} onAdd={handleAdd} />
              </section>
            );
          })}

          {/* Middle ads */}
          {middleAds.length > 0 && (
            <div className="space-y-2">
              {middleAds.map((a) => (
                <AdCard key={a.id} ad={a} />
              ))}
            </div>
          )}

          {/* All products */}
          <section id="top-picks">
            <SectionHeader
              title={
                navFilter === "offers"
                  ? "Offers"
                  : navFilter === "new"
                  ? "New Arrivals"
                  : brand !== "all"
                  ? `Brand: ${brand}`
                  : "Our Products"
              }
            />
            {brands.length > 0 && (
              <div
                id="brands-section"
                className="mb-3 flex flex-wrap items-center gap-1.5"
              >
                <button
                  type="button"
                  onClick={() => setBrand("all")}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold transition",
                    brand === "all"
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"
                  )}
                >
                  All brands
                </button>
                {brands.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBrand(b)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-semibold transition",
                      brand === b
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"
                    )}
                  >
                    {b}
                  </button>
                ))}
              </div>
            )}
            {productsLoading ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                Loading products…
              </div>
            ) : productsError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-800">
                <div className="font-semibold">Could not load products</div>
                <div className="mt-1 text-xs opacity-80">{productsError}</div>
                <div className="mt-3 text-xs text-rose-700">
                  If this persists, ask the admin to apply migration{" "}
                  <code className="rounded bg-rose-100 px-1">
                    0020_public_products_view.sql
                  </code>{" "}
                  in Supabase so guests can browse the catalog.
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 border-rose-300 text-rose-700 hover:bg-rose-100"
                  onClick={() => window.location.reload()}
                >
                  Retry
                </Button>
              </div>
            ) : products.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                No products available
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                No products match your search.
              </div>
            ) : (
              <ProductGrid products={filtered} onAdd={handleAdd} />
            )}
          </section>
        </main>

        {/* ----------- RIGHT SIDEBAR: About / Contact / Delivery ------------ */}
        <aside className="space-y-4">
          {sidebarAds.map((a) => (
            <AdCard key={a.id} ad={a} compact />
          ))}
          {/* About company */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-base font-bold text-emerald-700">
              About Our Company
            </div>
            <div className="my-3 flex justify-center">
              <img
                src={LOGO_URL_BROTHERS}
                alt="Ori Brothers"
                className="h-28 w-28 rounded-full object-contain ring-1 ring-slate-100"
              />
            </div>
            <div className="text-sm font-bold text-slate-800">ORI Brothers</div>
            <div className="text-sm font-semibold text-orange-500">
              Strength. Trust. Together
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              ORI Brothers is committed to delivering quality and trust in everything
              we do. Together we grow stronger.
            </p>
          </div>

          {/* Contact us */}
          <div id="contact-section" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-base font-bold text-slate-800">Contact Us</div>
            <div className="space-y-3 text-sm">
              <a
                href="mailto:sales@oribrother.com"
                className="flex items-start gap-2.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                  <Mail className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Email
                  </span>
                  <span className="block truncate text-xs text-slate-700">
                    sales@oribrother.com
                  </span>
                </span>
              </a>
              <a
                href="https://wa.me/9609778840"
                target="_blank"
                rel="noreferrer"
                className="flex items-start gap-2.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <MessageCircle className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    WhatsApp
                  </span>
                  <span className="block text-xs text-slate-700">+960 977 8840</span>
                </span>
              </a>
              <a
                href="viber://chat?number=%2B9609778840"
                className="flex items-start gap-2.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                  <Phone className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Viber
                  </span>
                  <span className="block text-xs text-slate-700">+960 977 8840</span>
                </span>
              </a>
            </div>
          </div>

          {/* Delivery card */}
          <div className="overflow-hidden rounded-xl border border-orange-200 bg-gradient-to-br from-emerald-50 via-white to-orange-50 p-4 shadow-sm">
            <div className="text-xs font-semibold text-orange-500">Fast & Reliable</div>
            <div className="mt-0.5 text-lg font-extrabold leading-tight text-slate-800">
              Delivery
              <br />
              You Can Trust
            </div>
            <div className="mt-1 text-xs text-slate-500">On time, every time</div>
            <div className="mt-3 flex items-center gap-2">
              <Truck className="h-10 w-10 text-emerald-600" />
              <button
                type="button"
                onClick={() => setOrdersOpen(true)}
                className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50"
              >
                Track Order
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* ============================ TRUST FOOTER ========================= */}
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-screen-2xl grid-cols-2 gap-4 px-3 py-6 sm:px-6 md:grid-cols-4">
          {[
            {
              icon: ShieldCheck,
              title: "100% Secure Payment",
              sub: "Your payments are safe with us",
            },
            {
              icon: RotateCcw,
              title: "Easy Returns",
              sub: "Hassle free returns",
            },
            {
              icon: Award,
              title: "Quality Guarantee",
              sub: "We ensure top quality products",
            },
            {
              icon: Headphones,
              title: "24/7 Customer Support",
              sub: "We are here to help you anytime",
            },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-800">{f.title}</div>
                  <div className="text-xs text-slate-500">{f.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-orange-500 py-3 text-center text-xs text-white">
          © {new Date().getFullYear()} Ori Barakah Store · An Ori Brothers venture · All
          Rights Reserved.
        </div>
      </section>
      </div>

      {/* ============================ DIALOGS ============================== */}
      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        initialMode={authInitialMode}
      />

      {/* Cart drawer */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-emerald-800">Your cart</DialogTitle>
            <DialogDescription>
              Review your items before checkout.
            </DialogDescription>
          </DialogHeader>
          {cart.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              <ShoppingCart className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              Your cart is empty.
            </div>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {cart.map((c) => {
                const ppc = Math.max(1, c.piecesPerCase);
                const step = c.unitType === "case" ? ppc : 1;
                const displayQty =
                  c.unitType === "case" ? Math.max(1, Math.round(c.qty / ppc)) : c.qty;
                const unitLabel = c.unitType === "case" ? "case" : "pc";
                const displayUnitPrice =
                  c.unitType === "case" ? c.unitPrice * ppc : c.unitPrice;
                return (
                  <div
                    key={c.productId}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium">
                        {c.productName}
                      </div>
                      <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                        <span>
                          {MVR(displayUnitPrice)} / {unitLabel}
                        </span>
                        {c.unitType === "case" && (
                          <span className="text-slate-400">· {c.qty} pcs</span>
                        )}
                        {ppc > 1 && (
                          <div className="ml-1 inline-flex overflow-hidden rounded-md border border-slate-300">
                            <button
                              type="button"
                              onClick={() => setUnitType(c.productId, "piece")}
                              className={cn(
                                "px-1.5 py-0.5 text-[10px] font-bold uppercase",
                                c.unitType === "piece"
                                  ? "bg-emerald-600 text-white"
                                  : "bg-white text-slate-600 hover:bg-slate-50"
                              )}
                            >
                              Pc
                            </button>
                            <button
                              type="button"
                              onClick={() => setUnitType(c.productId, "case")}
                              disabled={c.available < ppc}
                              className={cn(
                                "px-1.5 py-0.5 text-[10px] font-bold uppercase disabled:opacity-40",
                                c.unitType === "case"
                                  ? "bg-emerald-600 text-white"
                                  : "bg-white text-slate-600 hover:bg-slate-50"
                              )}
                            >
                              Case
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => setQty(c.productId, c.qty - step)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-bold">
                        {displayQty}
                      </span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => setQty(c.productId, c.qty + step)}
                        disabled={c.qty + step > c.available}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="w-20 text-right text-sm font-bold text-orange-600">
                      {MVR(c.unitPrice * c.qty)}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-rose-600"
                      onClick={() => removeFromCart(c.productId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between rounded-lg bg-gradient-to-r from-emerald-700 to-emerald-600 px-4 py-3 text-white">
            <span className="text-sm font-medium">Total</span>
            <span className="text-lg font-extrabold">{MVR(cartTotal)}</span>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={clearCart} disabled={cart.length === 0}>
              Clear
            </Button>
            <Button
              className="bg-orange-500 text-white hover:bg-orange-600"
              disabled={cart.length === 0}
              onClick={() => {
                if (!customer) {
                  toast.message("Sign in to place your order", {
                    description: "Create an account in seconds to checkout.",
                  });
                  navigate(
                    `/customer-login?next=${encodeURIComponent("/store")}`
                  );
                  return;
                }
                if (customer.active === false) {
                  toast.error(
                    "Your account is inactive. Please contact the shop."
                  );
                  return;
                }
                setCartOpen(false);
                setCheckoutOpen(true);
              }}
            >
              Checkout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        onPlaced={() => {
          setCheckoutOpen(false);
          setOrdersOpen(true);
        }}
        cartTotal={cartTotal}
        placeOrder={placeOrder}
      />

      {/* Orders dialog */}
      <Dialog open={ordersOpen} onOpenChange={setOrdersOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-emerald-800">My orders</DialogTitle>
          </DialogHeader>
          {myOrders.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              <Receipt className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              You haven't placed any orders yet.
            </div>
          ) : (
            <div className="max-h-[28rem] space-y-3 overflow-y-auto">
              {myOrders.map((o) => (
                <div
                  key={o.id}
                  className="rounded-xl border border-slate-200 bg-white p-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs text-slate-500">
                        {new Date(o.createdAt).toLocaleString()}
                      </div>
                      <div className="text-sm font-bold text-emerald-800">
                        {o.orderNo}
                      </div>
                    </div>
                    <OrderStatusBadge status={o.status} />
                  </div>
                  <div className="mt-2 space-y-1 text-xs">
                    {o.items.map((i) => (
                      <div key={i.id} className="flex justify-between">
                        <span>
                          {i.productName} × {i.qty}
                        </span>
                        <span className="text-slate-500">{MVR(i.lineTotal)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm">
                    <span className="text-slate-500">
                      {o.paymentMethod.toUpperCase()}
                    </span>
                    <span className="font-bold text-orange-600">{MVR(o.total)}</span>
                  </div>
                  {o.rejectionReason && (
                    <div className="mt-2 rounded bg-rose-50 px-2 py-1 text-xs text-rose-800">
                      Rejected: {o.rejectionReason}
                    </div>
                  )}
                  {o.deliveryTime && (
                    <div className="mt-2 text-xs text-emerald-700">
                      Expected delivery:{" "}
                      {new Date(o.deliveryTime).toLocaleString()}
                    </div>
                  )}
                  {o.status === "pending" && (
                    <div className="mt-2 flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void cancelOrder(o.id)}
                      >
                        <X className="mr-1 h-3 w-3" />
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ----------------------------- subcomponents ---------------------------- */

function BannerSlider({
  banners,
  index,
  setIndex,
}: {
  banners: import("@/lib/shopContent").ShopBanner[];
  index: number;
  setIndex: (i: number) => void;
}) {
  const safe = banners.length === 0 ? 0 : index % banners.length;
  const b = banners[safe];
  if (!b) return null;
  const prev = (): void =>
    setIndex((safe - 1 + banners.length) % banners.length);
  const next = (): void => setIndex((safe + 1) % banners.length);
  return (
    <section className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-slate-100 shadow-sm">
      <div className="relative h-48 w-full sm:h-64 md:h-72">
        <img
          src={b.imageUrl}
          alt={b.title}
          className="h-full w-full object-cover"
        />
        {(b.title || b.subtitle || b.buttonText) && (
          <div className="absolute inset-0 flex flex-col justify-center bg-gradient-to-r from-black/55 via-black/25 to-transparent p-6 sm:p-8">
            {b.title && (
              <h2 className="max-w-md text-2xl font-extrabold leading-tight text-white drop-shadow sm:text-3xl">
                {b.title}
              </h2>
            )}
            {b.subtitle && (
              <p className="mt-1.5 max-w-md text-sm text-white/90 drop-shadow">
                {b.subtitle}
              </p>
            )}
            {b.buttonText && (
              <a
                href={b.linkUrl || "#top-picks"}
                className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-orange-600"
              >
                {b.buttonText}
                <ChevronRight className="h-4 w-4" />
              </a>
            )}
          </div>
        )}
      </div>
      {banners.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Previous slide"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-1.5 shadow ring-1 ring-black/5 transition hover:bg-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next slide"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-1.5 shadow ring-1 ring-black/5 transition hover:bg-white"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {banners.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === safe ? "w-6 bg-white" : "w-1.5 bg-white/60"
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function AdCard({
  ad,
  compact,
}: {
  ad: import("@/lib/shopContent").ShopAd;
  compact?: boolean;
}) {
  const content = (
    <div
      className={cn(
        "group relative flex overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-sm transition hover:border-orange-300",
        compact ? "flex-col" : "flex-col sm:flex-row"
      )}
    >
      {ad.imageUrl && (
        <div
          className={cn(
            "shrink-0 overflow-hidden bg-slate-100",
            compact ? "h-28 w-full" : "h-28 w-full sm:h-auto sm:w-44"
          )}
        >
          <img
            src={ad.imageUrl}
            alt={ad.title}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col justify-center gap-1 p-3">
        {ad.title && (
          <div className="text-sm font-bold text-slate-800">{ad.title}</div>
        )}
        {ad.description && (
          <div className="line-clamp-2 text-xs text-slate-600">
            {ad.description}
          </div>
        )}
        {ad.buttonText && (
          <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-orange-500 px-3 py-1 text-[11px] font-semibold text-white">
            {ad.buttonText}
            <ChevronRight className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  );
  if (ad.linkUrl) {
    return (
      <a href={ad.linkUrl} target="_blank" rel="noreferrer" className="block">
        {content}
      </a>
    );
  }
  return content;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-lg font-bold text-slate-800">{title}</h2>
      <button
        type="button"
        className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
      >
        View All
      </button>
    </div>
  );
}

function ProductGrid({
  products,
  onAdd,
}: {
  products: PublicProduct[];
  onAdd: (p: PublicProduct, unitType?: "piece" | "case") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {products.map((p) => {
        const exp = daysUntilExpiry(p.expiry_date);
        const near = exp !== null && exp >= 0 && exp <= 30;
        const stock = p.stock_pieces;
        const stockBadge =
          stock <= 0
            ? { label: "Out of stock", cls: "bg-rose-500" }
            : stock <= 5
            ? { label: `Low · ${stock} left`, cls: "bg-amber-500" }
            : { label: "In stock", cls: "bg-emerald-600" };
        return (
          <div
            key={p.id}
            className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
          >
            <div className="relative aspect-square bg-slate-50">
              {p.photo_url ? (
                <img
                  src={p.photo_url}
                  alt={p.name}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <img src={LOGO_URL} alt="" className="h-16 w-16 opacity-25" />
                </div>
              )}
              <Badge
                className={cn(
                  "absolute right-2 top-2 text-[10px] text-white shadow-sm hover:opacity-100",
                  stockBadge.cls
                )}
              >
                {stockBadge.label}
              </Badge>
              {near && (
                <Badge
                  className="absolute left-2 top-2 bg-amber-500 text-[10px] text-white hover:bg-amber-500"
                  title={`Expires in ${exp} days`}
                >
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Near expiry
                </Badge>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3">
              <div className="line-clamp-2 min-h-[2.4rem] text-sm font-semibold text-slate-800">
                {p.name}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                {p.category || "Uncategorised"}
              </div>
              {(() => {
                const ppc = Math.max(1, p.pieces_per_case ?? 1);
                const piecePrice = p.selling_price / ppc;
                const casePrice = piecePrice * ppc;
                const canCase = ppc > 1 && stock >= ppc;
                return (
                  <div className="mt-auto pt-2">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Per piece
                        </span>
                        <span className="text-base font-extrabold leading-none text-orange-600">
                          {MVR(piecePrice)}
                        </span>
                      </div>
                      {ppc > 1 && (
                        <div className="flex items-baseline justify-between gap-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            Per case ({ppc} pcs)
                          </span>
                          <span className="text-sm font-bold leading-none text-emerald-700">
                            {MVR(casePrice)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onAdd(p, "piece")}
                        disabled={stock <= 0}
                        className="h-7 flex-1 border-emerald-200 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        + Pc
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => onAdd(p, "case")}
                        disabled={!canCase}
                        title={
                          ppc <= 1
                            ? "Sold by piece only"
                            : stock < ppc
                            ? `Need ${ppc} pcs in stock`
                            : `Add 1 case (${ppc} pcs)`
                        }
                        className="h-7 flex-1 bg-emerald-600 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                      >
                        + Case
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OrderStatusBadge({
  status,
}: {
  status:
    | "pending"
    | "accepted"
    | "rejected"
    | "preparing"
    | "out_for_delivery"
    | "delivered"
    | "cancelled";
}) {
  const map = {
    pending: { label: "Pending", icon: Clock, cls: "bg-amber-500" },
    accepted: { label: "Accepted", icon: CheckCircle2, cls: "bg-sky-500" },
    rejected: { label: "Rejected", icon: X, cls: "bg-rose-500" },
    preparing: { label: "Preparing", icon: PackageCheck, cls: "bg-indigo-500" },
    out_for_delivery: {
      label: "Out for delivery",
      icon: Truck,
      cls: "bg-purple-500",
    },
    delivered: {
      label: "Delivered",
      icon: CheckCircle2,
      cls: "bg-emerald-600",
    },
    cancelled: { label: "Cancelled", icon: X, cls: "bg-slate-500" },
  } as const;
  const m = map[status];
  const Icon = m.icon;
  return (
    <Badge className={cn("text-[10px] text-white hover:opacity-100", m.cls)}>
      <Icon className="mr-1 h-3 w-3" />
      {m.label}
    </Badge>
  );
}

function AuthDialog({
  open,
  onOpenChange,
  initialMode = "signin",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialMode?: "signin" | "signup";
}) {
  const signIn = useCustomerStore((s) => s.signIn);
  const signUp = useCustomerStore((s) => s.signUp);
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [island, setIsland] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    setBusy(true);
    try {
      if (mode === "signin") {
        const r = await signIn(phone, password);
        if (!r.ok) {
          toast.error(r.error ?? "Sign-in failed");
          return;
        }
        toast.success("Welcome back!");
        onOpenChange(false);
      } else {
        if (!name.trim() || !phone.trim() || !password) {
          toast.error("Name, phone and password are required");
          return;
        }
        if (password.length < 6) {
          toast.error("Password must be at least 6 characters");
          return;
        }
        const r = await signUp({
          name: name.trim(),
          phone: phone.trim(),
          password,
          island: island.trim(),
          address: address.trim(),
          email: email.trim() || undefined,
        });
        if (!r.ok) {
          toast.error(r.error ?? "Sign-up failed");
          return;
        }
        toast.success("Account created!");
        onOpenChange(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-emerald-800">
            {mode === "signin" ? "Sign in" : "Create account"}
          </DialogTitle>
          <DialogDescription>
            {mode === "signin"
              ? "Use your registered phone number."
              : "Register to place online orders."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {mode === "signup" && (
            <div>
              <Label>Full name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div>
            <Label>Mobile number *</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="7771234"
            />
          </div>
          <div>
            <Label>Password *</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {mode === "signup" && (
            <>
              <div>
                <Label>Island</Label>
                <Input value={island} onChange={(e) => setIsland(e.target.value)} />
              </div>
              <div>
                <Label>Address</Label>
                <Textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
              <div>
                <Label>Email (optional)</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() =>
              setMode((m) => (m === "signin" ? "signup" : "signin"))
            }
            disabled={busy}
          >
            {mode === "signin" ? "Create account" : "Have an account? Sign in"}
          </Button>
          <Button
            disabled={busy}
            onClick={() => void submit()}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {mode === "signin" ? "Sign in" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckoutDialog({
  open,
  onOpenChange,
  onPlaced,
  cartTotal,
  placeOrder,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPlaced: () => void;
  cartTotal: number;
  placeOrder: ReturnType<typeof useCustomerStore.getState>["placeOrder"];
}) {
  const customer = useCustomerStore((s) => s.customer);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank" | "credit">(
    "cash"
  );
  const [notes, setNotes] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && customer) setAddress(customer.address || "");
  }, [open, customer]);

  const submit = async (): Promise<void> => {
    setBusy(true);
    try {
      const r = await placeOrder({
        paymentMethod,
        notes: notes || undefined,
        deliveryAddress: address || undefined,
      });
      if (!r.ok) {
        toast.error(r.error ?? "Order failed");
        return;
      }
      toast.success("Order placed! The shop will confirm shortly.");
      onPlaced();
    } finally {
      setBusy(false);
    }
  };

  const creditAvailable = customer?.isCreditApproved
    ? Math.max(0, customer.creditLimit - customer.creditBalance)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-emerald-800">Checkout</DialogTitle>
          <DialogDescription>
            Confirm delivery address and payment.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Delivery address</Label>
            <Textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div>
            <Label>Payment method</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) =>
                setPaymentMethod(v as "cash" | "bank" | "credit")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash on delivery</SelectItem>
                <SelectItem value="bank">Bank transfer</SelectItem>
                <SelectItem value="credit" disabled={!customer?.isCreditApproved}>
                  Credit{" "}
                  {customer?.isCreditApproved
                    ? `(MVR ${creditAvailable.toFixed(2)} available)`
                    : "(not approved)"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Landmark, gate code, etc."
            />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-gradient-to-r from-emerald-700 to-orange-500 px-4 py-3 text-white">
            <span className="text-sm">Order total</span>
            <span className="text-lg font-extrabold">{MVR(cartTotal)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || cartTotal <= 0}
            onClick={() => void submit()}
            className="bg-orange-500 text-white hover:bg-orange-600"
          >
            Place order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
