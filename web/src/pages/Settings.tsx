import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettings } from "@/lib/settings";
import { useDropdowns, type DropdownGroup } from "@/lib/dropdowns";
import { useRoleSettings, type RolePermissions } from "@/lib/roleSettings";
import NumInput from "@/components/NumInput";
import type { Role } from "@/lib/types";
import {
  Percent,
  ShoppingBag,
  CreditCard,
  Store,
  Save,
  ToggleLeft,
  ToggleRight,
  Building2,
  Landmark,
  FileText,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  ListChecks,
  Send,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function ToggleRow({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between rounded-xl border border-border bg-secondary/40 px-4 py-3 text-left transition hover:bg-secondary"
    >
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      {value ? (
        <ToggleRight className="h-7 w-7 text-success" />
      ) : (
        <ToggleLeft className="h-7 w-7 text-muted-foreground" />
      )}
    </button>
  );
}

interface DropdownGroupConfig {
  key: DropdownGroup;
  title: string;
  description: string;
}

function DropdownEditor({ group }: { group: DropdownGroupConfig }) {
  // Subscribe to the raw options array (stable ref) and derive the filtered
  // list with useMemo. Returning a new array directly from a zustand selector
  // every render trips React's getSnapshot identity check and causes error
  // #185 (Maximum update depth exceeded).
  const allOptions = useDropdowns((s) => s.options);
  const options = useMemo(
    () =>
      allOptions
        .filter((o) => o.groupKey === group.key)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [allOptions, group.key]
  );
  const add = useDropdowns((s) => s.add);
  const update = useDropdowns((s) => s.update);
  const remove = useDropdowns((s) => s.remove);

  const [newLabel, setNewLabel] = useState<string>("");
  const [newValue, setNewValue] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState<string>("");
  const [editValue, setEditValue] = useState<string>("");

  const handleAdd = async (): Promise<void> => {
    const label = newLabel.trim();
    if (!label) {
      toast.error("Label is required");
      return;
    }
    try {
      await add(group.key, label, newValue.trim() || undefined);
      setNewLabel("");
      setNewValue("");
      toast.success("Option added");
    } catch (e) {
      console.error("[dropdowns] add failed", e);
      toast.error("Failed to add option");
    }
  };

  const startEdit = (id: string, label: string, value: string): void => {
    setEditingId(id);
    setEditLabel(label);
    setEditValue(value);
  };

  const saveEdit = async (id: string): Promise<void> => {
    try {
      await update(id, { label: editLabel.trim(), value: editValue.trim() });
      setEditingId(null);
      toast.success("Saved");
    } catch (e) {
      console.error("[dropdowns] update failed", e);
      toast.error("Failed to save");
    }
  };

  const handleRemove = async (id: string): Promise<void> => {
    if (!window.confirm("Delete this option?")) return;
    try {
      await remove(id);
      toast.success("Removed");
    } catch (e) {
      console.error("[dropdowns] remove failed", e);
      toast.error("Failed to remove");
    }
  };

  const toggleActive = async (id: string, active: boolean): Promise<void> => {
    try {
      await update(id, { active });
    } catch (e) {
      console.error("[dropdowns] toggle failed", e);
      toast.error("Failed to update");
    }
  };

  return (
    <div className="pos-card p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ListChecks className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">{group.title}</h3>
          <p className="text-xs text-muted-foreground">{group.description}</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Label"
          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="Value (optional)"
          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button onClick={handleAdd} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {options.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-6 text-center text-xs text-muted-foreground">
          No options yet. Add one above.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {options.map((o) => {
            const isEditing = editingId === o.id;
            return (
              <div
                key={o.id}
                className="grid grid-cols-1 items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_1fr_auto_auto]"
              >
                {isEditing ? (
                  <>
                    <input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <button
                      onClick={() => void saveEdit(o.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-success/10 text-success transition hover:bg-success/20"
                      aria-label="Save"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-secondary/40 text-muted-foreground transition hover:bg-secondary"
                      aria-label="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-medium text-foreground">
                      {o.label}
                      {!o.active && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                          inactive
                        </span>
                      )}
                    </div>
                    <code className="text-xs text-muted-foreground">{o.value}</code>
                    <button
                      onClick={() => startEdit(o.id, o.label, o.value)}
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-secondary"
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => void toggleActive(o.id, !o.active)}
                        className="flex h-9 items-center justify-center rounded-md border border-border px-2 text-xs text-muted-foreground transition hover:bg-secondary"
                        aria-label="Toggle active"
                      >
                        {o.active ? "Disable" : "Enable"}
                      </button>
                      <button
                        onClick={() => void handleRemove(o.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-destructive transition hover:bg-destructive/10"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const PRODUCT_GROUPS: DropdownGroupConfig[] = [
  { key: "product_category", title: "Categories", description: "Product categories" },
  { key: "unit_type", title: "Unit Types", description: "piece, kg, tin, box, case…" },
  { key: "gst_applicable", title: "GST Applicable", description: "Yes / No options" },
  { key: "supplier", title: "Supplier List", description: "Quick-pick supplier names" },
];

const POS_GROUPS: DropdownGroupConfig[] = [
  { key: "payment_method", title: "Payment Methods", description: "Cash, card, bank, credit…" },
  { key: "discount_reason", title: "Discount Reasons", description: "Why a discount was applied" },
  { key: "plastic_bag_option", title: "Plastic Bag Options", description: "Bag size / fee variants" },
];

const DAMAGE_GROUPS: DropdownGroupConfig[] = [
  { key: "damage_reason", title: "Damage Reasons", description: "Expired, broken, spoiled…" },
  { key: "damage_unit_type", title: "Damage Unit Types", description: "Units used when reporting damage" },
];

const ORDER_GROUPS: DropdownGroupConfig[] = [
  { key: "order_status", title: "Order Status", description: "Pending, loaded, received…" },
  { key: "boat_name", title: "Boat Names", description: "Boats used for delivery" },
  { key: "supplier_order_status", title: "Supplier Order Status", description: "Sent, acknowledged, shipped…" },
];

const CREDIT_GROUPS: DropdownGroupConfig[] = [
  { key: "customer_status", title: "Customer Status", description: "Active, inactive, blocked…" },
  { key: "credit_approval_status", title: "Credit Approval Status", description: "Pending, approved, rejected" },
  { key: "credit_payment_type", title: "Payment Types", description: "How customers pay credit" },
];

export default function Settings() {
  const s = useSettings();
  const loadDropdowns = useDropdowns((d) => d.load);
  const [form, setForm] = useState({
    gstEnabled: s.gstEnabled,
    gstPercent: s.gstPercent,
    plasticBagFee: s.plasticBagFee,
    bagFeeTaxable: s.bagFeeTaxable,
    cardChargePercent: s.cardChargePercent,
    taxInclusive: s.taxInclusive,
    defaultDiscountAllowed: s.defaultDiscountAllowed,
    shopName: s.shopName,
    receiptFooter: s.receiptFooter,
    companyAddress: s.companyAddress,
    companyPhone: s.companyPhone,
    companyEmail: s.companyEmail,
    companyRegNo: s.companyRegNo,
    bankName: s.bankName,
    bankAccountName: s.bankAccountName,
    bankAccountNumber: s.bankAccountNumber,
    bankBeneficiary: s.bankBeneficiary,
    quotationValidityDays: s.quotationValidityDays,
    quotationTerms: s.quotationTerms,
    nearExpiryDays: s.nearExpiryDays,
    blockExpiredSale: s.blockExpiredSale,
    expiryAlertsEnabled: s.expiryAlertsEnabled,
    creditMonthlyEnabled: s.creditMonthlyEnabled,
    creditMonthlyRunDay: s.creditMonthlyRunDay,
    creditDefaultSendMethod: s.creditDefaultSendMethod,
    creditMessageTemplate: s.creditMessageTemplate,
    taxableActivityNo: s.taxableActivityNo,
  });

  useEffect(() => {
    s.loadRemote()
      .then(() => {
        // Re-sync the form with whatever Supabase actually returned.
        const fresh = useSettings.getState();
        setForm({
          gstEnabled: fresh.gstEnabled,
          gstPercent: fresh.gstPercent,
          plasticBagFee: fresh.plasticBagFee,
          bagFeeTaxable: fresh.bagFeeTaxable,
          cardChargePercent: fresh.cardChargePercent,
          taxInclusive: fresh.taxInclusive,
          defaultDiscountAllowed: fresh.defaultDiscountAllowed,
          shopName: fresh.shopName,
          receiptFooter: fresh.receiptFooter,
          companyAddress: fresh.companyAddress,
          companyPhone: fresh.companyPhone,
          companyEmail: fresh.companyEmail,
          companyRegNo: fresh.companyRegNo,
          bankName: fresh.bankName,
          bankAccountName: fresh.bankAccountName,
          bankAccountNumber: fresh.bankAccountNumber,
          bankBeneficiary: fresh.bankBeneficiary,
          quotationValidityDays: fresh.quotationValidityDays,
          quotationTerms: fresh.quotationTerms,
          nearExpiryDays: fresh.nearExpiryDays,
          blockExpiredSale: fresh.blockExpiredSale,
          expiryAlertsEnabled: fresh.expiryAlertsEnabled,
          creditMonthlyEnabled: fresh.creditMonthlyEnabled,
          creditMonthlyRunDay: fresh.creditMonthlyRunDay,
          creditDefaultSendMethod: fresh.creditDefaultSendMethod,
          creditMessageTemplate: fresh.creditMessageTemplate,
          taxableActivityNo: fresh.taxableActivityNo,
        });
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(`Could not load settings from server: ${msg}`);
      });
    loadDropdowns().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Could not load dropdowns: ${msg}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validate = (): string | null => {
    if (!form.shopName.trim()) return "Shop name is required";
    if (form.gstPercent < 0 || form.gstPercent > 100) return "GST % must be 0–100";
    if (form.cardChargePercent < 0 || form.cardChargePercent > 100)
      return "Card surcharge % must be 0–100";
    if (form.plasticBagFee < 0) return "Plastic bag fee cannot be negative";
    if (form.nearExpiryDays < 1 || form.nearExpiryDays > 365)
      return "Near-expiry days must be 1–365";
    if (form.creditMonthlyRunDay < 1 || form.creditMonthlyRunDay > 28)
      return "Credit run day must be 1–28";
    if (form.quotationValidityDays < 1) return "Quotation validity must be ≥ 1 day";
    return null;
  };

  const save = async (): Promise<void> => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    s.set(form);
    try {
      // saveRemote() also re-fetches from DB so local state mirrors server.
      await s.saveRemote();
      const fresh = useSettings.getState();
      setForm((prev) => ({
        ...prev,
        gstEnabled: fresh.gstEnabled,
        gstPercent: fresh.gstPercent,
        plasticBagFee: fresh.plasticBagFee,
        bagFeeTaxable: fresh.bagFeeTaxable,
        cardChargePercent: fresh.cardChargePercent,
        taxInclusive: fresh.taxInclusive,
        defaultDiscountAllowed: fresh.defaultDiscountAllowed,
        shopName: fresh.shopName,
        receiptFooter: fresh.receiptFooter,
        companyAddress: fresh.companyAddress,
        companyPhone: fresh.companyPhone,
        companyEmail: fresh.companyEmail,
        companyRegNo: fresh.companyRegNo,
        bankName: fresh.bankName,
        bankAccountName: fresh.bankAccountName,
        bankAccountNumber: fresh.bankAccountNumber,
        bankBeneficiary: fresh.bankBeneficiary,
        quotationValidityDays: fresh.quotationValidityDays,
        quotationTerms: fresh.quotationTerms,
        nearExpiryDays: fresh.nearExpiryDays,
        blockExpiredSale: fresh.blockExpiredSale,
        expiryAlertsEnabled: fresh.expiryAlertsEnabled,
        creditMonthlyEnabled: fresh.creditMonthlyEnabled,
        creditMonthlyRunDay: fresh.creditMonthlyRunDay,
        creditDefaultSendMethod: fresh.creditDefaultSendMethod,
        creditMessageTemplate: fresh.creditMessageTemplate,
        taxableActivityNo: fresh.taxableActivityNo,
      }));
      toast.success("Settings saved");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[settings] save failed", e);
      toast.error(`Failed to save settings: ${msg}`);
    }
  };

  return (
    <>
      <PageHeader
        title="Admin Settings"
        description="Manage tax, POS rules, dropdown values and company details."
      />

      <Tabs defaultValue="tax" className="w-full">
        <TabsList className="mb-6 flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="tax">Tax Settings</TabsTrigger>
          <TabsTrigger value="pos">POS Settings</TabsTrigger>
          <TabsTrigger value="company">Company &amp; Receipt</TabsTrigger>
          <TabsTrigger value="product-dropdowns">Product Dropdowns</TabsTrigger>
          <TabsTrigger value="supplier-dropdowns">Supplier / Order</TabsTrigger>
          <TabsTrigger value="damage-dropdowns">Damage Dropdowns</TabsTrigger>
          <TabsTrigger value="credit-dropdowns">Credit Settings</TabsTrigger>
          <TabsTrigger value="credit-statements">Credit Statements</TabsTrigger>
          <TabsTrigger value="expiry">Expiry &amp; Alerts</TabsTrigger>
          <TabsTrigger value="roles">Roles &amp; Limits</TabsTrigger>
        </TabsList>

        {/* EXPIRY */}
        <TabsContent value="expiry" className="mt-0">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="pos-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <Percent className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Expiry tracking</h3>
                  <p className="text-xs text-muted-foreground">
                    How the system flags near-expiry and expired stock
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-foreground">
                    Near-expiry threshold (days)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    step="1"
                    value={form.nearExpiryDays}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        nearExpiryDays: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    Items with this many days or fewer remaining will be highlighted
                    as “Near expiry” (default: 7).
                  </span>
                </label>
                <ToggleRow
                  title="Expiry alerts enabled"
                  description="Show expired / near-expiry banners and dashboard counts"
                  value={form.expiryAlertsEnabled}
                  onChange={(v) => setForm((f) => ({ ...f, expiryAlertsEnabled: v }))}
                />
              </div>
            </div>

            <div className="pos-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                  <ShoppingBag className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">POS sale rules</h3>
                  <p className="text-xs text-muted-foreground">
                    What happens when a cashier tries to sell an expired item
                  </p>
                </div>
              </div>
              <ToggleRow
                title="Block sale of expired items"
                description="When ON, the cashier cannot add or check out expired items. When OFF, a warning is shown but the sale is allowed."
                value={form.blockExpiredSale}
                onChange={(v) => setForm((f) => ({ ...f, blockExpiredSale: v }))}
              />
              <p className="mt-3 rounded-lg bg-secondary/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                Stock is always deducted from the oldest batch first (FIFO by
                expiry date). Each stock-in with an expiry date is tracked as a
                separate batch and shown in the inventory history.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* TAX */}
        <TabsContent value="tax" className="mt-0">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="pos-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Percent className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">GST</h3>
                  <p className="text-xs text-muted-foreground">
                    Applied once, only to GST-applicable products
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <ToggleRow
                  title="GST enabled"
                  description="Apply GST automatically on sales"
                  value={form.gstEnabled}
                  onChange={(v) => setForm((f) => ({ ...f, gstEnabled: v }))}
                />
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-foreground">
                    GST percentage (%)
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    disabled={!form.gstEnabled}
                    value={form.gstPercent}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, gstPercent: Number(e.target.value) }))
                    }
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  />
                </label>
                <ToggleRow
                  title="Tax-inclusive prices"
                  description="Selling prices already include GST"
                  value={form.taxInclusive}
                  onChange={(v) => setForm((f) => ({ ...f, taxInclusive: v }))}
                />
              </div>
            </div>

            <div className="pos-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <ShoppingBag className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Plastic Bag Fee</h3>
                  <p className="text-xs text-muted-foreground">Optional add-on at checkout</p>
                </div>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-foreground">
                  Default fee per bag
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.plasticBagFee}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, plasticBagFee: Number(e.target.value) }))
                  }
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <div className="mt-3">
                <ToggleRow
                  title="Bag fee is taxable"
                  description="Include the plastic bag fee in the GST taxable base"
                  value={form.bagFeeTaxable}
                  onChange={(v) => setForm((f) => ({ ...f, bagFeeTaxable: v }))}
                />
              </div>
            </div>

            <div className="pos-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Bank Card Charge</h3>
                  <p className="text-xs text-muted-foreground">
                    Applied only when payment method is Card
                  </p>
                </div>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-foreground">
                  Card surcharge (%)
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={form.cardChargePercent}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cardChargePercent: Number(e.target.value) }))
                  }
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
            </div>

            <div className="pos-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                  <Percent className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Discount Permissions</h3>
                  <p className="text-xs text-muted-foreground">
                    Default authority for non-admin users
                  </p>
                </div>
              </div>
              <ToggleRow
                title="Allow cashier discounts by default"
                description="When off, only admins can apply discounts"
                value={form.defaultDiscountAllowed}
                onChange={(v) => setForm((f) => ({ ...f, defaultDiscountAllowed: v }))}
              />
            </div>
          </div>
        </TabsContent>

        {/* POS */}
        <TabsContent value="pos" className="mt-0">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {POS_GROUPS.map((g) => (
              <DropdownEditor key={g.key} group={g} />
            ))}
          </div>
        </TabsContent>

        {/* COMPANY / RECEIPT */}
        <TabsContent value="company" className="mt-0">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="pos-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Store className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Shop &amp; Receipt</h3>
                  <p className="text-xs text-muted-foreground">Branding shown on receipts</p>
                </div>
              </div>
              <label className="mb-3 block">
                <span className="mb-1.5 block text-xs font-medium text-foreground">Shop name</span>
                <input
                  value={form.shopName}
                  onChange={(e) => setForm((f) => ({ ...f, shopName: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-foreground">Receipt footer</span>
                <input
                  value={form.receiptFooter}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, receiptFooter: e.target.value }))
                  }
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
            </div>

            <div className="pos-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Company Details</h3>
                  <p className="text-xs text-muted-foreground">Shown on quotations &amp; invoices</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <TextField
                  label="Address"
                  value={form.companyAddress}
                  onChange={(v) => setForm((f) => ({ ...f, companyAddress: v }))}
                />
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label="Phone"
                    value={form.companyPhone}
                    onChange={(v) => setForm((f) => ({ ...f, companyPhone: v }))}
                  />
                  <TextField
                    label="Email"
                    value={form.companyEmail}
                    onChange={(v) => setForm((f) => ({ ...f, companyEmail: v }))}
                  />
                </div>
                <TextField
                  label="Registration / GST No."
                  value={form.companyRegNo}
                  onChange={(v) => setForm((f) => ({ ...f, companyRegNo: v }))}
                />
                <TextField
                  label="Your Taxable Activity Number (GST Purchase Report)"
                  value={form.taxableActivityNo}
                  onChange={(v) => setForm((f) => ({ ...f, taxableActivityNo: v }))}
                />
              </div>
            </div>

            <div className="pos-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <Landmark className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Bank Details</h3>
                  <p className="text-xs text-muted-foreground">Printed on quotation footer</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <TextField
                  label="Bank Name"
                  value={form.bankName}
                  onChange={(v) => setForm((f) => ({ ...f, bankName: v }))}
                />
                <TextField
                  label="Account Name"
                  value={form.bankAccountName}
                  onChange={(v) => setForm((f) => ({ ...f, bankAccountName: v }))}
                />
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label="Account Number"
                    value={form.bankAccountNumber}
                    onChange={(v) => setForm((f) => ({ ...f, bankAccountNumber: v }))}
                  />
                  <TextField
                    label="Beneficiary"
                    value={form.bankBeneficiary}
                    onChange={(v) => setForm((f) => ({ ...f, bankBeneficiary: v }))}
                  />
                </div>
              </div>
            </div>

            <div className="pos-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Quotation Defaults</h3>
                  <p className="text-xs text-muted-foreground">Validity period and printed terms</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <label className="block max-w-xs">
                  <span className="mb-1.5 block text-xs font-medium text-foreground">
                    Validity (days)
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={form.quotationValidityDays}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, quotationValidityDays: Number(e.target.value) }))
                    }
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-foreground">
                    Terms &amp; Conditions (one per line)
                  </span>
                  <textarea
                    rows={6}
                    value={form.quotationTerms}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, quotationTerms: e.target.value }))
                    }
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* PRODUCT DROPDOWNS */}
        <TabsContent value="product-dropdowns" className="mt-0">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {PRODUCT_GROUPS.map((g) => (
              <DropdownEditor key={g.key} group={g} />
            ))}
          </div>
        </TabsContent>

        {/* SUPPLIER / ORDER DROPDOWNS */}
        <TabsContent value="supplier-dropdowns" className="mt-0">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {ORDER_GROUPS.map((g) => (
              <DropdownEditor key={g.key} group={g} />
            ))}
          </div>
        </TabsContent>

        {/* DAMAGE DROPDOWNS */}
        <TabsContent value="damage-dropdowns" className="mt-0">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {DAMAGE_GROUPS.map((g) => (
              <DropdownEditor key={g.key} group={g} />
            ))}
          </div>
        </TabsContent>

        {/* CREDIT DROPDOWNS */}
        <TabsContent value="credit-dropdowns" className="mt-0">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {CREDIT_GROUPS.map((g) => (
              <DropdownEditor key={g.key} group={g} />
            ))}
          </div>
        </TabsContent>

        {/* CREDIT STATEMENTS */}
        <TabsContent value="credit-statements" className="mt-0">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="pos-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Monthly Statements</h3>
                  <p className="text-xs text-muted-foreground">
                    Auto-generate &amp; queue statements for approved customers with outstanding balances.
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <ToggleRow
                  title="Enable monthly statement generation"
                  description="On the chosen day each month, queue one statement per approved customer who owes a balance."
                  value={form.creditMonthlyEnabled}
                  onChange={(v) => setForm((f) => ({ ...f, creditMonthlyEnabled: v }))}
                />
                <label className="block max-w-xs">
                  <span className="mb-1.5 block text-xs font-medium text-foreground">
                    Run on day of month (1–28)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    step="1"
                    disabled={!form.creditMonthlyEnabled}
                    value={form.creditMonthlyRunDay}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        creditMonthlyRunDay: Math.max(1, Math.min(28, Number(e.target.value) || 1)),
                      }))
                    }
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  />
                </label>
                <label className="block max-w-xs">
                  <span className="mb-1.5 block text-xs font-medium text-foreground">
                    Default sending method
                  </span>
                  <select
                    value={form.creditDefaultSendMethod}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        creditDefaultSendMethod: e.target.value as typeof f.creditDefaultSendMethod,
                      }))
                    }
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="viber">Viber</option>
                    <option value="email">Email</option>
                    <option value="copy">Copy to queue</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="pos-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Message Template</h3>
                  <p className="text-xs text-muted-foreground">
                    Used when queuing statements. Tokens: <code>{"{name}"}</code>,{" "}
                    <code>{"{month}"}</code>, <code>{"{amount}"}</code>. The PDF is attached separately — no public link is sent.
                  </p>
                </div>
              </div>
              <textarea
                rows={8}
                value={form.creditMessageTemplate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, creditMessageTemplate: e.target.value }))
                }
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        </TabsContent>

        {/* ROLES & APPROVAL LIMITS */}
        <TabsContent value="roles" className="mt-0">
          <RoleSettingsPanel />
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex justify-end">
        <Button onClick={() => void save()} size="lg" className="gap-2">
          <Save className="h-4 w-4" /> Save settings
        </Button>
      </div>
    </>
  );
}

const PERMISSION_LABELS: Record<keyof RolePermissions, string> = {
  can_create_purchase: "Create purchase orders",
  can_create_stock_entry: "Create stock entries",
  can_request_approval: "Request approval",
  can_approve: "Approve / reject requests",
  can_override_limits: "Override approval limits",
  can_view_reports: "View reports",
  can_edit_after_approval: "Edit after approval",
};

const ROLE_LIST: Role[] = ["admin", "storekeeper", "cashier"];

function RoleSettingsPanel() {
  const settings = useRoleSettings((s) => s.settings);
  const loaded = useRoleSettings((s) => s.loaded);
  const load = useRoleSettings((s) => s.load);
  const saveRole = useRoleSettings((s) => s.save);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900">
        Configure permissions and per-role approval limits. A user whose role
        has <code>can_approve</code> can approve requests up to their limit
        (set <strong>0</strong> for unlimited, like Admin). Requests above
        the limit are auto-routed to a higher role.
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {ROLE_LIST.map((role) => {
          const r = settings[role];
          return (
            <div key={role} className="pos-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-base font-bold capitalize">{role}</div>
                  <div className="text-xs text-muted-foreground">
                    Approval rules &amp; permissions
                  </div>
                </div>
              </div>

              <label className="mb-3 block">
                <span className="mb-1.5 block text-xs font-medium text-foreground">
                  Approval limit (0 = unlimited)
                </span>
                <NumInput
                  value={r.approvalLimit}
                  onChange={(n) =>
                    void saveRole(role, { approvalLimit: n })
                  }
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  disabled={!r.permissions.can_approve}
                />
              </label>

              <div className="space-y-2">
                {(Object.keys(PERMISSION_LABELS) as (keyof RolePermissions)[]).map(
                  (key) => (
                    <ToggleRow
                      key={key}
                      title={PERMISSION_LABELS[key]}
                      description=""
                      value={r.permissions[key]}
                      onChange={(v) =>
                        void saveRole(role, {
                          permissions: { ...r.permissions, [key]: v },
                        })
                      }
                    />
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
