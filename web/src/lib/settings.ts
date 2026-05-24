import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export interface PosSettings {
  /** True once a remote load has succeeded at least one time this session. */
  remoteLoaded: boolean;
  /** Last remote load error (null if last attempt succeeded). */
  loadError: string | null;
  gstEnabled: boolean;
  gstPercent: number;
  plasticBagFee: number;
  cardChargePercent: number;
  /** If true, plastic bag fee is added to the GST taxable base. */
  bagFeeTaxable: boolean;
  /** If true, product selling prices already include GST (tax-inclusive). */
  taxInclusive: boolean;
  /** If true, cashiers may apply discounts without admin approval. */
  defaultDiscountAllowed: boolean;
  shopName: string;
  receiptFooter: string;
  // Company / contact details (used on quotation & invoices)
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyRegNo: string;
  // Bank details for quotation payment block
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankBeneficiary: string;
  // Bank details for Pre-Order payment tab
  preorderBankName: string;
  preorderBankAccountName: string;
  preorderBankAccountNumber: string;
  preorderPaymentNote: string;
  // Bank details for Online Shop checkout bank transfer tab
  onlineBankName: string;
  onlineBankAccountName: string;
  onlineBankAccountNumber: string;
  onlinePaymentNote: string;
  // Quotation terms & validity
  quotationValidityDays: number;
  quotationTerms: string;
  // Expiry tracking & alerts
  /** Days from today that count as "near expiry". Default 7. */
  nearExpiryDays: number;
  /** If true, POS blocks sale of expired items. If false, only warns. */
  blockExpiredSale: boolean;
  /** Master toggle for expiry alerts (dashboard, POS, login popup). */
  expiryAlertsEnabled: boolean;
  // Credit Statements
  /** Master switch — automatic monthly statement generation. */
  creditMonthlyEnabled: boolean;
  /** Day of month (1–28) on which to auto-run the queue. */
  creditMonthlyRunDay: number;
  /** Default channel suggested for the Pending Sends queue. */
  creditDefaultSendMethod: "whatsapp" | "viber" | "email" | "copy";
  /** Editable message template. Supports {name},{month},{amount}. */
  creditMessageTemplate: string;
  /** Your business taxable activity number, used as default for GST Purchase Report. */
  taxableActivityNo: string;
  set: (patch: Partial<Omit<PosSettings, "set" | "saveRemote" | "loadRemote" | "remoteLoaded" | "loadError">>) => void;
  /** Persist current settings to Supabase (admin-only) and refresh from DB. */
  saveRemote: () => Promise<void>;
  /** Load settings from Supabase and merge into local store. Throws on error. */
  loadRemote: () => Promise<void>;
}

export const useSettings = create<PosSettings>()(
  persist(
    (set) => ({
      remoteLoaded: false,
      loadError: null,
      gstEnabled: true,
      gstPercent: 8,
      plasticBagFee: 0,
      cardChargePercent: 0,
      bagFeeTaxable: false,
      taxInclusive: false,
      defaultDiscountAllowed: false,
      shopName: "Ori Barakah Store",
      receiptFooter: "Thank you for shopping with us!",
      companyAddress: "Lucky House, Asrafee Goalhi, R.Ungoofaaru",
      companyPhone: "9220222",
      companyEmail: "sales@oribrothers.com",
      companyRegNo: "",
      bankName: "Bank of Maldives",
      bankAccountName: "ORI BARAKAH STORE",
      bankAccountNumber: "7770000190257",
      bankBeneficiary: "Ibrahim Ayaan",
      preorderBankName: "Bank of Maldives",
      preorderBankAccountName: "ORI BARAKAH STORE",
      preorderBankAccountNumber: "7770000190257",
      preorderPaymentNote: "Please transfer and upload payment slip.",
      onlineBankName: "Bank of Maldives",
      onlineBankAccountName: "ORI BROTHERS",
      onlineBankAccountNumber: "7717334505",
      onlinePaymentNote: "Please transfer and upload payment slip.",
      nearExpiryDays: 7,
      blockExpiredSale: false,
      expiryAlertsEnabled: true,
      creditMonthlyEnabled: false,
      creditMonthlyRunDay: 1,
      creditDefaultSendMethod: "whatsapp",
      creditMessageTemplate:
        "Hello {name},\nYour credit statement for {month} is attached as a PDF.\nTotal balance: MVR {amount}\nThank you.",
      taxableActivityNo: "",
      quotationValidityDays: 7,
      quotationTerms:
        "1. Quotation is valid for the period stated above.\n2. Prices may change after the validity period.\n3. Order is confirmed only upon receipt of PO or written approval.\n4. Delivery as per agreed schedule. Payment as per agreed terms. GST applicable.\n5. For more information please contact 9220222.",
      set: (patch) => set(patch),
      saveRemote: async () => {
        if (!isSupabaseConfigured) throw new Error("Supabase not configured");
        const state = useSettings.getState() as unknown as Record<string, unknown>;
        // Strip functions and runtime-only fields before persisting.
        const value: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(state)) {
          if (typeof v === "function") continue;
          if (k === "remoteLoaded" || k === "loadError") continue;
          value[k] = v;
        }
        const { error } = await supabase
          .from("app_settings")
          .upsert(
            { key: "pos", value, updated_at: new Date().toISOString() },
            { onConflict: "key" }
          );
        if (error) {
          console.error("[settings] saveRemote error", error);
          throw error;
        }
        // Always refresh from DB so local state mirrors the server.
        await useSettings.getState().loadRemote();
      },
      loadRemote: async () => {
        if (!isSupabaseConfigured) {
          set({ loadError: "Supabase not configured" });
          throw new Error("Supabase not configured");
        }
        try {
          const { data, error } = await supabase
            .from("app_settings")
            .select("value")
            .eq("key", "pos")
            .maybeSingle();
          if (error) {
            // Treat "table missing" (PGRST205 / 404) as non-fatal: app keeps
            // running with locally persisted defaults until the migration
            // (web/supabase/migrations/0001_app_settings_and_dropdowns.sql)
            // is applied in the Supabase project.
            const code = (error as { code?: string }).code;
            const missing = code === "PGRST205" || /schema cache|does not exist|relation .* does not exist/i.test(error.message);
            if (missing) {
              console.warn("[settings] app_settings table missing \u2014 using local defaults");
              set({ remoteLoaded: true, loadError: "app_settings table missing" });
              return;
            }
            console.error("[settings] loadRemote error", error);
            set({ loadError: error.message });
            throw error;
          }
          if (data?.value && typeof data.value === "object") {
            set({ ...(data.value as Partial<PosSettings>), remoteLoaded: true, loadError: null });
          } else {
            set({ remoteLoaded: true, loadError: null });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[settings] loadRemote exception", e);
          set({ loadError: msg });
          throw e;
        }
      },
    }),
    { name: "ori-pos-settings", version: 5 }
  )
);
