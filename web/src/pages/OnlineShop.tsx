import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  Image as ImageIcon,
  Megaphone,
  LayoutGrid,
  Star,
  ArrowUp,
  ArrowDown,
  Pencil,
  X,
} from "lucide-react";
import {
  useShopContent,
  useShopBrands,
  type ShopBanner,
  type ShopAd,
  type ShopAdPosition,
  type ShopSection,
  type ShopBrand,
} from "@/lib/shopContent";
import { useStore } from "@/lib/store";
import { Tag as TagIcon, Award as AwardIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import NumInput from "@/components/NumInput";
import FileUpload from "@/components/FileUpload";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { AlertTriangle } from "lucide-react";

type AnyDialog = "banner" | "ad" | "section" | "brand" | null;

export default function OnlineShop() {
  const banners = useShopContent((s) => s.banners);
  const ads = useShopContent((s) => s.ads);
  const sections = useShopContent((s) => s.sections);
  const featured = useShopContent((s) => s.featured);
  const load = useShopContent((s) => s.load);
  const addBanner = useShopContent((s) => s.addBanner);
  const updateBanner = useShopContent((s) => s.updateBanner);
  const deleteBanner = useShopContent((s) => s.deleteBanner);
  const addAd = useShopContent((s) => s.addAd);
  const updateAd = useShopContent((s) => s.updateAd);
  const deleteAd = useShopContent((s) => s.deleteAd);
  const addSection = useShopContent((s) => s.addSection);
  const updateSection = useShopContent((s) => s.updateSection);
  const deleteSection = useShopContent((s) => s.deleteSection);
  const addFeatured = useShopContent((s) => s.addFeatured);
  const removeFeatured = useShopContent((s) => s.removeFeatured);
  const lastError = useShopContent((s) => s.lastError);
  const loading = useShopContent((s) => s.loading);

  const products = useStore((s) => s.products);
  const updateProduct = useStore((s) => s.updateProduct);

  const brands = useShopBrands((s) => s.brands);
  const loadBrands = useShopBrands((s) => s.load);
  const addBrand = useShopBrands((s) => s.addBrand);
  const updateBrand = useShopBrands((s) => s.updateBrand);
  const deleteBrand = useShopBrands((s) => s.deleteBrand);

  const [editing, setEditing] = useState<AnyDialog>(null);
  const [editingBanner, setEditingBanner] = useState<ShopBanner | null>(null);
  const [editingAd, setEditingAd] = useState<ShopAd | null>(null);
  const [editingSection, setEditingSection] = useState<ShopSection | null>(null);
  const [editingBrand, setEditingBrand] = useState<ShopBrand | null>(null);

  useEffect(() => {
    void load();
    void loadBrands();
    if (!isSupabaseConfigured) return;
    const ch = supabase
      .channel("admin-shop-content")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_banners" },
        () => void load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_ads" },
        () => void load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_sections" },
        () => void load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_featured_products" },
        () => void load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_brands" },
        () => void loadBrands()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [load, loadBrands]);

  const tablesMissing =
    !!lastError &&
    /(does not exist|relation|not found)/i.test(lastError);

  const sortedBanners = useMemo(
    () => [...banners].sort((a, b) => a.sortOrder - b.sortOrder),
    [banners]
  );
  const sortedAds = useMemo(
    () => [...ads].sort((a, b) => a.sortOrder - b.sortOrder),
    [ads]
  );
  const sortedSections = useMemo(
    () => [...sections].sort((a, b) => a.sortOrder - b.sortOrder),
    [sections]
  );

  const reorderBanner = (id: string, dir: -1 | 1): void => {
    const list = sortedBanners;
    const idx = list.findIndex((b) => b.id === id);
    const swapWith = list[idx + dir];
    if (!swapWith) return;
    const me = list[idx];
    void updateBanner(me.id, { sortOrder: swapWith.sortOrder });
    void updateBanner(swapWith.id, { sortOrder: me.sortOrder });
  };
  const reorderAd = (id: string, dir: -1 | 1): void => {
    const list = sortedAds;
    const idx = list.findIndex((a) => a.id === id);
    const swapWith = list[idx + dir];
    if (!swapWith) return;
    const me = list[idx];
    void updateAd(me.id, { sortOrder: swapWith.sortOrder });
    void updateAd(swapWith.id, { sortOrder: me.sortOrder });
  };
  const reorderSection = (id: string, dir: -1 | 1): void => {
    const list = sortedSections;
    const idx = list.findIndex((s) => s.id === id);
    const swapWith = list[idx + dir];
    if (!swapWith) return;
    const me = list[idx];
    void updateSection(me.id, { sortOrder: swapWith.sortOrder });
    void updateSection(swapWith.id, { sortOrder: me.sortOrder });
  };

  return (
    <div>
      <PageHeader
        title="Online Shop Management"
        description="Manage banners, advertisements, homepage sections and featured products visible on /store."
        actions={
          <Button
            variant="outline"
            onClick={() => window.open("/store", "_blank")}
          >
            Preview Store
          </Button>
        }
      />

      {tablesMissing && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <div className="font-semibold">Online Shop tables missing</div>
            <div className="mt-1 text-xs leading-relaxed">
              The <code className="rounded bg-amber-100 px-1">shop_banners</code>,{" "}
              <code className="rounded bg-amber-100 px-1">shop_ads</code>,{" "}
              <code className="rounded bg-amber-100 px-1">shop_sections</code> tables
              are not present in your Supabase project. Open Supabase →
              SQL Editor and run migration{" "}
              <code className="rounded bg-amber-100 px-1">
                0022_shop_content.sql
              </code>{" "}
              (and{" "}
              <code className="rounded bg-amber-100 px-1">
                0023_storage_uploads_bucket.sql
              </code>{" "}
              for image uploads). Then reload this page.
            </div>
            <div className="mt-2 font-mono text-[11px] opacity-75">
              {lastError}
            </div>
          </div>
        </div>
      )}
      {!tablesMissing && lastError && (
        <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
          {lastError}
        </div>
      )}
      {loading && !lastError && (
        <div className="mb-4 text-xs text-muted-foreground">
          Loading shop content…
        </div>
      )}

      <Tabs defaultValue="banners" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:grid-cols-6">
          <TabsTrigger value="banners">
            <ImageIcon className="mr-1.5 h-4 w-4" /> Banners
          </TabsTrigger>
          <TabsTrigger value="ads">
            <Megaphone className="mr-1.5 h-4 w-4" /> Ads
          </TabsTrigger>
          <TabsTrigger value="sections">
            <LayoutGrid className="mr-1.5 h-4 w-4" /> Sections
          </TabsTrigger>
          <TabsTrigger value="featured">
            <Star className="mr-1.5 h-4 w-4" /> Featured
          </TabsTrigger>
          <TabsTrigger value="brands">
            <AwardIcon className="mr-1.5 h-4 w-4" /> Brands
          </TabsTrigger>
          <TabsTrigger value="offers">
            <TagIcon className="mr-1.5 h-4 w-4" /> Offers
          </TabsTrigger>
        </TabsList>

        {/* ============================ BANNERS ============================ */}
        <TabsContent value="banners" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Hero slider images shown at the top of the storefront.
            </div>
            <Button
              size="sm"
              onClick={() => {
                setEditingBanner(null);
                setEditing("banner");
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Add Banner
            </Button>
          </div>
          {sortedBanners.length === 0 ? (
            <EmptyCard label="No banners yet. Add your first slide." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {sortedBanners.map((b, i) => (
                <div
                  key={b.id}
                  className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                >
                  <div className="relative h-40 w-full bg-muted">
                    {b.imageUrl ? (
                      <img
                        src={b.imageUrl}
                        alt={b.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                    {!b.active && (
                      <Badge className="absolute left-2 top-2 bg-slate-700 text-white">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {b.title || "Untitled"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {b.subtitle || "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Switch
                          checked={b.active}
                          onCheckedChange={(v) =>
                            void updateBanner(b.id, { active: v })
                          }
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          disabled={i === 0}
                          onClick={() => reorderBanner(b.id, -1)}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          disabled={i === sortedBanners.length - 1}
                          onClick={() => reorderBanner(b.id, 1)}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingBanner(b);
                            setEditing("banner");
                          }}
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-rose-600"
                          onClick={() => {
                            if (confirm(`Delete banner "${b.title}"?`)) {
                              void deleteBanner(b.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============================== ADS ============================== */}
        <TabsContent value="ads" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Promotional ads shown on the storefront. Top, middle or sidebar.
            </div>
            <Button
              size="sm"
              onClick={() => {
                setEditingAd(null);
                setEditing("ad");
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Add Ad
            </Button>
          </div>
          {sortedAds.length === 0 ? (
            <EmptyCard label="No ads yet. Create your first promotion." />
          ) : (
            <div className="space-y-2">
              {sortedAds.map((a, i) => (
                <div
                  key={a.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center"
                >
                  <div className="h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {a.imageUrl ? (
                      <img
                        src={a.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {a.position}
                      </Badge>
                      {!a.active && (
                        <Badge className="bg-slate-600 text-white">Inactive</Badge>
                      )}
                      {a.endAt && (
                        <Badge variant="outline" className="text-xs">
                          ends {new Date(a.endAt).toLocaleDateString()}
                        </Badge>
                      )}
                    </div>
                    <div className="truncate text-sm font-semibold">
                      {a.title || "Untitled"}
                    </div>
                    <div className="line-clamp-1 text-xs text-muted-foreground">
                      {a.description || "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={a.active}
                      onCheckedChange={(v) => void updateAd(a.id, { active: v })}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      disabled={i === 0}
                      onClick={() => reorderAd(a.id, -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      disabled={i === sortedAds.length - 1}
                      onClick={() => reorderAd(a.id, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingAd(a);
                        setEditing("ad");
                      }}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-rose-600"
                      onClick={() => {
                        if (confirm(`Delete ad "${a.title}"?`)) {
                          void deleteAd(a.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============================ SECTIONS =========================== */}
        <TabsContent value="sections" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Homepage product rows (Top Picks, Best Selling, New Arrivals…).
            </div>
            <Button
              size="sm"
              onClick={() => {
                setEditingSection(null);
                setEditing("section");
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Add Section
            </Button>
          </div>
          {sortedSections.length === 0 ? (
            <EmptyCard label="No sections yet." />
          ) : (
            <div className="space-y-2">
              {sortedSections.map((s, i) => {
                const count = featured.filter((f) => f.sectionId === s.id).length;
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{s.title}</span>
                        <Badge variant="outline" className="font-mono text-xs">
                          {s.key}
                        </Badge>
                        {!s.active && (
                          <Badge className="bg-slate-600 text-white">
                            Disabled
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.subtitle || "—"} · max {s.maxItems} items · {count}{" "}
                        pinned
                      </div>
                    </div>
                    <Switch
                      checked={s.active}
                      onCheckedChange={(v) =>
                        void updateSection(s.id, { active: v })
                      }
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      disabled={i === 0}
                      onClick={() => reorderSection(s.id, -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      disabled={i === sortedSections.length - 1}
                      onClick={() => reorderSection(s.id, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingSection(s);
                        setEditing("section");
                      }}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-rose-600"
                      onClick={() => {
                        if (
                          confirm(
                            `Delete section "${s.title}" and all pinned products?`
                          )
                        ) {
                          void deleteSection(s.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ============================ FEATURED =========================== */}
        <TabsContent value="featured" className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Pin products to homepage sections. Drag products in or remove them.
          </div>
          {sortedSections.length === 0 ? (
            <EmptyCard label="Create a section first to pin products." />
          ) : (
            sortedSections.map((s) => (
              <FeaturedSectionEditor
                key={s.id}
                section={s}
                products={products.map((p) => ({
                  id: p.id,
                  name: p.name,
                  category: p.category,
                  photo: p.photo,
                }))}
                pinned={featured.filter((f) => f.sectionId === s.id)}
                onAdd={(productId) => void addFeatured(s.id, productId)}
                onRemove={(id) => void removeFeatured(id)}
              />
            ))
          )}
        </TabsContent>
        {/* ============================== BRANDS =========================== */}
        <TabsContent value="brands" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Manage brands shown on the storefront. Assign brands to products in the Offers tab or in Inventory.
            </div>
            <Button
              size="sm"
              onClick={() => {
                setEditingBrand(null);
                setEditing("brand");
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Add Brand
            </Button>
          </div>
          {brands.length === 0 ? (
            <EmptyCard label="No brands yet. Add your first brand." />
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {brands.map((b) => {
                const productCount = products.filter(
                  (p) => (p.brand || "").toLowerCase() === b.name.toLowerCase()
                ).length;
                return (
                  <div
                    key={b.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                      {b.logoUrl ? (
                        <img
                          src={b.logoUrl}
                          alt={b.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <AwardIcon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{b.name}</span>
                        {!b.active && (
                          <Badge className="bg-slate-600 text-white">Inactive</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {productCount} product{productCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    <Switch
                      checked={b.active}
                      onCheckedChange={(v) => void updateBrand(b.id, { active: v })}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingBrand(b);
                        setEditing("brand");
                      }}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-rose-600"
                      onClick={() => {
                        if (confirm(`Delete brand "${b.name}"?`)) {
                          void deleteBrand(b.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ============================== OFFERS =========================== */}
        <TabsContent value="offers" className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Toggle products as offers, set discount %, and assign brands. Storefront filters update instantly.
          </div>
          <ProductOfferTable
            products={products}
            brands={brands}
            onSave={(id, patch) => updateProduct(id, patch)}
          />
        </TabsContent>

      </Tabs>

      {/* ============================ DIALOGS ============================ */}
      <BrandDialog
        open={editing === "brand"}
        onOpenChange={(o) => !o && setEditing(null)}
        brand={editingBrand}
        onSave={async (data) => {
          try {
            if (editingBrand) {
              await updateBrand(editingBrand.id, data);
              toast.success("Brand saved");
            } else {
              await addBrand(data);
              toast.success("Brand added");
            }
            setEditing(null);
          } catch {
            // already toasted
          }
        }}
      />
      <BannerDialog
        open={editing === "banner"}
        onOpenChange={(o) => !o && setEditing(null)}
        banner={editingBanner}
        onSave={async (data) => {
          try {
            if (editingBanner) {
              await updateBanner(editingBanner.id, data);
              toast.success("Banner saved");
            } else {
              await addBanner({ ...data, sortOrder: banners.length * 10 + 10 });
              toast.success("Banner added");
            }
            await load();
            setEditing(null);
          } catch {
            // error toast already shown by store; keep dialog open
          }
        }}
      />
      <AdDialog
        open={editing === "ad"}
        onOpenChange={(o) => !o && setEditing(null)}
        ad={editingAd}
        onSave={async (data) => {
          try {
            if (editingAd) {
              await updateAd(editingAd.id, data);
              toast.success("Ad saved");
            } else {
              await addAd({ ...data, sortOrder: ads.length * 10 + 10 });
              toast.success("Ad added");
            }
            await load();
            setEditing(null);
          } catch {
            // error toast already shown by store; keep dialog open
          }
        }}
      />
      <SectionDialog
        open={editing === "section"}
        onOpenChange={(o) => !o && setEditing(null)}
        section={editingSection}
        onSave={async (data) => {
          try {
            if (editingSection) {
              await updateSection(editingSection.id, data);
              toast.success("Section saved");
            } else {
              await addSection({ ...data, sortOrder: sections.length * 10 + 10 });
              toast.success("Section added");
            }
            await load();
            setEditing(null);
          } catch {
            // error toast already shown by store; keep dialog open
          }
        }}
      />
    </div>
  );
}

/* --------------------------------- bits --------------------------------- */

function EmptyCard({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function FeaturedSectionEditor({
  section,
  products,
  pinned,
  onAdd,
  onRemove,
}: {
  section: ShopSection;
  products: { id: string; name: string; category: string; photo?: string }[];
  pinned: { id: string; productId: string }[];
  onAdd: (productId: string) => void;
  onRemove: (id: string) => void;
}) {
  const [pick, setPick] = useState<string>("");
  const pinnedIds = new Set(pinned.map((p) => p.productId));
  const available = products.filter((p) => !pinnedIds.has(p.id));

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-bold">{section.title}</div>
          <div className="text-xs text-muted-foreground">
            {pinned.length} / {section.maxItems} pinned · {section.active ? "active" : "disabled"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="h-9 w-56">
              <SelectValue placeholder="Add a product…" />
            </SelectTrigger>
            <SelectContent>
              {available.length === 0 ? (
                <SelectItem value="__none" disabled>
                  No products available
                </SelectItem>
              ) : (
                available.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!pick}
            onClick={() => {
              if (pick) {
                onAdd(pick);
                setPick("");
              }
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      </div>
      {pinned.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-xs text-muted-foreground">
          No products pinned to this section yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {pinned.map((f) => {
            const p = products.find((x) => x.id === f.productId);
            return (
              <div
                key={f.id}
                className="relative overflow-hidden rounded-lg border border-border bg-background p-2"
              >
                <div className="aspect-square overflow-hidden rounded bg-muted">
                  {p?.photo ? (
                    <img
                      src={p.photo}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      —
                    </div>
                  )}
                </div>
                <div className="mt-1 truncate text-xs font-medium">
                  {p?.name ?? "(deleted)"}
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(f.id)}
                  className="absolute right-1 top-1 rounded-full bg-white/95 p-1 text-rose-600 shadow ring-1 ring-rose-200 hover:bg-rose-50"
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- dialogs ------------------------------- */

function BannerDialog({
  open,
  onOpenChange,
  banner,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  banner: ShopBanner | null;
  onSave: (data: {
    title: string;
    subtitle: string;
    imageUrl: string;
    linkUrl: string;
    buttonText: string;
    active: boolean;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [buttonText, setButtonText] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(banner?.title ?? "");
      setSubtitle(banner?.subtitle ?? "");
      setImageUrl(banner?.imageUrl ?? "");
      setLinkUrl(banner?.linkUrl ?? "");
      setButtonText(banner?.buttonText ?? "");
      setActive(banner?.active ?? true);
    }
  }, [open, banner]);

  const submit = async (): Promise<void> => {
    if (!imageUrl.trim()) {
      toast.error("Image URL is required");
      return;
    }
    setSaving(true);
    await onSave({ title, subtitle, imageUrl, linkUrl, buttonText, active });
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{banner ? "Edit Banner" : "Add Banner"}</DialogTitle>
          <DialogDescription>
            Hero slide displayed at the top of /store.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Banner image *">
            <FileUpload
              value={imageUrl}
              onChange={setImageUrl}
              folder="shop/banners"
              previewClassName="h-32"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Button text">
              <Input
                value={buttonText}
                onChange={(e) => setButtonText(e.target.value)}
                placeholder="Shop Now"
              />
            </Field>
          </div>
          <Field label="Subtitle">
            <Textarea
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              rows={2}
            />
          </Field>
          <Field label="Link URL (optional)">
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="/store?cat=offers"
            />
          </Field>
          <label className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm">Active</span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdDialog({
  open,
  onOpenChange,
  ad,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ad: ShopAd | null;
  onSave: (data: {
    title: string;
    description: string;
    imageUrl: string;
    buttonText: string;
    linkUrl: string;
    position: ShopAdPosition;
    active: boolean;
    startAt: string | null;
    endAt: string | null;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [buttonText, setButtonText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [position, setPosition] = useState<ShopAdPosition>("top");
  const [active, setActive] = useState(true);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(ad?.title ?? "");
      setDescription(ad?.description ?? "");
      setImageUrl(ad?.imageUrl ?? "");
      setButtonText(ad?.buttonText ?? "");
      setLinkUrl(ad?.linkUrl ?? "");
      setPosition(ad?.position ?? "top");
      setActive(ad?.active ?? true);
      setStartAt(ad?.startAt ? ad.startAt.slice(0, 10) : "");
      setEndAt(ad?.endAt ? ad.endAt.slice(0, 10) : "");
    }
  }, [open, ad]);

  const submit = async (): Promise<void> => {
    setSaving(true);
    await onSave({
      title,
      description,
      imageUrl,
      buttonText,
      linkUrl,
      position,
      active,
      startAt: startAt ? new Date(startAt).toISOString() : null,
      endAt: endAt ? new Date(endAt).toISOString() : null,
    });
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{ad ? "Edit Ad" : "Add Ad"}</DialogTitle>
          <DialogDescription>
            Promotional banner for the storefront.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Ad image">
            <FileUpload
              value={imageUrl}
              onChange={setImageUrl}
              folder="shop/ads"
              previewClassName="h-28"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Position">
              <Select
                value={position}
                onValueChange={(v) => setPosition(v as ShopAdPosition)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="top">Top</SelectItem>
                  <SelectItem value="middle">Middle</SelectItem>
                  <SelectItem value="sidebar">Sidebar</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Button text">
              <Input
                value={buttonText}
                onChange={(e) => setButtonText(e.target.value)}
                placeholder="Shop Now"
              />
            </Field>
            <Field label="Link URL">
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <Input
                type="date"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </Field>
            <Field label="End date">
              <Input
                type="date"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </Field>
          </div>
          <label className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm">Active</span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionDialog({
  open,
  onOpenChange,
  section,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  section: ShopSection | null;
  onSave: (data: {
    key: string;
    title: string;
    subtitle: string;
    maxItems: number;
    active: boolean;
  }) => Promise<void>;
}) {
  const [key, setKey] = useState("");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [maxItems, setMaxItems] = useState<number>(8);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setKey(section?.key ?? "");
      setTitle(section?.title ?? "");
      setSubtitle(section?.subtitle ?? "");
      setMaxItems(section?.maxItems ?? 8);
      setActive(section?.active ?? true);
    }
  }, [open, section]);

  const submit = async (): Promise<void> => {
    if (!key.trim() || !title.trim()) {
      toast.error("Key and title are required");
      return;
    }
    setSaving(true);
    await onSave({
      key: key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      title: title.trim(),
      subtitle,
      maxItems,
      active,
    });
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {section ? "Edit Section" : "Add Section"}
          </DialogTitle>
          <DialogDescription>
            Homepage product row (e.g. Top Picks).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Key (id) *">
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={!!section}
              placeholder="top_picks"
            />
          </Field>
          <Field label="Title *">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Subtitle">
            <Input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
            />
          </Field>
          <Field label="Max items">
            <NumInput
              value={maxItems}
              onChange={(v) => setMaxItems(v || 1)}
              min={1}
              max={24}
            />
          </Field>
          <label className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm">Active</span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5")}>
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}

function BrandDialog({
  open,
  onOpenChange,
  brand,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  brand: ShopBrand | null;
  onSave: (data: { name: string; logoUrl: string; active: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(brand?.name ?? "");
      setLogoUrl(brand?.logoUrl ?? "");
      setActive(brand?.active ?? true);
    }
  }, [open, brand]);

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      toast.error("Brand name is required");
      return;
    }
    setSaving(true);
    await onSave({ name: name.trim(), logoUrl, active });
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{brand ? "Edit Brand" : "Add Brand"}</DialogTitle>
          <DialogDescription>
            Brands help customers filter products on the storefront.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Brand name *">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Logo (optional)">
            <FileUpload
              value={logoUrl}
              onChange={setLogoUrl}
              folder="shop/brands"
              previewClassName="h-24"
            />
          </Field>
          <label className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm">Active</span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductOfferTable({
  products,
  brands,
  onSave,
}: {
  products: import("@/lib/types").Product[];
  brands: ShopBrand[];
  onSave: (
    id: string,
    patch: { brand?: string; isOffer?: boolean; discountPct?: number; offerLabel?: string }
  ) => void;
}) {
  const [search, setSearch] = useState("");
  const [showOffersOnly, setShowOffersOnly] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (showOffersOnly && !p.isOffer && (p.discountPct ?? 0) <= 0) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.brand || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q)
      );
    });
  }, [products, search, showOffersOnly]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className="max-w-sm"
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={showOffersOnly}
            onCheckedChange={setShowOffersOnly}
          />
          Show offers only
        </label>
        <div className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {products.length} products
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyCard label="No products match." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-left">Brand</th>
                <th className="px-3 py-2 text-left">Offer</th>
                <th className="px-3 py-2 text-left">Discount %</th>
                <th className="px-3 py-2 text-left">Label</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.category || "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={p.brand || "__none"}
                      onValueChange={(v) =>
                        onSave(p.id, { brand: v === "__none" ? "" : v })
                      }
                    >
                      <SelectTrigger className="h-8 w-40">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— None —</SelectItem>
                        {brands.map((b) => (
                          <SelectItem key={b.id} value={b.name}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Switch
                      checked={!!p.isOffer}
                      onCheckedChange={(v) => onSave(p.id, { isOffer: v })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={p.discountPct ?? 0}
                      onChange={(e) =>
                        onSave(p.id, {
                          discountPct: Math.max(
                            0,
                            Math.min(100, Number(e.target.value) || 0)
                          ),
                        })
                      }
                      className="h-8 w-20"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={p.offerLabel ?? ""}
                      onChange={(e) => onSave(p.id, { offerLabel: e.target.value })}
                      placeholder="Hot Deal"
                      className="h-8 w-32"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 200 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Showing first 200. Refine search to see more.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
