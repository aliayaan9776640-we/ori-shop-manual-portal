import ContactUs from "@/pages/ContactUs";
import PageTransition from "@/components/PageTransition";
import CustomerProfileDashboard from "@/components/CustomerProfileDashboard";
import PreOrders from "./PreOrders";
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
import FileUpload from "@/components/FileUpload";

interface PublicProduct {
  id: string;
  name: string;
  category: string;
  size?: string | null;
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
  unit_type?: string | null;
}

type NavFilter =
  | "home"
  | "shop"
  | "categories"
  | "offers"
  | "new"
  | "brands"
  | "preorders"
  | "profile"
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
    const view = searchParams.get("view");
    if (view === "profile" || view === "preorders") {
      setNavFilter(view);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [searchParams]);
  useEffect(() => {
    const payment = searchParams.get("payment");

    if (payment === "success") {
      toast.success("Payment successful. Your order has been placed.");
      setOrdersOpen(true);
    }

    if (payment === "failed") {
      toast.error("Payment failed or was declined. Please try again.");
    }

    if (payment === "cancelled") {
      toast.error("Payment was cancelled.");
    }

    if (payment) {
      const next = new URLSearchParams(searchParams);
      next.delete("payment");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setProductsLoading(false);
      setProductsError("Supabase is not configured");
      return;
    }
    let cancelled = false;

    const SELECT_COLS =
      "id,name,category,unit_type,size,selling_price,stock_pieces,photo_url,expiry_date,pieces_per_case,created_at,brand,is_offer,discount_pct,offer_label";

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
        console.log("FIRST PRODUCT UNIT TYPE:", rows?.[0]?.unit_type);
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
        (p.category || "").toLowerCase().includes(q) ||
        (p.size || "").toLowerCase().includes(q)
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
    // IMPORTANT: In Inventory, products with pieces_per_case > 1 store
    // selling_price as the CASE price. The online store must not multiply
    // it again. Per-piece price is case price / pieces per case.
    const rawPrice = Number(p.selling_price || 0);
    const piecePrice = ppc > 1 ? rawPrice / ppc : rawPrice;
    const casePrice = ppc > 1 ? rawPrice : rawPrice;
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
      productSize: p.size || "",
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
                { key: "preorders", label: "Pre-Orders", icon: PackageCheck },
                { key: "profile", label: "My Profile", icon: UserIcon },
                { key: "contact", label: "Contact Us", icon: Phone },
              ] as { key: NavFilter; label: string; icon: typeof HomeIcon }[]).map((n) => {
                const Icon = n.icon;
                const active = navFilter === n.key;

                return (
                  <button
                    key={n.key}
                    type="button"
                    onClick={() => {
                      setNavFilter(n.key);

                      if (n.key === "profile") {
                        setNavFilter("profile");
                        navigate("/store?view=profile", { replace: false });
                        window.scrollTo({ top: 0, behavior: "smooth" });
                        return;
                      }

                      if (n.key === "preorders") {
                        setNavFilter("preorders");
                        navigate("/store?view=preorders", { replace: false });
                        window.scrollTo({ top: 0, behavior: "smooth" });
                        return;
                      }

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
                        document
                          .getElementById("contact-section")
                          ?.scrollIntoView({ behavior: "smooth" });
                      } else if (n.key === "brands") {
                        setCategory("all");
                        document
                          .getElementById("brands-section")
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

        {navFilter === "contact" && <ContactUs />}
        {navFilter !== "preorders" && navFilter !== "profile" && navFilter !== "contact" && (
          <>
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



          </>
        )}

        <PageTransition pageKey={navFilter}>
          {navFilter === "preorders" && (
            <section
              id="preorders-section"
              className="mx-auto max-w-screen-2xl px-3 py-6 sm:px-6"
            >
              <PreOrders />
            </section>
          )}

          {navFilter === "profile" && <CustomerProfileDashboard />}
        </PageTransition>

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
                      {c.productSize && (
                        <div className="text-xs text-slate-500">
                          Size: {c.productSize}
                        </div>
                      )}
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
                          {i.productName}{i.productSize ? ` (${i.productSize})` : ""} x {i.qty}
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

function productUnitLabel(unitType?: string | null): string {
  switch ((unitType || "piece").toLowerCase()) {
    case "kg":
      return "KG";
    case "g":
      return "GRAM";
    case "box":
      return "BOX";
    case "case":
      return "CASE";
    case "packet":
      return "PACKET";
    case "bottle":
      return "BOTTLE";
    case "tin":
      return "TIN";
    case "bag":
      return "BAG";
    default:
      return "PIECE";
  }
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
        const ppc = Math.max(1, p.pieces_per_case ?? 1);
        // IMPORTANT: In Inventory, products with pieces_per_case > 1 store
        // selling_price as the CASE price. Do not multiply it again here.
        const rawPrice = Number(p.selling_price || 0);
        const unitPrice = ppc > 1 ? rawPrice / ppc : rawPrice;
        const casePrice = ppc > 1 ? rawPrice : rawPrice;
        const canCase = ppc > 1 && stock >= ppc;
        const unitLabel = productUnitLabel(p.unit_type);
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

              {p.size && (
                <div className="text-[11px] font-semibold text-emerald-700">
                  Size: {p.size}
                </div>
              )}

              <div className="mt-auto pt-2">
                <div className="mt-2 space-y-1">
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      PER {unitLabel}
                    </span>

                    <span className="text-base font-extrabold leading-none text-orange-600">
                      {MVR(unitPrice)}
                    </span>
                  </div>

                  {ppc > 1 && (
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        PER CASE ({ppc} PCS)
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
                    + {unitLabel}
                  </Button>

                  <Button
                    size="sm"
                    onClick={() => onAdd(p, "case")}
                    disabled={!canCase}
                    title={
                      ppc <= 1
                        ? "Sold by selected unit only"
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
  const verifySignupOtp = useCustomerStore((s) => s.verifySignupOtp);
  const bootstrap = useCustomerStore((s) => s.bootstrap);

  const [mode, setMode] = useState<"signin" | "signup" | "verify">(initialMode);
  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);

  const [loginEmail, setLoginEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [island, setIsland] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    setBusy(true);
    try {
      if (mode === "signin") {
        const cleanEmail = loginEmail.trim().toLowerCase();

        if (!cleanEmail || !password) {
          toast.error("Email and password are required");
          return;
        }

        const r = await signIn(cleanEmail, password);
        if (!r.ok) {
          toast.error(r.error ?? "Sign-in failed");
          return;
        }

        await bootstrap();
        toast.success("Welcome back!");
        onOpenChange(false);
        return;
      }

      if (mode === "verify") {
        const cleanEmail = pendingEmail.trim().toLowerCase();
        const cleanOtp = otp.trim();

        if (!cleanEmail || !cleanOtp) {
          toast.error("Email OTP is required");
          return;
        }

        const r = await verifySignupOtp(cleanEmail, cleanOtp);
        if (!r.ok) {
          toast.error(r.error ?? "OTP verification failed");
          return;
        }

        await bootstrap();
        toast.success("Email verified. Please sign in.");
        setMode("signin");
        setLoginEmail(cleanEmail);
        setPassword("");
        setOtp("");
        return;
      }

      if (!name.trim() || !phone.trim() || !email.trim() || !password) {
        toast.error("Name, mobile number, email and password are required");
        return;
      }

      if (password.length < 6) {
        toast.error("Password must be at least 6 characters");
        return;
      }

      const cleanEmail = email.trim().toLowerCase();

      const r = await signUp({
        name: name.trim(),
        phone: phone.trim(),
        password,
        island: island.trim(),
        address: address.trim(),
        email: cleanEmail,
      });

      if (!r.ok) {
        const msg = r.error ?? "Sign-up failed";

        if (
          isSupabaseConfigured &&
          /already|registered|exists/i.test(msg)
        ) {
          const { error: resendErr } = await customerSupabase.auth.resend({
            type: "signup",
            email: cleanEmail,
            options: {
              emailRedirectTo: `${window.location.origin}/customer-login`,
            },
          });

          if (resendErr) {
            toast.error(resendErr.message);
            return;
          }

          setPendingEmail(cleanEmail);
          toast.success("OTP resent to your email.");
          setMode("verify");
          return;
        }

        toast.error(msg);
        return;
      }

      setPendingEmail(cleanEmail);
      toast.success("OTP sent to your email.");
      setMode("verify");
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "signin"
      ? "Sign in"
      : mode === "verify"
        ? "Verify email"
        : "Create account";

  const description =
    mode === "signin"
      ? "Use your registered email address."
      : mode === "verify"
        ? "Enter the OTP code sent to your email."
        : "Register to place online orders.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-emerald-800">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {mode === "verify" ? (
            <>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={pendingEmail}
                  onChange={(e) => setPendingEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <Label>OTP code *</Label>
                <Input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter OTP code"
                />
              </div>
            </>
          ) : (
            <>
              {mode === "signup" && (
                <div>
                  <Label>Full name *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              )}

              <div>
                <Label>{mode === "signin" ? "Email *" : "Mobile number *"}</Label>
                <Input
                  type={mode === "signin" ? "email" : "tel"}
                  value={mode === "signin" ? loginEmail : phone}
                  onChange={(e) => {
                    if (mode === "signin") setLoginEmail(e.target.value);
                    else setPhone(e.target.value);
                  }}
                  placeholder={mode === "signin" ? "you@example.com" : "7771234"}
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
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              if (mode === "verify") {
                setMode("signin");
                return;
              }
              setMode((m) => (m === "signin" ? "signup" : "signin"));
            }}
            disabled={busy}
          >
            {mode === "signin"
              ? "Create account"
              : mode === "verify"
                ? "Back to sign in"
                : "Have an account? Sign in"}
          </Button>

          <Button
            disabled={busy}
            onClick={() => void submit()}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {busy
              ? "Please wait..."
              : mode === "signin"
                ? "Sign in"
                : mode === "verify"
                  ? "Verify OTP"
                  : "Create"}
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
  const customer = useCustomerStore((st) => st.customer);
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "bank" | "credit" | "bml_gateway"
  >("cash");
  const [notes, setNotes] = useState("");
  const [address, setAddress] = useState("");
  const [currentLocationText, setCurrentLocationText] = useState("");
  const [currentLocationUrl, setCurrentLocationUrl] = useState("");
  const [currentLatitude, setCurrentLatitude] = useState<number | null>(null);
  const [currentLongitude, setCurrentLongitude] = useState<number | null>(null);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paymentSlipUrl, setPaymentSlipUrl] = useState("");

  const [currentIslandDelivery, setCurrentIslandDelivery] = useState(true);
  const [needBoatDelivery, setNeedBoatDelivery] = useState(false);
  const [boatName, setBoatName] = useState("");
  const [boatContact, setBoatContact] = useState("");
  const [boatLocation, setBoatLocation] = useState("");
  const [boatDepartureDate, setBoatDepartureDate] = useState("");
  const [boatDepartureTime, setBoatDepartureTime] = useState("");

  const [creditAvailable, setCreditAvailable] = useState(0);
  const [creditAllowed, setCreditAllowed] = useState(false);
  const [creditMessage, setCreditMessage] = useState("Credit available only for approved credit customers");

  const [bank, setBank] = useState({
    bankName: "BML / Bank Transfer",
    accountName: "Ori Barakah Store",
    accountNumber: "",
    note: "Upload the transfer slip after payment.",
  });

  useEffect(() => {
    if (open && customer) {
      setAddress(customer.address || "");
      setPaymentMethod("cash");
      setPaymentSlipUrl("");
      setCurrentLocationText("");
      setCurrentLocationUrl("");
      setCurrentLatitude(null);
      setCurrentLongitude(null);
      setCurrentIslandDelivery(true);
      setNeedBoatDelivery(false);
    }
  }, [open, customer]);

  useEffect(() => {
    if (!open) return;
    void customerSupabase
      .from("app_settings")
      .select("online_bank_name,online_account_name,online_account_number,online_payment_note")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as any;
        if (row) {
          setBank({
            bankName: row.online_bank_name || "BML / Bank Transfer",
            accountName: row.online_account_name || "Ori Barakah Store",
            accountNumber: row.online_account_number || "",
            note: row.online_payment_note || "Upload the transfer slip after payment.",
          });
        }
      });
  }, [open]);

  useEffect(() => {
    if (!open || !customer?.name || !customer?.phone) return;
    setCreditAllowed(false);
    setCreditAvailable(0);
    void customerSupabase
      .rpc("match_approved_credit_customer", {
        p_name: customer.name,
        p_phone: customer.phone,
      })
      .then(({ data, error }) => {
        if (error) {
          setCreditMessage("Credit checking not configured. Ask admin to run the latest SQL.");
          return;
        }
        const row = Array.isArray(data) ? data[0] : null;
        if (!row?.id) {
          setCreditMessage("Credit not available: your name and phone do not match an approved credit customer.");
          return;
        }
        const limit = Number(row.credit_limit || 0);
        const balance = Number(row.balance || 0);
        const available = Math.max(0, limit - balance);
        setCreditAvailable(available);
        setCreditAllowed(available >= cartTotal && cartTotal > 0);
        setCreditMessage(
          available >= cartTotal
            ? `Available credit: MVR ${available.toFixed(2)}`
            : `Credit limit not enough. Available MVR ${available.toFixed(2)}`
        );
      });
  }, [open, customer?.name, customer?.phone, cartTotal]);

  const detectCurrentLocation = (): void => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Location tracking is not supported on this device/browser.");
      return;
    }

    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        const url = `https://www.google.com/maps?q=${lat},${lng}`;
        setCurrentLatitude(lat);
        setCurrentLongitude(lng);
        setCurrentLocationText(text);
        setCurrentLocationUrl(url);
        setDetectingLocation(false);
        toast.success("Current location captured.");
      },
      () => {
        setDetectingLocation(false);
        toast.error("Location permission denied. You can still type the delivery address manually.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  const bankSlipMissing = paymentMethod === "bank" && !paymentSlipUrl;
  const boatDetailsMissing =
    needBoatDelivery &&
    (!boatName.trim() || !boatContact.trim() || !boatLocation.trim());

  const requestLocationForOrder = (): Promise<boolean> => {
    if (currentLatitude && currentLongitude && currentLocationUrl) return Promise.resolve(true);

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Location service is not supported on this device/browser. Please type your delivery address clearly.");
      return Promise.resolve(false);
    }

    setDetectingLocation(true);
    toast.message("Please allow location service before placing the order.");

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          const url = `https://www.google.com/maps?q=${lat},${lng}`;
          setCurrentLatitude(lat);
          setCurrentLongitude(lng);
          setCurrentLocationText(text);
          setCurrentLocationUrl(url);
          setDetectingLocation(false);
          toast.success("Location captured. You can now place the order.");
          resolve(true);
        },
        (err) => {
          setDetectingLocation(false);
          toast.error(err.message || "Location permission denied. Please turn on location service and try again.");
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  };

  const submit = async (): Promise<void> => {
    if (busy) return;

    if (!address.trim()) {
      toast.error("Please enter delivery address.");
      return;
    }

    if (boatDetailsMissing) {
      toast.error("Please complete boat delivery details before submitting.");
      return;
    }

    if (paymentMethod === "credit" && !creditAllowed) {
      toast.error("Credit can only be used by approved matching credit customers.");
      return;
    }

    setBusy(true);

    try {
      const r = await placeOrder({
        paymentMethod,
        notes: notes || undefined,
        deliveryAddress: address || undefined,
        currentLocationText: currentLocationText || undefined,
        currentLocationUrl: currentLocationUrl || undefined,
        currentLatitude,
        currentLongitude,
        currentIslandDelivery,
        needBoatDelivery,
        boatName,
        boatContact,
        boatLocation,
        boatDepartureDate,
        boatDepartureTime,
        paymentSlipUrl,
      });

      if (!r.ok) {
        toast.error(r.error ?? "Order failed");
        return;
      }

      if (paymentMethod === "bml_gateway") {
        if (!r.orderId) {
          toast.error("Order created but order ID was not returned.");
          return;
        }

        const { data, error: functionError } = await supabase.functions.invoke(
          "create-bml-payment",
          {
            body: {
              order_type: "online",
              order_id: r.orderId,
            },
          }
        );

        if (functionError) {
          let detail = functionError.message || "BML payment creation failed.";

          const anyError = functionError as any;

          if (anyError.context) {
            try {
              const errorBody = await anyError.context.json();
              detail = errorBody?.error || JSON.stringify(errorBody);
            } catch {
              // keep default error
            }
          }

          console.error("BML function error:", functionError);
          toast.error(detail);
          return;
        }

        if (!data?.payment_url) {
          console.error("BML response without payment URL:", data);
          toast.error(data?.error || "BML payment URL was not returned.");
          return;
        }

        window.location.href = data.payment_url;
        return;
      }
      toast.success("Order placed! The shop will confirm shortly.");
      onPlaced();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-0 bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 text-white shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-extrabold text-white">Checkout</DialogTitle>
          <DialogDescription className="text-emerald-100">
            Confirm delivery, payment and boat delivery details if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-2xl bg-white/95 p-4 text-slate-900 shadow-sm">
            <Label>Delivery address</Label>
            <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <div className="rounded-2xl bg-white/95 p-4 text-slate-900 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex-1">
                <Label>Customer current location</Label>
                <Input
                  value={currentLocationText}
                  onChange={(e) => setCurrentLocationText(e.target.value)}
                  placeholder="Use Detect Location or type location/landmark"
                />
                {currentLocationUrl && (
                  <a
                    href={currentLocationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    Open captured location in Google Maps
                  </a>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={detectingLocation}
                onClick={detectCurrentLocation}
                className="shrink-0"
              >
                {detectingLocation ? "Detecting…" : "Detect location"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Customer can allow browser location. If permission is denied, typed delivery address still works.
            </p>
          </div>

          <div className="rounded-2xl bg-white/95 p-4 text-slate-900 shadow-sm">
            <Label>Payment method</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => {
                if (v === "credit" && !creditAllowed) {
                  toast.error("Credit can only be selected by approved matching credit customers.");
                  return;
                }

                setPaymentMethod(v as "cash" | "bank" | "credit" | "bml_gateway");
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash on delivery</SelectItem>
                <SelectItem value="bank">Bank transfer</SelectItem>
                <SelectItem value="bml_gateway">Card Payment / BML Gateway</SelectItem>
                <SelectItem value="credit" disabled={!creditAllowed}>
                  Credit {creditAllowed ? `(Available: MVR ${creditAvailable.toFixed(2)})` : "(not available)"}
                </SelectItem>
              </SelectContent>
            </Select>
            <div className={cn("mt-2 rounded-xl px-3 py-2 text-xs", creditAllowed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
              {creditMessage}
            </div>
          </div>

          {paymentMethod === "bank" && (
            <div className="overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-blue-50 p-4 text-slate-900 shadow-sm">
              <div className="mb-3 rounded-xl bg-gradient-to-r from-red-600 to-blue-700 px-4 py-3 text-white">
                <div className="text-xs font-semibold uppercase tracking-wider text-white/80">Bank Transfer</div>
                <div className="text-lg font-extrabold">{bank.bankName}</div>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div><b>Account Name:</b> {bank.accountName || "-"}</div>
                <div><b>Account No:</b> {bank.accountNumber || "-"}</div>
              </div>
              <p className="mt-2 text-xs text-slate-600">{bank.note}</p>
              <div className="mt-3">
                <Label>Upload payment slip</Label>
                <FileUpload
                  value={paymentSlipUrl}
                  onChange={(url) => setPaymentSlipUrl(url || "")}
                  folder="online-payment-slips"
                />
                {bankSlipMissing && (
                  <div className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                    Payment slip is required before placing a bank transfer order.
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-white/95 p-4 text-slate-900 shadow-sm">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={currentIslandDelivery}
                onChange={(e) => {
                  setCurrentIslandDelivery(e.target.checked);
                  if (e.target.checked) setNeedBoatDelivery(false);
                }}
              />
              Current island delivery / no boat needed
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={needBoatDelivery}
                onChange={(e) => {
                  setNeedBoatDelivery(e.target.checked);
                  if (e.target.checked) setCurrentIslandDelivery(false);
                }}
              />
              Need boat delivery
            </label>

            {needBoatDelivery && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div><Label>Boat name</Label><Input value={boatName} onChange={(e) => setBoatName(e.target.value)} /></div>
                <div><Label>Boat contact number</Label><Input value={boatContact} onChange={(e) => setBoatContact(e.target.value)} /></div>
                <div><Label>Boat location</Label><Input value={boatLocation} onChange={(e) => setBoatLocation(e.target.value)} /></div>
                <div><Label>Departure date</Label><Input type="date" value={boatDepartureDate} onChange={(e) => setBoatDepartureDate(e.target.value)} /></div>
                <div><Label>Departure time</Label><Input type="time" value={boatDepartureTime} onChange={(e) => setBoatDepartureTime(e.target.value)} /></div>
                {boatDetailsMissing && (
                  <div className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 sm:col-span-2">
                    Boat name, contact number and location are required when boat delivery is selected.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white/95 p-4 text-slate-900 shadow-sm">
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Landmark, gate code, delivery note, etc." />
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-orange-500 to-emerald-600 px-4 py-4 text-white">
            <span className="text-sm font-semibold">Order total</span>
            <span className="text-xl font-extrabold">{MVR(cartTotal)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={busy || cartTotal <= 0 || bankSlipMissing || boatDetailsMissing}
            onClick={() => void submit()}
            className="bg-orange-500 text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {bankSlipMissing
              ? "Upload slip first"
              : boatDetailsMissing
                ? "Complete boat details"
                : "Place order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}