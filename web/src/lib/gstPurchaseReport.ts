import { create } from "zustand";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import type { UnitType } from "@/lib/types";

export type BillStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "needs_correction";

export type ItemDecision = "pending" | "approved" | "rejected";
export type ProductAction = "match" | "create" | "skip";

export interface SupplierBillItem {
  id?: string;
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  source?: "manual" | "ocr";
  ocrConfidence?: number | null;
  /** Inventory matching */
  matchedProductId?: string | null;
  productAction?: ProductAction;
  decision?: ItemDecision;
  unitType?: UnitType | null;
  piecesPerCase?: number | null;
  gstApplicable?: boolean;
  correctionNote?: string | null;
  newProductName?: string | null;
  newProductBarcode?: string | null;
  newProductCategory?: string | null;
  newSupplierId?: string | null;
}

/**
 * Official GST Purchase Report fields (the only fields that matter):
 *   1. Supplier TIN
 *   2. Supplier Name
 *   3. Supplier Invoice Number
 *   4. Invoice Date
 *   5. Invoice Total (excluding GST)
 *   6. GST Charged at 8%
 *   7. Your Taxable Activity Number
 */
export interface SupplierBillUpload {
  id: string;
  supplierId: string | null;
  supplierTin: string;
  supplierName: string;
  supplierInvoiceNo: string;
  invoiceDate: string | null;
  invoiceTotalExclGst: number;
  gstCharged: number;
  taxableActivityNo: string;
  fileUrl: string | null;
  fileName: string | null;
  notes: string | null;
  status: BillStatus;
  rawText: string | null;
  ocrConfidence: number | null;
  ocrModel: string | null;
  ocrExtractedAt: string | null;
  ocrNotes: string | null;
  items: SupplierBillItem[];
  uploadedBy: string | null;
  uploadedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  correctionNote: string | null;
  submittedAt: string | null;
}

export interface GstPurchaseReportRow {
  id: string;
  uploadId: string | null;
  supplierId: string | null;
  supplierTin: string;
  supplierName: string;
  supplierInvoiceNo: string;
  invoiceDate: string;
  invoiceTotalExclGst: number;
  gstCharged: number;
  taxableActivityNo: string;
  approvedBy: string | null;
  approvedAt: string;
  notes: string | null;
}

interface State {
  uploads: SupplierBillUpload[];
  reports: GstPurchaseReportRow[];
  loading: boolean;
  tableMissing: boolean;
  load: () => Promise<void>;
  createUpload: (
    payload: Omit<
      SupplierBillUpload,
      | "id"
      | "status"
      | "uploadedBy"
      | "uploadedAt"
      | "approvedBy"
      | "approvedAt"
      | "rejectedReason"
      | "correctionNote"
      | "submittedAt"
    > & { status?: BillStatus }
  ) => Promise<{ ok: boolean; id?: string }>;
  loadUploadItems: (uploadId: string) => Promise<SupplierBillItem[]>;
  saveUploadItems: (
    uploadId: string,
    items: SupplierBillItem[]
  ) => Promise<boolean>;
  updateUpload: (
    id: string,
    patch: Partial<
      Pick<
        SupplierBillUpload,
        | "supplierTin"
        | "supplierName"
        | "supplierInvoiceNo"
        | "invoiceDate"
        | "invoiceTotalExclGst"
        | "gstCharged"
        | "taxableActivityNo"
        | "notes"
      >
    >
  ) => Promise<boolean>;
  submitForApproval: (id: string) => Promise<boolean>;
  approveUpload: (
    id: string,
    items?: SupplierBillItem[],
    notes?: string
  ) => Promise<boolean>;
  rejectUpload: (id: string, reason: string) => Promise<boolean>;
  requestCorrection: (id: string, note: string) => Promise<boolean>;
  removeUpload: (id: string) => Promise<void>;
  updateUploadTaxableActivityNo: (id: string, value: string) => Promise<boolean>;
  updateReportTaxableActivityNo: (id: string, value: string) => Promise<boolean>;
}

const TABLE_MISSING =
  /supplier_bill_uploads|gst_purchase_reports|schema cache|relation .* does not exist|column .* does not exist/i;

interface UploadRow {
  id: string;
  supplier_id: string | null;
  supplier_tin: string | null;
  supplier_name: string | null;
  bill_no: string | null;
  bill_date: string | null;
  invoice_total_excl_gst: number | null;
  gst_charged: number | null;
  taxable_activity_no: string | null;
  file_url: string | null;
  file_name: string | null;
  notes: string | null;
  status: BillStatus;
  uploaded_by: string | null;
  uploaded_at: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  raw_text: string | null;
  ocr_confidence: number | null;
  ocr_model: string | null;
  ocr_extracted_at: string | null;
  ocr_notes: string | null;
  correction_note: string | null;
  submitted_at: string | null;
}
interface ReportRow {
  id: string;
  upload_id: string | null;
  supplier_id: string | null;
  supplier_tin: string | null;
  supplier_name: string | null;
  bill_no: string | null;
  bill_date: string;
  invoice_total_excl_gst: number | null;
  gst_charged: number | null;
  taxable_activity_no: string | null;
  approved_by: string | null;
  approved_at: string;
  notes: string | null;
}

const uploadFromRow = (r: UploadRow): SupplierBillUpload => ({
  id: r.id,
  supplierId: r.supplier_id,
  supplierTin: r.supplier_tin ?? "",
  supplierName: r.supplier_name ?? "",
  supplierInvoiceNo: r.bill_no ?? "",
  invoiceDate: r.bill_date,
  invoiceTotalExclGst: Number(r.invoice_total_excl_gst ?? 0),
  gstCharged: Number(r.gst_charged ?? 0),
  taxableActivityNo: r.taxable_activity_no ?? "",
  fileUrl: r.file_url,
  fileName: r.file_name,
  notes: r.notes,
  status: r.status,
  uploadedBy: r.uploaded_by,
  uploadedAt: r.uploaded_at,
  approvedBy: r.approved_by,
  approvedAt: r.approved_at,
  rejectedReason: r.rejected_reason,
  rawText: r.raw_text ?? null,
  ocrConfidence: r.ocr_confidence != null ? Number(r.ocr_confidence) : null,
  ocrModel: r.ocr_model ?? null,
  ocrExtractedAt: r.ocr_extracted_at ?? null,
  ocrNotes: r.ocr_notes ?? null,
  correctionNote: r.correction_note ?? null,
  submittedAt: r.submitted_at ?? null,
  items: [],
});

const reportFromRow = (r: ReportRow): GstPurchaseReportRow => ({
  id: r.id,
  uploadId: r.upload_id,
  supplierId: r.supplier_id,
  supplierTin: r.supplier_tin ?? "",
  supplierName: r.supplier_name ?? "",
  supplierInvoiceNo: r.bill_no ?? "",
  invoiceDate: r.bill_date,
  invoiceTotalExclGst: Number(r.invoice_total_excl_gst ?? 0),
  gstCharged: Number(r.gst_charged ?? 0),
  taxableActivityNo: r.taxable_activity_no ?? "",
  approvedBy: r.approved_by,
  approvedAt: r.approved_at,
  notes: r.notes,
});

const itemToRow = (
  uploadId: string,
  it: SupplierBillItem,
  position: number
): Record<string, unknown> => ({
  upload_id: uploadId,
  description: it.description,
  qty: it.qty,
  unit_price: it.unitPrice,
  line_total: it.lineTotal,
  gst_applicable: it.gstApplicable ?? true,
  gst_amount: 0,
  position,
  source: it.source ?? "ocr",
  ocr_confidence: it.ocrConfidence ?? null,
  matched_product_id: it.matchedProductId ?? null,
  product_action: it.productAction ?? "match",
  decision: it.decision ?? "pending",
  unit_type: it.unitType ?? null,
  pieces_per_case: it.piecesPerCase ?? null,
  correction_note: it.correctionNote ?? null,
  new_product_name: it.newProductName ?? null,
  new_product_barcode: it.newProductBarcode ?? null,
  new_product_category: it.newProductCategory ?? null,
  new_supplier_id: it.newSupplierId ?? null,
});

interface ItemRow {
  id?: string;
  description: string | null;
  qty: number | string | null;
  unit_price: number | string | null;
  line_total: number | string | null;
  source: "manual" | "ocr" | null;
  ocr_confidence: number | string | null;
  matched_product_id?: string | null;
  product_action?: ProductAction | null;
  decision?: ItemDecision | null;
  unit_type?: string | null;
  pieces_per_case?: number | string | null;
  gst_applicable?: boolean | null;
  correction_note?: string | null;
  new_product_name?: string | null;
  new_product_barcode?: string | null;
  new_product_category?: string | null;
  new_supplier_id?: string | null;
}

const itemFromRow = (r: ItemRow): SupplierBillItem => ({
  id: r.id,
  description: r.description ?? "",
  qty: Number(r.qty ?? 0),
  unitPrice: Number(r.unit_price ?? 0),
  lineTotal: Number(r.line_total ?? 0),
  source: r.source ?? "manual",
  ocrConfidence: r.ocr_confidence != null ? Number(r.ocr_confidence) : null,
  matchedProductId: r.matched_product_id ?? null,
  productAction: r.product_action ?? "match",
  decision: r.decision ?? "pending",
  unitType: (r.unit_type as UnitType | null) ?? null,
  piecesPerCase: r.pieces_per_case != null ? Number(r.pieces_per_case) : null,
  gstApplicable: r.gst_applicable ?? true,
  correctionNote: r.correction_note ?? null,
  newProductName: r.new_product_name ?? null,
  newProductBarcode: r.new_product_barcode ?? null,
  newProductCategory: r.new_product_category ?? null,
  newSupplierId: r.new_supplier_id ?? null,
});

export const useGstPurchaseReport = create<State>()((set, get) => ({
  uploads: [],
  reports: [],
  loading: false,
  tableMissing: false,
  load: async () => {
    if (!isSupabaseConfigured) return;
    set({ loading: true });
    const [up, rep] = await Promise.all([
      supabase
        .from("supplier_bill_uploads")
        .select("*")
        .order("uploaded_at", { ascending: false })
        .limit(500),
      supabase
        .from("gst_purchase_reports")
        .select("*")
        .order("bill_date", { ascending: false })
        .limit(500),
    ]);
    set({ loading: false });
    const err = up.error ?? rep.error;
    if (err) {
      if (TABLE_MISSING.test(err.message)) {
        console.warn(
          "[gst_purchase_report] tables/columns missing — apply migrations 0010 + 0011 + 0013"
        );
        set({ tableMissing: true });
        return;
      }
      console.error("[gst_purchase_report] load error", err);
      return;
    }
    set({
      uploads: (up.data as UploadRow[] | null)?.map(uploadFromRow) ?? [],
      reports: (rep.data as ReportRow[] | null)?.map(reportFromRow) ?? [],
      tableMissing: false,
    });
  },
  createUpload: async (payload) => {
    if (!isSupabaseConfigured) return { ok: false };
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id ?? null;
    const total = payload.invoiceTotalExclGst + payload.gstCharged;
    const status: BillStatus = payload.status ?? "pending";
    const { data, error } = await supabase
      .from("supplier_bill_uploads")
      .insert({
        supplier_id: payload.supplierId,
        supplier_tin: payload.supplierTin,
        supplier_name: payload.supplierName,
        bill_no: payload.supplierInvoiceNo,
        bill_date: payload.invoiceDate,
        invoice_total_excl_gst: payload.invoiceTotalExclGst,
        gst_charged: payload.gstCharged,
        taxable_activity_no: payload.taxableActivityNo,
        file_url: payload.fileUrl,
        file_name: payload.fileName,
        notes: payload.notes,
        raw_text: payload.rawText,
        ocr_confidence: payload.ocrConfidence,
        ocr_model: payload.ocrModel,
        ocr_extracted_at: payload.ocrExtractedAt,
        ocr_notes: payload.ocrNotes,
        status,
        submitted_at:
          status === "pending" ? new Date().toISOString() : null,
        // legacy mirror columns kept in sync for backward compat
        total_amount: total,
        gst_amount: payload.gstCharged,
        non_gst_amount: payload.invoiceTotalExclGst,
        uploaded_by: uid,
      })
      .select()
      .single();
    if (error) {
      if (TABLE_MISSING.test(error.message)) {
        set({ tableMissing: true });
        toast.error(
          "Run migrations 0010, 0011 and 0013 in Supabase first"
        );
      } else {
        console.error("[supplier_bill_uploads] insert error", error);
        toast.error("Could not save bill: " + error.message);
      }
      return { ok: false };
    }
    const newId = (data as { id: string }).id;
    if (payload.items.length > 0) {
      const itemRows = payload.items.map((it, i) => itemToRow(newId, it, i));
      const itemsRes = await supabase
        .from("supplier_bill_items")
        .insert(itemRows);
      if (itemsRes.error) {
        console.warn(
          "[supplier_bill_items] insert error",
          itemsRes.error.message
        );
      }
    }
    await get().load();
    return { ok: true, id: newId };
  },
  loadUploadItems: async (uploadId) => {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from("supplier_bill_items")
      .select("*")
      .eq("upload_id", uploadId)
      .order("position", { ascending: true });
    if (error) {
      console.warn("[supplier_bill_items] load error", error.message);
      return [];
    }
    return ((data as ItemRow[] | null) ?? []).map(itemFromRow);
  },
  saveUploadItems: async (uploadId, items) => {
    if (!isSupabaseConfigured) return false;
    // Replace strategy: delete existing then insert all (simpler + reliable).
    const del = await supabase
      .from("supplier_bill_items")
      .delete()
      .eq("upload_id", uploadId);
    if (del.error) {
      console.error("[supplier_bill_items] delete error", del.error);
      toast.error("Could not save items: " + del.error.message);
      return false;
    }
    if (items.length === 0) return true;
    const rows = items.map((it, i) => itemToRow(uploadId, it, i));
    const ins = await supabase.from("supplier_bill_items").insert(rows);
    if (ins.error) {
      console.error("[supplier_bill_items] insert error", ins.error);
      toast.error("Could not save items: " + ins.error.message);
      return false;
    }
    return true;
  },
  updateUpload: async (id, patch) => {
    if (!isSupabaseConfigured) return false;
    const row: Record<string, unknown> = {};
    if (patch.supplierTin !== undefined) row.supplier_tin = patch.supplierTin;
    if (patch.supplierName !== undefined) row.supplier_name = patch.supplierName;
    if (patch.supplierInvoiceNo !== undefined) row.bill_no = patch.supplierInvoiceNo;
    if (patch.invoiceDate !== undefined) row.bill_date = patch.invoiceDate;
    if (patch.invoiceTotalExclGst !== undefined) {
      row.invoice_total_excl_gst = patch.invoiceTotalExclGst;
      row.non_gst_amount = patch.invoiceTotalExclGst;
    }
    if (patch.gstCharged !== undefined) {
      row.gst_charged = patch.gstCharged;
      row.gst_amount = patch.gstCharged;
    }
    if (patch.taxableActivityNo !== undefined) row.taxable_activity_no = patch.taxableActivityNo;
    if (patch.notes !== undefined) row.notes = patch.notes;
    const { error } = await supabase
      .from("supplier_bill_uploads")
      .update(row)
      .eq("id", id);
    if (error) {
      toast.error("Could not save: " + error.message);
      return false;
    }
    await get().load();
    return true;
  },
  submitForApproval: async (id) => {
    if (!isSupabaseConfigured) return false;
    const { error } = await supabase
      .from("supplier_bill_uploads")
      .update({
        status: "pending",
        submitted_at: new Date().toISOString(),
        correction_note: null,
      })
      .eq("id", id);
    if (error) {
      toast.error("Submit failed: " + error.message);
      return false;
    }
    await get().load();
    toast.success("Submitted for admin approval");
    return true;
  },
  approveUpload: async (id, itemsOverride, notes) => {
    if (!isSupabaseConfigured) return false;
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id ?? null;
    const upload = get().uploads.find((u) => u.id === id);
    if (!upload) {
      toast.error("Bill not found");
      return false;
    }

    // 6. Prevent duplicate approval
    if (upload.status === "approved") {
      toast.warning("This bill has already been approved");
      console.warn("[gst.approve] blocked duplicate approval", id);
      return false;
    }

    // Persist any item edits first
    const items =
      itemsOverride ?? (await get().loadUploadItems(id));
    if (itemsOverride) {
      const ok = await get().saveUploadItems(id, itemsOverride);
      if (!ok) return false;
    }

    const approvedAt = new Date().toISOString();
    const total = upload.invoiceTotalExclGst + upload.gstCharged;
    const { data: repData, error: repErr } = await supabase
      .from("gst_purchase_reports")
      .insert({
        upload_id: id,
        supplier_id: upload.supplierId,
        supplier_tin: upload.supplierTin,
        supplier_name: upload.supplierName,
        bill_no: upload.supplierInvoiceNo,
        bill_date: upload.invoiceDate ?? new Date().toISOString().slice(0, 10),
        invoice_total_excl_gst: upload.invoiceTotalExclGst,
        gst_charged: upload.gstCharged,
        taxable_activity_no: upload.taxableActivityNo,
        total_amount: total,
        gst_amount: upload.gstCharged,
        non_gst_amount: upload.invoiceTotalExclGst,
        approved_by: uid,
        approved_at: approvedAt,
        notes: notes ?? upload.notes,
      })
      .select()
      .single();
    if (repErr) {
      console.error("[gst_purchase_reports] insert error", repErr);
      toast.error("Approve failed: " + repErr.message);
      return false;
    }
    const reportId = (repData as { id: string }).id;

    // Insert approved items into report items + push to inventory.
    const approvedItems = items.filter(
      (it) => (it.decision ?? "pending") === "approved"
    );
    let invSuccess = 0;
    const invFailures: { name: string; reason: string }[] = [];

    if (approvedItems.length > 0) {
      const reportItemRows = approvedItems.map((it, i) => ({
        report_id: reportId,
        description: it.description,
        qty: it.qty,
        unit_price: it.unitPrice,
        line_total: it.lineTotal,
        gst_applicable: it.gstApplicable ?? true,
        gst_amount: 0,
        position: i,
      }));
      const ri = await supabase
        .from("gst_purchase_report_items")
        .insert(reportItemRows);
      if (ri.error) {
        console.warn(
          "[gst_purchase_report_items] insert error",
          ri.error.message
        );
      }

      // 1+2+3+4. Push approved items into inventory.
      // - Match by barcode/SKU first → then by exact name (case-insensitive).
      // - If found: update existing stock + purchase/landed cost + supplier.
      // - If not found: create a new product with the bill quantity.
      // - Convert case/box/bulk qty to total pieces using piecesPerCase.
      const storeApi = useStore.getState();
      const billRef = `GST bill ${upload.supplierInvoiceNo || id.slice(-6)} approved`;

      for (const it of approvedItems) {
        try {
          const rawQty = Number(it.qty) || 0;
          // 2. Quantity rule — convert non-piece units into pieces.
          const ppc = Math.max(1, Number(it.piecesPerCase) || 1);
          const isMultiPack =
            it.unitType === "case" ||
            it.unitType === "box" ||
            it.unitType === "tin";
          const totalPieces = Math.max(
            0,
            Math.round(isMultiPack ? rawQty * ppc : rawQty)
          );
          const purchasePrice = Number(it.unitPrice) || 0;
          // landed cost per piece — derive from line total when available
          const landedPerPiece =
            totalPieces > 0 && it.lineTotal > 0
              ? Number((it.lineTotal / totalPieces).toFixed(4))
              : isMultiPack && ppc > 0
              ? Number((purchasePrice / ppc).toFixed(4))
              : purchasePrice;

          if (totalPieces <= 0) {
            invFailures.push({
              name: it.description || "item",
              reason: "qty is 0",
            });
            continue;
          }

          // Resolve target product:
          //  1) explicit match → matchedProductId
          //  2) auto-match by barcode (case-insensitive)
          //  3) auto-match by exact name (case-insensitive)
          let targetId = it.matchedProductId ?? null;
          const products = storeApi.products;
          if (!targetId && it.productAction !== "create") {
            const bc = (it.newProductBarcode ?? "").trim().toLowerCase();
            if (bc) {
              const m = products.find(
                (p) => (p.barcode ?? "").trim().toLowerCase() === bc
              );
              if (m) targetId = m.id;
            }
            if (!targetId) {
              const nm = (
                it.newProductName ||
                it.description ||
                ""
              )
                .trim()
                .toLowerCase();
              if (nm) {
                const m = products.find(
                  (p) => (p.name ?? "").trim().toLowerCase() === nm
                );
                if (m) targetId = m.id;
              }
            }
          }

          if (targetId && it.productAction !== "create") {
            // 4. Update existing product
            storeApi.adjustStock(targetId, totalPieces, billRef, {
              purchaseDate: new Date().toISOString().slice(0, 10),
            });
            const patch: Record<string, unknown> = {};
            if (purchasePrice > 0) patch.purchasePrice = purchasePrice;
            if (upload.supplierId) patch.supplierId = upload.supplierId;
            if (it.gstApplicable !== undefined)
              patch.gstApplicable = it.gstApplicable;
            if (Object.keys(patch).length > 0) {
              storeApi.updateProduct(
                targetId,
                patch as Partial<typeof products[number]>
              );
            }
            invSuccess++;
          } else {
            // 3. Create new product
            const name = (it.newProductName || it.description || "").trim();
            if (!name) {
              invFailures.push({
                name: it.description || "item",
                reason: "missing product name",
              });
              continue;
            }
            const perPiecePrice =
              isMultiPack && ppc > 0 ? Number((purchasePrice / ppc).toFixed(4)) : purchasePrice;
            storeApi.addProduct({
              name,
              barcode: (it.newProductBarcode ?? "").trim(),
              category: (it.newProductCategory ?? "").trim(),
              supplierId: it.newSupplierId ?? upload.supplierId ?? "",
              purchasePrice: perPiecePrice,
              sellingPrice:
                perPiecePrice > 0
                  ? Number((perPiecePrice * 1.15).toFixed(2))
                  : 0,
              marginPct: 15,
              unit: (it.unitType as UnitType | null) ?? "piece",
              piecesPerCase: ppc,
              stockPieces: totalPieces,
              reorderLevel: 0,
              boatFee: 0,
              otherCost: 0,
              gstApplicable: it.gstApplicable ?? true,
            });
            invSuccess++;
          }

          console.log("[gst.approve] inventory updated", {
            description: it.description,
            totalPieces,
            unitType: it.unitType,
            piecesPerCase: ppc,
            landedPerPiece,
            target: targetId ?? "(new)",
          });
        } catch (e) {
          console.error("[gst.approve] item failed", it.description, e);
          invFailures.push({
            name: it.description || "item",
            reason: (e as Error).message ?? "unknown error",
          });
        }
      }
    }

    // 7. If any inventory item failed, surface a clear error and DO NOT mark
    // the upload as approved — leave it pending so admin can retry.
    if (invFailures.length > 0) {
      // Roll back the report row so we don't leave an orphan.
      await supabase.from("gst_purchase_reports").delete().eq("id", reportId);
      const lines = invFailures
        .slice(0, 4)
        .map((f) => `• ${f.name}: ${f.reason}`)
        .join("\n");
      toast.error(
        `Inventory update failed for ${invFailures.length} item(s). Bill NOT approved.\n${lines}`
      );
      console.error("[gst.approve] inventory failures", invFailures);
      return false;
    }

    const { error: statusErr } = await supabase
      .from("supplier_bill_uploads")
      .update({
        status: "approved",
        approved_by: uid,
        approved_at: approvedAt,
        correction_note: null,
      })
      .eq("id", id);
    if (statusErr) {
      console.error("[supplier_bill_uploads] approve update error", statusErr);
      toast.error("Could not mark bill approved: " + statusErr.message);
      return false;
    }
    await supabase.from("supplier_bill_approvals").insert({
      upload_id: id,
      action: "approved",
      reason: notes ?? null,
      acted_by: uid,
    });
    await get().load();
    toast.success(
      `Bill approved and inventory updated successfully · ${invSuccess} item(s)`
    );
    return true;
  },
  rejectUpload: async (id, reason) => {
    if (!isSupabaseConfigured) return false;
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id ?? null;
    const { error } = await supabase
      .from("supplier_bill_uploads")
      .update({
        status: "rejected",
        rejected_reason: reason,
        approved_by: uid,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      toast.error("Reject failed: " + error.message);
      return false;
    }
    await supabase.from("supplier_bill_approvals").insert({
      upload_id: id,
      action: "rejected",
      reason,
      acted_by: uid,
    });
    await get().load();
    toast.success("Bill rejected");
    return true;
  },
  requestCorrection: async (id, note) => {
    if (!isSupabaseConfigured) return false;
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id ?? null;
    const { error } = await supabase
      .from("supplier_bill_uploads")
      .update({
        status: "needs_correction",
        correction_note: note,
      })
      .eq("id", id);
    if (error) {
      toast.error("Could not request correction: " + error.message);
      return false;
    }
    await supabase.from("supplier_bill_approvals").insert({
      upload_id: id,
      action: "reopened",
      reason: note,
      acted_by: uid,
    });
    await get().load();
    toast.success("Sent back for correction");
    return true;
  },
  updateUploadTaxableActivityNo: async (id, value) => {
    if (!isSupabaseConfigured) return false;
    const trimmed = value.trim();
    set({
      uploads: get().uploads.map((u) =>
        u.id === id ? { ...u, taxableActivityNo: trimmed } : u
      ),
    });
    const { error } = await supabase
      .from("supplier_bill_uploads")
      .update({ taxable_activity_no: trimmed })
      .eq("id", id);
    if (error) {
      console.error("[supplier_bill_uploads] update tin error", error);
      toast.error("Could not save: " + error.message);
      await get().load();
      return false;
    }
    return true;
  },
  updateReportTaxableActivityNo: async (id, value) => {
    if (!isSupabaseConfigured) return false;
    const trimmed = value.trim();
    set({
      reports: get().reports.map((r) =>
        r.id === id ? { ...r, taxableActivityNo: trimmed } : r
      ),
    });
    const { error } = await supabase
      .from("gst_purchase_reports")
      .update({ taxable_activity_no: trimmed })
      .eq("id", id);
    if (error) {
      console.error("[gst_purchase_reports] update tin error", error);
      toast.error("Could not save: " + error.message);
      await get().load();
      return false;
    }
    return true;
  },
  removeUpload: async (id) => {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase
      .from("supplier_bill_uploads")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Delete failed: " + error.message);
      return;
    }
    set({ uploads: get().uploads.filter((u) => u.id !== id) });
  },
}));
