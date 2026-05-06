import { create } from "zustand";
import { customerSupabase, supabase, isSupabaseConfigured } from "./supabase";
import { toast } from "sonner";

/* --------------------------------- types -------------------------------- */

export interface ShopBanner {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  linkUrl: string;
  buttonText: string;
  sortOrder: number;
  active: boolean;
}

export type ShopAdPosition = "top" | "middle" | "sidebar";

export interface ShopAd {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  buttonText: string;
  linkUrl: string;
  position: ShopAdPosition;
  sortOrder: number;
  active: boolean;
  startAt: string | null;
  endAt: string | null;
}

export interface ShopSection {
  id: string;
  key: string;
  title: string;
  subtitle: string;
  active: boolean;
  maxItems: number;
  sortOrder: number;
}

export interface ShopFeaturedProduct {
  id: string;
  sectionId: string;
  productId: string;
  sortOrder: number;
}

export interface ShopBrand {
  id: string;
  name: string;
  logoUrl: string;
  active: boolean;
  sortOrder: number;
}

interface BrandRow {
  id: string;
  name: string;
  logo_url: string | null;
  active: boolean;
  sort_order: number;
}

const rowToBrand = (r: BrandRow): ShopBrand => ({
  id: r.id,
  name: r.name,
  logoUrl: r.logo_url ?? "",
  active: r.active,
  sortOrder: r.sort_order,
});

interface BannerRow {
  id: string;
  title: string | null;
  subtitle: string | null;
  image_url: string;
  link_url: string | null;
  button_text: string | null;
  sort_order: number;
  active: boolean;
}
interface AdRow {
  id: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  button_text: string | null;
  link_url: string | null;
  position: ShopAdPosition;
  sort_order: number;
  active: boolean;
  start_at: string | null;
  end_at: string | null;
}
interface SectionRow {
  id: string;
  key: string;
  title: string;
  subtitle: string | null;
  active: boolean;
  max_items: number;
  sort_order: number;
}
interface FeaturedRow {
  id: string;
  section_id: string;
  product_id: string;
  sort_order: number;
}

const rowToBanner = (r: BannerRow): ShopBanner => ({
  id: r.id,
  title: r.title ?? "",
  subtitle: r.subtitle ?? "",
  imageUrl: r.image_url,
  linkUrl: r.link_url ?? "",
  buttonText: r.button_text ?? "",
  sortOrder: r.sort_order,
  active: r.active,
});
const rowToAd = (r: AdRow): ShopAd => ({
  id: r.id,
  title: r.title ?? "",
  description: r.description ?? "",
  imageUrl: r.image_url ?? "",
  buttonText: r.button_text ?? "",
  linkUrl: r.link_url ?? "",
  position: r.position,
  sortOrder: r.sort_order,
  active: r.active,
  startAt: r.start_at,
  endAt: r.end_at,
});
const rowToSection = (r: SectionRow): ShopSection => ({
  id: r.id,
  key: r.key,
  title: r.title,
  subtitle: r.subtitle ?? "",
  active: r.active,
  maxItems: r.max_items,
  sortOrder: r.sort_order,
});
const rowToFeatured = (r: FeaturedRow): ShopFeaturedProduct => ({
  id: r.id,
  sectionId: r.section_id,
  productId: r.product_id,
  sortOrder: r.sort_order,
});

/* ------------------------------- store ------------------------------ */

interface ShopContentState {
  banners: ShopBanner[];
  ads: ShopAd[];
  sections: ShopSection[];
  featured: ShopFeaturedProduct[];
  loading: boolean;
  lastError: string | null;

  load: () => Promise<void>;
  loadPublic: () => Promise<void>;

  // banners
  addBanner: (
    input: Omit<ShopBanner, "id" | "sortOrder"> & { sortOrder?: number }
  ) => Promise<void>;
  updateBanner: (id: string, patch: Partial<ShopBanner>) => Promise<void>;
  deleteBanner: (id: string) => Promise<void>;

  // ads
  addAd: (
    input: Omit<ShopAd, "id" | "sortOrder"> & { sortOrder?: number }
  ) => Promise<void>;
  updateAd: (id: string, patch: Partial<ShopAd>) => Promise<void>;
  deleteAd: (id: string) => Promise<void>;

  // sections
  addSection: (
    input: Omit<ShopSection, "id" | "sortOrder"> & { sortOrder?: number }
  ) => Promise<void>;
  updateSection: (id: string, patch: Partial<ShopSection>) => Promise<void>;
  deleteSection: (id: string) => Promise<void>;

  // featured products
  addFeatured: (sectionId: string, productId: string) => Promise<void>;
  removeFeatured: (id: string) => Promise<void>;
}

const bannerPatchToRow = (p: Partial<ShopBanner>): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  if (p.title !== undefined) row.title = p.title || null;
  if (p.subtitle !== undefined) row.subtitle = p.subtitle || null;
  if (p.imageUrl !== undefined) row.image_url = p.imageUrl;
  if (p.linkUrl !== undefined) row.link_url = p.linkUrl || null;
  if (p.buttonText !== undefined) row.button_text = p.buttonText || null;
  if (p.sortOrder !== undefined) row.sort_order = p.sortOrder;
  if (p.active !== undefined) row.active = p.active;
  return row;
};
const adPatchToRow = (p: Partial<ShopAd>): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  if (p.title !== undefined) row.title = p.title || null;
  if (p.description !== undefined) row.description = p.description || null;
  if (p.imageUrl !== undefined) row.image_url = p.imageUrl || null;
  if (p.buttonText !== undefined) row.button_text = p.buttonText || null;
  if (p.linkUrl !== undefined) row.link_url = p.linkUrl || null;
  if (p.position !== undefined) row.position = p.position;
  if (p.sortOrder !== undefined) row.sort_order = p.sortOrder;
  if (p.active !== undefined) row.active = p.active;
  if (p.startAt !== undefined) row.start_at = p.startAt || null;
  if (p.endAt !== undefined) row.end_at = p.endAt || null;
  return row;
};
const sectionPatchToRow = (p: Partial<ShopSection>): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  if (p.key !== undefined) row.key = p.key;
  if (p.title !== undefined) row.title = p.title;
  if (p.subtitle !== undefined) row.subtitle = p.subtitle || null;
  if (p.active !== undefined) row.active = p.active;
  if (p.maxItems !== undefined) row.max_items = p.maxItems;
  if (p.sortOrder !== undefined) row.sort_order = p.sortOrder;
  return row;
};

export const useShopContent = create<ShopContentState>((set, get) => ({
  banners: [],
  ads: [],
  sections: [],
  featured: [],
  loading: false,
  lastError: null,

  load: async () => {
    if (!isSupabaseConfigured) {
      set({ loading: false, lastError: "Supabase is not configured" });
      return;
    }
    set({ loading: true });
    const [bRes, aRes, sRes, fRes] = await Promise.all([
      supabase.from("shop_banners").select("*").order("sort_order"),
      supabase.from("shop_ads").select("*").order("sort_order"),
      supabase.from("shop_sections").select("*").order("sort_order"),
      supabase.from("shop_featured_products").select("*").order("sort_order"),
    ]);
    const err =
      bRes.error?.message ||
      aRes.error?.message ||
      sRes.error?.message ||
      fRes.error?.message ||
      null;
    if (err) {
      console.error("[shopContent] load failed", err);
      const lower = err.toLowerCase();
      if (
        lower.includes("does not exist") ||
        lower.includes("not found") ||
        lower.includes("relation")
      ) {
        toast.error(
          "Online shop tables missing. Apply migration 0022_shop_content.sql in Supabase."
        );
      } else {
        toast.error("Load shop content failed: " + err);
      }
    } else {
      console.log("[shopContent] loaded", {
        banners: bRes.data?.length ?? 0,
        ads: aRes.data?.length ?? 0,
        sections: sRes.data?.length ?? 0,
        featured: fRes.data?.length ?? 0,
      });
    }
    set({
      banners: ((bRes.data as BannerRow[]) ?? []).map(rowToBanner),
      ads: ((aRes.data as AdRow[]) ?? []).map(rowToAd),
      sections: ((sRes.data as SectionRow[]) ?? []).map(rowToSection),
      featured: ((fRes.data as FeaturedRow[]) ?? []).map(rowToFeatured),
      loading: false,
      lastError: err,
    });
  },

  loadPublic: async () => {
    if (!isSupabaseConfigured) {
      console.warn("[shopContent] public load skipped — Supabase not configured");
      return;
    }
    console.log("[shopContent] public load: fetching from public.shop_banners (active=true)");
    // Try the customer (anon) client first. If it fails for any reason
    // (e.g. tab has stale customer auth), fall back to the staff client.
    const fetchAll = async (
      client: typeof customerSupabase
    ): Promise<{
      bRes: Awaited<ReturnType<typeof client.from>>;
      aRes: unknown;
      sRes: unknown;
      fRes: unknown;
    } | null> => {
      const [bRes, aRes, sRes, fRes] = await Promise.all([
        client
          .from("shop_banners")
          .select("*")
          .eq("active", true)
          .order("sort_order", { ascending: true }),
        client.from("shop_ads").select("*").order("sort_order", { ascending: true }),
        client.from("shop_sections").select("*").order("sort_order", { ascending: true }),
        client
          .from("shop_featured_products")
          .select("*")
          .order("sort_order", { ascending: true }),
      ]);
      return { bRes, aRes, sRes, fRes } as never;
    };

    let result = (await fetchAll(customerSupabase)) as {
      bRes: { data: BannerRow[] | null; error: { message: string } | null };
      aRes: { data: AdRow[] | null; error: { message: string } | null };
      sRes: { data: SectionRow[] | null; error: { message: string } | null };
      fRes: { data: FeaturedRow[] | null; error: { message: string } | null };
    };
    let err =
      result.bRes.error?.message ||
      result.aRes.error?.message ||
      result.sRes.error?.message ||
      result.fRes.error?.message ||
      null;

    if (err) {
      console.warn(
        "[shopContent] public load via customerSupabase failed, retrying via supabase client",
        err
      );
      result = (await fetchAll(supabase)) as typeof result;
      err =
        result.bRes.error?.message ||
        result.aRes.error?.message ||
        result.sRes.error?.message ||
        result.fRes.error?.message ||
        null;
    }

    if (err) {
      console.error("[shopContent] public load failed:", err);
      set({ lastError: err });
      return;
    }

    const bannerRows = result.bRes.data ?? [];
    console.log(
      "[shopContent] banners fetched count:",
      bannerRows.length,
      bannerRows.map((b) => ({
        id: b.id,
        title: b.title,
        image_url: b.image_url,
        active: b.active,
        sort_order: b.sort_order,
      }))
    );
    console.log("[shopContent] public loaded", {
      banners: bannerRows.length,
      ads: result.aRes.data?.length ?? 0,
      sections: result.sRes.data?.length ?? 0,
      featured: result.fRes.data?.length ?? 0,
    });
    set({
      banners: bannerRows.map(rowToBanner),
      ads: (result.aRes.data ?? []).map(rowToAd),
      sections: (result.sRes.data ?? []).map(rowToSection),
      featured: (result.fRes.data ?? []).map(rowToFeatured),
      lastError: null,
    });
  },

  addBanner: async (input) => {
    const row = bannerPatchToRow({
      ...input,
      active: input.active ?? true,
      sortOrder: input.sortOrder ?? get().banners.length * 10 + 10,
    });
    console.log("[shopContent] inserting banner", row);
    const { data, error } = await supabase
      .from("shop_banners")
      .insert(row)
      .select()
      .single();
    if (error) {
      console.error("[shopContent] add banner failed", error);
      const lower = error.message.toLowerCase();
      if (lower.includes("does not exist") || lower.includes("relation")) {
        toast.error(
          "shop_banners table missing. Apply migration 0022_shop_content.sql."
        );
      } else if (lower.includes("row-level security") || lower.includes("rls")) {
        toast.error(
          "Permission denied (RLS). You must be logged in as Admin to add banners."
        );
      } else {
        toast.error("Add banner failed: " + error.message);
      }
      throw new Error(error.message);
    }
    console.log("[shopContent] banner saved", data);
    set({ banners: [...get().banners, rowToBanner(data as BannerRow)] });
    void get().load();
  },
  updateBanner: async (id, patch) => {
    const { error } = await supabase
      .from("shop_banners")
      .update(bannerPatchToRow(patch))
      .eq("id", id);
    if (error) {
      console.error("[shopContent] update banner failed", error);
      toast.error("Update failed: " + error.message);
      throw new Error(error.message);
    }
    set({
      banners: get().banners.map((b) =>
        b.id === id ? { ...b, ...patch } : b
      ),
    });
  },
  deleteBanner: async (id) => {
    const { error } = await supabase.from("shop_banners").delete().eq("id", id);
    if (error) {
      toast.error("Delete failed: " + error.message);
      return;
    }
    set({ banners: get().banners.filter((b) => b.id !== id) });
  },

  addAd: async (input) => {
    const row = adPatchToRow({
      ...input,
      active: input.active ?? true,
      sortOrder: input.sortOrder ?? get().ads.length * 10 + 10,
    });
    console.log("[shopContent] inserting ad", row);
    const { data, error } = await supabase
      .from("shop_ads")
      .insert(row)
      .select()
      .single();
    if (error) {
      console.error("[shopContent] add ad failed", error);
      const lower = error.message.toLowerCase();
      if (lower.includes("does not exist") || lower.includes("relation")) {
        toast.error(
          "shop_ads table missing. Apply migration 0022_shop_content.sql."
        );
      } else if (lower.includes("row-level security") || lower.includes("rls")) {
        toast.error(
          "Permission denied (RLS). You must be logged in as Admin to add ads."
        );
      } else {
        toast.error("Add ad failed: " + error.message);
      }
      throw new Error(error.message);
    }
    console.log("[shopContent] ad saved", data);
    set({ ads: [...get().ads, rowToAd(data as AdRow)] });
    void get().load();
  },
  updateAd: async (id, patch) => {
    const { error } = await supabase
      .from("shop_ads")
      .update(adPatchToRow(patch))
      .eq("id", id);
    if (error) {
      console.error("[shopContent] update ad failed", error);
      toast.error("Update failed: " + error.message);
      throw new Error(error.message);
    }
    set({ ads: get().ads.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  },
  deleteAd: async (id) => {
    const { error } = await supabase.from("shop_ads").delete().eq("id", id);
    if (error) {
      toast.error("Delete failed: " + error.message);
      return;
    }
    set({ ads: get().ads.filter((a) => a.id !== id) });
  },

  addSection: async (input) => {
    const row = sectionPatchToRow({
      ...input,
      sortOrder: input.sortOrder ?? get().sections.length * 10 + 10,
    });
    const { data, error } = await supabase
      .from("shop_sections")
      .insert(row)
      .select()
      .single();
    if (error) {
      toast.error("Add section failed: " + error.message);
      return;
    }
    set({ sections: [...get().sections, rowToSection(data as SectionRow)] });
  },
  updateSection: async (id, patch) => {
    const { error } = await supabase
      .from("shop_sections")
      .update(sectionPatchToRow(patch))
      .eq("id", id);
    if (error) {
      toast.error("Update failed: " + error.message);
      return;
    }
    set({
      sections: get().sections.map((s) =>
        s.id === id ? { ...s, ...patch } : s
      ),
    });
  },
  deleteSection: async (id) => {
    const { error } = await supabase
      .from("shop_sections")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Delete failed: " + error.message);
      return;
    }
    set({
      sections: get().sections.filter((s) => s.id !== id),
      featured: get().featured.filter((f) => f.sectionId !== id),
    });
  },

  addFeatured: async (sectionId, productId) => {
    const sortOrder =
      get().featured.filter((f) => f.sectionId === sectionId).length * 10 + 10;
    const { data, error } = await supabase
      .from("shop_featured_products")
      .insert({
        section_id: sectionId,
        product_id: productId,
        sort_order: sortOrder,
      })
      .select()
      .single();
    if (error) {
      toast.error("Add product failed: " + error.message);
      return;
    }
    set({ featured: [...get().featured, rowToFeatured(data as FeaturedRow)] });
  },
  removeFeatured: async (id) => {
    const { error } = await supabase
      .from("shop_featured_products")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Remove failed: " + error.message);
      return;
    }
    set({ featured: get().featured.filter((f) => f.id !== id) });
  },
}));

/* ------------------------------ helpers ----------------------------- */

/* ------------------------------ brands store ----------------------------- */

interface ShopBrandsState {
  brands: ShopBrand[];
  loading: boolean;
  lastError: string | null;
  load: () => Promise<void>;
  loadPublic: () => Promise<void>;
  addBrand: (input: { name: string; logoUrl?: string; active?: boolean }) => Promise<void>;
  updateBrand: (id: string, patch: Partial<ShopBrand>) => Promise<void>;
  deleteBrand: (id: string) => Promise<void>;
}

export const useShopBrands = create<ShopBrandsState>((set, get) => ({
  brands: [],
  loading: false,
  lastError: null,
  load: async () => {
    if (!isSupabaseConfigured) return;
    set({ loading: true });
    const { data, error } = await supabase
      .from("shop_brands")
      .select("*")
      .order("sort_order")
      .order("name");
    if (error) {
      console.error("[shopBrands] load failed", error);
      set({ loading: false, lastError: error.message });
      return;
    }
    set({
      brands: ((data as BrandRow[]) ?? []).map(rowToBrand),
      loading: false,
      lastError: null,
    });
  },
  loadPublic: async () => {
    if (!isSupabaseConfigured) return;
    const { data, error } = await customerSupabase
      .from("shop_brands")
      .select("*")
      .eq("active", true)
      .order("sort_order")
      .order("name");
    if (error) {
      console.warn("[shopBrands] public load failed", error);
      return;
    }
    set({ brands: ((data as BrandRow[]) ?? []).map(rowToBrand) });
  },
  addBrand: async ({ name, logoUrl, active }) => {
    const sortOrder = get().brands.length * 10 + 10;
    const { data, error } = await supabase
      .from("shop_brands")
      .insert({
        name,
        logo_url: logoUrl || null,
        active: active ?? true,
        sort_order: sortOrder,
      })
      .select()
      .single();
    if (error) {
      toast.error("Add brand failed: " + error.message);
      throw new Error(error.message);
    }
    set({ brands: [...get().brands, rowToBrand(data as BrandRow)] });
  },
  updateBrand: async (id, patch) => {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.logoUrl !== undefined) row.logo_url = patch.logoUrl || null;
    if (patch.active !== undefined) row.active = patch.active;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    const { error } = await supabase
      .from("shop_brands")
      .update(row)
      .eq("id", id);
    if (error) {
      toast.error("Update brand failed: " + error.message);
      return;
    }
    set({
      brands: get().brands.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    });
  },
  deleteBrand: async (id) => {
    const { error } = await supabase.from("shop_brands").delete().eq("id", id);
    if (error) {
      toast.error("Delete brand failed: " + error.message);
      return;
    }
    set({ brands: get().brands.filter((b) => b.id !== id) });
  },
}));

export const isAdActive = (a: ShopAd, now: number = Date.now()): boolean => {
  if (!a.active) return false;
  if (a.startAt && new Date(a.startAt).getTime() > now) return false;
  if (a.endAt && new Date(a.endAt).getTime() < now) return false;
  return true;
};
