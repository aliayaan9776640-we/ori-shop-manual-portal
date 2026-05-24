import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import FileUpload from "@/components/FileUpload";

type AdminSection =
  | "overview"
  | "reports"
  | "products"
  | "upload"
  | "approval"
  | "delivery"
  | "settings";

type Status =
  | "pending"
  | "approved"
  | "rejected"
  | "accepted"
  | "processing"
  | "ready"
  | "delivering"
  | "delivered"
  | "completed";

const input =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#153f2f] focus:ring-4 focus:ring-emerald-900/10";

const btnPrimary =
  "rounded-xl bg-[#556b2f] px-4 py-2 text-sm font-bold text-white hover:bg-[#465925]";

const btnSecondary =
  "rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-[#153f2f] hover:bg-slate-50";

const btnDanger =
  "rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800";

const money = (value: number) =>
  `MVR ${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const badgeClass = (status: string) => {
  switch (status) {
    case "approved":
    case "accepted":
    case "delivered":
    case "completed":
      return "border-green-200 bg-green-100 text-green-700";
    case "ready":
      return "border-blue-200 bg-blue-100 text-blue-700";
    case "rejected":
      return "border-red-200 bg-red-100 text-red-700";
    case "processing":
    case "delivering":
      return "border-purple-200 bg-purple-100 text-purple-700";
    default:
      return "border-yellow-200 bg-yellow-100 text-yellow-700";
  }
};

export default function PreorderAdmin() {
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [settings, setSettings] = useState({
    bank_name: "",
    account_name: "",
    account_number: "",
    payment_note: "",
    bml_enabled: false,
    bml_gateway_url: "",
    banner_url: "",
    banner_title: "",
    banner_subtitle: "",
  });
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({
    name: "",
    description: "",
    photo_url: "",
    estimated_delivery_date: "",
    price: "",
    unit_type: "piece",
    minimum_qty: "1",
    sizes: "",
    category: "",
  });

  const load = async () => {
    const [ordersRes, productsRes, settingsRes] = await Promise.all([
      supabase.from("preorder_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("preorder_products").select("*").order("created_at", { ascending: false }),
      supabase.from("preorder_settings").select("*").limit(1).maybeSingle(),
    ]);

    setOrders(ordersRes.data || []);
    setProducts(productsRes.data || []);

    if (settingsRes.data) {
      setSettings({
        bank_name: settingsRes.data.bank_name || "",
        account_name: settingsRes.data.account_name || "",
        account_number: settingsRes.data.account_number || "",
        payment_note: settingsRes.data.payment_note || "",
        bml_enabled: !!settingsRes.data.bml_enabled,
        bml_gateway_url: settingsRes.data.bml_gateway_url || "",
        banner_url: settingsRes.data.banner_url || "",
        banner_title: settingsRes.data.banner_title || "",
        banner_subtitle: settingsRes.data.banner_subtitle || "",
      });
    }
  };

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("preorder-admin-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "preorder_orders" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "preorder_products" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "preorder_settings" }, () => void load())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const productMap = useMemo(() => {
    const map: Record<string, any> = {};
    products.forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, [products]);

  const filteredOrders = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter(
      (o) =>
        o.payment_status === filter ||
        o.order_status === filter ||
        o.tracking_status === filter
    );
  }, [orders, filter]);

  const totals = useMemo(() => {
    const totalOrders = filteredOrders.length;
    const totalQty = filteredOrders.reduce((sum, o) => sum + Number(o.qty || 0), 0);
    const totalValue = filteredOrders.reduce((sum, o) => sum + Number(o.agreed_price || 0), 0);
    const pending = filteredOrders.filter(
      (o) =>
        o.payment_status === "pending" ||
        o.order_status === "pending" ||
        o.tracking_status === "pending"
    ).length;

    const paymentPending = filteredOrders.filter((o) => o.payment_status === "pending").length;
    const orderApproval = filteredOrders.filter((o) => o.order_status === "pending").length;
    const ready = filteredOrders.filter((o) => o.tracking_status === "ready").length;
    const delivered = filteredOrders.filter(
      (o) => o.tracking_status === "delivered" || o.order_status === "completed"
    ).length;

    return { totalOrders, totalQty, totalValue, pending, paymentPending, orderApproval, ready, delivered };
  }, [filteredOrders]);

  const saveSettings = async () => {
    const existing = await supabase.from("preorder_settings").select("id").limit(1).maybeSingle();
    const payload = {
      bank_name: settings.bank_name,
      account_name: settings.account_name,
      account_number: settings.account_number,
      payment_note: settings.payment_note,
      bml_enabled: settings.bml_enabled,
      bml_gateway_url: settings.bml_gateway_url,
      banner_url: settings.banner_url,
      banner_title: settings.banner_title,
      banner_subtitle: settings.banner_subtitle,
    };

    const { error } = existing.data?.id
      ? await supabase.from("preorder_settings").update(payload).eq("id", existing.data.id)
      : await supabase.from("preorder_settings").insert(payload);

    if (error) return alert(error.message);
    alert("Payment settings saved");
    await load();
  };

  const submitItem = async () => {
    if (!form.name.trim()) return alert("Item name required");
    if (!form.price || Number(form.price) <= 0) return alert("Valid price required");

    const { error } = await supabase.from("preorder_products").insert({
      name: form.name.trim(),
      description: form.description.trim(),
      photo_url: form.photo_url,
      estimated_delivery_date: form.estimated_delivery_date || null,
      price: Number(form.price || 0),
      unit_type: form.unit_type || "piece",
      minimum_qty: Math.max(1, Number(form.minimum_qty || 1)),
      sizes: form.sizes.trim(),
      category: form.category.trim() || null,
      active: true,
    });

    if (error) return alert(error.message);

    alert("Pre-order item saved");
    setForm({
      name: "",
      description: "",
      photo_url: "",
      estimated_delivery_date: "",
      price: "",
      unit_type: "piece",
      minimum_qty: "1",
      sizes: "",
      category: "",
    });
    await load();
  };

  const toggleProduct = async (id: string, active: boolean) => {
    const { error } = await supabase.from("preorder_products").update({ active }).eq("id", id);
    if (error) alert(error.message);
    await load();
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("Delete this pre-order item?")) return;
    const { error } = await supabase.from("preorder_products").delete().eq("id", id);
    if (error) alert(error.message);
    await load();
  };

  const updateOrder = async (id: string, patch: any) => {
    const { error } = await supabase.from("preorder_orders").update(patch).eq("id", id);
    if (error) return alert(error.message);
    await load();
  };

  const deleteOrder = async (id: string) => {
    if (!confirm("Delete this pre-order order?")) return;
    const { error } = await supabase.from("preorder_orders").delete().eq("id", id);
    if (error) return alert(error.message);
    await load();
  };

  const approvePayment = (id: string) =>
    updateOrder(id, { payment_status: "approved", order_status: "accepted" });

  const rejectPayment = (id: string) =>
    updateOrder(id, { payment_status: "rejected", order_status: "rejected" });

  const exportExcel = () => {
    const headers = [
      "Customer",
      "Phone",
      "Island",
      "Delivery Address",
      "Item",
      "Qty",
      "Size",
      "Total",
      "Payment Method",
      "Payment",
      "Order",
      "Tracking",
      "Delivery",
      "Admin Note",
    ];

    const rows = filteredOrders.map((o) => {
      const p = productMap[o.preorder_product_id];
      return [
        o.customer_name || "",
        o.customer_phone || "",
        o.customer_island || "",
        o.delivery_address || "",
        p?.name || "Pre-order item",
        o.qty || "",
        o.selected_size || "",
        o.agreed_price || "",
        o.payment_method || "",
        o.payment_status || "",
        o.order_status || "",
        o.tracking_status || "",
        o.admin_delivery_date || o.estimated_delivery_date || "",
        o.admin_note || "",
      ];
    });

    const html = `
      <table border="1">
        <tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>
        ${rows.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}
      </table>
    `;
    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "preorder-report.xls";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const rows = filteredOrders
      .map((o) => {
        const p = productMap[o.preorder_product_id];
        return `
          <tr>
            <td>${o.customer_name || ""}</td>
            <td>${o.customer_phone || ""}</td>
            <td>${p?.name || "Pre-order item"}</td>
            <td>${o.qty || ""}</td>
            <td>${money(Number(o.agreed_price || 0))}</td>
            <td>${o.payment_method || ""}</td>
            <td>${o.payment_status || ""}</td>
            <td>${o.order_status || ""}</td>
            <td>${o.tracking_status || ""}</td>
            <td>${o.admin_delivery_date || o.estimated_delivery_date || ""}</td>
          </tr>
        `;
      })
      .join("");

    const win = window.open("", "_blank");
    if (!win) return;

    win.document.write(`
      <html>
        <head>
          <title>Pre-Order Report</title>
          <style>
            body { font-family: Arial; padding: 24px; }
            h1 { color: #153f2f; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
            th { background: #153f2f; color: white; }
          </style>
        </head>
        <body>
          <h1>Ori Barakah Store - Pre-Order Report</h1>
          <p>Total Orders: ${totals.totalOrders}</p>
          <p>Total Qty: ${totals.totalQty}</p>
          <p>Total Value: ${money(totals.totalValue)}</p>
          <table>
            <thead>
              <tr>
                <th>Customer</th><th>Phone</th><th>Item</th><th>Qty</th>
                <th>Total</th><th>Method</th><th>Payment</th><th>Order</th>
                <th>Tracking</th><th>Delivery</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <script>window.onload = function(){ window.print(); }</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const menuItems: { key: AdminSection; label: string; sub?: string }[] = [
    { key: "overview", label: "Overview", sub: "Dashboard summary" },
    { key: "reports", label: "Reports", sub: "Export and filter" },
    { key: "products", label: "Pre-Order Products", sub: "View and manage" },
    { key: "upload", label: "Upload Pre-Order Items", sub: "Add new item" },
    { key: "approval", label: "Order Approval", sub: "Payment and order approval" },
    { key: "delivery", label: "Delivery Updates", sub: "Status, dates and notes" },
    { key: "settings", label: "Settings", sub: "Payment and banner" },
  ];

  return (
    <div className="min-h-screen bg-[#faf8f3] p-4 text-slate-800 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-[#153f2f]">
              Pre-Order Admin Dashboard
            </h1>
            <p className="text-sm text-slate-500">
              Manage only pre-order products, reports, approvals, delivery updates and pre-order settings.
            </p>
          </div>
          <button className={btnSecondary} onClick={() => void load()}>
            Refresh
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
          <aside className="rounded-2xl border bg-white p-3 shadow-sm lg:sticky lg:top-6 lg:self-start">
            <div className="px-3 py-2 text-xs font-extrabold uppercase tracking-wider text-slate-400">
              Pre-Order Admin
            </div>
            <nav className="space-y-1">
              {menuItems.map((item) => {
                const active = activeSection === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveSection(item.key)}
                    className={
                      active
                        ? "w-full rounded-xl bg-[#153f2f] px-4 py-3 text-left text-white shadow-sm"
                        : "w-full rounded-xl px-4 py-3 text-left text-slate-700 hover:bg-slate-50"
                    }
                  >
                    <div className="text-sm font-extrabold">{item.label}</div>
                    {item.sub && (
                      <div className={active ? "text-xs text-white/70" : "text-xs text-slate-400"}>
                        {item.sub}
                      </div>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="mt-4 rounded-xl bg-orange-50 p-4 text-xs text-orange-800">
              Standalone pre-order module only. No POS or inventory linking.
            </div>
          </aside>

          <main className="space-y-6">
            {activeSection === "overview" && (
              <Section title="Overview">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <SummaryCard title="Orders" value={totals.totalOrders} />
                  <SummaryCard title="Total Qty" value={totals.totalQty} />
                  <SummaryCard title="Total Value" value={money(totals.totalValue)} />
                  <SummaryCard title="Pending" value={totals.pending} />
                  <SummaryCard title="Payment Pending" value={totals.paymentPending} />
                  <SummaryCard title="Order Approval" value={totals.orderApproval} />
                  <SummaryCard title="Ready" value={totals.ready} />
                  <SummaryCard title="Delivered" value={totals.delivered} />
                </div>
              </Section>
            )}

            {activeSection === "reports" && (
              <Section title="Reports">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <select className={input + " md:w-64"} value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="all">All Orders</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Payment Approved</option>
                    <option value="accepted">Order Accepted</option>
                    <option value="processing">Processing</option>
                    <option value="ready">Ready</option>
                    <option value="delivering">Delivering</option>
                    <option value="delivered">Delivered</option>
                    <option value="rejected">Rejected</option>
                  </select>

                  <div className="flex flex-wrap gap-2">
                    <button className={btnSecondary} onClick={() => void load()}>Refresh</button>
                    <button className={btnPrimary} onClick={exportExcel}>Export Excel</button>
                    <button className={btnPrimary} onClick={exportPdf}>Export PDF</button>
                  </div>
                </div>

                <ReportTable orders={filteredOrders} productMap={productMap} />
              </Section>
            )}

            {activeSection === "products" && (
              <Section title="Pre-Order Products">
                {products.length === 0 ? (
                  <Empty text="No pre-order products added yet." />
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {products.map((p) => (
                      <div key={p.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                        <div className="h-44 bg-slate-100">
                          {p.photo_url ? (
                            <img src={p.photo_url} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-sm text-slate-400">No Image</div>
                          )}
                        </div>
                        <div className="space-y-2 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-bold text-[#153f2f]">{p.name}</div>
                              <div className="text-xs text-slate-500">{p.category || "Pre-order"}</div>
                            </div>
                            <Badge status={p.active ? "approved" : "pending"} />
                          </div>
                          <div className="text-lg font-extrabold text-orange-600">{money(Number(p.price || 0))}</div>
                          <div className="text-xs text-slate-500">
                            Min Qty: {p.minimum_qty || 1} · Unit: {p.unit_type || "piece"} · Sizes: {p.sizes || "-"}
                          </div>
                          <div className="flex gap-2 pt-2">
                            <button className={btnSecondary} onClick={() => toggleProduct(p.id, !p.active)}>
                              {p.active ? "Disable" : "Enable"}
                            </button>
                            <button className={btnDanger} onClick={() => deleteProduct(p.id)}>
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {activeSection === "upload" && (
              <Section title="Upload Pre-Order Items">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <input className={input} placeholder="Item Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <input className={input} placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                  <input className={input} placeholder="Sizes/options: S,M,L or 1kg,5kg" value={form.sizes} onChange={(e) => setForm({ ...form, sizes: e.target.value })} />
                  <input className={input} placeholder="Price" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                  <input className={input} type="date" value={form.estimated_delivery_date} onChange={(e) => setForm({ ...form, estimated_delivery_date: e.target.value })} />
                  <input className={input} placeholder="Unit type: piece, case, kg, liter" value={form.unit_type} onChange={(e) => setForm({ ...form, unit_type: e.target.value })} />
                  <input className={input} type="number" min={1} placeholder="Minimum quantity" value={form.minimum_qty} onChange={(e) => setForm({ ...form, minimum_qty: e.target.value })} />
                  <div className="md:col-span-2">
                    <FileUpload value={form.photo_url} onChange={(v) => setForm({ ...form, photo_url: v })} folder="preorder-products" />
                  </div>
                  <textarea className={input + " min-h-24 md:col-span-2"} placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>

                <button className={btnPrimary + " mt-4"} onClick={submitItem}>
                  Save Pre-Order Item
                </button>
              </Section>
            )}

            {activeSection === "approval" && (
              <Section title="Order Approval">
                <OrderFilter filter={filter} setFilter={setFilter} />
                {filteredOrders.length === 0 ? (
                  <Empty text="No pre-order orders found." />
                ) : (
                  <div className="grid gap-4">
                    {filteredOrders.map((order) => {
                      const product = productMap[order.preorder_product_id];
                      return (
                        <OrderCard key={order.id} order={order} product={product}>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {order.payment_slip_url && (
                              <a href={order.payment_slip_url} target="_blank" rel="noreferrer" className={btnSecondary}>
                                View Slip
                              </a>
                            )}
                            <button className={btnPrimary} onClick={() => approvePayment(order.id)}>
                              Approve Payment
                            </button>
                            <button className={btnDanger} onClick={() => rejectPayment(order.id)}>
                              Reject
                            </button>
                            <button className={btnDanger} onClick={() => void deleteOrder(order.id)}>
                              Delete Order
                            </button>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <select className={input} value={order.payment_status || "pending"} onChange={(e) => updateOrder(order.id, { payment_status: e.target.value })}>
                              <option value="pending">Payment Pending</option>
                              <option value="approved">Payment Approved</option>
                              <option value="rejected">Payment Rejected</option>
                            </select>

                            <select className={input} value={order.order_status || "pending"} onChange={(e) => updateOrder(order.id, { order_status: e.target.value })}>
                              <option value="pending">Order Pending</option>
                              <option value="accepted">Order Accepted</option>
                              <option value="rejected">Order Rejected</option>
                              <option value="completed">Completed</option>
                            </select>
                          </div>
                        </OrderCard>
                      );
                    })}
                  </div>
                )}
              </Section>
            )}

            {activeSection === "delivery" && (
              <Section title="Delivery Updates">
                <OrderFilter filter={filter} setFilter={setFilter} />
                {filteredOrders.length === 0 ? (
                  <Empty text="No pre-order delivery updates found." />
                ) : (
                  <div className="grid gap-4">
                    {filteredOrders.map((order) => {
                      const product = productMap[order.preorder_product_id];
                      return (
                        <OrderCard key={order.id} order={order} product={product}>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button className={btnSecondary} onClick={() => updateOrder(order.id, { tracking_status: "ready" })}>
                              Mark Ready
                            </button>
                            <button className={btnSecondary} onClick={() => updateOrder(order.id, { tracking_status: "delivered", order_status: "completed" })}>
                              Mark Delivered
                            </button>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <select className={input} value={order.tracking_status || "pending"} onChange={(e) => updateOrder(order.id, { tracking_status: e.target.value })}>
                              <option value="pending">Pending</option>
                              <option value="processing">Processing</option>
                              <option value="ready">Ready</option>
                              <option value="delivering">Delivering</option>
                              <option value="delivered">Delivered</option>
                            </select>

                            <input className={input} type="date" value={order.admin_delivery_date || ""} onChange={(e) => updateOrder(order.id, { admin_delivery_date: e.target.value })} />

                            <textarea className={input + " min-h-24 md:col-span-1"} placeholder="Admin note" value={order.admin_note || ""} onChange={(e) => updateOrder(order.id, { admin_note: e.target.value })} />
                          </div>
                        </OrderCard>
                      );
                    })}
                  </div>
                )}
              </Section>
            )}

            {activeSection === "settings" && (
              <Section title="Settings">
                <div className="grid gap-6">
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <h3 className="mb-4 text-lg font-extrabold text-[#153f2f]">Payment Settings</h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <input className={input} placeholder="Bank Name" value={settings.bank_name} onChange={(e) => setSettings({ ...settings, bank_name: e.target.value })} />
                      <input className={input} placeholder="Account Name" value={settings.account_name} onChange={(e) => setSettings({ ...settings, account_name: e.target.value })} />
                      <input className={input} placeholder="Account Number" value={settings.account_number} onChange={(e) => setSettings({ ...settings, account_number: e.target.value })} />
                      <input className={input} placeholder="BML Gateway URL" value={settings.bml_gateway_url} onChange={(e) => setSettings({ ...settings, bml_gateway_url: e.target.value })} />
                      <textarea className={input + " min-h-24 md:col-span-2"} placeholder="Payment Instructions" value={settings.payment_note} onChange={(e) => setSettings({ ...settings, payment_note: e.target.value })} />
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={settings.bml_enabled} onChange={(e) => setSettings({ ...settings, bml_enabled: e.target.checked })} />
                        Enable BML Gateway Button
                      </label>
                    </div>
                    <button className={btnPrimary + " mt-4"} onClick={saveSettings}>
                      Save Payment Settings
                    </button>
                  </div>

                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <h3 className="mb-4 text-lg font-extrabold text-[#153f2f]">Pre-Order Page Banner</h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <input className={input} placeholder="Banner Title" value={settings.banner_title} onChange={(e) => setSettings({ ...settings, banner_title: e.target.value })} />
                      <input className={input} placeholder="Banner Subtitle" value={settings.banner_subtitle} onChange={(e) => setSettings({ ...settings, banner_subtitle: e.target.value })} />
                      <div className="md:col-span-2">
                        <FileUpload value={settings.banner_url} onChange={(v) => setSettings({ ...settings, banner_url: v })} folder="preorder-banners" />
                      </div>
                    </div>

                    {settings.banner_url && (
                      <div className="mt-4 overflow-hidden rounded-2xl border bg-slate-100">
                        <img src={settings.banner_url} alt="Pre-order banner preview" className="h-48 w-full object-cover" />
                      </div>
                    )}

                    <button className={btnPrimary + " mt-4"} onClick={saveSettings}>
                      Save Banner
                    </button>
                  </div>
                </div>
              </Section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-2 text-3xl font-bold text-[#153f2f]">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm md:p-6">
      <h2 className="mb-5 text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function OrderFilter({ filter, setFilter }: { filter: string; setFilter: (value: string) => void }) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <select className={input + " md:w-64"} value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="all">All Orders</option>
        <option value="pending">Pending</option>
        <option value="approved">Payment Approved</option>
        <option value="accepted">Order Accepted</option>
        <option value="processing">Processing</option>
        <option value="ready">Ready</option>
        <option value="delivering">Delivering</option>
        <option value="delivered">Delivered</option>
        <option value="rejected">Rejected</option>
      </select>
    </div>
  );
}

function OrderCard({ order, product, children }: { order: any; product: any; children: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="h-28 w-28 overflow-hidden rounded-xl bg-slate-100">
          {product?.photo_url ? (
            <img src={product.photo_url} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">No Image</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-extrabold text-[#153f2f]">
                {product?.name || "Pre-order item"}
              </h3>
              <p className="text-sm text-slate-500">
                {order.customer_name} · {order.customer_phone} · {order.customer_island}
              </p>
              <p className="text-xs text-slate-500">
                Delivery: {order.delivery_address || "-"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge status={order.payment_status || "pending"} />
              <Badge status={order.order_status || "pending"} />
              <Badge status={order.tracking_status || "pending"} />
            </div>
          </div>

          <div className="mt-4 grid gap-3 text-sm md:grid-cols-5">
            <Info label="Qty" value={`${order.qty || 0} ${order.unit_type || ""}`} />
            <Info label="Size" value={order.selected_size || "-"} />
            <Info label="Total" value={money(Number(order.agreed_price || 0))} />
            <Info label="Method" value={order.payment_method || "-"} />
            <Info label="Delivery Date" value={order.admin_delivery_date || order.estimated_delivery_date || "-"} />
          </div>

          {order.customer_note && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
              <b>Customer note:</b> {order.customer_note}
            </div>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold capitalize ${badgeClass(status)}`}>
      {status}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-bold text-slate-800">{value}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function ReportTable({ orders, productMap }: { orders: any[]; productMap: Record<string, any> }) {
  if (orders.length === 0) return <Empty text="No report data." />;

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="min-w-full bg-white text-sm">
        <thead className="bg-[#153f2f] text-white">
          <tr>
            <Th>Customer</Th>
            <Th>Item</Th>
            <Th>Qty</Th>
            <Th>Total</Th>
            <Th>Method</Th>
            <Th>Payment</Th>
            <Th>Order</Th>
            <Th>Tracking</Th>
            <Th>Delivery</Th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const p = productMap[o.preorder_product_id];
            return (
              <tr key={o.id} className="border-t">
                <Td>{o.customer_name || "-"}</Td>
                <Td>{p?.name || "Pre-order item"}</Td>
                <Td>{o.qty || 0}</Td>
                <Td>{money(Number(o.agreed_price || 0))}</Td>
                <Td>{o.payment_method || "-"}</Td>
                <Td><Badge status={o.payment_status || "pending"} /></Td>
                <Td><Badge status={o.order_status || "pending"} /></Td>
                <Td><Badge status={o.tracking_status || "pending"} /></Td>
                <Td>{o.admin_delivery_date || o.estimated_delivery_date || "-"}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 text-left font-semibold">{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td className="px-4 py-3 align-middle">{children}</td>;
}
