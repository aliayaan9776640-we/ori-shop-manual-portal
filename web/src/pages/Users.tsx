import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useStore, useCurrentUser } from "@/lib/store";
import type { Role, User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Shield, Box, Wallet, KeyRound, MailCheck } from "lucide-react";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const roleIcon: Record<Role, React.ElementType> = {
  admin: Shield,
  storekeeper: Box,
  cashier: Wallet,
};

const roleColor: Record<Role, string> = {
  admin: "bg-amber-100 text-amber-700",
  storekeeper: "bg-blue-100 text-blue-700",
  cashier: "bg-emerald-100 text-emerald-700",
};

interface FormState {
  email: string;
  password: string;
  fullName: string;
  role: Role;
  active: boolean;
  isPurchasingStaff: boolean;
}

const blank: FormState = {
  email: "",
  password: "",
  fullName: "",
  role: "cashier",
  active: true,
  isPurchasingStaff: false,
};

export default function Users() {
  const users = useStore((s) => s.users);
  const addUser = useStore((s) => s.addUser);
  const updateUser = useStore((s) => s.updateUser);
  const deleteUser = useStore((s) => s.deleteUser);
  const me = useCurrentUser();
  const logs = useStore((s) => s.logs);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (): Promise<void> => {
    if (!form.email.trim() || !form.fullName.trim()) {
      toast.error("Email and full name required");
      return;
    }
    if (!editing && !form.password) {
      toast.error("Password required");
      return;
    }
    if (editing) {
      const patch: Partial<User> = {
        email: form.email,
        username: form.email,
        fullName: form.fullName,
        role: form.role,
        active: form.active,
        isPurchasingStaff: form.isPurchasingStaff,
      };
      updateUser(editing.id, patch);
      toast.success("User updated");
    } else {
      setSubmitting(true);
      const res = await addUser({
        email: form.email.trim(),
        username: form.email.trim(),
        password: form.password,
        fullName: form.fullName,
        role: form.role,
        active: form.active,
      });
      // After creating, persist the purchasing-staff flag if set.
      if (form.isPurchasingStaff && res.ok) {
        const created = useStore
          .getState()
          .users.find((u) => u.email === form.email.trim());
        if (created) updateUser(created.id, { isPurchasingStaff: true });
      }
      setSubmitting(false);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to create user");
        return;
      }
      if (res.error === "created-pending-confirmation") {
        toast.warning(
          "User created, but Supabase requires email confirmation. Ask them to check their inbox, or turn off \"Confirm email\" in Supabase Auth settings.",
          { duration: 8000 }
        );
      } else {
        toast.success("User created successfully and can login now");
      }
    }
    setOpen(false);
    setForm(blank);
    setEditing(null);
  };

  return (
    <>
      <PageHeader
        title="Users & Activity"
        description="Manage staff accounts, roles, and review activity log."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setForm(blank);
              setOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" /> Add User
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Username</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const Icon = roleIcon[u.role];
                return (
                  <tr key={u.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                          {u.fullName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium">{u.fullName}</div>
                          <div className="text-xs text-muted-foreground">
                            joined {formatDate(u.createdAt)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${roleColor[u.role]}`}>
                        <Icon className="h-3 w-3" /> {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                          u.active ? "text-success" : "text-muted-foreground"
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${
                            u.active ? "bg-success" : "bg-muted-foreground/50"
                          }`}
                        />
                        {u.active ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => updateUser(u.id, { active: !u.active })}
                          disabled={u.id === me?.id}
                          className="rounded-md px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
                        >
                          {u.active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={async () => {
                            if (!isSupabaseConfigured) {
                              toast.error("Supabase not configured");
                              return;
                            }
                            if (!confirm(`Send password reset email to ${u.email}?`)) return;
                            const redirectTo = `${window.location.origin}/reset-password`;
                            const { error } = await supabase.auth.resetPasswordForEmail(u.email, { redirectTo });
                            if (error) {
                              toast.error(error.message);
                              return;
                            }
                            toast.success("Reset email sent");
                          }}
                          title="Send password reset email"
                          className="rounded-md p-1.5 hover:bg-secondary"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          onClick={async () => {
                            if (!isSupabaseConfigured) {
                              toast.error("Supabase not configured");
                              return;
                            }
                            const { error } = await supabase.auth.resend({
                              type: "signup",
                              email: u.email,
                              options: {
                                emailRedirectTo: `${window.location.origin}/login`,
                              },
                            });
                            if (error) {
                              toast.error(error.message);
                              return;
                            }
                            toast.success(`Confirmation email resent to ${u.email}`);
                          }}
                          title="Resend confirmation email"
                          className="rounded-md p-1.5 hover:bg-secondary"
                        >
                          <MailCheck className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditing(u);
                            setForm({
                              email: u.email,
                              password: "",
                              fullName: u.fullName,
                              role: u.role,
                              active: u.active,
                              isPurchasingStaff: !!u.isPurchasingStaff,
                            });
                            setOpen(true);
                          }}
                          className="rounded-md p-1.5 hover:bg-secondary"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (u.id === me?.id) return toast.error("Cannot delete yourself");
                            if (confirm(`Delete ${u.fullName}?`)) {
                              deleteUser(u.id);
                              toast.success("Deleted");
                            }
                          }}
                          disabled={u.id === me?.id}
                          className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Recent activity
          </h3>
          <div className="max-h-[600px] space-y-3 overflow-y-auto scrollbar-thin">
            {logs.length === 0 && (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            )}
            {logs.map((l) => (
              <div
                key={l.id}
                className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs"
              >
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
                    {l.action}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(l.date).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="mt-1 text-foreground">{l.detail}</div>
                <div className="text-[11px] text-muted-foreground">{l.userName}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit User" : "Add User"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" full>
              <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={input} />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={input}
                disabled={!!editing}
              />
            </Field>
            {!editing && (
              <Field label="Password">
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className={input}
                />
              </Field>
            )}
            <Field label="Role">
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                className={input}
              >
                <option value="admin">Admin</option>
                <option value="storekeeper">Storekeeper</option>
                <option value="cashier">Cashier</option>
              </select>
            </Field>
            <Field label="Status">
              <select
                value={form.active ? "y" : "n"}
                onChange={(e) => setForm({ ...form, active: e.target.value === "y" })}
                className={input}
              >
                <option value="y">Active</option>
                <option value="n">Deactivated</option>
              </select>
            </Field>
            <Field label="Purchasing staff" full>
              <label className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isPurchasingStaff}
                  onChange={(e) =>
                    setForm({ ...form, isPurchasingStaff: e.target.checked })
                  }
                />
                <span>Allow this user to attend purchase orders (enter buying details)</span>
              </label>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting ? "Creating..." : editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
