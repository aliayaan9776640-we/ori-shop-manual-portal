import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useOnlineAdminStore, orderToSaleItems } from "@/lib/onlineStore";
import type { OnlineOrder, OnlineOrderStatus } from "@/lib/onlineStore";
import { useStore, landedCostPerPiece } from "@/lib/store";
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
  const approveCustomer = useOnlineAdminStore((s) => s.approveCustomer);
  const rejectCustomer = useOnlineAdminStore((s) => s.rejectCustomer);
  const setCustomerCredit = useOnlineAdminStore((s) => s.setCustomerCredit);

  const products = useStore((s) => s.products);
  const addSale = useStore((s) => s.addSale);
  const users = useStore((s) => s.users);

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

  const reject = async (): Promise<void> => {
    if (!rejectFor) return;
    await rejectOrder(rejectFor.id, rejectReason);
    setRejectFor(null);
    setRejectReason("");
    toast.success("Order rejected");
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

    const pm = o.paymentMethod === "cash" ? "cash" : o.paymentMethod === "bank" ? "bank" : "credit";

    // Find or auto-create a credit customer linkage if needed.
    let customerId: string | undefined;
    if (pm === "credit") {
      // Try to find existing credit customer by phone match.
      const match = useStore
        .getState()
        .customers.find((c) => c.phone === o.customerPhone);
      customerId = match?.id;
      if (!customerId) {
        toast.error(
          "No matching credit customer found. Create one in Credit Customers and retry."
        );
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
          <TabsTrigger value="customers">
            Customers
            {customers.filter((c) => c.approvalStatus === "pending").length >
              0 && (
              <span className="ml-2 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                {customers.filter((c) => c.approvalStatus === "pending").length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <OrderList
            orders={active}
            onSelect={setSelected}
            onReject={setRejectFor}
          />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <OrderList
            orders={history}
            onSelect={setSelected}
            onReject={setRejectFor}
          />
        </TabsContent>
        <TabsContent value="customers" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Island</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Credit</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      No customers yet.
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3">{c.phone}</td>
                      <td className="p-3">{c.island}</td>
                      <td className="p-3">
                        <Badge
                          className={
                            c.approvalStatus === "approved"
                              ? "bg-emerald-600"
                              : c.approvalStatus === "rejected"
                                ? "bg-rose-500"
                                : "bg-amber-500"
                          }
                        >
                          {c.approvalStatus}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs">
                        {c.isCreditApproved ? (
                          <span className="text-emerald-700">
                            {MVR(c.creditLimit)} limit
                          </span>
                        ) : (
                          <span className="text-muted-foreground">No credit</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-2">
                          {c.approvalStatus !== "approved" && (
                            <Button
                              size="sm"
                              onClick={() => void approveCustomer(c.id)}
                              className="bg-emerald-600 hover:bg-emerald-700"
                            >
                              <UserCheck className="mr-1 h-3 w-3" />
                              Approve
                            </Button>
                          )}
                          <CreditEditor
                            customerId={c.id}
                            currentLimit={c.creditLimit}
                            currentApproved={c.isCreditApproved}
                            onSave={(l, a) =>
                              void setCustomerCredit(c.id, l, a)
                            }
                          />
                          {c.approvalStatus !== "rejected" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void rejectCustomer(c.id)}
                            >
                              Reject
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
                <DialogTitle>{selected.orderNo}</DialogTitle>
                <DialogDescription>
                  {new Date(selected.createdAt).toLocaleString()} ·{" "}
                  {selected.customerName} · {selected.customerPhone}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-lg border border-border p-3 text-sm">
                  <div className="text-xs text-muted-foreground">Deliver to</div>
                  <div>
                    {selected.customerIsland}
                    {selected.customerIsland && selected.deliveryAddress && " · "}
                    {selected.deliveryAddress}
                  </div>
                  {selected.notes && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Note: {selected.notes}
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
                      {selected.paymentMethod}
                    </div>
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
}: {
  orders: OnlineOrder[];
  onSelect: (o: OnlineOrder) => void;
  onReject: (o: OnlineOrder) => void;
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
