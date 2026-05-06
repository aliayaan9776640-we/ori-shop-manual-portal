import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useStore, useCurrentUser } from "@/lib/store";
import type { CreditCustomer } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Check,
  X as XIcon,
  ShieldCheck,
  Clock,
  Phone,
  MapPin,
  Eye,
  Ban,
  ClipboardList,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import NumInput from "@/components/NumInput";

export default function CreditApprovals() {
  const customers = useStore((s) => s.customers);
  const user = useCurrentUser();
  const isAdmin = user?.role === "admin";
  const approveCustomer = useStore((s) => s.approveCustomer);
  const rejectCustomer = useStore((s) => s.rejectCustomer);
  const updateCustomer = useStore((s) => s.updateCustomer);

  const pending = useMemo(
    () => customers.filter((c) => c.approvalStatus === "pending"),
    [customers]
  );
  const rejected = useMemo(
    () => customers.filter((c) => c.approvalStatus === "rejected"),
    [customers]
  );
  const approved = useMemo(
    () => customers.filter((c) => c.approvalStatus === "approved"),
    [customers]
  );

  const [target, setTarget] = useState<CreditCustomer | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [limit, setLimit] = useState<number>(0);
  const [note, setNote] = useState<string>("");

  const openApprove = (c: CreditCustomer): void => {
    setTarget(c);
    setDecision("approve");
    setLimit(c.requestedCreditLimit ?? 0);
    setNote(c.notes ?? "");
  };
  const openReject = (c: CreditCustomer): void => {
    setTarget(c);
    setDecision("reject");
    setNote("");
  };
  const close = (): void => {
    setTarget(null);
    setDecision(null);
    setNote("");
    setLimit(0);
  };

  const submit = (): void => {
    if (!target || !decision) return;
    if (decision === "approve") {
      if (limit <= 0) return toast.error("Set a credit limit first");
      if (note.trim() && note !== (target.notes ?? "")) {
        updateCustomer(target.id, { notes: note });
      }
      approveCustomer(target.id, limit);
      toast.success(`Approved ${target.name}`);
    } else {
      if (note.trim() && note !== (target.notes ?? "")) {
        updateCustomer(target.id, { notes: note });
      }
      rejectCustomer(target.id);
      toast.success(`Rejected ${target.name}`);
    }
    close();
  };

  if (!isAdmin) {
    return (
      <>
        <PageHeader
          title="Credit Customer Approvals"
          description="Admin only"
        />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-800">
          You do not have permission to view this page.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Credit Customer Approvals"
        description="Review pending credit requests submitted by cashiers."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Pending" value={pending.length} accent="amber" />
        <Stat label="Approved" value={approved.length} accent="emerald" />
        <Stat label="Rejected" value={rejected.length} accent="rose" />
        <Stat
          label="Outstanding"
          value={formatCurrency(
            approved.reduce((s, c) => s + c.balance, 0)
          )}
        />
      </div>

      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-600" />
          <h2 className="text-lg font-semibold">Pending Requests</h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {pending.length}
          </span>
        </div>
        {pending.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
            No pending credit customers — you're all caught up.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pending.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-foreground">
                      {c.name}
                    </div>
                    {c.phone && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" /> {c.phone}
                      </div>
                    )}
                    {c.address && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{c.address}</span>
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                    Pending
                  </span>
                </div>
                <div className="mt-3 rounded-lg bg-white/70 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Requested limit
                    </span>
                    <span className="font-semibold">
                      {formatCurrency(c.requestedCreditLimit ?? 0)}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      Opening balance
                    </span>
                    <span className="font-medium">
                      {formatCurrency(c.openingBalance ?? 0)}
                    </span>
                  </div>
                  {c.notes && (
                    <div className="mt-2 rounded-md bg-amber-100/60 px-2 py-1.5 text-xs text-amber-900">
                      {c.notes}
                    </div>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Button
                    asChild
                    variant="outline"
                    className="gap-1 text-xs"
                  >
                    <Link to={`/customers/${c.id}`}>
                      <Eye className="h-3.5 w-3.5" /> View
                    </Link>
                  </Button>
                  <Button
                    onClick={() => openApprove(c)}
                    className="gap-1 bg-emerald-600 text-xs hover:bg-emerald-700"
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => openReject(c)}
                    className="gap-1 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <XIcon className="h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {rejected.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Ban className="h-4 w-4 text-rose-600" />
            <h2 className="text-lg font-semibold">Rejected / Disabled</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rejected.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.phone || "—"}
                    {c.approvedAt ? ` · ${formatDate(c.approvedAt)}` : ""}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openApprove(c)}
                >
                  Re-approve
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <h2 className="text-lg font-semibold">Recently Approved</h2>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="hidden md:grid grid-cols-12 gap-2 border-b border-border bg-secondary/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div className="col-span-3">Customer</div>
            <div className="col-span-2">Phone</div>
            <div className="col-span-2 text-right">Limit</div>
            <div className="col-span-2 text-right">Balance</div>
            <div className="col-span-3">Approved by</div>
          </div>
          {approved.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No approved customers yet.
            </div>
          ) : (
            approved
              .slice()
              .sort(
                (a, b) =>
                  new Date(b.approvedAt ?? 0).getTime() -
                  new Date(a.approvedAt ?? 0).getTime()
              )
              .slice(0, 12)
              .map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-2 md:grid-cols-12 gap-2 border-b border-border px-4 py-2.5 text-sm last:border-b-0"
                >
                  <div className="col-span-2 md:col-span-3 font-medium">
                    {c.name}
                  </div>
                  <div className="col-span-1 md:col-span-2 text-xs text-muted-foreground">
                    {c.phone || "—"}
                  </div>
                  <div className="col-span-1 md:col-span-2 text-right">
                    {formatCurrency(c.creditLimit)}
                  </div>
                  <div className="col-span-1 md:col-span-2 text-right">
                    {formatCurrency(c.balance)}
                  </div>
                  <div className="col-span-2 md:col-span-3 text-xs text-muted-foreground">
                    {c.approvedByName ?? "—"}
                    {c.approvedAt ? ` · ${formatDate(c.approvedAt)}` : ""}
                  </div>
                </div>
              ))
          )}
        </div>
      </section>

      <Dialog open={!!target} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === "approve" ? "Approve" : "Reject"} — {target?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl bg-secondary/40 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Requested limit</span>
                <span className="font-semibold">
                  {formatCurrency(target?.requestedCreditLimit ?? 0)}
                </span>
              </div>
              {target?.phone && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Phone: {target.phone}
                </div>
              )}
              {target?.address && (
                <div className="text-xs text-muted-foreground">
                  Address: {target.address}
                </div>
              )}
            </div>

            {decision === "approve" && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Final approved credit limit
                </label>
                <NumInput
                  value={limit}
                  onChange={(n) => setLimit(n)}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Approval note (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={
                  decision === "approve"
                    ? "Reason for approval, terms, etc."
                    : "Reason for rejection (visible to admin)"
                }
                className="w-full rounded-lg border border-input bg-background p-3 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              className={
                decision === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 hover:bg-rose-700"
              }
            >
              {decision === "approve" ? "Confirm Approve" : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "amber" | "emerald" | "rose";
}) {
  const tone =
    accent === "amber"
      ? "border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100 text-amber-900"
      : accent === "emerald"
      ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-900"
      : accent === "rose"
      ? "border-rose-200 bg-gradient-to-br from-rose-50 to-rose-100 text-rose-900"
      : "border-border bg-card";
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tone}`}>
      <div className="text-xs uppercase tracking-widest opacity-75">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-2xl font-bold">
        <ClipboardList className="h-5 w-5 opacity-50" />
        {value}
      </div>
    </div>
  );
}
