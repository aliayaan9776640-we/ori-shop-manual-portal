import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStore, useCurrentUser } from "@/lib/store";
import { useSettings } from "@/lib/settings";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  useGstPurchaseReport,
  type SupplierBillUpload,
  type SupplierBillItem,
  type BillStatus,
} from "@/lib/gstPurchaseReport";
import type { UnitType } from "@/lib/types";
import {
  extractBillFromFile,
  extractBillFromText,
  fileToDataUrl,
  type ExtractedBill,
} from "@/lib/billOcr";
import {
  AlertTriangle,
  Upload,
  Trash2,
  Check,
  X,
  Printer,
  FileSpreadsheet,
  FileText,
  Eye,
  RefreshCw,
  Sparkles,
  Loader2,
  Pencil,
  PackagePlus,
  Send as SendIcon,
  PackageSearch,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const GST_PERCENT_LABEL = 8;

// Strip packing/parenthetical text and noise from a raw bill line so it can
// be used as a clean product name. Examples:
//   "TEZ GLASS 90G (1 case / 2 box=6 doz.) (1 Doz.=12 btl.)" → "TEZ GLASS 90G"
//   "COCA COLA 330ML [PACK OF 24]" → "COCA COLA 330ML"
function cleanProductName(raw: string): string {
  if (!raw) return "";
  let s = String(raw);
  // Remove anything inside (...) or [...] or {...}, repeatedly to handle nesting.
  for (let i = 0; i < 4; i++) {
    s = s.replace(/\([^()]*\)/g, " ").replace(/\[[^\[\]]*\]/g, " ").replace(/\{[^{}]*\}/g, " ");
  }
  // Remove trailing packing words after a dash/comma if they look like packing.
  s = s.replace(/[\-,;]\s*(?:\d+\s*)?(?:case|box|doz|dozen|btl|bottle|pack|pcs|pieces?|ctn|carton)\b.*$/i, "");
  // Collapse whitespace and trim trailing punctuation.
  s = s.replace(/\s+/g, " ").replace(/[\s,;:.\-]+$/g, "").trim();
  return s;
}

export default function GstPurchaseReport(): JSX.Element {
  const me = useCurrentUser();
  const suppliers = useStore((s) => s.suppliers);
  const taxableActivityNoDefault = useSettings((s) => s.taxableActivityNo ?? "");
  const {
    uploads,
    reports,
    tableMissing,
    load,
    createUpload,
    approveUpload,
    rejectUpload,
    removeUpload,
    requestCorrection,
    submitForApproval,
    updateUpload,
    saveUploadItems,
    updateUploadTaxableActivityNo,
    updateReportTaxableActivityNo,
  } = useGstPurchaseReport();
  const products = useStore((s) => s.products);

  const [tab, setTab] = useState<"pending" | "approved">("approved");
  const [showAll, setShowAll] = useState<boolean>(true);
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Form state — exactly the 7 official fields.
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [supplierTin, setSupplierTin] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [invoiceTotalExclGst, setInvoiceTotalExclGst] = useState<number>(0);
  const [gstCharged, setGstCharged] = useState<number>(0);
  const [taxableActivityNo, setTaxableActivityNo] = useState<string>(
    taxableActivityNoDefault
  );

  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileMime, setFileMime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // OCR / AI extraction state
  const [ocrLoading, setOcrLoading] = useState<boolean>(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [ocrRawText, setOcrRawText] = useState<string>("");
  const [ocrNotes, setOcrNotes] = useState<string>("");
  const [extractedItems, setExtractedItems] = useState<SupplierBillItem[]>([]);
  const [reviewStatus, setReviewStatus] = useState<
    "idle" | "extracted" | "pending-review"
  >("idle");
  const [pasteText, setPasteText] = useState<string>("");
  const [ocrSource, setOcrSource] = useState<"ai" | "paste" | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewing, setPreviewing] = useState<SupplierBillUpload | null>(null);
  const [previewItems, setPreviewItems] = useState<SupplierBillItem[]>([]);
  const [reviewing, setReviewing] = useState<SupplierBillUpload | null>(null);
  const [reviewItems, setReviewItems] = useState<SupplierBillItem[]>([]);
  const [reviewBusy, setReviewBusy] = useState<boolean>(false);
  const [editing, setEditing] = useState<SupplierBillUpload | null>(null);
  const [editForm, setEditForm] = useState<Partial<SupplierBillUpload>>({});
  const [editItems, setEditItems] = useState<SupplierBillItem[]>([]);
  const [editBusy, setEditBusy] = useState<boolean>(false);

  const isAdmin = me?.role === "admin";
  const canUpload = me?.role === "admin" || me?.role === "storekeeper";

  useEffect(() => {
    void load();
  }, [load]);

  const loadUploadItems = useGstPurchaseReport((s) => s.loadUploadItems);
  useEffect(() => {
    if (!previewing) {
      setPreviewItems([]);
      return;
    }
    void loadUploadItems(previewing.id).then(setPreviewItems);
  }, [previewing, loadUploadItems]);

  useEffect(() => {
    setTaxableActivityNo((prev) => (prev ? prev : taxableActivityNoDefault));
  }, [taxableActivityNoDefault]);

  const fromMs = new Date(from + "T00:00:00").getTime();
  const toMs = new Date(to + "T23:59:59").getTime();

  const filteredReports = useMemo(() => {
    if (showAll) return reports;
    return reports.filter((r) => {
      const t = new Date(r.invoiceDate).getTime();
      return t >= fromMs && t <= toMs;
    });
  }, [reports, fromMs, toMs, showAll]);

  const filteredPending = useMemo(() => {
    return uploads.filter((u) => {
      if (u.status === "approved" || u.status === "rejected") return false;
      if (showAll || !u.invoiceDate) return true;
      const t = new Date(u.invoiceDate).getTime();
      return t >= fromMs && t <= toMs;
    });
  }, [uploads, fromMs, toMs, showAll]);

  const totals = useMemo(() => {
    let totalExcl = 0;
    let gst = 0;
    filteredReports.forEach((r) => {
      totalExcl += r.invoiceTotalExclGst;
      gst += r.gstCharged;
    });
    return {
      totalExcl,
      gst,
      grand: totalExcl + gst,
      count: filteredReports.length,
    };
  }, [filteredReports]);

  const resetForm = (): void => {
    setSupplierId("");
    setSupplierTin("");
    setSupplierName("");
    setSupplierInvoiceNo("");
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setInvoiceTotalExclGst(0);
    setGstCharged(0);
    setTaxableActivityNo(taxableActivityNoDefault);
    setFileUrl(null);
    setFileName(null);
    setFileMime(null);
    setNotes("");
    setOcrLoading(false);
    setOcrError(null);
    setOcrConfidence(null);
    setOcrRawText("");
    setOcrNotes("");
    setExtractedItems([]);
    setReviewStatus("idle");
    setPasteText("");
    setOcrSource(null);
  };

  const applyExtracted = (e: ExtractedBill): void => {
    if (e.supplierTin) setSupplierTin(e.supplierTin);
    if (e.supplierName) setSupplierName(e.supplierName);
    if (e.supplierInvoiceNo) setSupplierInvoiceNo(e.supplierInvoiceNo);
    if (e.invoiceDate) setInvoiceDate(e.invoiceDate);
    if (e.invoiceTotalExclGst > 0) setInvoiceTotalExclGst(e.invoiceTotalExclGst);
    if (e.gstCharged > 0) setGstCharged(e.gstCharged);
    if (e.taxableActivityNo) setTaxableActivityNo(e.taxableActivityNo);
    setOcrConfidence(e.confidence);
    setOcrRawText(e.rawText);
    setOcrNotes(e.notes);
    setExtractedItems(
      e.items.map((it) => ({
        description: it.description,
        qty: it.qty,
        unitPrice: it.unitPrice,
        lineTotal: it.lineTotal,
        source: "ocr",
        ocrConfidence: e.confidence,
      }))
    );
    setReviewStatus("pending-review");
  };

  const runExtraction = async (
    file: File,
    dataUrl: string
  ): Promise<void> => {
    console.log("[gst-ocr] starting extraction", {
      name: file.name,
      type: file.type,
      size: file.size,
    });
    setOcrLoading(true);
    setOcrError(null);
    const r = await extractBillFromFile({ file, dataUrl });
    setOcrLoading(false);
    if (!r.ok || !r.data) {
      console.warn("[gst-ocr] extraction failed", r.error);
      const msg = r.error ?? "AI extraction failed";
      setOcrError(
        msg +
          " — OCR/AI is not available in this preview. Use the 'Paste bill text' fallback below or fill the form manually."
      );
      toast.error("OCR not available — use paste-text fallback");
      return;
    }
    console.log("[gst-ocr] extraction result", r.data);
    setOcrSource("ai");
    applyExtracted(r.data);
    toast.success(
      `AI extracted bill (${Math.round((r.data.confidence ?? 0) * 100)}% confidence) — please review`
    );
  };

  const runPasteExtraction = (): void => {
    const text = pasteText.trim();
    if (!text) {
      toast.error("Paste the bill text first");
      return;
    }
    console.log("[gst-ocr] parsing pasted text", { length: text.length });
    setOcrError(null);
    try {
      const data = extractBillFromText(text);
      console.log("[gst-ocr] paste parse result", data);
      setOcrSource("paste");
      applyExtracted(data);
      toast.success(
        `Parsed ${Math.round((data.confidence ?? 0) * 100)}% of fields — review before submitting`
      );
    } catch (e) {
      console.error("[gst-ocr] paste parse error", e);
      const msg = e instanceof Error ? e.message : String(e);
      setOcrError("Could not parse pasted text: " + msg);
      toast.error("Could not parse pasted text");
    }
  };

  const handleFile = async (f: File): Promise<void> => {
    console.log("[gst-ocr] file selected", {
      name: f.name,
      type: f.type,
      size: f.size,
    });
    try {
      const dataUrl = await fileToDataUrl(f);
      setFileUrl(dataUrl);
      setFileName(f.name);
      setFileMime(f.type || null);
      toast.success(`Attached ${f.name} — reading with AI…`);
      void runExtraction(f, dataUrl);
    } catch (e) {
      console.error("[gst-ocr] file read error", e);
      toast.error(
        "Could not read file: " +
          (e instanceof Error ? e.message : String(e))
      );
    }
  };

  const reRunExtraction = async (): Promise<void> => {
    if (!fileUrl || !fileName) return;
    // Rebuild a File-like for the extractor from the data URL.
    try {
      const res = await fetch(fileUrl);
      const blob = await res.blob();
      const file = new File([blob], fileName, {
        type: fileMime ?? blob.type ?? "application/octet-stream",
      });
      await runExtraction(file, fileUrl);
    } catch (e) {
      toast.error(
        "Could not re-run AI: " + (e instanceof Error ? e.message : String(e))
      );
    }
  };

  const autoCalcGst = (): void => {
    const calc = Number(((invoiceTotalExclGst * GST_PERCENT_LABEL) / 100).toFixed(2));
    setGstCharged(calc);
    toast.success(`GST auto-calculated at ${GST_PERCENT_LABEL}%`);
  };

  const submit = async (asDraft: boolean): Promise<void> => {
    if (!canUpload) return;
    if (!supplierName.trim()) {
      toast.error("Supplier Name is required");
      return;
    }
    if (!supplierInvoiceNo.trim()) {
      toast.error("Supplier Invoice Number is required");
      return;
    }
    if (!invoiceDate) {
      toast.error("Invoice Date is required");
      return;
    }
    if (invoiceTotalExclGst <= 0) {
      toast.error("Invoice Total (excl. GST) must be greater than 0");
      return;
    }
    if (gstCharged < 0) {
      toast.error("GST cannot be negative");
      return;
    }
    setSaving(true);
    const r = await createUpload({
      supplierId: supplierId || null,
      supplierTin: supplierTin.trim(),
      supplierName: supplierName.trim(),
      supplierInvoiceNo: supplierInvoiceNo.trim(),
      invoiceDate,
      invoiceTotalExclGst,
      gstCharged,
      taxableActivityNo: taxableActivityNo.trim(),
      fileUrl,
      fileName,
      notes: notes || null,
      rawText: ocrRawText || null,
      ocrConfidence: ocrConfidence,
      ocrModel: ocrConfidence != null ? "rork-toolkit-llm" : null,
      ocrExtractedAt: ocrConfidence != null ? new Date().toISOString() : null,
      ocrNotes: ocrNotes || null,
      items: extractedItems,
      status: asDraft ? "draft" : "pending",
    });
    setSaving(false);
    if (r.ok) {
      toast.success(
        asDraft
          ? "Saved as draft"
          : "Bill uploaded and queued for admin approval"
      );
      setOpen(false);
      resetForm();
    }
  };

  const openReview = async (u: SupplierBillUpload): Promise<void> => {
    if (!isAdmin) return;
    const items = await useGstPurchaseReport
      .getState()
      .loadUploadItems(u.id);
    // Hydrate decisions: default each item to 'approved' to make admin's job
    // a one-click confirm if the OCR matched well.
    setReviewItems(
      items.map((it) => {
        const action = it.productAction ?? (it.matchedProductId ? "match" : "create");
        const autoName =
          action === "create" && !(it.newProductName ?? "").trim()
            ? cleanProductName(it.description ?? "")
            : it.newProductName;
        return {
          ...it,
          decision: it.decision ?? "approved",
          productAction: action,
          newProductName: autoName,
          gstApplicable: it.gstApplicable ?? true,
          unitType: it.unitType ?? "piece",
          piecesPerCase: it.piecesPerCase ?? 1,
        };
      })
    );
    setReviewing(u);
  };

  const reject = async (id: string): Promise<void> => {
    if (!isAdmin) return;
    const reason = window.prompt("Reason for rejection?") ?? "";
    if (!reason.trim()) return;
    await rejectUpload(id, reason);
  };

  const sendBackForCorrection = async (id: string): Promise<void> => {
    if (!isAdmin) return;
    const note = window.prompt("What needs to be corrected?") ?? "";
    if (!note.trim()) return;
    await requestCorrection(id, note);
  };

  const openEdit = async (u: SupplierBillUpload): Promise<void> => {
    setEditForm({
      supplierTin: u.supplierTin,
      supplierName: u.supplierName,
      supplierInvoiceNo: u.supplierInvoiceNo,
      invoiceDate: u.invoiceDate,
      invoiceTotalExclGst: u.invoiceTotalExclGst,
      gstCharged: u.gstCharged,
      taxableActivityNo: u.taxableActivityNo,
      notes: u.notes,
    });
    const items = await useGstPurchaseReport.getState().loadUploadItems(u.id);
    setEditItems(items);
    setEditing(u);
  };

  const saveEdit = async (): Promise<void> => {
    if (!editing) return;
    setEditBusy(true);
    const ok1 = await updateUpload(editing.id, {
      supplierTin: (editForm.supplierTin ?? "").trim(),
      supplierName: (editForm.supplierName ?? "").trim(),
      supplierInvoiceNo: (editForm.supplierInvoiceNo ?? "").trim(),
      invoiceDate: editForm.invoiceDate ?? null,
      invoiceTotalExclGst: Number(editForm.invoiceTotalExclGst ?? 0),
      gstCharged: Number(editForm.gstCharged ?? 0),
      taxableActivityNo: (editForm.taxableActivityNo ?? "").trim(),
      notes: editForm.notes ?? null,
    });
    const ok2 = await saveUploadItems(editing.id, editItems);
    setEditBusy(false);
    if (ok1 && ok2) {
      toast.success("Saved");
      setEditing(null);
    }
  };

  const submitDraft = async (id: string): Promise<void> => {
    await submitForApproval(id);
  };

  // ---------- Exports ----------
  const HEADERS: string[] = [
    "Supplier TIN",
    "Supplier Name",
    "Supplier Invoice Number",
    "Invoice Date",
    "Invoice Total (excl. GST)",
    `GST Charged at ${GST_PERCENT_LABEL}%`,
    "Your Taxable Activity Number",
  ];

  const exportExcel = (): void => {
    const sheetData: (string | number)[][] = [HEADERS];
    filteredReports.forEach((r) => {
      sheetData.push([
        r.supplierTin,
        r.supplierName,
        r.supplierInvoiceNo,
        r.invoiceDate,
        r.invoiceTotalExclGst,
        r.gstCharged,
        r.taxableActivityNo,
      ]);
    });
    sheetData.push([
      "",
      "",
      "",
      "TOTAL",
      totals.totalExcl,
      totals.gst,
      "",
    ]);
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "GST Purchases");
    XLSX.writeFile(wb, `gst-purchase-report-${from}-to-${to}.xlsx`);
  };

  const buildPrintableHtml = (): string => {
    const rowsHtml = filteredReports
      .map(
        (r) => `
      <tr>
        <td>${escapeHtml(r.supplierTin)}</td>
        <td>${escapeHtml(r.supplierName)}</td>
        <td>${escapeHtml(r.supplierInvoiceNo)}</td>
        <td>${formatDate(r.invoiceDate)}</td>
        <td style="text-align:right">${r.invoiceTotalExclGst.toFixed(2)}</td>
        <td style="text-align:right">${r.gstCharged.toFixed(2)}</td>
        <td>${escapeHtml(r.taxableActivityNo)}</td>
      </tr>`
      )
      .join("");
    return `<!doctype html><html><head><meta charset="utf-8"/>
      <title>GST Purchase Report</title>
      <style>
        body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;color:#0f172a}
        h1{margin:0 0 4px;font-size:20px}
        .meta{color:#475569;font-size:12px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #cbd5e1;padding:6px 8px;vertical-align:top}
        th{background:#f1f5f9;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.04em}
        tfoot td{font-weight:bold;background:#fef3c7}
      </style></head><body>
      <h1>GST Purchase Report</h1>
      <div class="meta">Period: ${formatDate(from)} → ${formatDate(to)} · Generated ${new Date().toLocaleString()}</div>
      <table>
        <thead><tr>${HEADERS.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="${HEADERS.length}" style="text-align:center;padding:18px">No records.</td></tr>`}</tbody>
        <tfoot><tr>
          <td colspan="4">TOTAL · ${totals.count} invoice(s)</td>
          <td style="text-align:right">${totals.totalExcl.toFixed(2)}</td>
          <td style="text-align:right">${totals.gst.toFixed(2)}</td>
          <td></td>
        </tr></tfoot>
      </table>
    </body></html>`;
  };

  const printReport = (): void => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(buildPrintableHtml());
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  const exportPdf = (): void => {
    const blob = new Blob([buildPrintableHtml()], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gst-purchase-report-${from}-to-${to}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.info("HTML downloaded — open it and Print → Save as PDF");
  };

  if (me?.role === "cashier") {
    return (
      <>
        <PageHeader title="GST Purchase Report" />
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
          You don't have access to this section.
        </div>
      </>
    );
  }

  return (
    <div className="min-w-0 max-w-full">
      {tableMissing && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-900 shadow-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div className="text-sm">
            <div className="font-bold">GST Purchase Report tables/columns are missing</div>
            <div className="mt-0.5">
              Run these migration files in the Supabase SQL editor:{" "}
              <code className="rounded bg-rose-100 px-1">
                web/supabase/migrations/0010_gst_purchase_report.sql
              </code>{" "}
              then{" "}
              <code className="rounded bg-rose-100 px-1">
                web/supabase/migrations/0011_gst_report_fields.sql
              </code>
              .
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="GST Purchase Report"
        description="Capture supplier invoices using the 7 official GST fields, approve, and export the GST purchase ledger."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => { void load(); }}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            {canUpload && (
              <Button
                onClick={() => {
                  resetForm();
                  setOpen(true);
                }}
                className="gap-2"
              >
                <Upload className="h-4 w-4" /> Upload Bill
              </Button>
            )}
          </>
        }
      />

      {/* Filters */}
      <div className="mb-5 grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={from}
            disabled={showAll}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={to}
            disabled={showAll}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            Show all dates
          </label>
        </div>
        <div className="col-span-1 flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-1">
          <Button onClick={printReport} variant="outline" className="gap-2">
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button onClick={exportPdf} variant="outline" className="gap-2">
            <FileText className="h-4 w-4" /> PDF
          </Button>
          <Button onClick={exportExcel} variant="outline" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Approved Invoices" value={String(totals.count)} />
        <Tile label="Total (excl. GST)" value={formatCurrency(totals.totalExcl)} />
        <Tile label={`GST at ${GST_PERCENT_LABEL}%`} value={formatCurrency(totals.gst)} tone="primary" />
        <Tile label="Grand Total" value={formatCurrency(totals.grand)} />
      </div>

      {/* Tabs */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setTab("pending")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            tab === "pending"
              ? "bg-amber-500 text-white"
              : "bg-secondary text-secondary-foreground"
          }`}
        >
          Pending Approvals ({filteredPending.length})
        </button>
        <button
          onClick={() => setTab("approved")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            tab === "approved"
              ? "bg-emerald-600 text-white"
              : "bg-secondary text-secondary-foreground"
          }`}
        >
          Approved ({filteredReports.length})
        </button>
      </div>

      {/* Pending */}
      {tab === "pending" && (
        <div className="max-w-full overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="min-w-[820px] w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Supplier TIN</th>
                <th className="px-3 py-2 text-left">Supplier Name</th>
                <th className="px-3 py-2 text-left">Invoice No</th>
                <th className="px-3 py-2 text-left">Invoice Date</th>
                <th className="px-3 py-2 text-right">Total (excl. GST)</th>
                <th className="px-3 py-2 text-right">GST {GST_PERCENT_LABEL}%</th>
                <th className="px-3 py-2 text-left">Taxable Activity No</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPending.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-muted-foreground">
                    No pending invoices.
                  </td>
                </tr>
              ) : (
                filteredPending.map((u) => (
                  <tr key={u.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-3 py-2"><StatusBadge status={u.status} /></td>
                    <td className="px-3 py-2">{u.supplierTin || "—"}</td>
                    <td className="px-3 py-2 font-medium break-words max-w-[220px]">{u.supplierName}</td>
                    <td className="px-3 py-2 break-words max-w-[180px]">{u.supplierInvoiceNo || "—"}</td>
                    <td className="px-3 py-2">
                      {u.invoiceDate ? formatDate(u.invoiceDate) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatCurrency(u.invoiceTotalExclGst)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatCurrency(u.gstCharged)}
                    </td>
                    <td className="px-3 py-2">
                      <EditableTin
                        value={u.taxableActivityNo}
                        onSave={(v) => { void updateUploadTaxableActivityNo(u.id, v); }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPreviewing(u)}
                          className="gap-1"
                          title="Preview"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {canUpload &&
                          (u.status === "draft" ||
                            u.status === "pending" ||
                            u.status === "needs_correction") && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { void openEdit(u); }}
                              className="gap-1"
                              title="Edit bill"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        {canUpload && !isAdmin &&
                          (u.status === "draft" ||
                            u.status === "needs_correction") && (
                            <Button
                              size="sm"
                              onClick={() => { void submitDraft(u.id); }}
                              className="gap-1 bg-amber-500 text-white hover:bg-amber-600"
                              title="Submit for admin approval"
                            >
                              <SendIcon className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        {isAdmin && u.status !== "rejected" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => { void openReview(u); }}
                              className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                              title="Review & approve"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { void sendBackForCorrection(u.id); }}
                              className="gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                              title="Request correction"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { void reject(u.id); }}
                              className="gap-1 border-rose-300 text-rose-700 hover:bg-rose-50"
                              title="Reject"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {canUpload && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { void removeUpload(u.id); }}
                            className="gap-1 text-destructive hover:bg-destructive/10"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
      )}

      {/* Approved */}
      {tab === "approved" && (
        <div className="max-w-full overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="min-w-[820px] w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Supplier TIN</th>
                <th className="px-3 py-2 text-left">Supplier Name</th>
                <th className="px-3 py-2 text-left">Supplier Invoice Number</th>
                <th className="px-3 py-2 text-left">Invoice Date</th>
                <th className="px-3 py-2 text-right">Invoice Total (excl. GST)</th>
                <th className="px-3 py-2 text-right">GST Charged at {GST_PERCENT_LABEL}%</th>
                <th className="px-3 py-2 text-left">Your Taxable Activity Number</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">
                    {reports.length === 0
                      ? "No approved invoices yet. Upload an invoice, then approve it from the Pending Approvals tab."
                      : "No approved invoices in this period. Try widening the date range or enable 'Show all dates'."}
                  </td>
                </tr>
              ) : (
                filteredReports.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-3 py-2">{r.supplierTin || "—"}</td>
                    <td className="px-3 py-2 font-medium break-words max-w-[220px]">{r.supplierName}</td>
                    <td className="px-3 py-2 break-words max-w-[180px]">{r.supplierInvoiceNo || "—"}</td>
                    <td className="px-3 py-2">{formatDate(r.invoiceDate)}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatCurrency(r.invoiceTotalExclGst)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatCurrency(r.gstCharged)}
                    </td>
                    <td className="px-3 py-2">
                      <EditableTin
                        value={r.taxableActivityNo}
                        onSave={(v) => { void updateReportTaxableActivityNo(r.id, v); }}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredReports.length > 0 && (
              <tfoot className="bg-amber-50 text-sm font-semibold">
                <tr>
                  <td className="px-3 py-2" colSpan={4}>
                    TOTAL · {totals.count} invoice(s)
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatCurrency(totals.totalExcl)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatCurrency(totals.gst)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Upload Dialog — exactly the 7 fields */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetForm();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload Supplier Invoice</DialogTitle>
          </DialogHeader>
          <div className="min-w-0 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs">Pick from saved suppliers (optional)</Label>
                <select
                  value={supplierId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSupplierId(id);
                    const s = suppliers.find((x) => x.id === id);
                    if (s) {
                      setSupplierName(s.name);
                      const tin = (s as { tin?: string | null }).tin;
                      if (tin) setSupplierTin(tin);
                    }
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">— Select supplier —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 1. Supplier TIN */}
              <div>
                <Label className="text-xs">1. Supplier TIN</Label>
                <Input
                  value={supplierTin}
                  onChange={(e) => setSupplierTin(e.target.value)}
                  placeholder="e.g. 12-345-678"
                />
              </div>

              {/* 2. Supplier Name */}
              <div>
                <Label className="text-xs">2. Supplier Name</Label>
                <Input
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="As printed on the invoice"
                />
              </div>

              {/* 3. Supplier Invoice Number */}
              <div>
                <Label className="text-xs">3. Supplier Invoice Number</Label>
                <Input
                  value={supplierInvoiceNo}
                  onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                  placeholder="Invoice / Bill No"
                />
              </div>

              {/* 4. Invoice Date */}
              <div>
                <Label className="text-xs">4. Invoice Date</Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>

              {/* 5. Invoice Total (excluding GST) */}
              <div>
                <Label className="text-xs">5. Invoice Total (excluding GST)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={invoiceTotalExclGst}
                  onChange={(e) => setInvoiceTotalExclGst(Number(e.target.value))}
                />
              </div>

              {/* 6. GST Charged at 8% */}
              <div>
                <Label className="text-xs">6. GST Charged at {GST_PERCENT_LABEL}%</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={gstCharged}
                    onChange={(e) => setGstCharged(Number(e.target.value))}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={autoCalcGst}
                    title={`Auto-calculate ${GST_PERCENT_LABEL}% of invoice total`}
                  >
                    {GST_PERCENT_LABEL}%
                  </Button>
                </div>
              </div>

              {/* 7. Your Taxable Activity Number */}
              <div className="sm:col-span-2">
                <Label className="text-xs">7. Your Taxable Activity Number</Label>
                <Input
                  value={taxableActivityNo}
                  onChange={(e) => setTaxableActivityNo(e.target.value)}
                  placeholder="Your business taxable activity number"
                />
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="flex items-center gap-2 text-xs font-semibold">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Bill File / Photo — AI auto-fills the form
                </Label>
                {fileUrl && !ocrLoading && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => { void reRunExtraction(); }}
                  >
                    <RefreshCw className="h-3 w-3" /> Re-run AI
                  </Button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/*
                  Reliable upload pattern: the native <input type="file"> is
                  rendered transparently on TOP of the visible button so the
                  user's click goes directly to the input. This avoids issues
                  with Radix Dialog focus traps, sr-only positioning, or
                  preview iframes that swallow programmatic .click() calls.
                */}
                <div className="relative inline-flex">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1 pointer-events-none"
                    disabled={ocrLoading}
                    tabIndex={-1}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {fileName ? "Replace bill file" : "Choose bill (PDF / image)"}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    aria-label="Choose supplier bill file"
                    title="Choose supplier bill file"
                    disabled={ocrLoading}
                    className="absolute inset-0 z-10 cursor-pointer opacity-0"
                    style={{ fontSize: 0 }}
                    onClick={() => {
                      console.log("[gst-ocr] file input clicked (native)");
                    }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      console.log("[gst-ocr] input change", {
                        hasFile: !!f,
                        name: f?.name,
                        type: f?.type,
                        size: f?.size,
                      });
                      if (f) void handleFile(f);
                      // Reset so re-uploading the same file fires onChange again.
                      e.target.value = "";
                    }}
                  />
                </div>
                {fileName && (
                  <span className="block max-w-full truncate break-all text-xs text-muted-foreground">
                    {fileName}
                  </span>
                )}
              </div>
              {ocrLoading && (
                <div className="mt-2 flex items-center gap-2 text-xs text-primary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Reading bill…
                </div>
              )}
              {ocrError && !ocrLoading && (
                <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-800 break-words">
                  {ocrError}
                </div>
              )}

              {/* Paste-text fallback — always available, works when AI/OCR is blocked */}
              <div className="mt-3 rounded-lg border border-border bg-background/60 p-2">
                <Label className="text-[11px] font-semibold">
                  Or paste bill text here (works when OCR is unavailable)
                </Label>
                <Textarea
                  rows={4}
                  className="mt-1 text-xs"
                  placeholder={
                    "Paste the bill text. Examples:\n" +
                    "Supplier: Acme Trading Ltd\n" +
                    "TIN: 12345678\n" +
                    "Invoice No: INV-2025-0421\n" +
                    "Date: 12/03/2026\n" +
                    "Subtotal: 1000.00\n" +
                    "GST 8%: 80.00\n" +
                    "Taxable Activity No: TAN-7788"
                  }
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    Parser runs locally — no upload required.
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 gap-1 text-xs"
                    onClick={runPasteExtraction}
                  >
                    <Sparkles className="h-3 w-3" /> Extract from pasted text
                  </Button>
                </div>
              </div>
              {!ocrLoading && ocrConfidence != null && (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
                        ocrConfidence >= 0.8
                          ? "bg-emerald-100 text-emerald-800"
                          : ocrConfidence >= 0.5
                          ? "bg-amber-100 text-amber-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      <Sparkles className="h-3 w-3" />
                      {ocrSource === "paste" ? "Paste" : "AI"} confidence: {Math.round(ocrConfidence * 100)}%
                    </span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
                      Status: Pending Review
                    </span>
                    <span className="text-muted-foreground">
                      AI can make mistakes — review every field before submitting.
                    </span>
                  </div>
                  {ocrNotes && (
                    <div className="text-xs italic text-muted-foreground">
                      AI notes: {ocrNotes}
                    </div>
                  )}
                </div>
              )}
            </div>

            {extractedItems.length > 0 && (
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <div className="text-xs font-semibold">
                    Extracted Line Items ({extractedItems.length})
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Editable — not added to inventory automatically
                  </div>
                </div>
                <div className="max-h-56 max-w-full overflow-auto">
                  <table className="min-w-[520px] w-full text-xs">
                    <thead className="bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Item</th>
                        <th className="px-2 py-1.5 text-right">Qty</th>
                        <th className="px-2 py-1.5 text-right">Unit</th>
                        <th className="px-2 py-1.5 text-right">Total</th>
                        <th className="px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {extractedItems.map((it, idx) => (
                        <tr key={idx} className="border-t border-border">
                          <td className="px-2 py-1">
                            <Input
                              className="h-7 text-xs"
                              value={it.description}
                              onChange={(e) => {
                                const v = e.target.value;
                                setExtractedItems((arr) =>
                                  arr.map((x, i) => (i === idx ? { ...x, description: v } : x))
                                );
                              }}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              type="number"
                              step="0.001"
                              className="h-7 w-20 text-right text-xs"
                              value={it.qty}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setExtractedItems((arr) =>
                                  arr.map((x, i) =>
                                    i === idx
                                      ? { ...x, qty: v, lineTotal: Number((v * x.unitPrice).toFixed(2)) }
                                      : x
                                  )
                                );
                              }}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              type="number"
                              step="0.01"
                              className="h-7 w-24 text-right text-xs"
                              value={it.unitPrice}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setExtractedItems((arr) =>
                                  arr.map((x, i) =>
                                    i === idx
                                      ? { ...x, unitPrice: v, lineTotal: Number((x.qty * v).toFixed(2)) }
                                      : x
                                  )
                                );
                              }}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              type="number"
                              step="0.01"
                              className="h-7 w-24 text-right text-xs"
                              value={it.lineTotal}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setExtractedItems((arr) =>
                                  arr.map((x, i) => (i === idx ? { ...x, lineTotal: v } : x))
                                );
                              }}
                            />
                          </td>
                          <td className="px-2 py-1 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive"
                              onClick={() =>
                                setExtractedItems((arr) => arr.filter((_, i) => i !== idx))
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {ocrRawText && (
              <details className="rounded-xl border border-border bg-secondary/20 p-3 text-xs">
                <summary className="cursor-pointer font-semibold">
                  Raw text the AI read (audit) — click to view
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
{ocrRawText}
                </pre>
              </details>
            )}

            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="rounded-xl border border-border bg-secondary/30 p-3 text-xs">
              <div className="font-semibold">Grand total</div>
              <div className="mt-1">
                {formatCurrency(invoiceTotalExclGst + gstCharged)} ={" "}
                {formatCurrency(invoiceTotalExclGst)} (excl. GST) +{" "}
                {formatCurrency(gstCharged)} (GST {GST_PERCENT_LABEL}%)
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => { void submit(true); }}
              disabled={saving}
              className="gap-2"
              title="Save as draft — do not send to admin yet"
            >
              Save as Draft
            </Button>
            <Button
              onClick={() => { void submit(false); }}
              disabled={saving}
              className="gap-2"
            >
              <SendIcon className="h-4 w-4" />
              {saving
                ? "Saving…"
                : reviewStatus === "pending-review"
                ? "Confirm & Submit for Approval"
                : "Submit for Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview / Approval screen */}
      <Dialog open={!!previewing} onOpenChange={(v) => !v && setPreviewing(null)}>

        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="break-words">
              Invoice Preview · {previewing?.supplierName}
            </DialogTitle>
          </DialogHeader>
          {previewing && (
            <div className="min-w-0 space-y-3">
              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <FieldRow label="1. Supplier TIN" value={previewing.supplierTin || "—"} />
                <FieldRow label="2. Supplier Name" value={previewing.supplierName} />
                <FieldRow label="3. Supplier Invoice Number" value={previewing.supplierInvoiceNo || "—"} />
                <FieldRow
                  label="4. Invoice Date"
                  value={previewing.invoiceDate ? formatDate(previewing.invoiceDate) : "—"}
                />
                <FieldRow
                  label="5. Invoice Total (excl. GST)"
                  value={formatCurrency(previewing.invoiceTotalExclGst)}
                />
                <FieldRow
                  label={`6. GST Charged at ${GST_PERCENT_LABEL}%`}
                  value={formatCurrency(previewing.gstCharged)}
                />
                <div className="rounded-lg border border-border bg-card px-3 py-2 sm:col-span-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    7. Your Taxable Activity Number
                  </div>
                  <Input
                    className="mt-1"
                    value={previewing.taxableActivityNo}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPreviewing({ ...previewing, taxableActivityNo: v });
                    }}
                    onBlur={(e) => {
                      void updateUploadTaxableActivityNo(previewing.id, e.target.value);
                    }}
                    placeholder="Your business taxable activity number"
                  />
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Editable — saved on blur. Default from Settings: {taxableActivityNoDefault || "(not set)"}
                  </div>
                </div>
              </div>
              {previewItems.length > 0 && (
                <div className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border px-3 py-2 text-xs font-semibold">
                    Line Items ({previewItems.length})
                    {previewing.ocrConfidence != null && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <Sparkles className="h-3 w-3" />
                        AI {Math.round((previewing.ocrConfidence ?? 0) * 100)}%
                      </span>
                    )}
                  </div>
                  <div className="max-h-48 max-w-full overflow-auto">
                    <table className="min-w-[480px] w-full text-xs">
                      <thead className="bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-2 py-1 text-left">Item</th>
                          <th className="px-2 py-1 text-right">Qty</th>
                          <th className="px-2 py-1 text-right">Unit</th>
                          <th className="px-2 py-1 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewItems.map((it, idx) => (
                          <tr key={idx} className="border-t border-border">
                            <td className="px-2 py-1 break-words max-w-[220px]">{it.description}</td>
                            <td className="px-2 py-1 text-right">{it.qty}</td>
                            <td className="px-2 py-1 text-right">{formatCurrency(it.unitPrice)}</td>
                            <td className="px-2 py-1 text-right">{formatCurrency(it.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {previewing.rawText && (
                <details className="rounded-lg border border-border bg-secondary/20 p-2 text-xs">
                  <summary className="cursor-pointer font-semibold">
                    Raw OCR text (audit)
                  </summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
{previewing.rawText}
                  </pre>
                </details>
              )}
              {previewing.fileUrl && (
                <a
                  href={previewing.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-xs font-medium text-primary hover:underline"
                >
                  Open attached file ({previewing.fileName})
                </a>
              )}
              {isAdmin && previewing.status !== "approved" && previewing.status !== "rejected" && (
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <Button
                    onClick={async () => {
                      const u = previewing;
                      setPreviewing(null);
                      await openReview(u);
                    }}
                    className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <Check className="h-4 w-4" /> Review &amp; Approve
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      await reject(previewing.id);
                      setPreviewing(null);
                    }}
                    className="gap-1 border-rose-300 text-rose-700 hover:bg-rose-50"
                  >
                    <X className="h-4 w-4" /> Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ----- Admin Review & Approve dialog ----- */}
      <Dialog open={!!reviewing} onOpenChange={(v) => !v && setReviewing(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="break-words">
              Review & Approve · {reviewing?.supplierName}
            </DialogTitle>
          </DialogHeader>
          {reviewing && (
            <div className="min-w-0 space-y-3">
              <div className="rounded-xl border border-border bg-secondary/30 p-3 text-xs">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Mini label="Invoice No" value={reviewing.supplierInvoiceNo || "—"} />
                  <Mini
                    label="Invoice Date"
                    value={reviewing.invoiceDate ? formatDate(reviewing.invoiceDate) : "—"}
                  />
                  <Mini
                    label="Total (excl. GST)"
                    value={formatCurrency(reviewing.invoiceTotalExclGst)}
                  />
                  <Mini
                    label={`GST ${GST_PERCENT_LABEL}%`}
                    value={formatCurrency(reviewing.gstCharged)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold">
                  Item lines ({reviewItems.length}) — match each line to a product or create new
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() =>
                      setReviewItems((arr) =>
                        arr.map((x) => ({ ...x, decision: "approved" }))
                      )
                    }
                  >
                    Approve all
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() =>
                      setReviewItems((arr) =>
                        arr.map((x) => ({ ...x, decision: "rejected" }))
                      )
                    }
                  >
                    Reject all
                  </Button>
                </div>
              </div>
              {reviewItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-6 text-center text-xs text-muted-foreground">
                  No item lines were captured for this bill. You can still approve
                  the bill header into the GST report — inventory will not change.
                </div>
              ) : (
                <div className="max-h-[420px] overflow-auto rounded-xl border border-border">
                  <table className="min-w-[820px] w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-secondary/70 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Decision</th>
                        <th className="px-2 py-1.5 text-left">Bill line</th>
                        <th className="px-2 py-1.5 text-right">Qty</th>
                        <th className="px-2 py-1.5 text-right">Unit price</th>
                        <th className="px-2 py-1.5 text-left">Inventory</th>
                        <th className="px-2 py-1.5 text-left">Unit</th>
                        <th className="px-2 py-1.5 text-center">GST</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewItems.map((it, idx) => (
                        <ItemReviewRow
                          key={idx}
                          it={it}
                          products={products}
                          onChange={(patch) =>
                            setReviewItems((arr) =>
                              arr.map((x, i) => (i === idx ? { ...x, ...patch } : x))
                            )
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                <strong>Inventory rule:</strong> only items marked <em>approved</em> are
                added to inventory when you approve the bill. Rejected lines are
                kept on the bill record for audit but never touch stock.
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setReviewing(null)}>
              Close
            </Button>
            {reviewing && (
              <>
                <Button
                  variant="outline"
                  className="gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={async () => {
                    const u = reviewing;
                    setReviewing(null);
                    await sendBackForCorrection(u.id);
                  }}
                >
                  <RotateCcw className="h-4 w-4" /> Send back
                </Button>
                <Button
                  variant="outline"
                  className="gap-1 border-rose-300 text-rose-700 hover:bg-rose-50"
                  onClick={async () => {
                    const u = reviewing;
                    setReviewing(null);
                    await reject(u.id);
                  }}
                >
                  <X className="h-4 w-4" /> Reject
                </Button>
                <Button
                  className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={reviewBusy}
                  onClick={async () => {
                    if (!reviewing) return;
                    // Validate: items marked approved must have a target.
                    // Auto-fill new product name from the cleaned bill
                    // description so admins are never blocked by an empty
                    // field they didn't realise needed typing.
                    const filled = reviewItems.map((it) => {
                      if ((it.decision ?? "pending") !== "approved") return it;
                      const action = it.productAction ?? "match";
                      if (action !== "create") return it;
                      if ((it.newProductName ?? "").trim()) return it;
                      const auto = cleanProductName(it.description ?? "");
                      return auto ? { ...it, newProductName: auto } : it;
                    });
                    if (filled !== reviewItems) setReviewItems(filled);
                    const bad = filled.find(
                      (it) =>
                        (it.decision ?? "pending") === "approved" &&
                        it.productAction !== "skip" &&
                        ((it.productAction ?? "match") === "match"
                          ? !it.matchedProductId
                          : !(it.newProductName ?? "").trim())
                    );
                    if (bad) {
                      const action = bad.productAction ?? "match";
                      toast.error(
                        action === "match"
                          ? `Please select existing product or enter new product name for "${bad.description}".`
                          : `Please enter a new product name for "${bad.description}".`
                      );
                      return;
                    }
                    setReviewBusy(true);
                    const ok = await approveUpload(reviewing.id, reviewItems);
                    setReviewBusy(false);
                    if (ok) setReviewing(null);
                  }}
                >
                  <Check className="h-4 w-4" />
                  {reviewBusy ? "Approving…" : "Approve & Update Inventory"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----- Edit dialog (storekeeper or admin, before approval) ----- */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="break-words">
              Edit Bill · {editing?.supplierName}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="min-w-0 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Supplier TIN</Label>
                  <Input
                    value={editForm.supplierTin ?? ""}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, supplierTin: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Supplier Name</Label>
                  <Input
                    value={editForm.supplierName ?? ""}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, supplierName: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Supplier Invoice Number</Label>
                  <Input
                    value={editForm.supplierInvoiceNo ?? ""}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        supplierInvoiceNo: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Invoice Date</Label>
                  <Input
                    type="date"
                    value={editForm.invoiceDate ?? ""}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, invoiceDate: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Invoice Total (excl. GST)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.invoiceTotalExclGst ?? 0}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        invoiceTotalExclGst: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">GST Charged at {GST_PERCENT_LABEL}%</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.gstCharged ?? 0}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        gstCharged: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Taxable Activity Number</Label>
                  <Input
                    value={editForm.taxableActivityNo ?? ""}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        taxableActivityNo: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              {editing.correctionNote && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <strong>Admin note:</strong> {editing.correctionNote}
                </div>
              )}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-xs">Item lines ({editItems.length})</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-[11px]"
                    onClick={() =>
                      setEditItems((arr) => [
                        ...arr,
                        {
                          description: "",
                          qty: 1,
                          unitPrice: 0,
                          lineTotal: 0,
                          source: "manual",
                          decision: "pending",
                          productAction: "match",
                          gstApplicable: true,
                          unitType: "piece",
                          piecesPerCase: 1,
                        },
                      ])
                    }
                  >
                    + Add line
                  </Button>
                </div>
                <div className="max-h-72 overflow-auto rounded-lg border border-border">
                  <table className="min-w-[520px] w-full text-xs">
                    <thead className="bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Item</th>
                        <th className="px-2 py-1.5 text-right">Qty</th>
                        <th className="px-2 py-1.5 text-right">Unit price</th>
                        <th className="px-2 py-1.5 text-right">Total</th>
                        <th className="px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editItems.map((it, idx) => (
                        <tr key={idx} className="border-t border-border">
                          <td className="px-2 py-1">
                            <Input
                              className="h-7 text-xs"
                              value={it.description}
                              onChange={(e) => {
                                const v = e.target.value;
                                setEditItems((arr) =>
                                  arr.map((x, i) =>
                                    i === idx ? { ...x, description: v } : x
                                  )
                                );
                              }}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              type="number"
                              step="0.001"
                              className="h-7 w-20 text-right text-xs"
                              value={it.qty}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setEditItems((arr) =>
                                  arr.map((x, i) =>
                                    i === idx
                                      ? {
                                          ...x,
                                          qty: v,
                                          lineTotal: Number(
                                            (v * x.unitPrice).toFixed(2)
                                          ),
                                        }
                                      : x
                                  )
                                );
                              }}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              type="number"
                              step="0.01"
                              className="h-7 w-24 text-right text-xs"
                              value={it.unitPrice}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setEditItems((arr) =>
                                  arr.map((x, i) =>
                                    i === idx
                                      ? {
                                          ...x,
                                          unitPrice: v,
                                          lineTotal: Number(
                                            (x.qty * v).toFixed(2)
                                          ),
                                        }
                                      : x
                                  )
                                );
                              }}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              type="number"
                              step="0.01"
                              className="h-7 w-24 text-right text-xs"
                              value={it.lineTotal}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setEditItems((arr) =>
                                  arr.map((x, i) =>
                                    i === idx ? { ...x, lineTotal: v } : x
                                  )
                                );
                              }}
                            />
                          </td>
                          <td className="px-2 py-1 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive"
                              onClick={() =>
                                setEditItems((arr) =>
                                  arr.filter((_, i) => i !== idx)
                                )
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={editBusy}
              onClick={() => { void saveEdit(); }}
              className="gap-2"
            >
              {editBusy ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: BillStatus }): JSX.Element {
  const map: Record<BillStatus, { label: string; cls: string }> = {
    draft: { label: "Draft", cls: "bg-slate-200 text-slate-800" },
    pending: { label: "Pending Approval", cls: "bg-amber-100 text-amber-800" },
    approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-800" },
    rejected: { label: "Rejected", cls: "bg-rose-100 text-rose-800" },
    needs_correction: {
      label: "Needs Correction",
      cls: "bg-orange-100 text-orange-800",
    },
  };
  const m = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-800" };
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

function Mini({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 break-words text-xs font-semibold">{value}</div>
    </div>
  );
}

function ItemReviewRow({
  it,
  products,
  onChange,
}: {
  it: SupplierBillItem;
  products: { id: string; name: string; barcode: string }[];
  onChange: (patch: Partial<SupplierBillItem>) => void;
}): JSX.Element {
  const decision = it.decision ?? "pending";
  const action = it.productAction ?? "match";
  const search = (it.description ?? "").trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!search) return products.slice(0, 8);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          (p.barcode ?? "").toLowerCase().includes(search)
      )
      .slice(0, 12);
  }, [products, search]);
  return (
    <tr
      className={`border-t border-border ${
        decision === "rejected"
          ? "bg-rose-50/40"
          : decision === "approved"
          ? "bg-emerald-50/40"
          : ""
      }`}
    >
      <td className="px-2 py-1.5 align-top">
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            size="sm"
            variant={decision === "approved" ? "default" : "outline"}
            className={`h-7 gap-1 text-[10px] ${
              decision === "approved"
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : ""
            }`}
            onClick={() => onChange({ decision: "approved" })}
          >
            <Check className="h-3 w-3" /> Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant={decision === "rejected" ? "default" : "outline"}
            className={`h-7 gap-1 text-[10px] ${
              decision === "rejected"
                ? "bg-rose-600 text-white hover:bg-rose-700"
                : ""
            }`}
            onClick={() => onChange({ decision: "rejected" })}
          >
            <X className="h-3 w-3" /> Reject
          </Button>
        </div>
      </td>
      <td className="px-2 py-1.5 align-top">
        <Input
          className="h-7 text-xs"
          value={it.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </td>
      <td className="px-2 py-1.5 align-top">
        <Input
          type="number"
          step="0.001"
          className="h-7 w-20 text-right text-xs"
          value={it.qty}
          onChange={(e) => {
            const q = Number(e.target.value);
            onChange({
              qty: q,
              lineTotal: Number((q * (it.unitPrice || 0)).toFixed(2)),
            });
          }}
        />
      </td>
      <td className="px-2 py-1.5 align-top">
        <Input
          type="number"
          step="0.01"
          className="h-7 w-24 text-right text-xs"
          value={it.unitPrice}
          onChange={(e) => {
            const u = Number(e.target.value);
            onChange({
              unitPrice: u,
              lineTotal: Number(((it.qty || 0) * u).toFixed(2)),
            });
          }}
        />
      </td>
      <td className="px-2 py-1.5 align-top">
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant={action === "match" ? "default" : "outline"}
              className="h-6 gap-1 px-1.5 text-[10px]"
              onClick={() => onChange({ productAction: "match" })}
            >
              <PackageSearch className="h-3 w-3" /> Match
            </Button>
            <Button
              type="button"
              size="sm"
              variant={action === "create" ? "default" : "outline"}
              className="h-6 gap-1 px-1.5 text-[10px]"
              onClick={() => {
                const patch: Partial<SupplierBillItem> = { productAction: "create" };
                if (!(it.newProductName ?? "").trim()) {
                  const auto = cleanProductName(it.description ?? "");
                  if (auto) patch.newProductName = auto;
                }
                onChange(patch);
              }}
            >
              <PackagePlus className="h-3 w-3" /> Create new
            </Button>
          </div>
          {action === "match" ? (
            <select
              value={it.matchedProductId ?? ""}
              onChange={(e) => onChange({ matchedProductId: e.target.value || null })}
              className="h-7 max-w-[220px] rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">— Select product —</option>
              {suggestions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.barcode ? ` · ${p.barcode}` : ""}
                </option>
              ))}
            </select>
          ) : (
            <Input
              className="h-7 text-xs"
              placeholder="New product name (e.g. TEZ GLASS 90G)"
              value={it.newProductName ?? cleanProductName(it.description ?? "")}
              onChange={(e) => onChange({ newProductName: e.target.value })}
            />
          )}
        </div>
      </td>
      <td className="px-2 py-1.5 align-top">
        <div className="flex flex-col gap-1">
          <select
            value={it.unitType ?? "piece"}
            onChange={(e) =>
              onChange({ unitType: e.target.value as UnitType })
            }
            className="h-7 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="piece">piece</option>
            <option value="kg">kg</option>
            <option value="tin">tin</option>
            <option value="box">box</option>
            <option value="case">case</option>
          </select>
          <Input
            type="number"
            min="1"
            className="h-7 w-20 text-right text-xs"
            placeholder="pcs/case"
            value={it.piecesPerCase ?? 1}
            onChange={(e) =>
              onChange({ piecesPerCase: Number(e.target.value) || 1 })
            }
          />
        </div>
      </td>
      <td className="px-2 py-1.5 text-center align-top">
        <input
          type="checkbox"
          checked={it.gstApplicable ?? true}
          onChange={(e) => onChange({ gstApplicable: e.target.checked })}
          aria-label="GST applicable"
        />
      </td>
    </tr>
  );
}

function EditableTin({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}): JSX.Element {
  const [v, setV] = useState<string>(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <Input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v.trim() !== value.trim()) onSave(v);
      }}
      placeholder="—"
      className="h-8 min-w-[10rem] text-xs"
    />
  );
}

function FieldRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 break-words text-sm font-medium">{value}</div>
    </div>
  );
}

function Tile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary";
}): JSX.Element {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        tone === "primary"
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-card"
      }`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tracking-tight lg:text-2xl">
        {value}
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
