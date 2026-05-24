import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useCustomerStore } from "@/lib/onlineStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import FileUpload from "@/components/FileUpload";
import {
  Search,
  ShoppingBag,
  Package,
  Clock,
  CheckCircle2,
  Truck,
  HelpCircle,
  Phone,
  MessageCircle,
  Minus,
  Plus,
  X,
  CreditCard,
  UploadCloud,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LOGO_URL } from "@/components/Logo";

type PreorderProduct = {
  id: string;
  name: string;
  description?: string | null;
  photo_url?: string | null;
  price?: number | null;
  unit_type?: string | null;
  minimum_qty?: number | null;
  sizes?: string | null;
  category?: string | null;
  estimated_delivery_date?: string | null;
  active?: boolean | null;
};

type CheckoutStep = "details" | "payment" | "delivery" | "success";
type PaymentMethod = "bank_transfer" | "bml_gateway";

const MVR = (n: number) =>
  `MVR ${Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const getQtyNumber = (value: string) => {
  if (value.trim() === "") return 1;
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number <= 0) return 1;
  return number;
};

const normalizeQty = (value: string) => {
  const number = getQtyNumber(value);
  return String(Math.max(1, number));
};

const addAmountToGatewayUrl = (rawUrl: string, amount: number, itemName: string) => {
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl);
    url.searchParams.set("amount", amount.toFixed(2));
    url.searchParams.set("currency", "MVR");
    url.searchParams.set("description", itemName);
    return url.toString();
  } catch {
    const joiner = rawUrl.includes("?") ? "&" : "?";
    return `${rawUrl}${joiner}amount=${encodeURIComponent(
      amount.toFixed(2)
    )}&currency=MVR&description=${encodeURIComponent(itemName)}`;
  }
};

export default function PreOrders() {
  const customer = useCustomerStore((s) => s.customer);
  const bootstrap = useCustomerStore((s) => s.bootstrap);
  const navigate = useNavigate();

  const [products, setProducts] = useState<PreorderProduct[]>([]);
  const [settings, setSettings] = useState<any | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PreorderProduct | null>(null);
  const [step, setStep] = useState<CheckoutStep>("details");
  const [submitting, setSubmitting] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);

  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    customer_island: "",
    delivery_address: "",
    current_location_text: "",
    current_location_url: "",
    current_latitude: null as number | null,
    current_longitude: null as number | null,
    delivery_note: "",
    qty: "1",
    selected_size: "",
    customer_note: "",
    payment_slip_url: "",
    payment_method: "bank_transfer" as PaymentMethod,
  });

  const load = async () => {
    const [productsRes, settingsRes] = await Promise.all([
      supabase
        .from("preorder_products")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false }),
      supabase.from("preorder_settings").select("*").limit(1).maybeSingle(),
    ]);

    setProducts(productsRes.data || []);
    setSettings(settingsRes.data || null);
  };

  useEffect(() => {
    void bootstrap();
    void load();

    const channel = supabase
      .channel("preorder-page-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "preorder_products" },
        () => void load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "preorder_settings" },
        () => void load()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [bootstrap]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategory !== "all" && p.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q)
      );
    });
  }, [products, selectedCategory, search]);

  const selectedSizes = selected
    ? String(selected.sizes || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    : [];

  const minQty = 1;
  const qty = getQtyNumber(form.qty);
  const displayQty = qty;
  const unitPrice = Number(selected?.price || 0);
  const total = unitPrice * displayQty;
  const bmlUrl = selected
    ? addAmountToGatewayUrl(settings?.bml_gateway_url || "", total, selected.name)
    : "";

  const ensureCustomer = async () => {
    await bootstrap();
    const latest = useCustomerStore.getState().customer;

    if (!latest?.id) {
      alert("Please sign in before placing a pre-order.");
      navigate("/customer-login?next=/store");
      return null;
    }

    return latest;
  };

  const openPreorder = async (item: PreorderProduct) => {
    const latest = await ensureCustomer();
    if (!latest) return;

    const sizes = String(item.sizes || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    setSelected(item);
    setStep("details");
    setSubmitting(false);
    setForm({
      customer_name: latest.name || "",
      customer_phone: latest.phone || "",
      customer_island: latest.island || latest.address || "",
      delivery_address: latest.address || latest.island || "",
      current_location_text: "",
      current_location_url: "",
      current_latitude: null,
      current_longitude: null,
      delivery_note: "",
      qty: "1",
      selected_size: sizes[0] || "",
      customer_note: "",
      payment_slip_url: "",
      payment_method: "bank_transfer",
    });
  };

  const detectCurrentLocation = (): void => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      alert("Location tracking is not supported on this device/browser.");
      return;
    }

    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        const url = `https://www.google.com/maps?q=${lat},${lng}`;
        setForm((prev) => ({
          ...prev,
          current_location_text: text,
          current_location_url: url,
          current_latitude: lat,
          current_longitude: lng,
        }));
        setDetectingLocation(false);
      },
      () => {
        setDetectingLocation(false);
        alert("Location permission denied. You can still enter delivery address manually.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  const validateDetails = () => {
    if (!form.customer_name.trim()) return "Customer name is required.";
    if (!form.customer_phone.trim()) return "Phone number is required.";
    if (!form.customer_island.trim()) return "Island / address is required.";
    if (displayQty < 1) return "Quantity must be at least 1.";
    return "";
  };

  const submitOrder = async () => {
    if (!selected) return;
    const latest = await ensureCustomer();
    if (!latest) return;

    const detailsError = validateDetails();
    if (detailsError) {
      alert(detailsError);
      setStep("details");
      return;
    }

    if (form.payment_method === "bank_transfer" && !form.payment_slip_url) {
      alert("Please upload the payment slip before submitting.");
      setStep("payment");
      return;
    }

    if (!form.delivery_address.trim()) {
      alert("Please enter delivery information.");
      setStep("delivery");
      return;
    }

    setSubmitting(true);

    const customerNote = [
      form.customer_note.trim(),
      form.delivery_note.trim() ? `Delivery note: ${form.delivery_note.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const { error } = await supabase.from("preorder_orders").insert({
      customer_id: latest.id,
      preorder_product_id: selected.id,
      customer_name: form.customer_name.trim() || latest.name,
      customer_phone: form.customer_phone.trim() || latest.phone,
      customer_island: form.customer_island.trim(),
      delivery_address: form.delivery_address.trim(),
      current_location_text: form.current_location_text || null,
      current_location_url: form.current_location_url || null,
      current_latitude: form.current_latitude,
      current_longitude: form.current_longitude,
      qty: displayQty,
      unit_type: selected.unit_type || "piece",
      selected_size: form.selected_size,
      agreed_price: total,
      estimated_delivery_date: selected.estimated_delivery_date,
      customer_note: customerNote,
      payment_method: form.payment_method,
      payment_slip_url: form.payment_slip_url,
      payment_status: "pending",
      order_status: "pending",
      tracking_status: "pending",
    });

    setSubmitting(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Order submitted successfully.");

    setSelected(null);

    setForm({
      customer_name: "",
      customer_phone: "",
      customer_island: "",
      qty: "1",
      selected_size: "",
      customer_note: "",
      payment_method: "bank_transfer",
      payment_slip_url: "",
      delivery_address: "",
      current_location_text: "",
      current_location_url: "",
      current_latitude: null,
      current_longitude: null,
      delivery_note: "",
    });

    setStep("details");

    void load();
  };
  return (
    <div className="mx-auto max-w-screen-2xl px-3 py-5 sm:px-6">
      <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)_250px]">
        <aside className="space-y-4">
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="bg-[#064b2f] px-4 py-3 text-sm font-bold text-white">
              PREORDER PAGE LOADED
            </div>
            <div className="space-y-1 p-3">
              <CategoryButton
                active={selectedCategory === "all"}
                label="All Pre-Orders"
                onClick={() => setSelectedCategory("all")}
              />
              {categories.length === 0 ? (
                <div className="px-3 py-3 text-xs text-slate-400">No categories yet</div>
              ) : (
                categories.map((c) => (
                  <CategoryButton
                    key={c}
                    active={selectedCategory === c}
                    label={c}
                    onClick={() => setSelectedCategory(c)}
                  />
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
            <div className="flex items-center gap-2 font-bold text-orange-700">
              <HelpCircle className="h-4 w-4" />
              How Pre-Order Works?
            </div>
            <div className="mt-3 space-y-2 text-xs text-slate-700">
              <div>1. Choose product and quantity.</div>
              <div>2. Pay exact total amount.</div>
              <div>3. Add delivery information.</div>
              <div>4. Admin verifies payment and updates status.</div>
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          {settings?.banner_url && (
            <div className="mb-5 overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-sm">
              <img
                src={settings.banner_url}
                alt={settings.banner_title || "Pre-order banner"}
                className="h-48 w-full object-cover sm:h-64"
              />

              {(settings.banner_title || settings.banner_subtitle) && (
                <div className="p-4">
                  {settings.banner_title && (
                    <h2 className="text-2xl font-extrabold text-[#064b2f]">
                      {settings.banner_title}
                    </h2>
                  )}

                  {settings.banner_subtitle && (
                    <p className="mt-1 text-sm text-slate-600">
                      {settings.banner_subtitle}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="mb-5 rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                  <ShoppingBag className="h-8 w-8" />
                </div>
                <div>
                  <h1 className="text-3xl font-extrabold text-[#064b2f]">Pre-Orders</h1>
                  <p className="text-sm text-slate-500">
                    Pre-order upcoming products directly from Ori Barakah Store.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                <img src={LOGO_URL} className="h-10 w-10 rounded-full" />
                <div>
                  <div className="text-sm font-bold text-[#064b2f]">Ori Barakah Store</div>
                  <div className="text-xs text-slate-500">Quality Products</div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search pre-order products..."
                  className="pl-9"
                />
              </div>
              <Button
                className="bg-orange-500 text-white hover:bg-orange-600"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              >
                View Products
              </Button>
            </div>
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-4">
            <StatusCard icon={Clock} title="Pending" value="Waiting Approval" />
            <StatusCard icon={CheckCircle2} title="Approved" value="Admin Approved" />
            <StatusCard icon={Truck} title="Ready" value="Ready to Deliver" />
            <StatusCard icon={Package} title="Delivered" value="Completed" />
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">
              No pre-order products available.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p) => (
                <div
                  key={p.id}
                  className="overflow-hidden rounded-xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="aspect-square bg-slate-50">
                    {p.photo_url ? (
                      <img src={p.photo_url} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <img src={LOGO_URL} className="h-20 w-20 opacity-30" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="line-clamp-2 min-h-10 text-sm font-bold text-slate-800">
                      {p.name}
                    </div>
                    <div className="text-xs uppercase text-slate-400">
                      {p.category || "Pre-Order"}
                    </div>
                    <div className="text-lg font-extrabold text-orange-600">
                      {MVR(Number(p.price || 0))}
                    </div>
                    <div className="text-xs text-slate-500">
                      Expected: {p.estimated_delivery_date || "-"}
                    </div>
                    <Button
                      className="w-full bg-orange-500 text-white hover:bg-orange-600"
                      onClick={() => void openPreorder(p)}
                    >
                      Pre-Order
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        <aside className="space-y-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="font-bold text-[#064b2f]">Need Help?</div>
            <p className="mt-2 text-xs text-slate-600">
              Our team is here to assist you with pre-orders.
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-[#064b2f]" />
                +960 977 8840
              </div>
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-[#064b2f]" />
                Chat on WhatsApp
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <img src={LOGO_URL} className="mx-auto h-28 w-28 opacity-80" />
            <div className="mt-3 text-center text-sm font-bold text-[#064b2f]">
              Ori Barakah Store
            </div>
          </div>
        </aside>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
          <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
              <div>
                <h2 className="text-2xl font-extrabold text-[#064b2f]">{selected.name}</h2>
                <p className="text-sm text-slate-500">
                  Complete your pre-order details.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-full bg-slate-100 p-2 hover:bg-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="border-b px-5 py-3">
              <div className="grid grid-cols-4 gap-2 text-center text-xs font-bold">
                <StepPill active={step === "details"} done={["payment", "delivery", "success"].includes(step)} label="Details" />
                <StepPill active={step === "payment"} done={["delivery", "success"].includes(step)} label="Payment" />
                <StepPill active={step === "delivery"} done={step === "success"} label="Delivery" />
                <StepPill active={step === "success"} done={step === "success"} label="Submitted" />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {step !== "success" && (
                <div className="mb-4 grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-[140px_minmax(0,1fr)]">
                  <div className="overflow-hidden rounded-xl bg-white">
                    {selected.photo_url ? (
                      <img src={selected.photo_url} className="h-36 w-full object-cover" />
                    ) : (
                      <div className="flex h-36 items-center justify-center">
                        <img src={LOGO_URL} className="h-20 w-20 opacity-30" />
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-lg font-bold text-slate-900">{selected.name}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {selected.description || "Pre-order product"}
                    </div>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                      <InfoBox label="Unit Price" value={MVR(unitPrice)} />
                      <InfoBox label="Quantity" value={`${displayQty}`} />
                      <InfoBox label="Total Payment" value={MVR(total)} strong />
                    </div>
                  </div>
                </div>
              )}

              {step === "details" && (
                <div className="grid gap-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      value={form.customer_name}
                      onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                      placeholder="Customer name"
                    />
                    <Input
                      value={form.customer_phone}
                      onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                      placeholder="Phone number"
                    />
                    <Input
                      className="sm:col-span-2"
                      value={form.customer_island}
                      onChange={(e) => setForm({ ...form, customer_island: e.target.value })}
                      placeholder="Island / Address"
                    />

                    {selectedSizes.length > 0 && (
                      <select
                        value={form.selected_size}
                        onChange={(e) => setForm({ ...form, selected_size: e.target.value })}
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm sm:col-span-2"
                      >
                        {selectedSizes.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
                    <div className="mb-3 text-sm font-bold text-slate-700">Quantity</div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({ ...prev, qty: String(Math.max(1, getQtyNumber(prev.qty) - 1)) }))
                        }
                        className="flex h-11 w-11 items-center justify-center rounded-xl border bg-white hover:bg-slate-50"
                      >
                        <Minus className="h-4 w-4" />
                      </button>

                      <Input
                        type="text"
                        inputMode="numeric"
                        value={form.qty}
                        onChange={(e) => {
                          const onlyDigits = e.target.value.replace(/[^0-9]/g, "");
                          setForm((prev) => ({ ...prev, qty: onlyDigits || "1" }));
                        }}
                        onBlur={() => setForm((prev) => ({ ...prev, qty: normalizeQty(prev.qty) }))}
                        className="h-11 text-center text-lg font-extrabold"
                      />

                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, qty: String(getQtyNumber(prev.qty) + 1) }))}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border bg-white hover:bg-slate-50"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 rounded-xl bg-white p-3 text-sm">
                      <div className="flex justify-between">
                        <span>Unit Price</span>
                        <b>{MVR(unitPrice)}</b>
                      </div>
                      <div className="mt-1 flex justify-between">
                        <span>Quantity</span>
                        <b>{displayQty}</b>
                      </div>
                      <div className="mt-2 flex justify-between border-t pt-2 text-lg font-extrabold text-orange-600">
                        <span>Total</span>
                        <span>{MVR(total)}</span>
                      </div>
                    </div>
                  </div>

                  <textarea
                    value={form.customer_note}
                    onChange={(e) => setForm({ ...form, customer_note: e.target.value })}
                    placeholder="Customer note"
                    className="min-h-24 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#064b2f]"
                  />

                </div>
              )}

              {step === "payment" && (
                <div className="grid gap-4">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="text-sm font-bold text-emerald-900">
                      Payment amount must be exactly {MVR(total)}
                    </div>
                    <div className="mt-2 text-xs text-emerald-800">
                      This amount is calculated from unit price × selected quantity.
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, payment_method: "bank_transfer" })}
                      className={cn(
                        "rounded-2xl border p-4 text-left",
                        form.payment_method === "bank_transfer"
                          ? "border-[#064b2f] bg-emerald-50"
                          : "bg-white hover:bg-slate-50"
                      )}
                    >
                      <UploadCloud className="mb-2 h-5 w-5 text-[#064b2f]" />
                      <div className="font-bold">Bank transfer</div>
                      <div className="text-xs text-slate-500">
                        Upload payment slip for admin verification.
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={!settings?.bml_enabled || !settings?.bml_gateway_url}
                      onClick={() => setForm({ ...form, payment_method: "bml_gateway" })}
                      className={cn(
                        "rounded-2xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-50",
                        form.payment_method === "bml_gateway"
                          ? "border-[#064b2f] bg-emerald-50"
                          : "bg-white hover:bg-slate-50"
                      )}
                    >
                      <CreditCard className="mb-2 h-5 w-5 text-[#064b2f]" />
                      <div className="font-bold">BML Gateway</div>
                      <div className="text-xs text-slate-500">
                        Gateway link opens with {MVR(total)}.
                      </div>
                    </button>
                  </div>

                  {form.payment_method === "bank_transfer" && (
                    <div className="rounded-2xl bg-slate-50 p-4 text-sm">
                      <div>Bank: <b>{settings?.bank_name || "-"}</b></div>
                      <div>Account Name: <b>{settings?.account_name || "-"}</b></div>
                      <div>Account Number: <b>{settings?.account_number || "-"}</b></div>
                      <div className="mt-2 text-xs">{settings?.payment_note || ""}</div>

                      <div className="mt-4">
                        <FileUpload
                          value={form.payment_slip_url}
                          onChange={(v) => setForm({ ...form, payment_slip_url: v })}
                          folder="payment-slips"
                        />
                      </div>
                    </div>
                  )}

                  {form.payment_method === "bml_gateway" && (
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-sm font-semibold">
                        BML Gateway payment amount: {MVR(total)}
                      </div>
                      <Button
                        type="button"
                        className="mt-3 bg-[#064b2f] text-white hover:bg-[#073d29]"
                        onClick={() => window.open(bmlUrl, "_blank")}
                        disabled={!bmlUrl}
                      >
                        Open BML Payment Link
                      </Button>
                      <p className="mt-2 text-xs text-slate-500">
                        After payment, continue to delivery information. Admin will verify payment.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                    <Button variant="outline" onClick={() => setStep("details")}>
                      Back
                    </Button>
                    <Button
                      className="bg-[#064b2f] text-white hover:bg-[#073d29]"
                      onClick={() => {
                        if (form.payment_method === "bank_transfer" && !form.payment_slip_url) {
                          alert("Please upload payment slip.");
                          return;
                        }
                        setStep("delivery");
                      }}
                    >
                      Next: Delivery Information
                    </Button>
                  </div>
                </div>
              )}

              {step === "delivery" && (
                <div className="grid gap-4">
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <div className="mb-3 flex items-center gap-2 font-bold text-[#064b2f]">
                      <MapPin className="h-5 w-5" />
                      Delivery Information
                    </div>
                    <div className="grid gap-3">
                      <Input
                        value={form.delivery_address}
                        onChange={(e) => setForm({ ...form, delivery_address: e.target.value })}
                        placeholder="Delivery address / island / shop pickup details"
                      />

                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-900">
                          <MapPin className="h-4 w-4" />
                          Customer Current Location
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                          <Input
                            value={form.current_location_text}
                            onChange={(e) =>
                              setForm({ ...form, current_location_text: e.target.value })
                            }
                            placeholder="Use Detect Location or type location/landmark"
                            className="bg-white"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            disabled={detectingLocation}
                            onClick={detectCurrentLocation}
                          >
                            {detectingLocation ? "Detecting…" : "Detect location"}
                          </Button>
                        </div>
                        {form.current_location_url && (
                          <a
                            href={form.current_location_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block text-xs font-semibold text-emerald-700 hover:underline"
                          >
                            Open captured location in Google Maps
                          </a>
                        )}
                        <p className="mt-2 text-xs text-emerald-800">
                          Customer can allow browser location. If permission is denied, typed delivery address still works.
                        </p>
                      </div>

                      <textarea
                        value={form.delivery_note}
                        onChange={(e) => setForm({ ...form, delivery_note: e.target.value })}
                        placeholder="Delivery note, preferred time, landmark, etc."
                        className="min-h-24 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#064b2f]"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
                    <div className="font-bold text-orange-700">Final Summary</div>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between"><span>Item</span><b>{selected.name}</b></div>
                      <div className="flex justify-between"><span>Qty</span><b>{displayQty}</b></div>
                      <div className="flex justify-between"><span>Unit price</span><b>{MVR(unitPrice)}</b></div>
                      <div className="flex justify-between border-t pt-2 text-lg font-extrabold text-orange-600">
                        <span>Total payment</span><span>{MVR(total)}</span>
                      </div>
                      <div className="flex justify-between"><span>Payment method</span><b>{form.payment_method === "bml_gateway" ? "BML Gateway" : "Bank Transfer"}</b></div>
                    </div>
                  </div>

                </div>
              )}

              {step === "success" && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-700" />
                  <h3 className="mt-3 text-2xl font-extrabold text-emerald-900">
                    Pre-order submitted for admin approval
                  </h3>
                  <p className="mt-2 text-sm text-emerald-800">
                    You can check payment approval, order status and delivery updates from My Profile → My Orders.
                  </p>
                  <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                    <Button variant="outline" onClick={() => setSelected(null)}>
                      Close
                    </Button>
                    <Button
                      className="bg-[#064b2f] text-white hover:bg-[#073d29]"
                      onClick={() => { setSelected(null); navigate("/store?view=profile"); }}
                    >
                      Go to My Orders
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {step !== "success" && (
              <div className="border-t bg-white px-5 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xs text-slate-500">Total Payment</div>
                    <div className="text-xl font-extrabold text-orange-600">{MVR(total)}</div>
                    <div className="text-xs text-slate-500">Qty {displayQty} × {MVR(unitPrice)}</div>
                  </div>

                  <div className="flex flex-col-reverse gap-2 sm:flex-row">
                    {step !== "details" && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStep(step === "delivery" ? "payment" : "details")}
                      >
                        Back
                      </Button>
                    )}

                    {step === "details" && (
                      <Button
                        type="button"
                        className="bg-[#064b2f] text-white hover:bg-[#073d29]"
                        onClick={() => {
                          const message = validateDetails();
                          if (message) return alert(message);
                          setForm((prev) => ({ ...prev, qty: normalizeQty(prev.qty) }));
                          setStep("payment");
                        }}
                      >
                        Next: Payment {MVR(total)}
                      </Button>
                    )}

                    {step === "payment" && (
                      <Button
                        type="button"
                        className="bg-[#064b2f] text-white hover:bg-[#073d29]"
                        onClick={() => {
                          if (form.payment_method === "bank_transfer" && !form.payment_slip_url) {
                            alert("Please upload payment slip.");
                            return;
                          }
                          setStep("delivery");
                        }}
                      >
                        Next: Delivery Information
                      </Button>
                    )}

                    {step === "delivery" && (
                      <Button
                        type="button"
                        className="bg-[#064b2f] text-white hover:bg-[#073d29]"
                        disabled={submitting}
                        onClick={() => void submitOrder()}
                      >
                        {submitting ? "Submitting..." : "Submit for Admin Approval"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
        active ? "bg-[#064b2f] font-bold text-white" : "text-slate-700 hover:bg-slate-50"
      )}
    >
      <ShoppingBag className="h-4 w-4" />
      {label}
    </button>
  );
}

function StatusCard({
  icon: Icon,
  title,
  value,
}: {
  icon: any;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <Icon className="h-5 w-5 text-orange-500" />
      <div className="mt-2 text-sm font-bold text-slate-800">{title}</div>
      <div className="text-xs text-slate-500">{value}</div>
    </div>
  );
}

function InfoBox({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn("font-bold", strong ? "text-orange-600" : "text-slate-800")}>
        {value}
      </div>
    </div>
  );
}

function StepPill({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div
      className={cn(
        "rounded-full border px-2 py-1",
        done
          ? "border-emerald-200 bg-emerald-100 text-emerald-800"
          : active
            ? "border-orange-200 bg-orange-100 text-orange-700"
            : "border-slate-200 bg-slate-50 text-slate-400"
      )}
    >
      {label}
    </div>
  );
}
