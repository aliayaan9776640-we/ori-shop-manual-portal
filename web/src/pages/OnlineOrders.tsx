import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useOnlineAdminStore, orderToSaleItems } from "@/lib/onlineStore";
import type { OnlineOrder, OnlineOrderStatus } from "@/lib/onlineStore";
import { useStore, landedCostPerPiece, useCurrentUser } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  CheckCircle2,
  X,
  Truck,
  PackageCheck,
  Clock,
  Receipt,
  UserCheck,
  RefreshCw,
  Trash2,
} from "lucide-react";

const MVR = (n: number): string =>
  `MVR ${Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const STATUS_FLOW: OnlineOrderStatus[] = [
  "accepted",
  "preparing",
  "out_for_delivery",
  "delivered",
];

export default function OnlineOrders() {
  const orders = useOnlineAdminStore((s) => s.orders);
  const customers = useOnlineAdminStore((s) => s.customers);
  const load = useOnlineAdminStore((s) => s.load);
  const lastError = useOnlineAdminStore((s) => s.lastError);
  const acceptOrder = useOnlineAdminStore((s) => s.acceptOrder);
  const rejectOrder = useOnlineAdminStore((s) => s.rejectOrder);
  const setStatus = useOnlineAdminStore((s) => s.setStatus);
  const assignDelivery = useOnlineAdminStore((s) => s.assignDelivery);
  const acceptDelivery = useOnlineAdminStore((s) => s.acceptDelivery);
  const updateDeliveryLocation = useOnlineAdminStore((s) => s.updateDeliveryLocation);
  const approveCustomer = useOnlineAdminStore((s) => s.approveCustomer);
  const rejectCustomer = useOnlineAdminStore((s) => s.rejectCustomer);
  const setCustomerCredit = useOnlineAdminStore((s) => s.setCustomerCredit);

  const products = useStore((s) => s.products);
  const addSale = useStore((s) => s.addSale);
  const users = useStore((s) => s.users);
  const currentUser = useCurrentUser();

  const [tab, setTab] = useState<string>("active");
  const [selected, setSelected] = useState<OnlineOrder | null>(null);
  const [rejectFor, setRejectFor] = useState<OnlineOrder | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("online-orders-admin-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "online_orders" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "online_order_items" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "public_customers" },
        () => load()
      )
      .subscribe();
    // 10s polling fallback in case realtime is disabled
    const interval = window.setInterval(() => void load(), 10_000);
    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(interval);
    };
  }, [load]);

  const active = useMemo(
    () =>
      orders.filter((o) =>
        ["pending", "accepted", "preparing", "out_for_delivery"].includes(
          o.status
        )
      ),
    [orders]
  );
  const history = useMemo(
    () =>
      orders.filter((o) =>
        ["delivered", "rejected", "cancelled"].includes(o.status)
      ),
    [orders]
  );

  const deliveryStaff = users.filter(
    (u) => u.active && u.role !== "admin"
  );

  const deleteOrderPermanently = async (o: OnlineOrder): Promise<void> => {
    const ok = window.confirm(
      `Permanently delete order ${o.orderNo || o.id}?\n\nThis will remove the order and its items from Supabase. This action cannot be undone.`
    );

    if (!ok) return;

    const { error: itemError } = await supabase
      .from("online_order_items")
      .delete()
      .eq("order_id", o.id);

    if (itemError) {
      toast.error("Could not delete order items: " + itemError.message);
      return;
    }

    const { error: orderError } = await supabase
      .from("online_orders")
      .delete()
      .eq("id", o.id);

    if (orderError) {
      toast.error("Could not delete order: " + orderError.message);
      return;
    }

    toast.success("Order permanently deleted");
    setSelected(null);
    await load();
  };

  const reject = async (): Promise<void> => {
    if (!rejectFor) return;
    await rejectOrder(rejectFor.id, rejectReason);
    setRejectFor(null);
    setRejectReason("");
    toast.success("Order rejected");
  };

  const approveBankPayment = async (o: OnlineOrder): Promise<void> => {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id ?? null;
    let staffName: string | null = null;
    if (uid) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name,email")
        .eq("id", uid)
        .maybeSingle();
      staffName =
        (prof as { full_name?: string; email?: string } | null)?.full_name ??
        (prof as { email?: string } | null)?.email ??
        null;
    }
    const { error } = await supabase
      .from("online_orders")
      .update({
        payment_status: "paid",
        payment_approved_at: new Date().toISOString(),
        payment_approved_by: staffName,
      })
      .eq("id", o.id);
    if (error) {
      toast.error("Payment approval failed: " + error.message);
      return;
    }
    toast.success("Payment approved");
    await load();
  };

  const shareDeliveryLocation = (o: OnlineOrder): void => {
    if (!navigator.geolocation) {
      toast.error("Location is not supported on this browser/device.");
      return;
    }
    if (!o.deliveryStaffId) {
      toast.error("Assign delivery ID before sharing delivery location.");
      return;
    }
    if (currentUser?.id !== o.deliveryStaffId) {
      toast.error("Only the assigned delivery ID can update live delivery location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const res = await updateDeliveryLocation(
          o.id,
          lat,
          lng,
          `Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`
        );
        if (!res.ok) {
          toast.error(res.error || "Could not update delivery location");
          return;
        }
        toast.success("Delivery live location updated");
      },
      (err) => toast.error(err.message || "Please allow location permission."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  };

  /** Convert accepted online order → POS sale (deducts inventory). */
  const convertToSale = async (o: OnlineOrder): Promise<void> => {
    const lookup = (productId: string) => {
      const p = products.find((pp) => pp.id === productId);
      if (!p) return null;
      return {
        sellingPrice: p.sellingPrice,
        landedCost: landedCostPerPiece(p),
        unit: p.unit,
        gstApplicable: p.gstApplicable,
      };
    };

    // Validate inventory.
    for (const it of o.items) {
      if (!it.productId) {
        toast.error(`Item "${it.productName}" no longer linked to a product.`);
        return;
      }
      const p = products.find((pp) => pp.id === it.productId);
      if (!p) {
        toast.error(`Product "${it.productName}" not found.`);
        return;
      }
      if (p.stockPieces < it.qty) {
        toast.error(
          `Not enough stock for ${it.productName} (have ${p.stockPieces}, need ${it.qty})`
        );
        return;
      }
    }

    const items = orderToSaleItems(o, lookup);
    if (items.length === 0) {
      toast.error("No valid items in this order.");
      return;
    }

    const pm =
      o.paymentMethod === "cash"
        ? "cash"
        : o.paymentMethod === "bank"
          ? "bank"
          : o.paymentMethod === "bml_gateway"
            ? "card"
            : "credit";

    // Credit can be used only when the online customer name + phone matches an approved POS credit customer.
    let customerId: string | undefined;
    if (pm === "credit") {
      const normalizeName = (v: string) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
      const normalizePhone = (v: string) => String(v || "").replace(/\D/g, "");
      const match = useStore.getState().customers.find((c) =>
        normalizeName(c.name) === normalizeName(o.customerName) &&
        normalizePhone(c.phone) === normalizePhone(o.customerPhone) &&
        c.approvalStatus === "approved"
      );
      customerId = match?.id;
      if (!customerId) {
        toast.error("Credit customer not matched. Name and phone must match an approved POS credit customer.");
        return;
      }
    }

    const sale = addSale(items, pm, customerId);

    // Mark order completed and link sale.
    await supabase
      .from("online_orders")
      .update({
        status: "delivered",
        sale_id: sale.id.startsWith("sl_") ? null : sale.id,
        payment_status: pm === "cash" ? "unpaid" : "paid",
        delivered_at: new Date().toISOString(),
      })
      .eq("id", o.id);

    toast.success(`Order ${o.orderNo} converted to POS sale`);
    await load();
    setSelected(null);
  };

  return (
    <div>
      <PageHeader
        title="Online Orders"
        description="Customer orders from the public storefront."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {lastError && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <strong>Online order data error:</strong> {lastError}
          <div className="mt-1 text-xs text-destructive/80">
            Run migration <code className="rounded bg-destructive/20 px-1">0019_online_store.sql</code> in Supabase if missing.
          </div>
        </div>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="active">
            Active
            {active.length > 0 && (
              <span className="ml-2 rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white">
                {active.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <OrderList
            orders={active}
            onSelect={setSelected}
            onReject={setRejectFor}
            onDelete={(o) => void deleteOrderPermanently(o)}
          />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <OrderList
            orders={history}
            onSelect={setSelected}
            onReject={setRejectFor}
            onDelete={(o) => void deleteOrderPermanently(o)}
          />
        </TabsContent>
      </Tabs>

      {/* Order detail dialog */}
      <Dialog
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
      >
        <DialogContent className="max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.orderNo || `ONL-${selected.id.slice(0, 8).toUpperCase()}`}</DialogTitle>
                <DialogDescription>
                  {new Date(selected.createdAt).toLocaleString()} ·{" "}
                  {selected.customerName} · {selected.customerPhone}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-lg border border-border p-3 text-sm">
                  <div className="text-xs font-bold uppercase text-muted-foreground">Customer / Delivery Details</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div><b>Name:</b> {selected.customerName || "-"}</div>
                    <div><b>Phone:</b> {selected.customerPhone || "-"}</div>
                    <div><b>Island:</b> {selected.customerIsland || "-"}</div>
                    <div><b>Address:</b> {selected.deliveryAddress || "-"}</div>
                  </div>
                  {selected.notes && <div className="mt-2 text-xs text-muted-foreground">Note: {selected.notes}</div>}

                  {selected.currentLatitude && selected.currentLongitude && (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                      <div className="mb-1 font-bold uppercase">Customer current location</div>
                      <div>{selected.currentLocationText || `${selected.currentLatitude}, ${selected.currentLongitude}`}</div>
                      <div className="mt-2 rounded-md bg-emerald-700 px-3 py-1.5 text-center text-xs font-bold text-white">
                        Customer location shown below
                      </div>
                      <div className="mt-3 overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">
                        <iframe
                          title="Customer location map"
                          src={`https://maps.google.com/maps?q=${selected.currentLatitude},${selected.currentLongitude}&z=16&output=embed`}
                          className="h-64 w-full"
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                      </div>
                    </div>
                  )}

                  {selected.deliveryStaffLatitude && selected.deliveryStaffLongitude && (
                    <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900">
                      <div className="mb-1 font-bold uppercase">Delivery ID live location</div>
                      <div>{selected.deliveryStaffLocationText || `${selected.deliveryStaffLatitude}, ${selected.deliveryStaffLongitude}`}</div>
                      {selected.deliveryStaffLocationUpdatedAt && (
                        <div className="mt-1">Last update: {new Date(selected.deliveryStaffLocationUpdatedAt).toLocaleString()}</div>
                      )}
                      <div className="mt-2 rounded-md bg-purple-700 px-3 py-1.5 text-center text-xs font-bold text-white">
                        Delivery location shown below
                      </div>
                      <div className="mt-3 overflow-hidden rounded-xl border border-purple-200 bg-white shadow-sm">
                        <iframe
                          title="Delivery ID live location map"
                          src={`https://maps.google.com/maps?q=${selected.deliveryStaffLatitude},${selected.deliveryStaffLongitude}&z=16&output=embed`}
                          className="h-64 w-full"
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                      </div>
                    </div>
                  )}

                  {selected.currentLatitude && selected.currentLongitude && selected.deliveryStaffLatitude && selected.deliveryStaffLongitude && (
                    <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
                      <div className="mb-1 font-bold uppercase">Admin view: both locations</div>
                      <div className="text-indigo-800">
                        Customer and assigned delivery location are shown above directly inside this order window.
                      </div>
                    </div>
                  )}

                  {(selected as any).needBoatDelivery && (
                    <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
                      <div className="mb-1 font-bold uppercase">Boat delivery requested</div>
                      <div className="grid gap-1 sm:grid-cols-2">
                        <div><b>Boat:</b> {(selected as any).boatName || "-"}</div>
                        <div><b>Contact:</b> {(selected as any).boatContact || "-"}</div>
                        <div><b>Location:</b> {(selected as any).boatLocation || "-"}</div>
                        <div><b>Departure:</b> {[(selected as any).boatDepartureDate, (selected as any).boatDepartureTime].filter(Boolean).join(" ") || "-"}</div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="p-2">Item</th>
                        <th className="p-2 text-right">Qty</th>
                        <th className="p-2 text-right">Price</th>
                        <th className="p-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.items.map((i) => (
                        <tr key={i.id} className="border-t border-border">
                          <td className="p-2">{i.productName}</td>
                          <td className="p-2 text-right">{i.qty}</td>
                          <td className="p-2 text-right">{MVR(i.unitPrice)}</td>
                          <td className="p-2 text-right font-medium">
                            {MVR(i.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/40">
                        <td colSpan={3} className="p-2 text-right font-bold">
                          Total
                        </td>
                        <td className="p-2 text-right font-extrabold text-emerald-700">
                          {MVR(selected.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">Payment</div>
                    <div className="font-medium uppercase">
                      {selected.paymentMethod} · {selected.paymentStatus}
                    </div>
                    {(selected as any).paymentSlipUrl && (
                      <a
                        href={(selected as any).paymentSlipUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block text-xs text-sky-600 underline"
                      >
                        View payment slip
                      </a>
                    )}
                    {selected.paymentMethod === "bank" && selected.paymentStatus !== "paid" && (
                      <Button size="sm" className="mt-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => void approveBankPayment(selected)}>
                        Approve Payment
                      </Button>
                    )}
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className="font-medium uppercase">
                      {selected.status.replace(/_/g, " ")}
                    </div>
                  </div>
                </div>

                {selected.status !== "rejected" &&
                  selected.status !== "cancelled" && (
                    <div className="space-y-2 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                      <div className="text-xs font-bold uppercase text-emerald-800">
                        Delivery
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Select
                          value={selected.deliveryStaffId ?? ""}
                          onValueChange={(v) => {
                            const staff = deliveryStaff.find((s) => s.id === v);
                            if (staff)
                              void assignDelivery(
                                selected.id,
                                staff.id,
                                staff.fullName
                              );
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Assign delivery staff…" />
                          </SelectTrigger>
                          <SelectContent>
                            {deliveryStaff.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.fullName} ({s.role})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={selected.status}
                          onValueChange={(v) =>
                            void setStatus(
                              selected.id,
                              v as OnlineOrderStatus
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_FLOW.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s.replace(/_/g, " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {selected.deliveryStaffName && (
                        <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
                          <div><b>Assigned Delivery ID:</b> {selected.deliveryStaffName}</div>
                          <div><b>Accepted:</b> {selected.deliveryStaffAccepted ? "Yes" : "No"}</div>
                          {selected.deliveryStaffLocationUpdatedAt && (
                            <div><b>Last live update:</b> {new Date(selected.deliveryStaffLocationUpdatedAt).toLocaleString()}</div>
                          )}
                        </div>
                      )}

                      {selected.deliveryStaffId === currentUser?.id && !selected.deliveryStaffAccepted && (
                        <Button
                          size="sm"
                          className="bg-purple-600 hover:bg-purple-700"
                          onClick={() =>
                            void acceptDelivery(selected.id).then((r) => {
                              if (!r.ok) toast.error(r.error || "Could not accept delivery");
                              else toast.success("Delivery accepted");
                            })
                          }
                        >
                          <Truck className="mr-1 h-4 w-4" />
                          Accept Delivery ID
                        </Button>
                      )}

                      {selected.deliveryStaffId === currentUser?.id && selected.deliveryStaffAccepted && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-purple-300 text-purple-700 hover:bg-purple-50"
                          onClick={() => shareDeliveryLocation(selected)}
                        >
                          <Truck className="mr-1 h-4 w-4" />
                          Update My Live Location
                        </Button>
                      )}
                    </div>
                  )}
              </div>

              <DialogFooter className="gap-2">
                {selected.status === "pending" && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setRejectFor(selected);
                        setSelected(null);
                      }}
                    >
                      <X className="mr-1 h-4 w-4" />
                      Reject
                    </Button>
                    <Button
                      onClick={() =>
                        void acceptOrder(selected.id, {}).then((r) => {
                          if (r.ok) toast.success("Order accepted");
                        })
                      }
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                      Accept
                    </Button>
                  </>
                )}
                {(selected.status === "accepted" ||
                  selected.status === "preparing" ||
                  selected.status === "out_for_delivery") &&
                  !selected.saleId && (
                    <Button
                      onClick={() => void convertToSale(selected)}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Receipt className="mr-1 h-4 w-4" />
                      Complete &amp; convert to POS sale
                    </Button>
                  )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject reason */}
      <Dialog
        open={!!rejectFor}
        onOpenChange={(v) => {
          if (!v) {
            setRejectFor(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject order</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Reason (visible to customer)</Label>
            <Textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Out of stock, store closed, etc."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void reject()}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* --------------------------- order list table --------------------------- */

function OrderList({
  orders,
  onSelect,
  onReject,
  onDelete,
}: {
  orders: OnlineOrder[];
  onSelect: (o: OnlineOrder) => void;
  onReject: (o: OnlineOrder) => void;
  onDelete: (o: OnlineOrder) => void;
}) {
  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
        No orders.
      </div>
    );
  }
  const statusColor: Record<OnlineOrderStatus, string> = {
    pending: "bg-amber-500",
    accepted: "bg-sky-500",
    preparing: "bg-indigo-500",
    out_for_delivery: "bg-purple-500",
    delivered: "bg-emerald-600",
    rejected: "bg-rose-500",
    cancelled: "bg-slate-500",
  };
  const statusIcon: Record<OnlineOrderStatus, React.ElementType> = {
    pending: Clock,
    accepted: CheckCircle2,
    preparing: PackageCheck,
    out_for_delivery: Truck,
    delivered: CheckCircle2,
    rejected: X,
    cancelled: X,
  };
  return (
    <div className="rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="p-3">Order</th>
            <th className="p-3">Customer</th>
            <th className="p-3">Items</th>
            <th className="p-3">Payment</th>
            <th className="p-3 text-right">Total</th>
            <th className="p-3">Status</th>
            <th className="p-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const Icon = statusIcon[o.status];
            return (
              <tr
                key={o.id}
                className="cursor-pointer border-t border-border hover:bg-muted/20"
                onClick={() => onSelect(o)}
              >
                <td className="p-3 font-mono text-xs">
                  <div className="font-bold">{o.orderNo}</div>
                  <div className="text-muted-foreground">
                    {new Date(o.createdAt).toLocaleString()}
                  </div>
                </td>
                <td className="p-3">
                  <div className="font-medium">{o.customerName}</div>
                  <div className="text-xs text-muted-foreground">
                    {o.customerPhone}
                  </div>
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {o.items.length} item{o.items.length === 1 ? "" : "s"}
                </td>
                <td className="p-3 text-xs uppercase">{o.paymentMethod}</td>
                <td className="p-3 text-right font-bold text-emerald-700">
                  {MVR(o.total)}
                </td>
                <td className="p-3">
                  <Badge className={`${statusColor[o.status]} text-white`}>
                    <Icon className="mr-1 h-3 w-3" />
                    {o.status.replace(/_/g, " ")}
                  </Badge>
                </td>
                <td className="p-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    {o.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onReject(o)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => onSelect(o)}
                        >
                          Open
                        </Button>
                      </>
                    )}
                    {o.status !== "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSelect(o)}
                      >
                        Open
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onDelete(o)}
                      title="Delete permanently"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------- credit editor ----------------------------- */

function CreditEditor({
  customerId,
  currentLimit,
  currentApproved,
  onSave,
}: {
  customerId: string;
  currentLimit: number;
  currentApproved: boolean;
  onSave: (limit: number, approved: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(String(currentLimit || 0));
  const [approved, setApproved] = useState(currentApproved);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Credit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Credit settings</DialogTitle>
            <DialogDescription>
              Customer ID: {customerId.slice(0, 8)}…
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Credit limit (MVR)</Label>
              <Input
                type="number"
                min={0}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={approved}
                onChange={(e) => setApproved(e.target.checked)}
              />
              Credit approved
            </label>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                onSave(Number(limit) || 0, approved);
                setOpen(false);
              }}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}