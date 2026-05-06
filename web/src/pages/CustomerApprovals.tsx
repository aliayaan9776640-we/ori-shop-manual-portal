import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useOnlineAdminStore } from "@/lib/onlineStore";
import type { PublicCustomer } from "@/lib/onlineStore";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  UserCheck,
  UserX,
  Pencil,
  RefreshCw,
  Search,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

const MVR = (n: number): string =>
  `MVR ${Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function CustomerApprovals() {
  const customers = useOnlineAdminStore((s) => s.customers);
  const load = useOnlineAdminStore((s) => s.load);
  const lastError = useOnlineAdminStore((s) => s.lastError);
  const approveCustomer = useOnlineAdminStore((s) => s.approveCustomer);
  const rejectCustomer = useOnlineAdminStore((s) => s.rejectCustomer);
  const setCustomerCredit = useOnlineAdminStore((s) => s.setCustomerCredit);
  const updateCustomer = useOnlineAdminStore((s) => s.updateCustomer);

  const [tab, setTab] = useState<string>("pending");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<PublicCustomer | null>(null);

  // Initial load + realtime + 10s polling fallback
  useEffect(() => {
    void load();
    const channel = supabase
      .channel("customer-approvals-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "public_customers" },
        () => void load()
      )
      .subscribe();
    const interval = window.setInterval(() => void load(), 10_000);
    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(interval);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (tab === "pending" && c.approvalStatus !== "pending") return false;
      if (tab === "approved" && c.approvalStatus !== "approved") return false;
      if (tab === "rejected" && c.approvalStatus !== "rejected") return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.island.toLowerCase().includes(q)
      );
    });
  }, [customers, tab, search]);

  const counts = useMemo(
    () => ({
      pending: customers.filter((c) => c.approvalStatus === "pending").length,
      approved: customers.filter((c) => c.approvalStatus === "approved").length,
      rejected: customers.filter((c) => c.approvalStatus === "rejected").length,
    }),
    [customers]
  );

  return (
    <div>
      <PageHeader
        title="Customer Approvals"
        description="Review and manage online store customer registrations."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {lastError && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-bold">Could not load customer data</div>
            <div className="text-xs">{lastError}</div>
            <div className="mt-1 text-xs text-destructive/80">
              Check Supabase migration{" "}
              <code className="rounded bg-destructive/20 px-1">0019_online_store.sql</code>{" "}
              and RLS policies.
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone or island…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending
            {counts.pending > 0 && (
              <span className="ml-2 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                {counts.pending}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved
            <span className="ml-2 rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white">
              {counts.approved}
            </span>
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected
            <span className="ml-2 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
              {counts.rejected}
            </span>
          </TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Island</th>
                  <th className="p-3">Address</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Credit</th>
                  <th className="p-3">Registered</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="p-8 text-center text-muted-foreground"
                    >
                      {customers.length === 0
                        ? "No customers registered yet."
                        : "No customers match this filter."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr
                      key={c.id}
                      className="border-t border-border align-top"
                    >
                      <td className="p-3">
                        <div className="font-medium">{c.name}</div>
                        {c.email && (
                          <div className="text-xs text-muted-foreground">
                            {c.email}
                          </div>
                        )}
                      </td>
                      <td className="p-3 font-mono text-xs">{c.phone}</td>
                      <td className="p-3 text-xs">{c.island || "—"}</td>
                      <td className="p-3 text-xs text-muted-foreground max-w-[16rem]">
                        <div className="line-clamp-2">{c.address || "—"}</div>
                      </td>
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
                          <span className="text-emerald-700 font-medium">
                            {MVR(c.creditLimit)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditing(c)}
                            title="Edit / credit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {c.approvalStatus !== "approved" && (
                            <Button
                              size="sm"
                              onClick={async () => {
                                await approveCustomer(c.id);
                                toast.success(`${c.name} approved`);
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700"
                            >
                              <UserCheck className="mr-1 h-3 w-3" />
                              Approve
                            </Button>
                          )}
                          {c.approvalStatus !== "rejected" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                await rejectCustomer(c.id);
                                toast.success(`${c.name} rejected`);
                              }}
                            >
                              <UserX className="mr-1 h-3 w-3" />
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

      <CustomerEditDialog
        customer={editing}
        onClose={() => setEditing(null)}
        onSave={async (patch, credit) => {
          if (!editing) return;
          await updateCustomer(editing.id, patch);
          await setCustomerCredit(
            editing.id,
            credit.creditLimit,
            credit.isCreditApproved
          );
          toast.success("Customer updated");
          setEditing(null);
        }}
      />
    </div>
  );
}

function CustomerEditDialog({
  customer,
  onClose,
  onSave,
}: {
  customer: PublicCustomer | null;
  onClose: () => void;
  onSave: (
    patch: { name: string; phone: string; island: string; address: string; email: string },
    credit: { creditLimit: number; isCreditApproved: boolean }
  ) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [island, setIsland] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [creditLimit, setCreditLimit] = useState("0");
  const [creditApproved, setCreditApproved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!customer) return;
    setName(customer.name);
    setPhone(customer.phone);
    setIsland(customer.island);
    setAddress(customer.address);
    setEmail(customer.email);
    setCreditLimit(String(customer.creditLimit || 0));
    setCreditApproved(customer.isCreditApproved);
  }, [customer]);

  return (
    <Dialog open={!!customer} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit customer</DialogTitle>
          <DialogDescription>
            Confirm details and configure credit.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Full name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Mobile number</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label>Island</Label>
            <Input value={island} onChange={(e) => setIsland(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <Textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Email (optional)</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2 mt-2 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              Credit settings
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <Label>Credit limit (MVR)</Label>
                <Input
                  type="number"
                  min={0}
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                />
              </div>
              <label className="flex items-end gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={creditApproved}
                  onChange={(e) => setCreditApproved(e.target.checked)}
                  className="mb-2 h-4 w-4"
                />
                <span className="mb-2">Credit approved</span>
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(
                  { name, phone, island, address, email },
                  {
                    creditLimit: Number(creditLimit) || 0,
                    isCreditApproved: creditApproved,
                  }
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
