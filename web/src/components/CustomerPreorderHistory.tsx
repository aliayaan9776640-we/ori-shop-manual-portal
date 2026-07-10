import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCustomerStore } from "@/lib/onlineStore";
import { Button } from "@/components/ui/button";

const MVR = (n: number | string) =>
  `MVR ${Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const badgeClass = (status: string) => {
  switch (status) {
    case "approved":
    case "accepted":
    case "delivered":
    case "completed":
    case "sent":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "quotation_sent":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "ready":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "rejected":
    case "declined":
      return "bg-red-100 text-red-800 border-red-200";
    case "processing":
    case "delivering":
      return "bg-purple-100 text-purple-800 border-purple-200";
    default:
      return "bg-amber-100 text-amber-800 border-amber-200";
  }
};

const detailsToRows = (data: unknown): { key: string; value: string }[] => {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  return Object.entries(data as Record<string, unknown>)
    .filter(([, value]) => String(value ?? "").trim())
    .map(([key, value]) => ({ key, value: String(value ?? "") }));
};

export default function CustomerPreorderHistory() {
  const customer = useCustomerStore((s) => s.customer);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const productMap = useMemo(() => {
    const map: Record<string, any> = {};
    products.forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, [products]);

  const load = async () => {
    if (!customer?.id) {
      setOrders([]);
      setProducts([]);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("preorder_orders")
      .select("*")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[CustomerPreorderHistory]", error);
      setOrders([]);
      setLoading(false);
      return;
    }

    const orderRows = data || [];
    setOrders(orderRows);

    const ids = Array.from(new Set(orderRows.map((o) => o.preorder_product_id).filter(Boolean)));
    if (ids.length > 0) {
      const { data: productRows } = await supabase
        .from("preorder_products")
        .select("*")
        .in("id", ids);
      setProducts(productRows || []);
    } else {
      setProducts([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`customer-preorder-history-live-${customer?.id || "guest"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "preorder_orders" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "preorder_products" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [customer?.id]);

  const acceptQuotation = async (orderId: string) => {
    const { error } = await supabase
      .from("preorder_orders")
      .update({
        quotation_status: "accepted",
        order_status: "accepted",
        payment_status: "pending",
        request_type: "order",
        quotation_responded_at: new Date().toISOString(),
      })
      .eq("id", orderId);
    if (error) return alert(error.message);
    alert("Quotation accepted. Please contact store/payment section for payment confirmation.");
    await load();
  };

  const declineQuotation = async (orderId: string) => {
    const { error } = await supabase
      .from("preorder_orders")
      .update({
        quotation_status: "declined",
        order_status: "rejected",
        quotation_responded_at: new Date().toISOString(),
      })
      .eq("id", orderId);
    if (error) return alert(error.message);
    await load();
  };

  if (!customer) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        Please sign in to view your pre-order history.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-extrabold text-[#18392b]">My Pre-Orders & Quotations</h3>
          <p className="text-sm text-slate-500">
            Track payment approval, quotation price, submitted measurements, delivery status and admin updates.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
          Loading pre-orders...
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
          No pre-orders or quotations found for this account.
        </div>
      ) : (
        <div className="grid gap-4">
          {orders.map((o) => {
            const product = productMap[o.preorder_product_id];
            const submittedDetails = detailsToRows(o.measurement_data);
            const quotationPrice = Number(o.quotation_price || o.agreed_price || 0);
            const isQuotation = o.request_type === "quotation" || !!o.quotation_status || o.payment_method === "quotation";
            const quotationSent = ["sent", "quotation_sent"].includes(String(o.quotation_status || o.payment_status || o.order_status));

            return (
              <div key={o.id} className="rounded-2xl border bg-slate-50 p-4">
                <div className="flex flex-col gap-4 md:flex-row">
                  {product?.photo_url ? (
                    <img src={product.photo_url} className="h-28 w-28 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center rounded-xl bg-white text-xs text-slate-400">
                      No Image
                    </div>
                  )}

                  <div className="flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-bold text-emerald-900">
                          {product?.name || "Pre-order item"}
                        </div>
                        <div className="text-xs text-slate-500">
                          Order ID: {String(o.id).slice(0, 8)}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {isQuotation && <Badge status={o.quotation_status || "quotation_pending"} />}
                        <Badge status={o.tracking_status || o.order_status || "pending"} />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                      <Info label="Qty" value={`${o.qty || 0} ${o.unit_type || ""}`} />
                      <Info label="Size / Option" value={o.selected_size || "-"} />
                      <Info label="Color / Option" value={o.selected_color || "-"} />
                      <Info label="Total / Quotation" value={MVR(quotationPrice)} />
                      <Info label="Payment Method" value={o.payment_method || "-"} />
                      <Info label="Payment Approval" value={o.payment_status || "pending"} />
                      <Info label="Order Approval" value={o.order_status || "pending"} />
                      <Info label="Delivery Status" value={o.tracking_status || "pending"} />
                      <Info label="Delivery Address" value={o.delivery_address || o.customer_island || "-"} />
                    </div>

                    {submittedDetails.length > 0 && (
                      <div className="mt-3 rounded-xl bg-white p-3 text-sm">
                        <b>Submitted Details / Measurements:</b>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {submittedDetails.map((row) => (
                            <div key={row.key} className="rounded-lg bg-slate-50 p-2">
                              <span className="text-xs text-slate-500">{row.key}</span>
                              <div className="font-bold text-slate-800">{row.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {o.quotation_note && (
                      <div className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
                        <b>Quotation Note:</b> {o.quotation_note}
                      </div>
                    )}
                    {o.quotation_admin_note && (
                      <div className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
                        <b>Admin Quotation Note:</b> {o.quotation_admin_note}
                      </div>
                    )}
                    {o.admin_note && (
                      <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                        <b>Admin Note:</b> {o.admin_note}
                      </div>
                    )}
                    {o.customer_note && (
                      <div className="mt-3 rounded-xl bg-white p-3 text-sm text-slate-700 whitespace-pre-wrap">
                        <b>Your Note:</b> {o.customer_note}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-3">
                      {o.reference_image_url && (
                        <a href={o.reference_image_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 underline">
                          View Reference Image
                        </a>
                      )}
                      {o.payment_slip_url && (
                        <a href={o.payment_slip_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 underline">
                          View Payment Slip
                        </a>
                      )}
                    </div>

                    {isQuotation && quotationSent && String(o.quotation_status) !== "accepted" && String(o.quotation_status) !== "declined" && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button className="bg-emerald-700 text-white hover:bg-emerald-800" onClick={() => void acceptQuotation(o.id)}>
                          Accept Quotation
                        </Button>
                        <Button variant="outline" onClick={() => void declineQuotation(o.id)}>
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Badge({ status }: { status: string }) {
  return <div className={`rounded-full border px-3 py-1 text-xs font-bold capitalize ${badgeClass(status)}`}>{status}</div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-bold text-slate-800">{value}</div>
    </div>
  );
}
