import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import NumInput from "@/components/NumInput";
import {
  useConsignment,
  computeOwnerBalance,
  itemBalance,
  type ConsignmentItem,
  type ConsignmentOwner,
  type ConsignmentUnit,
} from "@/lib/consignment";
import { useCurrentUser } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash2,
  Phone,
  MapPin,
  ShoppingCart,
  Undo2,
  HandCoins,
  PackageCheck,
  Users as UsersIcon,
  Receipt,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

const UNIT_OPTIONS: ConsignmentUnit[] = ["piece", "packet", "kg", "tin", "box", "case"];

/* ------------------------------ root ------------------------------ */

export default function ConsignmentPage() {
  const user = useCurrentUser();
  const isAdmin = user?.role === "admin";
  const isStorekeeper = user?.role === "storekeeper";
  const isCashier = user?.role === "cashier";
  const canManageOwners = isAdmin || isStorekeeper;
  const canSell = isAdmin || isCashier;
  const canSettle = isAdmin;

  const load = useConsignment((s) => s.load);
  const loaded = useConsignment((s) => s.loaded);
  const missing = useConsignment((s) => s.missing);
  const owners = useConsignment((s) => s.owners);
  const items = useConsignment((s) => s.items);
  const sales = useConsignment((s) => s.sales);
  const returns = useConsignment((s) => s.returns);
  const settlements = useConsignment((s) => s.settlements);

  useEffect(() => {
    if (!loaded) void load();
  }, [load, loaded]);

  // KPIs
  const today = useMemo(() => new Date(), []);
  const isToday = (iso: string): boolean => {
    const d = new Date(iso);
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    );
  };
  const todaySales = sales.filter((s) => isToday(s.createdAt));
  const todaySalesTotal = todaySales.reduce((a, s) => a + s.totalAmount, 0);
  const todayPayable = todaySales.reduce((a, s) => a + s.payableAmount, 0);
  const totalUnpaid = owners.reduce((a, o) => {
    const b = computeOwnerBalance(o.id, items, sales, settlements);
    return a + b.remainingPayable;
  }, 0);
  const stockBalanceItems = items.filter((i) => itemBalance(i) > 0).length;

  return (
    <>
      <PageHeader
        title="Consignment"
        description="Stock owned by suppliers / individuals — track receive, sell, settle and return."
      />

      {missing && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
          <div className="flex-1">
            <div className="font-semibold text-destructive">
              Consignment tables not found in Supabase
            </div>
            <div className="text-muted-foreground">
              Open your Supabase Dashboard → SQL Editor and run{" "}
              <code className="rounded bg-muted px-1">
                supabase/migrations/0005_consignment.sql
              </code>{" "}
              (or the combined{" "}
              <code className="rounded bg-muted px-1">apply_now.sql</code>),
              then click <b>Reload</b>.
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void useConsignment.getState().load();
                  toast.info("Reloading…");
                }}
              >
                Reload
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Today consignment sales"
          value={formatCurrency(todaySalesTotal)}
          icon={ShoppingCart}
          tone="primary"
        />
        <Kpi
          label="Today payable to owners"
          value={formatCurrency(todayPayable)}
          icon={HandCoins}
          tone="warning"
        />
        <Kpi
          label="Total unpaid balance"
          value={formatCurrency(totalUnpaid)}
          icon={Receipt}
          tone="danger"
        />
        <Kpi
          label="Items in stock"
          value={String(stockBalanceItems)}
          icon={PackageCheck}
          tone="success"
        />
      </div>

      <Tabs defaultValue="owners" className="w-full">
        <TabsList className="mb-4 flex w-full overflow-x-auto">
          <TabsTrigger value="owners" className="gap-1.5">
            <UsersIcon className="h-3.5 w-3.5" /> Owners
          </TabsTrigger>
          <TabsTrigger value="stock" className="gap-1.5">
            <PackageCheck className="h-3.5 w-3.5" /> Stock
          </TabsTrigger>
          <TabsTrigger value="sales" className="gap-1.5">
            <ShoppingCart className="h-3.5 w-3.5" /> Sales
          </TabsTrigger>
          <TabsTrigger value="settlements" className="gap-1.5">
            <HandCoins className="h-3.5 w-3.5" /> Settlements
          </TabsTrigger>
          <TabsTrigger value="returns" className="gap-1.5">
            <Undo2 className="h-3.5 w-3.5" /> Returns
          </TabsTrigger>
        </TabsList>

        <TabsContent value="owners">
          <OwnersTab canManage={canManageOwners} />
        </TabsContent>
        <TabsContent value="stock">
          <StockTab canManage={canManageOwners} canSell={canSell} />
        </TabsContent>
        <TabsContent value="sales">
          <SalesTab />
        </TabsContent>
        <TabsContent value="settlements">
          <SettlementsTab canSettle={canSettle} />
        </TabsContent>
        <TabsContent value="returns">
          <ReturnsTab canManage={canManageOwners} />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ------------------------------ KPI ------------------------------ */

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone: "primary" | "warning" | "danger" | "success";
}) {
  const toneClass: Record<string, string> = {
    primary: "from-primary/10 to-primary/5 text-primary",
    warning: "from-amber-500/10 to-amber-500/5 text-amber-600",
    danger: "from-rose-500/10 to-rose-500/5 text-rose-600",
    success: "from-emerald-500/10 to-emerald-500/5 text-emerald-600",
  };
  return (
    <div className={`rounded-2xl border border-border bg-gradient-to-br ${toneClass[tone]} p-4 shadow-sm`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-2 text-2xl font-bold text-foreground">{value}</div>
    </div>
  );
}

/* ------------------------------ Owners ------------------------------ */

interface OwnerForm {
  name: string;
  phone: string;
  address: string;
  paymentMethod: string;
  notes: string;
}
const blankOwner: OwnerForm = {
  name: "",
  phone: "",
  address: "",
  paymentMethod: "",
  notes: "",
};

function OwnersTab({ canManage }: { canManage: boolean }) {
  const owners = useConsignment((s) => s.owners);
  const items = useConsignment((s) => s.items);
  const sales = useConsignment((s) => s.sales);
  const settlements = useConsignment((s) => s.settlements);
  const addOwner = useConsignment((s) => s.addOwner);
  const updateOwner = useConsignment((s) => s.updateOwner);
  const deleteOwner = useConsignment((s) => s.deleteOwner);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ConsignmentOwner | null>(null);
  const [form, setForm] = useState<OwnerForm>(blankOwner);

  const openNew = (): void => {
    setEditing(null);
    setForm(blankOwner);
    setOpen(true);
  };
  const openEdit = (o: ConsignmentOwner): void => {
    setEditing(o);
    setForm({
      name: o.name,
      phone: o.phone,
      address: o.address,
      paymentMethod: o.paymentMethod,
      notes: o.notes,
    });
    setOpen(true);
  };

  const submit = async (): Promise<void> => {
    if (!form.name.trim()) {
      toast.error("Owner name is required");
      return;
    }
    if (editing) {
      await updateOwner(editing.id, form);
      toast.success("Owner updated");
    } else {
      const created = await addOwner(form);
      if (created) toast.success("Owner added");
      else toast.error("Failed to add owner");
    }
    setOpen(false);
  };

  const onDelete = async (o: ConsignmentOwner): Promise<void> => {
    if (!confirm(`Delete owner "${o.name}"? This will remove their items, sales and settlements.`))
      return;
    await deleteOwner(o.id);
    toast.success("Owner deleted");
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {owners.length} owner{owners.length === 1 ? "" : "s"}
        </div>
        {canManage && (
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Add Owner
          </Button>
        )}
      </div>

      {owners.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="No consignment owners yet"
          description="Add an owner to start tracking supplier-owned stock."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {owners.map((o) => {
            const b = computeOwnerBalance(o.id, items, sales, settlements);
            return (
              <div
                key={o.id}
                className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-bold">{o.name}</div>
                    {o.phone && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" /> {o.phone}
                      </div>
                    )}
                    {o.address && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {o.address}
                      </div>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(o)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => void onDelete(o)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <Metric label="Sales" value={formatCurrency(b.totalSalesAmount)} />
                  <Metric label="Payable" value={formatCurrency(b.totalPayable)} />
                  <Metric label="Paid" value={formatCurrency(b.totalPaid)} />
                  <Metric
                    label="Unpaid"
                    value={formatCurrency(b.remainingPayable)}
                    danger={b.remainingPayable > 0}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                  <span>
                    {b.qtyReceived.toFixed(0)} received · {b.qtySold.toFixed(0)} sold
                  </span>
                  <span className="font-semibold text-foreground">
                    Balance {b.qtyBalance.toFixed(0)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit owner" : "New consignment owner"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Owner / Supplier name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Ahmed Fisherman"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div>
                <Label>Payment method</Label>
                <Input
                  value={form.paymentMethod}
                  onChange={(e) =>
                    setForm({ ...form, paymentMethod: e.target.value })
                  }
                  placeholder="Cash / Bank transfer"
                />
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()}>
              {editing ? "Save changes" : "Add owner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Metric({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg bg-muted/50 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-sm font-semibold ${danger ? "text-rose-600" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

/* ------------------------------ Stock ------------------------------ */

interface ItemForm {
  ownerId: string;
  name: string;
  unitType: ConsignmentUnit;
  qtyReceived: number;
  sellingPrice: number;
  ownerPayout: number;
  commissionPct: number;
  receivedDate: string;
  notes: string;
}

const blankItem = (): ItemForm => ({
  ownerId: "",
  name: "",
  unitType: "piece",
  qtyReceived: 0,
  sellingPrice: 0,
  ownerPayout: 0,
  commissionPct: 0,
  receivedDate: new Date().toISOString().slice(0, 10),
  notes: "",
});

function StockTab({ canManage, canSell }: { canManage: boolean; canSell: boolean }) {
  const owners = useConsignment((s) => s.owners);
  const items = useConsignment((s) => s.items);
  const addItem = useConsignment((s) => s.addItem);
  const updateItem = useConsignment((s) => s.updateItem);
  const deleteItem = useConsignment((s) => s.deleteItem);
  const recordSale = useConsignment((s) => s.recordSale);

  const [filterOwner, setFilterOwner] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ConsignmentItem | null>(null);
  const [form, setForm] = useState<ItemForm>(blankItem());

  const [sellOpen, setSellOpen] = useState(false);
  const [sellItem, setSellItem] = useState<ConsignmentItem | null>(null);
  const [sellQty, setSellQty] = useState<number>(1);
  const [sellPrice, setSellPrice] = useState<number>(0);
  const [sellNotes, setSellNotes] = useState<string>("");

  const visibleItems = items
    .filter((i) => filterOwner === "all" || i.ownerId === filterOwner)
    .filter((i) => i.active);

  const openNew = (): void => {
    setEditing(null);
    setForm(blankItem());
    setOpen(true);
  };
  const openEdit = (i: ConsignmentItem): void => {
    setEditing(i);
    setForm({
      ownerId: i.ownerId,
      name: i.name,
      unitType: i.unitType,
      qtyReceived: i.qtyReceived,
      sellingPrice: i.sellingPrice,
      ownerPayout: i.ownerPayout,
      commissionPct: i.commissionPct,
      receivedDate: i.receivedDate,
      notes: i.notes,
    });
    setOpen(true);
  };

  const submit = async (): Promise<void> => {
    if (!form.ownerId) {
      toast.error("Choose an owner");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Item name is required");
      return;
    }
    if (form.qtyReceived <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    if (editing) {
      await updateItem(editing.id, form);
      toast.success("Item updated");
    } else {
      const c = await addItem(form);
      if (c) toast.success("Item received");
      else toast.error("Failed to add item");
    }
    setOpen(false);
  };

  const onDelete = async (i: ConsignmentItem): Promise<void> => {
    if (!confirm(`Delete "${i.name}"? Sales/returns history will be removed too.`)) return;
    await deleteItem(i.id);
    toast.success("Item deleted");
  };

  const openSell = (i: ConsignmentItem): void => {
    setSellItem(i);
    setSellQty(1);
    setSellPrice(i.sellingPrice);
    setSellNotes("");
    setSellOpen(true);
  };

  const submitSell = async (): Promise<void> => {
    if (!sellItem) return;
    if (sellQty <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    const balance = itemBalance(sellItem);
    if (sellQty > balance) {
      toast.error(`Only ${balance} ${sellItem.unitType} available`);
      return;
    }
    const sale = await recordSale({
      itemId: sellItem.id,
      qty: sellQty,
      unitPrice: sellPrice,
      notes: sellNotes,
    });
    if (sale) {
      toast.success(
        `Sold ${sellQty} × ${sellItem.name}`,
        { description: "Consignment stock updated and payable amount calculated." }
      );
      setSellOpen(false);
    } else {
      toast.error("Sale failed");
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Select value={filterOwner} onValueChange={setFilterOwner}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All owners</SelectItem>
              {owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {visibleItems.length} item{visibleItems.length === 1 ? "" : "s"}
          </span>
        </div>
        {canManage && (
          <Button onClick={openNew} className="gap-2" disabled={owners.length === 0}>
            <Plus className="h-4 w-4" /> Receive Stock
          </Button>
        )}
      </div>

      {owners.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="Add an owner first"
          description="Go to the Owners tab and add at least one consignment owner before recording stock."
        />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="No consignment stock"
          description="Click Receive Stock to record items dropped off by an owner."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Item</th>
                <th className="px-3 py-2.5">Owner</th>
                <th className="px-3 py-2.5 text-right">Received</th>
                <th className="px-3 py-2.5 text-right">Sold</th>
                <th className="px-3 py-2.5 text-right">Returned</th>
                <th className="px-3 py-2.5 text-right">Balance</th>
                <th className="px-3 py-2.5 text-right">Sell @</th>
                <th className="px-3 py-2.5 text-right">Owner @</th>
                <th className="px-3 py-2.5">Received</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleItems.map((i) => {
                const balance = itemBalance(i);
                const owner = owners.find((o) => o.id === i.ownerId);
                return (
                  <tr key={i.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2.5 font-medium">{i.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {owner?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {i.qtyReceived} {i.unitType}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {i.qtySold}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {i.qtyReturned}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                      <Badge
                        variant="outline"
                        className={
                          balance <= 0
                            ? "border-rose-300 bg-rose-50 text-rose-700"
                            : "border-emerald-300 bg-emerald-50 text-emerald-700"
                        }
                      >
                        {balance}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatCurrency(i.sellingPrice)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatCurrency(i.ownerPayout)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatDate(i.receivedDate)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        {canSell && balance > 0 && (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 gap-1"
                            onClick={() => openSell(i)}
                          >
                            <ShoppingCart className="h-3 w-3" /> Sell
                          </Button>
                        )}
                        {canManage && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => openEdit(i)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              onClick={() => void onDelete(i)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* item dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit consignment item" : "Receive consignment stock"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Owner *</Label>
              <Select
                value={form.ownerId}
                onValueChange={(v) => setForm({ ...form, ownerId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  {owners.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Item name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Tuna 1kg"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Unit type</Label>
                <Select
                  value={form.unitType}
                  onValueChange={(v) =>
                    setForm({ ...form, unitType: v as ConsignmentUnit })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantity received *</Label>
                <NumInput
                  value={form.qtyReceived}
                  onChange={(n) => setForm({ ...form, qtyReceived: n })}
                  min={0}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Selling price (per unit)</Label>
                <NumInput
                  value={form.sellingPrice}
                  onChange={(n) => setForm({ ...form, sellingPrice: n })}
                  min={0}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <Label>Owner payout (per unit)</Label>
                <NumInput
                  value={form.ownerPayout}
                  onChange={(n) => setForm({ ...form, ownerPayout: n })}
                  min={0}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Shop commission %</Label>
                <NumInput
                  value={form.commissionPct}
                  onChange={(n) => setForm({ ...form, commissionPct: n })}
                  min={0}
                  max={100}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Leave 0 to derive commission from (selling − owner payout).
                </div>
              </div>
              <div>
                <Label>Date received</Label>
                <Input
                  type="date"
                  value={form.receivedDate}
                  onChange={(e) =>
                    setForm({ ...form, receivedDate: e.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()}>
              {editing ? "Save changes" : "Receive stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* sell dialog */}
      <Dialog open={sellOpen} onOpenChange={setSellOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sell consignment item</DialogTitle>
          </DialogHeader>
          {sellItem && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <div className="font-semibold">{sellItem.name}</div>
                <div className="text-xs text-muted-foreground">
                  Balance: {itemBalance(sellItem)} {sellItem.unitType} · Owner @{" "}
                  {formatCurrency(sellItem.ownerPayout)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Quantity</Label>
                  <NumInput
                    value={sellQty}
                    onChange={setSellQty}
                    min={0}
                    max={itemBalance(sellItem)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <Label>Price per unit</Label>
                  <NumInput
                    value={sellPrice}
                    onChange={setSellPrice}
                    min={0}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Input
                  value={sellNotes}
                  onChange={(e) => setSellNotes(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="rounded-lg border border-border bg-background p-3 text-sm">
                <Row label="Total sale" value={formatCurrency(sellQty * sellPrice)} />
                <Row
                  label="Owner payable"
                  value={formatCurrency(sellQty * sellItem.ownerPayout)}
                />
                <Row
                  label="Shop commission"
                  value={formatCurrency(
                    sellItem.commissionPct > 0
                      ? sellQty * sellPrice * (sellItem.commissionPct / 100)
                      : Math.max(
                          0,
                          sellQty * sellPrice - sellQty * sellItem.ownerPayout
                        )
                  )}
                  bold
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSellOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitSell()}>Confirm sale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-1 ${bold ? "font-bold text-foreground" : "text-muted-foreground"}`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/* ------------------------------ Sales list ------------------------------ */

function SalesTab() {
  const sales = useConsignment((s) => s.sales);
  const items = useConsignment((s) => s.items);
  const owners = useConsignment((s) => s.owners);
  const user = useCurrentUser();
  const showCommission = user?.role === "admin";

  if (sales.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No consignment sales yet"
        description="Sales recorded from the Stock tab will appear here."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5">Date</th>
            <th className="px-3 py-2.5">Item</th>
            <th className="px-3 py-2.5">Owner</th>
            <th className="px-3 py-2.5 text-right">Qty</th>
            <th className="px-3 py-2.5 text-right">Price</th>
            <th className="px-3 py-2.5 text-right">Total</th>
            <th className="px-3 py-2.5 text-right">Owner payable</th>
            {showCommission && (
              <th className="px-3 py-2.5 text-right">Commission</th>
            )}
            <th className="px-3 py-2.5">By</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sales.map((s) => {
            const it = items.find((x) => x.id === s.itemId);
            const ow = owners.find((o) => o.id === s.ownerId);
            return (
              <tr key={s.id} className="hover:bg-muted/40">
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {formatDateTime(s.createdAt)}
                </td>
                <td className="px-3 py-2.5 font-medium">{it?.name ?? "(deleted)"}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{ow?.name ?? "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.qty}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatCurrency(s.unitPrice)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                  {formatCurrency(s.totalAmount)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatCurrency(s.payableAmount)}
                </td>
                {showCommission && (
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                    {formatCurrency(s.commission)}
                  </td>
                )}
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {s.userName ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------ Settlements ------------------------------ */

function SettlementsTab({ canSettle }: { canSettle: boolean }) {
  const owners = useConsignment((s) => s.owners);
  const items = useConsignment((s) => s.items);
  const sales = useConsignment((s) => s.sales);
  const settlements = useConsignment((s) => s.settlements);
  const recordSettlement = useConsignment((s) => s.recordSettlement);

  const [open, setOpen] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [notes, setNotes] = useState("");

  const openNew = (ownerIdInit?: string, suggestedAmount?: number): void => {
    setOwnerId(ownerIdInit ?? "");
    setAmount(suggestedAmount ?? 0);
    setPaymentMethod("cash");
    setPeriodFrom("");
    setPeriodTo("");
    setNotes("");
    setOpen(true);
  };

  const submit = async (): Promise<void> => {
    if (!ownerId) {
      toast.error("Choose an owner");
      return;
    }
    if (amount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    const r = await recordSettlement({
      ownerId,
      amount,
      paymentMethod,
      periodFrom: periodFrom || undefined,
      periodTo: periodTo || undefined,
      notes,
    });
    if (r) {
      toast.success("Owner payment recorded and balance updated.");
      setOpen(false);
    } else {
      toast.error("Failed");
    }
  };

  const ownerBalances = owners.map((o) => ({
    owner: o,
    bal: computeOwnerBalance(o.id, items, sales, settlements),
  }));

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Pay owners for sold consignment items.
        </div>
        {canSettle && (
          <Button onClick={() => openNew()} className="gap-2">
            <HandCoins className="h-4 w-4" /> Record payment
          </Button>
        )}
      </div>

      {/* Owner balances */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ownerBalances.map(({ owner, bal }) => (
          <div
            key={owner.id}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-bold">{owner.name}</div>
                {owner.phone && (
                  <div className="text-xs text-muted-foreground">{owner.phone}</div>
                )}
              </div>
              <Badge
                variant="outline"
                className={
                  bal.remainingPayable > 0
                    ? "border-amber-300 bg-amber-50 text-amber-700"
                    : "border-emerald-300 bg-emerald-50 text-emerald-700"
                }
              >
                {bal.remainingPayable > 0 ? "Owed" : "Settled"}
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Metric label="Total payable" value={formatCurrency(bal.totalPayable)} />
              <Metric label="Paid" value={formatCurrency(bal.totalPaid)} />
              <Metric
                label="Unpaid"
                value={formatCurrency(bal.remainingPayable)}
                danger={bal.remainingPayable > 0}
              />
              <Metric label="Sold qty" value={bal.qtySold.toFixed(0)} />
            </div>
            {canSettle && bal.remainingPayable > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full gap-1"
                onClick={() => openNew(owner.id, bal.remainingPayable)}
              >
                <HandCoins className="h-3.5 w-3.5" /> Pay {formatCurrency(bal.remainingPayable)}
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Recent settlements */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Owner</th>
              <th className="px-3 py-2.5 text-right">Amount</th>
              <th className="px-3 py-2.5">Method</th>
              <th className="px-3 py-2.5">Period</th>
              <th className="px-3 py-2.5">By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {settlements.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No settlements recorded yet.
                </td>
              </tr>
            )}
            {settlements.map((s) => {
              const owner = owners.find((o) => o.id === s.ownerId);
              return (
                <tr key={s.id}>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {formatDateTime(s.paidAt)}
                  </td>
                  <td className="px-3 py-2.5 font-medium">{owner?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                    {formatCurrency(s.amount)}
                  </td>
                  <td className="px-3 py-2.5 text-xs">{s.paymentMethod ?? "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {s.periodFrom || s.periodTo
                      ? `${s.periodFrom ?? "…"} → ${s.periodTo ?? "…"}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {s.userName ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record settlement</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Owner *</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  {owners.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Amount paid *</Label>
                <NumInput
                  value={amount}
                  onChange={setAmount}
                  min={0}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <Label>Method</Label>
                <Input
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Period from</Label>
                <Input
                  type="date"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                />
              </div>
              <div>
                <Label>Period to</Label>
                <Input
                  type="date"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()}>Save payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------ Returns ------------------------------ */

function ReturnsTab({ canManage }: { canManage: boolean }) {
  const items = useConsignment((s) => s.items);
  const owners = useConsignment((s) => s.owners);
  const returns = useConsignment((s) => s.returns);
  const recordReturn = useConsignment((s) => s.recordReturn);

  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");

  const submit = async (): Promise<void> => {
    if (!itemId) {
      toast.error("Pick an item");
      return;
    }
    const item = items.find((x) => x.id === itemId);
    if (!item) return;
    if (qty <= 0 || qty > itemBalance(item)) {
      toast.error("Invalid return quantity");
      return;
    }
    const r = await recordReturn({ itemId, qty, notes });
    if (r) {
      toast.success("Return recorded");
      setOpen(false);
    } else {
      toast.error("Failed");
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Return unsold consignment stock to its owner.
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setItemId("");
              setQty(1);
              setNotes("");
              setOpen(true);
            }}
            className="gap-2"
            disabled={items.length === 0}
          >
            <Undo2 className="h-4 w-4" /> Record return
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Item</th>
              <th className="px-3 py-2.5">Owner</th>
              <th className="px-3 py-2.5 text-right">Qty</th>
              <th className="px-3 py-2.5">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {returns.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No returns yet.
                </td>
              </tr>
            )}
            {returns.map((r) => {
              const it = items.find((x) => x.id === r.itemId);
              const ow = owners.find((o) => o.id === r.ownerId);
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {formatDateTime(r.createdAt)}
                  </td>
                  <td className="px-3 py-2.5 font-medium">{it?.name ?? "(deleted)"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{ow?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.qty}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {r.notes ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Return unsold stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Item *</Label>
              <Select value={itemId} onValueChange={setItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select item" />
                </SelectTrigger>
                <SelectContent>
                  {items
                    .filter((i) => itemBalance(i) > 0)
                    .map((i) => {
                      const ow = owners.find((o) => o.id === i.ownerId);
                      return (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name} — {ow?.name ?? ""} (bal {itemBalance(i)})
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity</Label>
              <NumInput
                value={qty}
                onChange={setQty}
                min={0}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()}>Save return</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------ misc ------------------------------ */

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <div className="text-base font-semibold">{title}</div>
      <div className="mt-1 max-w-md text-sm text-muted-foreground">{description}</div>
    </div>
  );
}
