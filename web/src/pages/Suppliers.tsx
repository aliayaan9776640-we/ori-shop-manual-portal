import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Supplier } from "@/lib/types";
import { Plus, Pencil, Trash2, Phone, MessageCircle, Mail, MapPin } from "lucide-react";
import { toast } from "sonner";

const blank: Omit<Supplier, "id"> = {
  name: "",
  contactPerson: "",
  phone: "",
  viber: "",
  email: "",
  address: "",
  notes: "",
};

export default function Suppliers() {
  const suppliers = useStore((s) => s.suppliers);
  const products = useStore((s) => s.products);
  const addSupplier = useStore((s) => s.addSupplier);
  const updateSupplier = useStore((s) => s.updateSupplier);
  const deleteSupplier = useStore((s) => s.deleteSupplier);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(blank);

  const openNew = (): void => {
    setEditing(null);
    setForm(blank);
    setOpen(true);
  };
  const openEdit = (s: Supplier): void => {
    setEditing(s);
    setForm({ ...s });
    setOpen(true);
  };
  const submit = (): void => {
    if (!form.name.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    if (editing) {
      updateSupplier(editing.id, form);
      toast.success("Supplier updated");
    } else {
      addSupplier(form);
      toast.success("Supplier added");
    }
    setOpen(false);
  };

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Manage supplier contacts and products supplied."
        actions={
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Add Supplier
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {suppliers.map((s) => {
          const supplied = products.filter((p) => p.supplierId === s.id);
          return (
            <div
              key={s.id}
              className="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.contactPerson}</div>
                </div>
                <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => openEdit(s)}
                    className="rounded-md p-1.5 hover:bg-secondary"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete ${s.name}?`)) {
                        deleteSupplier(s.id);
                        toast.success("Supplier deleted");
                      }
                    }}
                    className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                {s.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /> {s.phone}
                  </div>
                )}
                {s.viber && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MessageCircle className="h-3.5 w-3.5 text-violet-500" /> {s.viber}
                  </div>
                )}
                {s.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> {s.email}
                  </div>
                )}
                {s.address && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <MapPin className="mt-0.5 h-3.5 w-3.5" /> {s.address}
                  </div>
                )}
              </div>
              {s.notes && (
                <div className="mt-3 rounded-lg bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                  {s.notes}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">Products supplied</span>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {supplied.length}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Supplier name" full>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={input}
              />
            </Field>
            <Field label="Contact person">
              <input
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
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
            <Field label="Viber">
              <input
                value={form.viber}
                onChange={(e) => setForm({ ...form, viber: e.target.value })}
                className={input}
              />
            </Field>
            <Field label="Email">
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={input}
              />
            </Field>
            <Field label="Address" full>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className={input}
              />
            </Field>
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
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>{editing ? "Save" : "Add"}</Button>
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
