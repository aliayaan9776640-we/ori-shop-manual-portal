import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCustomerStore } from "@/lib/onlineStore";
import { Button } from "@/components/ui/button";

const MVR = (n: number) =>
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
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "ready":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "rejected":
      return "bg-red-100 text-red-800 border-red-200";
    case "processing":
    case "delivering":
      return "bg-purple-100 text-purple-800 border-purple-200";
    default:
      return "bg-amber-100 text-amber-800 border-amber-200";
  }
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
      .channel("customer-preorder-history-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "preorder_orders" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "preorder_products" }, () => void load())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [customer?.id]);

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
          <h3 className="text-xl font-extrabold text-[#18392b]">My Pre-Orders</h3>
          <p className="text-sm text-slate-500">
            Track payment approval, order approval, delivery status and admin updates.
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
          No pre-orders found for this account.
        </div>
      ) : (
        <div className="grid gap-4">
          {orders.map((o) => {
            const product = productMap[o.preorder_product_id];

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

                      <Badge status={o.tracking_status || "pending"} />
                    </div>

                    <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                      <Info label="Qty" value={`${o.qty || 0} ${o.unit_type || ""}`} />
                      <Info label="Size / Option" value={o.selected_size || "-"} />
                      <Info label="Total Payment" value={MVR(Number(o.agreed_price || 0))} />
                      <Info label="Payment Method" value={o.payment_method || "-"} />
                      <Info label="Payment Approval" value={o.payment_status || "pending"} />
                      <Info label="Order Approval" value={o.order_status || "pending"} />
                      <Info label="Delivery Status" value={o.tracking_status || "pending"} />
                      <Info label="Delivery Address" value={o.delivery_address || o.customer_island || "-"} />
                      <Info
                        label="Expected / Admin Delivery Date"
                        value={o.admin_delivery_date || o.estimated_delivery_date || "-"}
                      />
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <StatusLine title="Payment" status={o.payment_status || "pending"} />
                      <StatusLine title="Order" status={o.order_status || "pending"} />
                      <StatusLine title="Delivery" status={o.tracking_status || "pending"} />
                    </div>

                    {o.admin_note && (
                      <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                        <b>Admin Note:</b> {o.admin_note}
                      </div>
                    )}

                    {o.customer_note && (
                      <div className="mt-3 rounded-xl bg-white p-3 text-sm text-slate-700">
                        <b>Your Note:</b> {o.customer_note}
                      </div>
                    )}

                    {o.payment_slip_url && (
                      <a
                        href={o.payment_slip_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block text-sm font-semibold text-blue-600 underline"
                      >
                        View Payment Slip
                      </a>
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
  return (
    <div className={`rounded-full border px-3 py-1 text-xs font-bold capitalize ${badgeClass(status)}`}>
      {status}
    </div>
  );
}

function StatusLine({ title, status }: { title: string; status: string }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <div className="text-xs text-slate-500">{title}</div>
      <Badge status={status} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-bold text-slate-800">{value}</div>
    </div>
  );
}
