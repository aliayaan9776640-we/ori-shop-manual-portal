import { useEffect, useMemo, useState } from "react";
import {
  User,
  ShoppingCart,
  Receipt,
  PackageCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  Lock,
  Phone,
  MapPin,
  Home,
  CreditCard,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import FileUpload from "@/components/FileUpload";
import { supabase, customerSupabase } from "@/lib/supabase";
import { useCustomerStore } from "@/lib/onlineStore";
import CustomerPreorderHistory from "@/components/CustomerPreorderHistory";
import { cn } from "@/lib/utils";

type TabKey =
  | "profile"
  | "cart"
  | "orders"
  | "preorders"
  | "history"
  | "password";

const MVR = (n: number | string): string =>
  `MVR ${Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function CustomerProfileDashboard() {
  const customer = useCustomerStore((s) => s.customer);
  const cart = useCustomerStore((s) => s.cart);
  const myOrders = useCustomerStore((s) => s.myOrders);
  const loadMyOrders = useCustomerStore((s) => s.loadMyOrders);

  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [profilePhoto, setProfilePhoto] = useState<string>("");
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);

  useEffect(() => {
    const c = customer as any;

    let savedPhoto = "";
    if (c?.id) {
      savedPhoto = localStorage.getItem(`ori_customer_photo_${c.id}`) || "";
    }

    setProfilePhoto(
      c?.photo_url || c?.profile_photo_url || c?.avatar_url || savedPhoto || ""
    );
  }, [customer?.id]);

  const updateProfilePhoto = async (url: string): Promise<void> => {
    setProfilePhoto(url);
    setShowPhotoUpload(false);

    if (!customer?.id) return;

    localStorage.setItem(`ori_customer_photo_${customer.id}`, url);

    const payloads = [
      { table: "customers", column: "photo_url" },
      { table: "customer_profiles", column: "photo_url" },
      { table: "online_store_customers", column: "photo_url" },
      { table: "profiles", column: "avatar_url" },
    ];

    for (const target of payloads) {
      try {
        await supabase
          .from(target.table)
          .update({ [target.column]: url })
          .eq("id", customer.id);
      } catch {
        // Ignore optional profile tables that do not exist in this project.
      }
    }
  };

  useEffect(() => {
    if (customer?.id) void loadMyOrders();
  }, [customer?.id, loadMyOrders]);

  const activeOrders = useMemo(
    () =>
      myOrders.filter((o) =>
        ["pending", "accepted", "preparing", "out_for_delivery"].includes(
          o.status
        )
      ),
    [myOrders]
  );

  const deliveredOrders = useMemo(
    () => myOrders.filter((o) => o.status === "delivered"),
    [myOrders]
  );

  const cartTotal = cart.reduce((s, c) => s + c.qty * c.unitPrice, 0);

  if (!customer) {
    return (
      <section className="mx-auto max-w-screen-2xl px-3 py-8 sm:px-6">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-900 shadow-sm">
          <h2 className="text-xl font-bold">Please sign in</h2>
          <p className="mt-1 text-sm">
            Sign in to view your profile, cart, order history, preorder status,
            and admin updates.
          </p>
        </div>
      </section>
    );
  }

  const menu = [
    { key: "profile" as TabKey, label: "Profile Details", icon: User, badge: null },
    { key: "cart" as TabKey, label: "My Cart", icon: ShoppingCart, badge: cart.length },
    { key: "orders" as TabKey, label: "My Orders", icon: Receipt, badge: activeOrders.length },
    { key: "preorders" as TabKey, label: "My Pre-Orders", icon: PackageCheck, badge: null },
    { key: "history" as TabKey, label: "Order History", icon: Clock, badge: deliveredOrders.length },
    { key: "password" as TabKey, label: "Change Password", icon: Lock, badge: null },
  ];

  return (
    <section
      id="customer-profile-section"
      className="mx-auto max-w-screen-2xl px-3 py-6 sm:px-6"
    >
      <div className="overflow-hidden rounded-[2rem] border border-orange-100 bg-gradient-to-br from-emerald-50 via-white to-orange-50 shadow-sm">
        <div className="border-b border-orange-100 bg-gradient-to-r from-emerald-700 via-emerald-600 to-orange-500 px-5 py-6 text-white sm:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative h-24 w-24 shrink-0">
                <div className="h-24 w-24 overflow-hidden rounded-full bg-white/20 ring-4 ring-white/20 shadow-lg">
                  {profilePhoto ? (
                    <img
                      src={profilePhoto}
                      alt={customer.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/10">
                      <User className="h-10 w-10 text-white" />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("profile");
                    setShowPhotoUpload((prev) => !prev);
                  }}
                  className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-orange-500 text-xl font-bold leading-none text-white shadow-lg transition hover:scale-105 hover:bg-orange-600"
                  title="Upload / Change profile photo"
                >
                  +
                </button>
              </div>

              <div>
                <h2 className="text-2xl font-extrabold sm:text-3xl">
                  My Profile
                </h2>
                <p className="mt-1 text-sm text-white/85">
                  Welcome back, {customer.name}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
                    ID: ORI-
                    {customer.id
                      .replace(/[^a-z0-9]/gi, "")
                      .slice(-4)
                      .toUpperCase()}
                  </span>
                  <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold capitalize">
                    {customer.approvalStatus || "active"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-0 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="border-b border-orange-100 bg-white/80 p-4 lg:border-b-0 lg:border-r">
            <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Customer
              </div>
              <div className="mt-1 font-extrabold text-slate-900">
                {customer.name}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {customer.phone}
              </div>
            </div>

            <nav className="space-y-2">
              {menu.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.key;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveTab(item.key)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
                      active
                        ? "bg-gradient-to-r from-emerald-600 to-orange-500 text-white shadow-md"
                        : "bg-white text-slate-700 hover:bg-orange-50 hover:text-emerald-800"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge !== null && item.badge > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-bold",
                          active
                            ? "bg-white/25 text-white"
                            : "bg-orange-100 text-orange-700"
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 opacity-60" />
                  </button>
                );
              })}
            </nav>
          </aside>

          <main className="min-h-[620px] p-4 sm:p-6">
            <div className="mb-5 grid gap-4 md:grid-cols-4">
              <SummaryCard
                title="Cart Items"
                value={cart.length}
                icon={ShoppingCart}
                tone="orange"
              />
              <SummaryCard
                title="Active Orders"
                value={activeOrders.length}
                icon={Truck}
                tone="blue"
              />
              <SummaryCard
                title="Total Orders"
                value={myOrders.length}
                icon={Receipt}
                tone="green"
              />
              <SummaryCard
                title="Cart Value"
                value={MVR(cartTotal)}
                icon={CreditCard}
                tone="purple"
              />
            </div>

            {activeTab === "profile" && (
              <ProfileDetails
                customer={customer}
                profilePhoto={profilePhoto}
                showPhotoUpload={showPhotoUpload}
                updateProfilePhoto={updateProfilePhoto}
              />
            )}
            {activeTab === "cart" && <CartSection cart={cart} />}
            {activeTab === "orders" && <OrdersSection orders={activeOrders} />}
            {activeTab === "preorders" && (
              <div className="rounded-3xl border bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-xl font-extrabold text-emerald-900">
                    My Pre-Orders
                  </h3>
                  <p className="text-sm text-slate-500">
                    Track your preorder requests, approval status, delivery
                    date, and admin updates.
                  </p>
                </div>
                <CustomerPreorderHistory />
              </div>
            )}
            {activeTab === "history" && (
              <OrdersSection orders={deliveredOrders} history />
            )}
            {activeTab === "password" && <ChangePassword />}
          </main>
        </div>
      </div>
    </section>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string | number;
  icon: typeof User;
  tone: "orange" | "green" | "blue" | "purple";
}) {
  const cls = {
    orange: "bg-orange-50 text-orange-600",
    green: "bg-emerald-50 text-emerald-600",
    blue: "bg-sky-50 text-sky-600",
    purple: "bg-purple-50 text-purple-600",
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {title}
          </div>
          <div className="mt-1 text-lg font-extrabold text-slate-900">
            {value}
          </div>
        </div>
        <div className={cn("rounded-2xl p-3", cls)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function ProfileDetails({
  customer,
  profilePhoto,
  showPhotoUpload,
  updateProfilePhoto,
}: {
  customer: any;
  profilePhoto: string;
  showPhotoUpload: boolean;
  updateProfilePhoto: (url: string) => void | Promise<void>;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {showPhotoUpload && (
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm lg:col-span-2">
          <div className="mb-3 text-sm font-bold text-emerald-900">
            Upload / Change Profile Photo
          </div>
          <FileUpload
            value={profilePhoto}
            onChange={(url) => void updateProfilePhoto(url)}
            folder="customer-profiles"
          />
        </div>
      )}

      <div className="rounded-3xl border bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-xl font-extrabold text-emerald-900">
          Profile Details
        </h3>

        <div className="grid gap-3">
          <Info icon={User} label="Full Name" value={customer.name} />
          <Info icon={Phone} label="Phone Number" value={customer.phone} />
          <Info icon={MapPin} label="Island" value={customer.island || "-"} />
          <Info icon={Home} label="Address" value={customer.address || "-"} />
        </div>
      </div>

      <div className="rounded-3xl border bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-xl font-extrabold text-emerald-900">
          Account Status
        </h3>

        <div className="space-y-3">
          <StatusBox
            icon={ShieldCheck}
            label="Approval Status"
            value={customer.approvalStatus || "Active"}
            good
          />
          <StatusBox
            icon={CreditCard}
            label="Credit Approved"
            value={customer.isCreditApproved ? "Yes" : "No"}
            good={!!customer.isCreditApproved}
          />
          <div className="rounded-2xl bg-gradient-to-r from-emerald-50 to-orange-50 p-4 text-sm text-slate-600">
            Your profile, cart items, online order history, and preorder status
            are shown here. Admin updates will appear automatically when
            available.
          </div>
        </div>
      </div>
    </div>
  );
}

function CartSection({ cart }: { cart: any[] }) {
  const total = cart.reduce((s, c) => s + c.qty * c.unitPrice, 0);

  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-extrabold text-emerald-900">My Cart</h3>
          <p className="text-sm text-slate-500">
            Items currently added to your cart.
          </p>
        </div>
        <div className="rounded-full bg-orange-100 px-4 py-2 text-sm font-bold text-orange-700">
          Total: {MVR(total)}
        </div>
      </div>

      {cart.length === 0 ? (
        <Empty text="Your cart is empty." />
      ) : (
        <div className="overflow-hidden rounded-2xl border">
          <table className="min-w-full bg-white text-sm">
            <thead className="bg-emerald-700 text-white">
              <tr>
                <th className="px-4 py-3 text-left">Item</th>
                <th className="px-4 py-3 text-left">Qty</th>
                <th className="px-4 py-3 text-left">Unit Price</th>
                <th className="px-4 py-3 text-left">Total</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((c) => (
                <tr key={c.productId} className="border-b last:border-0">
                  <td className="px-4 py-3 font-semibold">{c.productName}</td>
                  <td className="px-4 py-3">{c.qty}</td>
                  <td className="px-4 py-3">{MVR(c.unitPrice)}</td>
                  <td className="px-4 py-3 font-bold text-orange-600">
                    {MVR(c.qty * c.unitPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrdersSection({
  orders,
  history = false,
}: {
  orders: any[];
  history?: boolean;
}) {
  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-xl font-extrabold text-emerald-900">
          {history ? "Order History" : "My Orders"}
        </h3>
        <p className="text-sm text-slate-500">
          {history
            ? "Completed and delivered order records."
            : "Track your current online store orders."}
        </p>
      </div>

      {orders.length === 0 ? (
        <Empty
          text={
            history
              ? "No completed orders found."
              : "No active online store orders found."
          }
        />
      ) : (
        <div className="grid gap-4">
          {orders.map((o) => (
            <div
              key={o.id}
              className="overflow-hidden rounded-2xl border bg-slate-50"
            >
              <div className="flex flex-col gap-2 border-b bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs text-slate-500">
                    {o.createdAt ? new Date(o.createdAt).toLocaleString() : "-"}
                  </div>
                  <div className="font-extrabold text-emerald-900">
                    {o.orderNo || o.id}
                  </div>
                </div>
                <OrderStatus status={o.status} />
              </div>

              <div className="grid gap-3 p-4 md:grid-cols-3">
                <InfoPlain label="Payment Status" value={o.paymentStatus} />
                <InfoPlain label="Total Amount" value={MVR(o.total)} />
                <InfoPlain
                  label="Delivery"
                  value={
                    o.deliveryTime
                      ? new Date(o.deliveryTime).toLocaleString()
                      : "-"
                  }
                />
              </div>

              <div className="px-4 pb-4">
                <div className="grid gap-3 md:grid-cols-2">
                  {(o.currentLocationUrl || (o.currentLatitude && o.currentLongitude)) && (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-900">
                      <div className="font-bold uppercase">My submitted location</div>
                      <div className="mt-1">{o.currentLocationText || `${o.currentLatitude}, ${o.currentLongitude}`}</div>
                      {o.currentLatitude && o.currentLongitude && (
                        <div className="mt-3 overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">
                          <iframe
                            title="My submitted location map"
                            src={`https://maps.google.com/maps?q=${o.currentLatitude},${o.currentLongitude}&z=16&output=embed`}
                            className="h-56 w-full"
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {o.deliveryStaffName && (
                    <div className="rounded-2xl border border-purple-100 bg-purple-50 p-3 text-xs text-purple-900">
                      <div className="font-bold uppercase">Assigned delivery ID</div>
                      <div className="mt-1">{o.deliveryStaffName}</div>
                      {o.deliveryStaffLocationUpdatedAt && (
                        <div className="mt-1">Last update: {new Date(o.deliveryStaffLocationUpdatedAt).toLocaleString()}</div>
                      )}
                      {o.deliveryStaffLatitude && o.deliveryStaffLongitude && (
                        <div className="mt-3 overflow-hidden rounded-xl border border-purple-200 bg-white shadow-sm">
                          <iframe
                            title="Delivery ID live location map"
                            src={`https://maps.google.com/maps?q=${o.deliveryStaffLatitude},${o.deliveryStaffLongitude}&z=16&output=embed`}
                            className="h-56 w-full"
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-4 pb-4">
                <div className="rounded-2xl bg-white p-3">
                  <div className="mb-2 text-sm font-bold text-slate-700">
                    Items
                  </div>

                  {o.items?.length ? (
                    <div className="grid gap-2">
                      {o.items.map((i: any) => (
                        <div
                          key={i.id}
                          className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs"
                        >
                          <span className="font-semibold">
                            {i.productName} × {i.qty}
                          </span>
                          <span className="font-bold text-orange-600">
                            {MVR(i.lineTotal)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">
                      No item details found.
                    </div>
                  )}
                </div>

                {o.rejectionReason && (
                  <div className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
                    Reason: {o.rejectionReason}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChangePassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const updatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    setSaving(true);

    const { error } = await customerSupabase.auth.updateUser({
      password: newPassword,
    });

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Password updated successfully.");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <h3 className="text-xl font-extrabold text-emerald-900">
        Change Password
      </h3>

      <p className="mt-1 text-sm text-slate-500">
        Update your customer login password.
      </p>

      <div className="mt-5 grid gap-4">
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">
            New Password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            placeholder="Enter new password"
          />
        </div>

        <div>
          <label className="text-xs font-bold uppercase text-slate-500">
            Confirm Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            placeholder="Confirm new password"
          />
        </div>
      </div>

      <Button
        onClick={() => void updatePassword()}
        disabled={saving}
        className="mt-5 bg-gradient-to-r from-emerald-600 to-orange-500 text-white hover:from-emerald-700 hover:to-orange-600"
      >
        <Lock className="mr-2 h-4 w-4" />
        {saving ? "Updating..." : "Update Password"}
      </Button>
    </div>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </div>
        <div className="truncate font-bold text-slate-900">{value}</div>
      </div>
    </div>
  );
}

function InfoPlain({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-3">
      <div className="text-xs font-semibold uppercase text-slate-500">
        {label}
      </div>
      <div className="mt-1 font-bold text-slate-900">{value || "-"}</div>
    </div>
  );
}

function StatusBox({
  icon: Icon,
  label,
  value,
  good,
}: {
  icon: typeof User;
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl p-4",
        good ? "bg-emerald-50" : "bg-orange-50"
      )}
    >
      <div
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm",
          good ? "text-emerald-600" : "text-orange-600"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </div>
        <div
          className={cn(
            "font-extrabold capitalize",
            good ? "text-emerald-700" : "text-orange-700"
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function OrderStatus({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; icon: typeof Clock; cls: string }
  > = {
    pending: {
      label: "Pending",
      icon: Clock,
      cls: "bg-amber-100 text-amber-700",
    },
    accepted: {
      label: "Accepted",
      icon: CheckCircle2,
      cls: "bg-sky-100 text-sky-700",
    },
    rejected: {
      label: "Rejected",
      icon: XCircle,
      cls: "bg-rose-100 text-rose-700",
    },
    preparing: {
      label: "Preparing",
      icon: PackageCheck,
      cls: "bg-indigo-100 text-indigo-700",
    },
    out_for_delivery: {
      label: "Out For Delivery",
      icon: Truck,
      cls: "bg-purple-100 text-purple-700",
    },
    delivered: {
      label: "Delivered",
      icon: CheckCircle2,
      cls: "bg-emerald-100 text-emerald-700",
    },
    cancelled: {
      label: "Cancelled",
      icon: XCircle,
      cls: "bg-slate-100 text-slate-700",
    },
  };

  const item = map[status] || map.pending;
  const Icon = item.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold",
        item.cls
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {item.label}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
