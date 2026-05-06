import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useStore, landedCostPerPiece } from "@/lib/store";
import type { Order, OrderItem, OrderStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { useDropdownGroup } from "@/lib/dropdowns";
import {
  Sparkles,
  MessageCircle,
  Mail,
  Copy,
  Anchor,
  PackageCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

const statusColor: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  loaded: "bg-blue-100 text-blue-700",
  received: "bg-emerald-100 text-emerald-700",
  partial: "bg-violet-100 text-violet-700",
  cancelled: "bg-rose-100 text-rose-700",
};

export default function Orders() {
  const products = useStore((s) => s.products);
  const suppliers = useStore((s) => s.suppliers);
  const orders = useStore((s) => s.orders);
  const sales = useStore((s) => s.sales);
  const addOrder = useStore((s) => s.addOrder);
  const updateOrder = useStore((s) => s.updateOrder);
  const receiveOrderItem = useStore((s) => s.receiveOrderItem);
  const markOrderReceived = useStore((s) => s.markOrderReceived);

  // Auto-suggest order quantities by supplier
  const suggestions = useMemo(() => {
    // Compute 30-day sales velocity (pieces/day) per product
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const sold = new Map<string, number>();
    sales
      .filter((s) => new Date(s.date).getTime() >= cutoff)
      .forEach((s) =>
        s.items.forEach((it) => {
          sold.set(it.productId, (sold.get(it.productId) ?? 0) + it.qty);
        })
      );
    return suppliers.map((sup) => {
      const items = products
        .filter((p) => p.supplierId === sup.id)
        .map((p) => {
          const sold30 = sold.get(p.id) ?? 0;
          const velocity = sold30 / 30;
          // suggest 14 days of stock above reorder
          const target = Math.max(p.reorderLevel, Math.ceil(velocity * 14));
          const need = Math.max(0, target - p.stockPieces);
          if (need <= 0) return null;
          const ppCase = Math.max(1, p.piecesPerCase);
          // round up to whole case
          const cases = Math.ceil(need / ppCase);
          const pieces = cases * ppCase;
          return {
            product: p,
            currentStock: p.stockPieces,
            suggestedPieces: pieces,
            suggestedUnits: cases,
            unit: p.unit,
            sold30,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      return { supplier: sup, items };
    });
  }, [products, suppliers, sales]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Record<string, Record<string, number>>>({});
  // draft[supplierId][productId] = unit qty
  const [boatOpen, setBoatOpen] = useState<Order | null>(null);
  const [receiveOpen, setReceiveOpen] = useState<Order | null>(null);
  const [viberOpen, setViberOpen] = useState<{ order: Order; message: string } | null>(null);

  const getDraftQty = (supplierId: string, productId: string, defaultUnit: number): number => {
    return draft[supplierId]?.[productId] ?? defaultUnit;
  };

  const setDraftQty = (supplierId: string, productId: string, val: number): void => {
    setDraft((prev) => ({
      ...prev,
      [supplierId]: { ...(prev[supplierId] ?? {}), [productId]: val },
    }));
  };

  const createOrderForSupplier = (supplierId: string): void => {
    const sug = suggestions.find((s) => s.supplier.id === supplierId);
    if (!sug) return;
    const items: OrderItem[] = sug.items
      .map((it) => {
        const unitQty = getDraftQty(supplierId, it.product.id, it.suggestedUnits);
        const ppCase = Math.max(1, it.product.piecesPerCase);
        const pieces = Math.round(unitQty * ppCase);
        return {
          productId: it.product.id,
          name: it.product.name,
          currentStock: it.currentStock,
          qty: pieces,
          unit: it.product.unit,
          unitQty,
          receivedQty: 0,
        };
      })
      .filter((it) => it.qty > 0);
    if (items.length === 0) {
      toast.error("Set at least one quantity > 0");
      return;
    }
    const order = addOrder(supplierId, items);
    toast.success("Order created");
    // clear draft for that supplier
    setDraft((prev) => ({ ...prev, [supplierId]: {} }));
    setBoatOpen(order);
  };

  const buildViberMessage = (order: Order): string => {
    const sup = suppliers.find((s) => s.id === order.supplierId);
    const lines = order.items
      .map(
        (it, idx) =>
          `${idx + 1}. ${it.name} - ${it.unitQty} - ${it.unit}`
      )
      .join("\n");
    return `Hello, please arrange the following order:\n\nSupplier: ${
      sup?.name ?? ""
    }\nShop: Ori Shop\n\n${lines}\n\nBoat name: ${order.boatName ?? ""}\nLoading date: ${
      order.loadingDate ? formatDate(order.loadingDate) : ""
    }\nContact number: ${order.boatContact ?? ""}\n\nThank you.`;
  };

  const sendViber = (order: Order): void => {
    const msg = buildViberMessage(order);
    const sup = suppliers.find((s) => s.id === order.supplierId);
    const number = (sup?.viber ?? sup?.phone ?? "").replace(/[^\d+]/g, "");
    setViberOpen({ order, message: msg });
    // Try to open Viber deeplink
    const text = encodeURIComponent(msg);
    if (number) {
      const url = `viber://chat?number=${number}&text=${text}`;
      window.open(url, "_blank");
    }
  };

  const sendEmail = (order: Order): void => {
    const sup = suppliers.find((s) => s.id === order.supplierId);
    const msg = buildViberMessage(order);
    const subject = `Order from Ori Shop · ${formatDate(order.date)}`;
    const url = `mailto:${sup?.email ?? ""}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(msg)}`;
    window.location.href = url;
  };

  const copyMessage = async (order: Order): Promise<void> => {
    const msg = buildViberMessage(order);
    try {
      await navigator.clipboard.writeText(msg);
      toast.success("Message copied to clipboard");
    } catch {
      toast.error("Couldn't copy. Select and copy manually.");
    }
  };

  return (
    <>
      <PageHeader
        title="Supplier Orders"
        description="Auto-generated reorder lists, send via Viber or email, and track boat loading."
      />

      {/* Auto-generated suggestions */}
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Auto-suggested orders
          </h2>
        </div>
        <div className="space-y-3">
          {suggestions.map(({ supplier, items }) => {
            const isOpen = expanded[supplier.id] ?? items.length > 0;
            return (
              <div
                key={supplier.id}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
              >
                <button
                  onClick={() =>
                    setExpanded((e) => ({ ...e, [supplier.id]: !isOpen }))
                  }
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-secondary/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Anchor className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold">{supplier.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {items.length} item{items.length !== 1 && "s"} suggested ·{" "}
                        {supplier.viber || supplier.phone}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {items.length > 0 && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        Reorder needed
                      </span>
                    )}
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-border">
                    {items.length === 0 ? (
                      <div className="px-5 py-6 text-sm text-muted-foreground">
                        Stock levels are healthy for this supplier.
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                              <tr>
                                <th className="px-4 py-2 text-left">Item</th>
                                <th className="px-4 py-2 text-right">Stock</th>
                                <th className="px-4 py-2 text-right">Sold (30d)</th>
                                <th className="px-4 py-2 text-right">Suggested</th>
                                <th className="px-4 py-2 text-right">Order qty</th>
                                <th className="px-4 py-2 text-left">Unit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((it) => (
                                <tr
                                  key={it.product.id}
                                  className="border-t border-border"
                                >
                                  <td className="px-4 py-2">
                                    <div className="font-medium">{it.product.name}</div>
                                    <div className="text-xs text-muted-foreground">
                                      Reorder at {it.product.reorderLevel}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    {it.currentStock}
                                  </td>
                                  <td className="px-4 py-2 text-right text-muted-foreground">
                                    {it.sold30}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    {it.suggestedUnits} {it.unit}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <input
                                      type="number"
                                      min={0}
                                      value={getDraftQty(supplier.id, it.product.id, it.suggestedUnits)}
                                      onChange={(e) =>
                                        setDraftQty(
                                          supplier.id,
                                          it.product.id,
                                          Number(e.target.value)
                                        )
                                      }
                                      className="h-9 w-20 rounded-md border border-input bg-background px-2 text-right text-sm"
                                    />
                                  </td>
                                  <td className="px-4 py-2 text-muted-foreground">
                                    {it.unit}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-end border-t border-border px-5 py-3">
                          <Button
                            onClick={() => createOrderForSupplier(supplier.id)}
                            className="gap-2"
                          >
                            <PackageCheck className="h-4 w-4" /> Create Order
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Active orders */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Orders
      </h2>
      <div className="space-y-3">
        {orders.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No orders yet. Create one above.
          </div>
        )}
        {orders.map((order) => {
          const sup = suppliers.find((s) => s.id === order.supplierId);
          const total = order.items.reduce((s, it) => {
            const p = products.find((x) => x.id === it.productId);
            return s + (p ? landedCostPerPiece(p) * it.qty : 0);
          }, 0);
          return (
            <div
              key={order.id}
              className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
            >
              <div className="flex flex-col gap-3 border-b border-border bg-secondary/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <Anchor className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold">{sup?.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Order #{order.id.slice(-6).toUpperCase()} · {formatDate(order.date)} · {order.items.length} items · {formatCurrency(total)}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusColor[order.status]}`}>
                    {order.status}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => sendViber(order)} className="gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5 text-violet-500" /> Viber
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => sendEmail(order)} className="gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> Email
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => copyMessage(order)} className="gap-1.5">
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setBoatOpen(order)}>
                    Boat details
                  </Button>
                  <Button size="sm" onClick={() => setReceiveOpen(order)}>
                    Receive
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">Item</th>
                      <th className="px-4 py-2 text-right">Stock</th>
                      <th className="px-4 py-2 text-right">Ordered</th>
                      <th className="px-4 py-2 text-right">Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((it) => (
                      <tr key={it.productId} className="border-t border-border">
                        <td className="px-4 py-2 font-medium">{it.name}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {it.currentStock}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {it.unitQty} {it.unit} ({it.qty} pcs)
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span
                            className={
                              it.receivedQty === it.qty
                                ? "text-success font-semibold"
                                : it.receivedQty > 0
                                ? "text-amber-600 font-semibold"
                                : "text-muted-foreground"
                            }
                          >
                            {it.receivedQty} pcs
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(order.boatName || order.loadingDate) && (
                <div className="border-t border-border bg-secondary/20 px-4 py-2 text-xs text-muted-foreground">
                  Boat: <span className="font-medium text-foreground">{order.boatName ?? "—"}</span> · Loading{" "}
                  <span className="font-medium text-foreground">
                    {order.loadingDate ? formatDate(order.loadingDate) : "—"}
                  </span>
                  {order.expectedDate && (
                    <>
                      {" · ETA "}
                      <span className="font-medium text-foreground">{formatDate(order.expectedDate)}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Boat details dialog */}
      <Dialog open={!!boatOpen} onOpenChange={(o) => !o && setBoatOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Boat & Loading Details</DialogTitle>
          </DialogHeader>
          {boatOpen && (
            <BoatForm
              order={boatOpen}
              onSave={(patch) => {
                updateOrder(boatOpen.id, patch);
                toast.success("Boat details saved");
                setBoatOpen(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Receive dialog */}
      <Dialog open={!!receiveOpen} onOpenChange={(o) => !o && setReceiveOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Receive Stock</DialogTitle>
          </DialogHeader>
          {receiveOpen && (
            <ReceiveForm
              order={receiveOpen}
              onUpdate={(productId, qty) => receiveOrderItem(receiveOpen.id, productId, qty)}
              onComplete={() => {
                markOrderReceived(receiveOpen.id);
                toast.success("Order marked as received");
                setReceiveOpen(null);
              }}
              onPartial={() => {
                updateOrder(receiveOpen.id, { status: "partial" });
                toast.success("Saved as partially received");
                setReceiveOpen(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Viber message dialog */}
      <Dialog open={!!viberOpen} onOpenChange={(o) => !o && setViberOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Viber Message</DialogTitle>
          </DialogHeader>
          {viberOpen && (
            <>
              <p className="text-xs text-muted-foreground">
                We tried to open Viber. If it didn't open, copy the message and paste in Viber.
              </p>
              <textarea
                readOnly
                value={viberOpen.message}
                rows={12}
                className="w-full rounded-lg border border-input bg-secondary/30 p-3 text-sm font-mono"
              />
              <DialogFooter>
                <Button
                  onClick={async () => {
                    await navigator.clipboard.writeText(viberOpen.message);
                    toast.success("Copied!");
                  }}
                  className="gap-2"
                >
                  <Copy className="h-4 w-4" /> Copy message
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

interface BoatFormProps {
  order: Order;
  onSave: (patch: Partial<Order>) => void;
}
function BoatForm({ order, onSave }: BoatFormProps) {
  const [boatName, setBoatName] = useState(order.boatName ?? "");
  const [boatContact, setBoatContact] = useState(order.boatContact ?? "");
  const [loadingDate, setLoadingDate] = useState(order.loadingDate?.slice(0, 10) ?? "");
  const [sentDate, setSentDate] = useState(order.sentDate?.slice(0, 10) ?? "");
  const [expectedDate, setExpectedDate] = useState(order.expectedDate?.slice(0, 10) ?? "");
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [notes, setNotes] = useState(order.notes ?? "");
  const statusOptions = useDropdownGroup("order_status");
  const boatOptions = useDropdownGroup("boat_name");

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Boat name">
          {boatOptions.length > 0 ? (
            <select value={boatName} onChange={(e) => setBoatName(e.target.value)} className={inputCls}>
              <option value="">— Select —</option>
              {boatOptions.map((b) => (
                <option key={b.id} value={b.label}>
                  {b.label}
                </option>
              ))}
              {boatName && !boatOptions.some((b) => b.label === boatName) && (
                <option value={boatName}>{boatName} (legacy)</option>
              )}
            </select>
          ) : (
            <input value={boatName} onChange={(e) => setBoatName(e.target.value)} className={inputCls} />
          )}
        </Field>
        <Field label="Boat contact">
          <input value={boatContact} onChange={(e) => setBoatContact(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Loading date">
          <input type="date" value={loadingDate} onChange={(e) => setLoadingDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Sent date">
          <input type="date" value={sentDate} onChange={(e) => setSentDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Expected received date">
          <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as OrderStatus)}
            className={inputCls}
          >
            {(statusOptions.length > 0
              ? statusOptions
              : [
                  { id: "s-pending", value: "pending", label: "Pending" },
                  { id: "s-loaded", value: "loaded", label: "Loaded" },
                  { id: "s-received", value: "received", label: "Received" },
                  { id: "s-partial", value: "partial", label: "Partially received" },
                  { id: "s-cancelled", value: "cancelled", label: "Cancelled" },
                ]
            ).map((o) => (
              <option key={o.id} value={o.value}>
                {o.label}
              </option>
            ))}
            {statusOptions.length > 0 &&
              !statusOptions.some((o) => o.value === status) && (
                <option value={status}>{status} (legacy)</option>
              )}
          </select>
        </Field>
      </div>
      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-input bg-background p-3 text-sm"
        />
      </Field>
      <DialogFooter>
        <Button
          onClick={() =>
            onSave({
              boatName,
              boatContact,
              loadingDate: loadingDate ? new Date(loadingDate).toISOString() : undefined,
              sentDate: sentDate ? new Date(sentDate).toISOString() : undefined,
              expectedDate: expectedDate ? new Date(expectedDate).toISOString() : undefined,
              status,
              notes,
            })
          }
        >
          Save
        </Button>
      </DialogFooter>
    </div>
  );
}

interface ReceiveFormProps {
  order: Order;
  onUpdate: (productId: string, qty: number) => void;
  onComplete: () => void;
  onPartial: () => void;
}
function ReceiveForm({ order, onUpdate, onComplete, onPartial }: ReceiveFormProps) {
  const [draft, setDraft] = useState<Record<string, number>>(
    Object.fromEntries(order.items.map((i) => [i.productId, i.receivedQty]))
  );

  const apply = (): void => {
    Object.entries(draft).forEach(([pid, qty]) => onUpdate(pid, qty));
  };

  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Item</th>
            <th className="px-3 py-2 text-right">Ordered (pcs)</th>
            <th className="px-3 py-2 text-right">Received (pcs)</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((it) => (
            <tr key={it.productId} className="border-t border-border">
              <td className="px-3 py-2">{it.name}</td>
              <td className="px-3 py-2 text-right">{it.qty}</td>
              <td className="px-3 py-2 text-right">
                <input
                  type="number"
                  min={0}
                  max={it.qty}
                  value={draft[it.productId] ?? 0}
                  onChange={(e) =>
                    setDraft({ ...draft, [it.productId]: Math.min(it.qty, Number(e.target.value)) })
                  }
                  className="h-9 w-24 rounded-md border border-input bg-background px-2 text-right text-sm"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={() => { apply(); onPartial(); }}>
          Save partial
        </Button>
        <Button onClick={() => { apply(); onComplete(); }}>
          Mark as fully received
        </Button>
      </DialogFooter>
    </div>
  );
}

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface FieldProps {
  label: string;
  children: React.ReactNode;
}
function Field({ label, children }: FieldProps) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
