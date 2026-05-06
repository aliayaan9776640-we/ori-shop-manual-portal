import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
  Plus,
  Pencil,
  Trash2,
  HandCoins,
  Phone,
  MapPin,
  Check,
  X as XIcon,
  ShieldCheck,
  Clock,
  Ban,
  Eye,
  Send,
  Link as LinkIcon,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "sonner";
import NumInput from "@/components/NumInput";

const buildReminder = (c: CreditCustomer): string => {
  const url = c.publicToken
    ? `${window.location.origin}/bill/${c.publicToken}`
    : "";
  return [
    `Dear ${c.name},`,
    ``,
    `Your credit account at Ori Barakah Store:`,
    `Outstanding balance: MVR ${c.balance.toFixed(2)}`,
    c.lastPaymentAt
      ? `Last payment: ${formatDate(c.lastPaymentAt)}`
      : `No payments recorded yet.`,
    ``,
    `Please settle your bill before month end.`,
    url ? `View full bill: ${url}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

const sendCustomerReminder = (
  c: CreditCustomer,
  channel: "whatsapp" | "viber" | "sms"
): void => {
  const phone = (c.phone ?? "").replace(/[^0-9+]/g, "");
  if (!phone) {
    toast.error("Customer has no phone number");
    return;
  }
  const msg = buildReminder(c);
  if (channel === "whatsapp") {
    window.open(
      `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(msg)}`,
      "_blank"
    );
  } else if (channel === "viber") {
    navigator.clipboard.writeText(msg).catch(() => undefined);
    toast.success("Message copied — paste in Viber");
    window.location.href = `viber://chat?number=${encodeURIComponent(phone)}`;
  } else {
    window.location.href = `sms:${phone}?body=${encodeURIComponent(msg)}`;
  }
};

const copyPublicLink = (c: CreditCustomer): void => {
  if (!c.publicToken) {
    toast.error("Public link not yet generated — refresh the page");
    return;
  }
  const url = `${window.location.origin}/bill/${c.publicToken}`;
  navigator.clipboard
    .writeText(url)
    .then(() => toast.success("Public bill link copied"))
    .catch(() => toast.error("Could not copy"));
};

interface FormState {
  name: string;
  phone: string;
  address: string;
  openingBalance: number;
  requestedCreditLimit: number;
  creditLimit: number;
  notes: string;
}

const blank: FormState = {
  name: "",
  phone: "",
  address: "",
  openingBalance: 0,
  requestedCreditLimit: 0,
  creditLimit: 0,
  notes: "",
};

export default function Customers() {
  const customers = useStore((s) => s.customers);
  const tx = useStore((s) => s.creditTx);
  const addCustomer = useStore((s) => s.addCustomer);
  const updateCustomer = useStore((s) => s.updateCustomer);
  const deleteCustomer = useStore((s) => s.deleteCustomer);
  const addCreditPayment = useStore((s) => s.addCreditPayment);
  const approveCustomer = useStore((s) => s.approveCustomer);
  const rejectCustomer = useStore((s) => s.rejectCustomer);
  const user = useCurrentUser();
  const isAdmin = user?.role === "admin";
  const isCashier = user?.role === "cashier";
  const canAdd = isAdmin || isCashier;

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CreditCustomer | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [payOpen, setPayOpen] = useState<CreditCustomer | null>(null);
  const [payAmt, setPayAmt] = useState(0);
  const [payNote, setPayNote] = useState("");
  const [approveTarget, setApproveTarget] = useState<CreditCustomer | null>(null);
  const [approveLimit, setApproveLimit] = useState(0);

  const pending = useMemo(
    () => customers.filter((c) => c.approvalStatus === "pending"),
    [customers]
  );
  const approved = useMemo(
    () => customers.filter((c) => c.approvalStatus === "approved"),
    [customers]
  );
  const rejected = useMemo(
    () => customers.filter((c) => c.approvalStatus === "rejected"),
    [customers]
  );

  const totalOutstanding = useMemo(
    () => approved.reduce((s, c) => s + c.balance, 0),
    [approved]
  );

  const submit = async (): Promise<void> => {
    if (!canAdd) return void toast.error("Not allowed");
    if (!form.name.trim()) return void toast.error("Name required");
    if (editing) {
      // Cashier cannot edit creditLimit / approval directly
      if (!isAdmin) {
        updateCustomer(editing.id, {
          name: form.name,
          phone: form.phone,
          address: form.address,
          notes: form.notes,
          requestedCreditLimit: form.requestedCreditLimit,
        });
      } else {
        updateCustomer(editing.id, {
          name: form.name,
          phone: form.phone,
          address: form.address,
          notes: form.notes,
          creditLimit: form.creditLimit,
          requestedCreditLimit: form.requestedCreditLimit,
        });
      }
      toast.success("Customer updated");
    } else {
      // Cashier creates pending; Admin creates approved directly
      const res = await addCustomer({
        name: form.name,
        phone: form.phone,
        address: form.address,
        openingBalance: form.openingBalance,
        requestedCreditLimit: form.requestedCreditLimit,
        creditLimit: isAdmin ? form.creditLimit : 0,
        notes: form.notes,
        approvalStatus: isAdmin ? "approved" : "pending",
      });
      if (!res.ok) {
        toast.error(`Failed to save customer: ${res.error ?? "unknown error"}`);
        return;
      }
      toast.success(
        isAdmin
          ? "Customer added & approved"
          : "Customer sent for admin approval"
      );
    }
    setOpen(false);
    setForm(blank);
    setEditing(null);
  };

  const submitPayment = (): void => {
    if (!payOpen) return;
    if (payAmt <= 0) return toast.error("Amount must be > 0");
    addCreditPayment(payOpen.id, payAmt, payNote);
    toast.success("Payment recorded");
    setPayOpen(null);
    setPayAmt(0);
    setPayNote("");
  };

  const confirmApprove = (): void => {
    if (!approveTarget) return;
    if (approveLimit <= 0) return toast.error("Set a credit limit first");
    approveCustomer(approveTarget.id, approveLimit);
    toast.success(`Approved ${approveTarget.name}`);
    setApproveTarget(null);
  };

  return (
    <>
      <PageHeader
        title="Credit Customers"
        description="Manage customer credit balances, approvals, and payments."
        actions={
          canAdd ? (
            <Button
              onClick={() => {
                setEditing(null);
                setForm(blank);
                setOpen(true);
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> Add Customer
            </Button>
          ) : null
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Approved" value={approved.length} />
        <StatCard label="Pending Approval" value={pending.length} accent="amber" />
        <StatCard
          label="Total Outstanding"
          value={formatCurrency(totalOutstanding)}
        />
        <StatCard label="Recent Tx" value={tx.length} />
      </div>

      {/* Pending approval (admin focus) */}
      {pending.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            <h2 className="text-lg font-semibold">Pending Credit Customers</h2>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {pending.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pending.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-foreground">{c.name}</div>
                    {c.phone && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" /> {c.phone}
                      </div>
                    )}
                    {c.address && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {c.address}
                      </div>
                    )}
                  </div>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                    Pending
                  </span>
                </div>
                <div className="mt-3 rounded-lg bg-white/70 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Requested limit</span>
                    <span className="font-semibold">
                      {formatCurrency(c.requestedCreditLimit ?? 0)}
                    </span>
                  </div>
                  {c.notes && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {c.notes}
                    </div>
                  )}
                </div>
                {isAdmin ? (
                  <div className="mt-4 flex gap-2">
                    <Button
                      onClick={() => {
                        setApproveTarget(c);
                        setApproveLimit(c.requestedCreditLimit ?? 0);
                      }}
                      className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (confirm(`Reject ${c.name}?`)) {
                          rejectCustomer(c.id);
                          toast.success("Rejected");
                        }
                      }}
                      className="gap-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <XIcon className="h-4 w-4" /> Reject
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-amber-300 bg-amber-100/60 px-3 py-2 text-xs text-amber-900">
                    Awaiting admin approval. Cannot be used for credit sales yet.
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Approved customers */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <h2 className="text-lg font-semibold">Approved Customers</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {approved.map((c) => {
            const utilization =
              c.creditLimit > 0 ? (c.balance / c.creditLimit) * 100 : 0;
            const remaining = Math.max(0, c.creditLimit - c.balance);
            const recent = tx
              .filter((t) => t.customerId === c.id)
              .sort(
                (a, b) =>
                  new Date(b.date).getTime() - new Date(a.date).getTime()
              )
              .slice(0, 3);
            return (
              <div
                key={c.id}
                className="rounded-2xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="font-semibold">{c.name}</div>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                        Approved
                      </span>
                    </div>
                    {c.phone && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" /> {c.phone}
                      </div>
                    )}
                    {c.address && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {c.address}
                      </div>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditing(c);
                          setForm({
                            name: c.name,
                            phone: c.phone,
                            address: c.address,
                            openingBalance: c.openingBalance,
                            requestedCreditLimit:
                              c.requestedCreditLimit ?? c.creditLimit,
                            creditLimit: c.creditLimit,
                            notes: c.notes,
                          });
                          setOpen(true);
                        }}
                        className="rounded-md p-1.5 hover:bg-secondary"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Disable & reject ${c.name}?`)) {
                            rejectCustomer(c.id);
                            toast.success("Customer disabled");
                          }
                        }}
                        className="rounded-md p-1.5 text-amber-600 hover:bg-amber-50"
                        title="Disable"
                      >
                        <Ban className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${c.name}?`)) {
                            deleteCustomer(c.id);
                            toast.success("Deleted");
                          }
                        }}
                        className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-xl bg-secondary/40 p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      Balance
                    </span>
                    <span className="text-2xl font-bold">
                      {formatCurrency(c.balance)}
                    </span>
                  </div>
                  <div className="mt-2">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>
                        Limit {formatCurrency(c.creditLimit)} · Remaining{" "}
                        {formatCurrency(remaining)}
                      </span>
                      <span>{utilization.toFixed(0)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className={`h-full rounded-full transition-all ${
                          utilization >= 90
                            ? "bg-rose-500"
                            : utilization >= 60
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min(100, utilization)}%` }}
                      />
                    </div>
                  </div>
                  {c.approvedByName && (
                    <div className="mt-2 text-[10px] text-muted-foreground">
                      Approved by {c.approvedByName}
                      {c.approvedAt ? ` · ${formatDate(c.approvedAt)}` : ""}
                    </div>
                  )}
                </div>

                {recent.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    {recent.map((t) => (
                      <div key={t.id} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          {formatDate(t.date)} ·{" "}
                          <span
                            className={t.type === "payment" ? "text-success" : ""}
                          >
                            {t.type}
                          </span>
                        </span>
                        <span
                          className={`font-medium ${
                            t.type === "payment" ? "text-success" : ""
                          }`}
                        >
                          {t.type === "payment" ? "-" : "+"}
                          {formatCurrency(t.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button asChild variant="outline" className="gap-2">
                    <Link to={`/customers/${c.id}`}>
                      <Eye className="h-4 w-4" /> View
                    </Link>
                  </Button>
                  <Button
                    onClick={() => {
                      setPayOpen(c);
                      setPayAmt(0);
                      setPayNote("");
                    }}
                    disabled={c.balance <= 0}
                    className="gap-2"
                    variant={c.balance > 0 ? "default" : "outline"}
                  >
                    <HandCoins className="h-4 w-4" />
                    Pay
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1">
                  <button
                    onClick={() => copyPublicLink(c)}
                    className="flex items-center justify-center gap-1 rounded-md border border-border bg-background px-1 py-1.5 text-[10px] font-medium hover:bg-secondary"
                    title="Copy public link"
                  >
                    <LinkIcon className="h-3 w-3" /> Link
                  </button>
                  <button
                    onClick={() => sendCustomerReminder(c, "whatsapp")}
                    className="flex items-center justify-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1 py-1.5 text-[10px] font-medium text-emerald-800 hover:bg-emerald-100"
                    title="Send via WhatsApp"
                  >
                    <Send className="h-3 w-3" /> WA
                  </button>
                  <button
                    onClick={() => sendCustomerReminder(c, "viber")}
                    className="flex items-center justify-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1 py-1.5 text-[10px] font-medium text-violet-800 hover:bg-violet-100"
                    title="Send via Viber"
                  >
                    <Send className="h-3 w-3" /> Viber
                  </button>
                  <button
                    onClick={() => sendCustomerReminder(c, "sms")}
                    className="flex items-center justify-center gap-1 rounded-md border border-border bg-background px-1 py-1.5 text-[10px] font-medium hover:bg-secondary"
                    title="Send via SMS"
                  >
                    <Send className="h-3 w-3" /> SMS
                  </button>
                </div>
              </div>
            );
          })}
          {approved.length === 0 && (
            <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
              No approved credit customers yet.
            </div>
          )}
        </div>
      </section>

      {/* Rejected (admin) */}
      {isAdmin && rejected.length > 0 && (
        <section className="mt-8">
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
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.phone}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setApproveTarget(c);
                    setApproveLimit(c.requestedCreditLimit ?? 0);
                  }}
                >
                  Re-approve
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Add / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Customer" : "Add Credit Customer"}
            </DialogTitle>
          </DialogHeader>
          {!isAdmin && !editing && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              New customers go to <b>Pending Approval</b>. Admin must approve
              before credit sales can be made.
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" full>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={input}
              />
            </Field>
            <Field label="Phone">
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={input}
              />
            </Field>
            <Field label="Address">
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className={input}
              />
            </Field>
            {!editing && (
              <Field label="Opening balance">
                <NumInput
                  value={form.openingBalance}
                  onChange={(n) => setForm({ ...form, openingBalance: n })}
                  className={input}
                />
              </Field>
            )}
            <Field label="Requested credit limit">
              <NumInput
                value={form.requestedCreditLimit}
                onChange={(n) => setForm({ ...form, requestedCreditLimit: n })}
                className={input}
              />
            </Field>
            {isAdmin && (
              <Field label="Approved credit limit">
                <NumInput
                  value={form.creditLimit}
                  onChange={(n) => setForm({ ...form, creditLimit: n })}
                  className={input}
                />
              </Field>
            )}
            <Field label="Notes" full>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-input bg-background p-3 text-sm"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => { void submit(); }}>
              {editing ? "Save" : isAdmin ? "Add & Approve" : "Submit for approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve dialog */}
      <Dialog
        open={!!approveTarget}
        onOpenChange={(o) => !o && setApproveTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve — {approveTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl bg-secondary/40 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Requested limit</span>
                <span className="font-semibold">
                  {formatCurrency(approveTarget?.requestedCreditLimit ?? 0)}
                </span>
              </div>
              {approveTarget?.phone && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Phone: {approveTarget.phone}
                </div>
              )}
            </div>
            <Field label="Final approved credit limit">
              <NumInput
                value={approveLimit}
                onChange={(n) => setApproveLimit(n)}
                className={input}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={confirmApprove}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={!!payOpen} onOpenChange={(o) => !o && setPayOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment — {payOpen?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl bg-secondary/40 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Outstanding
              </div>
              <div className="text-2xl font-bold">
                {formatCurrency(payOpen?.balance ?? 0)}
              </div>
            </div>
            <Field label="Amount received">
              <NumInput
                value={payAmt}
                onChange={(n) => setPayAmt(n)}
                className={input}
              />
            </Field>
            <Field label="Note (optional)">
              <input
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                className={input}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(null)}>
              Cancel
            </Button>
            <Button onClick={submitPayment}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "amber";
}) {
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${
        accent === "amber"
          ? "border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100 text-amber-900"
          : "border-border bg-card"
      }`}
    >
      <div
        className={`text-xs uppercase tracking-widest ${
          accent === "amber" ? "opacity-70" : "text-muted-foreground"
        }`}
      >
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

const input =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface FieldProps {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}
function Field({ label, children, full }: FieldProps) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
