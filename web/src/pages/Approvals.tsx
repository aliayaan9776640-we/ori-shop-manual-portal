import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { useStore, useCurrentUser } from "@/lib/store";
import { usePurchaseOrders, PO_STATUS_LABEL } from "@/lib/purchaseOrders";
import type { CreditCustomer, Product } from "@/lib/types";
import type { PurchaseOrder } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import NumInput from "@/components/NumInput";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import {
  Check,
  X as XIcon,
  Clock,
  ShieldCheck,
  Users as UsersIcon,
  ClipboardCheck as POIcon,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Package as PackageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { isSupabaseConfigured } from "@/lib/supabase";

type ModuleKey = "credit" | "purchase_order" | "product";

interface UnifiedRequest {
  id: string;
  module: ModuleKey;
  title: string;
  subtitle: string;
  amount?: number;
  requestedBy?: string;
  requestedAt: string;
  raw: CreditCustomer | PurchaseOrder | Product;
}

export default function Approvals() {
  const me = useCurrentUser();
  const customers = useStore((s) => s.customers);
  const users = useStore((s) => s.users);
  const products = useStore((s) => s.products);
  const approveCustomer = useStore((s) => s.approveCustomer);
  const rejectCustomer = useStore((s) => s.rejectCustomer);
  const updateCustomer = useStore((s) => s.updateCustomer);
  const approveProduct = useStore((s) => s.approveProduct);
  const rejectProduct = useStore((s) => s.rejectProduct);

  const pos = usePurchaseOrders((s) => s.pos);
  const loadPO = usePurchaseOrders((s) => s.load);
  const loadedPO = usePurchaseOrders((s) => s.loaded);
  const approvePO = usePurchaseOrders((s) => s.approvePO);
  const rejectPO = usePurchaseOrders((s) => s.rejectPO);

  useEffect(() => {
    if (!loadedPO) void loadPO();
  }, [loadedPO, loadPO]);

  const isAdmin = me?.role === "admin";

  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [creditTarget, setCreditTarget] = useState<CreditCustomer | null>(null);
  const [creditDecision, setCreditDecision] = useState<"approve" | "reject" | null>(
    null
  );
  const [creditLimit, setCreditLimit] = useState<number>(0);
  const [creditNote, setCreditNote] = useState<string>("");

  const [poTarget, setPoTarget] = useState<PurchaseOrder | null>(null);
  const [poDecision, setPoDecision] = useState<"approve" | "reject" | null>(null);
  const [poNote, setPoNote] = useState<string>("");

  const [productTarget, setProductTarget] = useState<Product | null>(null);
  const [productDecision, setProductDecision] = useState<
    "approve" | "reject" | null
  >(null);

  const userName = (uid?: string): string =>
    users.find((u) => u.id === uid)?.fullName ?? "—";

  const credit = useMemo(() => {
    const pending: UnifiedRequest[] = [];
    const approved: UnifiedRequest[] = [];
    const rejected: UnifiedRequest[] = [];
    customers.forEach((c) => {
      const u: UnifiedRequest = {
        id: c.id,
        module: "credit",
        title: c.name,
        subtitle: c.phone || c.address || "Credit customer",
        amount: c.requestedCreditLimit ?? c.creditLimit,
        requestedBy: undefined,
        requestedAt: c.approvedAt ?? new Date().toISOString(),
        raw: c,
      };
      if (c.approvalStatus === "pending") pending.push(u);
      else if (c.approvalStatus === "approved") approved.push(u);
      else if (c.approvalStatus === "rejected") rejected.push(u);
    });
    return { pending, approved, rejected };
  }, [customers]);

  const purchase = useMemo(() => {
    const pending: UnifiedRequest[] = [];
    const approved: UnifiedRequest[] = [];
    const rejected: UnifiedRequest[] = [];
    pos.forEach((p) => {
      const u: UnifiedRequest = {
        id: p.id,
        module: "purchase_order",
        title: p.poNo
          ? `PO ${p.poNo}`
          : `PO ${p.id.slice(-6).toUpperCase()}`,
        subtitle: `${p.items.length} item${p.items.length === 1 ? "" : "s"} · ${PO_STATUS_LABEL[p.status]}`,
        amount: p.totalAmount || p.estimatedTotal,
        requestedBy: userName(p.raisedBy),
        requestedAt: p.raisedAt,
        raw: p,
      };
      if (p.status === "waiting_approval") pending.push(u);
      else if (p.status === "approved" || p.status === "completed")
        approved.push(u);
      else if (p.status === "rejected") rejected.push(u);
    });
    return { pending, approved, rejected };
  }, [pos, users]);

  const productReq = useMemo(() => {
    const pending: UnifiedRequest[] = [];
    const approved: UnifiedRequest[] = [];
    const rejected: UnifiedRequest[] = [];
    products.forEach((p) => {
      const status = p.publishStatus ?? "approved";
      if (status === "draft") return;
      const u: UnifiedRequest = {
        id: p.id,
        module: "product",
        title: p.name,
        subtitle: `${p.category || "Uncategorized"} \u00b7 ${p.unit}\u00b7 ${p.stockPieces} pcs`,
        amount: p.sellingPrice,
        requestedBy: undefined,
        requestedAt: p.approvedAt ?? new Date().toISOString(),
        raw: p,
      };
      if (status === "pending") pending.push(u);
      else if (status === "approved") approved.push(u);
      else if (status === "rejected") rejected.push(u);
    });
    return { pending, approved, rejected };
  }, [products]);

  const allPending = useMemo(
    () =>
      [...credit.pending, ...purchase.pending, ...productReq.pending].sort(
        (a, b) =>
          new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
      ),
    [credit.pending, purchase.pending, productReq.pending]
  );
  const allApproved = useMemo(
    () =>
      [...credit.approved, ...purchase.approved, ...productReq.approved].sort(
        (a, b) =>
          new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
      ),
    [credit.approved, purchase.approved, productReq.approved]
  );
  const allRejected = useMemo(
    () =>
      [...credit.rejected, ...purchase.rejected, ...productReq.rejected].sort(
        (a, b) =>
          new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
      ),
    [credit.rejected, purchase.rejected, productReq.rejected]
  );

  const list =
    tab === "pending"
      ? allPending
      : tab === "approved"
      ? allApproved
      : allRejected;

  const openCredit = (c: CreditCustomer, dec: "approve" | "reject"): void => {
    setCreditTarget(c);
    setCreditDecision(dec);
    setCreditLimit(c.requestedCreditLimit ?? c.creditLimit ?? 0);
    setCreditNote("");
  };
  const closeCredit = (): void => {
    setCreditTarget(null);
    setCreditDecision(null);
  };
  const submitCredit = (): void => {
    if (!creditTarget || !creditDecision) return;
    if (creditDecision === "approve") {
      if (creditLimit <= 0) return toast.error("Set a credit limit first");
      if (creditNote.trim()) updateCustomer(creditTarget.id, { notes: creditNote });
      approveCustomer(creditTarget.id, creditLimit);
      toast.success(`Approved ${creditTarget.name}`);
    } else {
      if (creditNote.trim()) updateCustomer(creditTarget.id, { notes: creditNote });
      rejectCustomer(creditTarget.id);
      toast.success(`Rejected ${creditTarget.name}`);
    }
    closeCredit();
  };

  const openPO = (p: PurchaseOrder, dec: "approve" | "reject"): void => {
    setPoTarget(p);
    setPoDecision(dec);
    setPoNote("");
  };
  const closePO = (): void => {
    setPoTarget(null);
    setPoDecision(null);
  };
  const openProduct = (p: Product, dec: "approve" | "reject"): void => {
    setProductTarget(p);
    setProductDecision(dec);
  };
  const closeProduct = (): void => {
    setProductTarget(null);
    setProductDecision(null);
  };
  const submitProduct = (): void => {
    if (!productTarget || !productDecision) return;
    if (productDecision === "approve") {
      approveProduct(productTarget.id);
      toast.success(`Approved ${productTarget.name} for online shop`);
    } else {
      rejectProduct(productTarget.id);
      toast.success(`Rejected ${productTarget.name}`);
    }
    closeProduct();
  };

  const submitPO = async (): Promise<void> => {
    if (!poTarget || !poDecision) return;
    try {
      if (poDecision === "approve") {
        await approvePO(poTarget.id);
        toast.success(`Approved ${poTarget.poNo ?? "PO"}`);
      } else {
        if (!poNote.trim()) return toast.error("Reason is required");
        await rejectPO(poTarget.id, poNote.trim());
        toast.success(`Rejected ${poTarget.poNo ?? "PO"}`);
      }
      closePO();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Approvals" description="Admin only" />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-800">
          Only admins can review approval requests.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Approvals Center"
        description="Centralized queue for credit, purchase orders, and other module requests."
      />

      {!isSupabaseConfigured && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">
              Production not connected to Supabase
            </div>
            <div className="text-xs">
              Set <code>VITE_SUPABASE_URL</code> and{" "}
              <code>VITE_SUPABASE_ANON_KEY</code> in your hosting environment
              (Vercel → Project → Settings → Environment Variables) and
              redeploy. Until then, data is held in memory and won&apos;t sync.
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Pending"
          value={allPending.length}
          icon={Clock}
          accent="amber"
        />
        <Stat
          label="Credit Requests"
          value={credit.pending.length}
          icon={UsersIcon}
          accent="primary"
        />
        <Stat
          label="Purchase Orders"
          value={purchase.pending.length}
          icon={POIcon}
          accent="primary"
        />
        <Stat
          label="Approved (total)"
          value={allApproved.length}
          icon={ShieldCheck}
          accent="emerald"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            { id: "pending", label: "Pending", count: allPending.length },
            { id: "approved", label: "Approved", count: allApproved.length },
            { id: "rejected", label: "Rejected", count: allRejected.length },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
              tab === t.id
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground hover:bg-secondary"
            }`}
          >
            {t.label}
            <span className="ml-2 rounded-full bg-black/10 px-1.5 py-0.5 text-[10px]">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {list.length === 0 ? (
          <div className="px-6 py-16 text-center text-muted-foreground">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 opacity-50" />
            {tab === "pending"
              ? "No pending requests — you're all caught up."
              : `No ${tab} requests.`}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {list.map((req) => (
              <div
                key={`${req.module}-${req.id}`}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <ModuleBadge module={req.module} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-foreground">
                      {req.title}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {req.subtitle}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      {req.requestedBy && (
                        <span>by {req.requestedBy}</span>
                      )}
                      <span>{formatDateTime(req.requestedAt)}</span>
                      {req.amount !== undefined && req.amount > 0 && (
                        <span className="font-semibold text-foreground">
                          {formatCurrency(req.amount)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {req.module === "credit" && (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="gap-1"
                    >
                      <Link to={`/customers/${req.id}`}>
                        <Eye className="h-3.5 w-3.5" /> View
                      </Link>
                    </Button>
                  )}
                  {req.module === "purchase_order" && (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="gap-1"
                    >
                      <Link to="/purchase-orders">
                        <Eye className="h-3.5 w-3.5" /> Open
                      </Link>
                    </Button>
                  )}
                  {req.module === "product" && (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="gap-1"
                    >
                      <Link to="/inventory">
                        <Eye className="h-3.5 w-3.5" /> Open
                      </Link>
                    </Button>
                  )}
                  {tab === "pending" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (req.module === "credit")
                            openCredit(req.raw as CreditCustomer, "approve");
                          else if (req.module === "purchase_order")
                            openPO(req.raw as PurchaseOrder, "approve");
                          else openProduct(req.raw as Product, "approve");
                        }}
                        className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Check className="h-3.5 w-3.5" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (req.module === "credit")
                            openCredit(req.raw as CreditCustomer, "reject");
                          else if (req.module === "purchase_order")
                            openPO(req.raw as PurchaseOrder, "reject");
                          else openProduct(req.raw as Product, "reject");
                        }}
                        className="gap-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <XIcon className="h-3.5 w-3.5" /> Reject
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Credit dialog */}
      <Dialog open={!!creditTarget} onOpenChange={(o) => !o && closeCredit()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {creditDecision === "approve" ? "Approve" : "Reject"} —{" "}
              {creditTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl bg-secondary/40 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Requested limit</span>
                <span className="font-semibold">
                  {formatCurrency(creditTarget?.requestedCreditLimit ?? 0)}
                </span>
              </div>
              {creditTarget?.phone && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Phone: {creditTarget.phone}
                </div>
              )}
            </div>
            {creditDecision === "approve" && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Final approved credit limit
                </label>
                <NumInput
                  value={creditLimit}
                  onChange={(n) => setCreditLimit(n)}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Note (optional)
              </label>
              <textarea
                value={creditNote}
                onChange={(e) => setCreditNote(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-input bg-background p-3 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCredit}>
              Cancel
            </Button>
            <Button
              onClick={submitCredit}
              className={
                creditDecision === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 hover:bg-rose-700"
              }
            >
              {creditDecision === "approve"
                ? "Confirm Approve"
                : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product approval dialog */}
      <Dialog open={!!productTarget} onOpenChange={(o) => !o && closeProduct()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {productDecision === "approve" ? "Publish to Online Shop" : "Reject Product"}
              {productTarget ? ` \u2014 ${productTarget.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-secondary/40 p-3">
              {productTarget?.photo ? (
                <img
                  src={productTarget.photo}
                  alt={productTarget.name}
                  className="h-16 w-16 rounded-lg border border-border object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  No img
                </div>
              )}
              <div className="min-w-0 text-sm">
                <div className="font-semibold">{productTarget?.name}</div>
                <div className="text-xs text-muted-foreground">
                  {productTarget?.category || "Uncategorized"}{" \u00b7 "}
                  {productTarget?.unit}
                </div>
                <div className="text-xs text-muted-foreground">
                  Selling: {formatCurrency(productTarget?.sellingPrice ?? 0)}{" \u00b7 "}
                  Stock: {productTarget?.stockPieces ?? 0} pcs
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {productDecision === "approve"
                ? "This product will become visible on the public /store page."
                : "This product will not appear on /store. You can re-approve it later from this page."}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeProduct}>
              Cancel
            </Button>
            <Button
              onClick={submitProduct}
              className={
                productDecision === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 hover:bg-rose-700"
              }
            >
              {productDecision === "approve" ? "Confirm Publish" : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PO dialog */}
      <Dialog open={!!poTarget} onOpenChange={(o) => !o && closePO()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {poDecision === "approve" ? "Approve" : "Reject"} Purchase Order
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl bg-secondary/40 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">PO #</span>
                <span className="font-semibold">
                  {poTarget?.poNo ?? poTarget?.id.slice(-6).toUpperCase()}
                </span>
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>Items</span>
                <span>{poTarget?.items.length ?? 0}</span>
              </div>
              {(poTarget?.totalAmount ?? 0) > 0 && (
                <div className="mt-1 flex justify-between text-xs">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold">
                    {formatCurrency(poTarget?.totalAmount ?? 0)}
                  </span>
                </div>
              )}
              {poTarget?.raisedBy && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Raised by: {userName(poTarget.raisedBy)} ·{" "}
                  {formatDate(poTarget.raisedAt)}
                </div>
              )}
            </div>
            {poDecision === "reject" && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Reason (required)
                </label>
                <textarea
                  value={poNote}
                  onChange={(e) => setPoNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-input bg-background p-3 text-sm"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closePO}>
              Cancel
            </Button>
            <Button
              onClick={() => void submitPO()}
              className={
                poDecision === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 hover:bg-rose-700"
              }
            >
              {poDecision === "approve" ? "Confirm Approve" : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ModuleBadge({ module }: { module: ModuleKey }) {
  if (module === "credit") {
    return (
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
        <UsersIcon className="h-4 w-4" />
      </span>
    );
  }
  if (module === "product") {
    return (
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
        <PackageIcon className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
      <POIcon className="h-4 w-4" />
    </span>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  accent?: "amber" | "emerald" | "rose" | "primary";
}) {
  const tone =
    accent === "amber"
      ? "border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100 text-amber-900"
      : accent === "emerald"
      ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-900"
      : accent === "rose"
      ? "border-rose-200 bg-gradient-to-br from-rose-50 to-rose-100 text-rose-900"
      : accent === "primary"
      ? "border-border bg-card"
      : "border-border bg-card";
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-4 shadow-sm ${tone}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/60">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest opacity-75">
          {label}
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </div>
  );
}

