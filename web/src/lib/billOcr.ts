// AI/OCR bill reader for the GST Purchase Report module.
//
// Sends an uploaded supplier bill (image or PDF) to the Rork toolkit LLM and
// asks it to return a strict JSON document containing the 7 official GST fields
// plus extracted line items and a confidence score.
//
// The endpoint is the public Rork toolkit (no key required for the basic /text/llm/
// route). All AI output is treated as untrusted — every field is normalised and
// the user must review/edit before approval.

const TOOLKIT_URL =
  (import.meta.env.VITE_TOOLKIT_URL as string | undefined) ??
  (import.meta.env.EXPO_PUBLIC_TOOLKIT_URL as string | undefined) ??
  "https://toolkit.rork.com";

const LLM_ENDPOINT = `${TOOLKIT_URL.replace(/\/$/, "")}/text/llm/`;

export interface ExtractedBillItem {
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ExtractedBill {
  supplierTin: string;
  supplierName: string;
  supplierInvoiceNo: string;
  invoiceDate: string; // YYYY-MM-DD
  invoiceTotalExclGst: number;
  gstCharged: number;
  taxableActivityNo: string;
  items: ExtractedBillItem[];
  /** 0–1 self-reported confidence from the model. */
  confidence: number;
  /** Raw text the model reports it read from the bill (audit). */
  rawText: string;
  /** Free-form notes/warnings from the model. */
  notes: string;
}

const SYSTEM_PROMPT = `You are a precise OCR and accounting assistant. You receive a photo or scan of a SUPPLIER PURCHASE INVOICE / BILL.

Your job: read the bill carefully and return ONLY a strict JSON object (no prose, no markdown fences) with this exact shape:

{
  "supplierTin": string,                  // supplier's Tax Identification Number, exactly as printed; "" if not visible
  "supplierName": string,                 // supplier business name, exactly as printed
  "supplierInvoiceNo": string,            // invoice / bill number on the supplier's document
  "invoiceDate": string,                  // ISO date YYYY-MM-DD; "" if not visible
  "invoiceTotalExclGst": number,          // numeric total BEFORE GST (subtotal / net), 0 if not visible
  "gstCharged": number,                   // GST/VAT amount charged on the invoice (look for 8% line); 0 if not visible
  "taxableActivityNo": string,            // OUR (the buyer's) taxable activity number printed on the bill, "" if not visible
  "items": [                              // line items if printed; [] if none readable
    { "description": string, "qty": number, "unitPrice": number, "lineTotal": number }
  ],
  "confidence": number,                   // your own 0..1 confidence in the overall extraction
  "rawText": string,                      // best-effort plain text transcription of the bill (for audit)
  "notes": string                         // short remarks (e.g. "GST line not clearly printed")
}

Rules:
- Output STRICT JSON. No markdown. No explanation. No trailing commas.
- Numbers must be plain JSON numbers (no currency symbols, no thousand separators).
- Dates must be ISO YYYY-MM-DD. Convert if needed.
- If a value cannot be read, return "" for strings and 0 for numbers — DO NOT guess.
- "supplierTin" is the SUPPLIER's TIN. "taxableActivityNo" is the BUYER's (recipient's) taxable activity number; do not confuse them.
- "invoiceTotalExclGst" is the subtotal / net amount BEFORE tax. Do NOT include GST in it.
- If only a grand-total and a GST amount are printed, compute exclTotal = grandTotal - gstCharged.
`;

interface LlmContentPart {
  type: "text" | "image";
  text?: string;
  image?: string;
}
interface LlmMessage {
  role: "system" | "user";
  content: string | LlmContentPart[];
}
interface LlmResponse {
  completion?: string;
}

const stripJsonFence = (s: string): string => {
  const trimmed = s.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fence && fence[1]) return fence[1].trim();
  return trimmed;
};

const toNum = (v: unknown): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.\-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const toStr = (v: unknown): string => {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return "";
};

const normaliseDate = (v: unknown): string => {
  const s = toStr(v);
  if (!s) return "";
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY or DD-MM-YYYY
  const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    let y = m[3];
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y}-${mo}-${d}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
};

const coerceExtracted = (raw: unknown): ExtractedBill => {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const itemsRaw = Array.isArray(obj.items) ? (obj.items as unknown[]) : [];
  const items: ExtractedBillItem[] = itemsRaw
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      return {
        description: toStr(o.description ?? o.name ?? o.item ?? ""),
        qty: toNum(o.qty ?? o.quantity ?? 0),
        unitPrice: toNum(o.unitPrice ?? o.unit_price ?? o.price ?? 0),
        lineTotal: toNum(o.lineTotal ?? o.line_total ?? o.total ?? 0),
      };
    })
    .filter((it) => it.description.length > 0);

  let confidence = toNum(obj.confidence);
  if (confidence > 1) confidence = confidence / 100; // accept 0..100 too
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    supplierTin: toStr(obj.supplierTin ?? obj.supplier_tin),
    supplierName: toStr(obj.supplierName ?? obj.supplier_name),
    supplierInvoiceNo: toStr(
      obj.supplierInvoiceNo ?? obj.invoiceNo ?? obj.bill_no ?? obj.invoice_number
    ),
    invoiceDate: normaliseDate(obj.invoiceDate ?? obj.invoice_date ?? obj.date),
    invoiceTotalExclGst: toNum(
      obj.invoiceTotalExclGst ?? obj.invoice_total_excl_gst ?? obj.subtotal
    ),
    gstCharged: toNum(obj.gstCharged ?? obj.gst_charged ?? obj.gst ?? obj.tax),
    taxableActivityNo: toStr(
      obj.taxableActivityNo ?? obj.taxable_activity_no ?? obj.our_tin
    ),
    items,
    confidence,
    rawText: toStr(obj.rawText ?? obj.raw_text ?? ""),
    notes: toStr(obj.notes ?? ""),
  };
};

export interface ExtractInput {
  /** Original file (image/* or application/pdf). */
  file: File;
  /** Pre-encoded data URL of the file. */
  dataUrl: string;
}

export interface ExtractResult {
  ok: boolean;
  data?: ExtractedBill;
  error?: string;
}

/**
 * Runs OCR + structured extraction on a supplier bill via the Rork toolkit LLM.
 *
 * - For images, the data URL is sent directly as a vision input.
 * - For PDFs, the model is asked to read the embedded text/image content. If
 *   the toolkit cannot accept PDFs, the call returns an error so the UI can
 *   fall back to manual entry.
 */
export async function extractBillFromFile(input: ExtractInput): Promise<ExtractResult> {
  const { file, dataUrl } = input;
  const isImage = file.type.startsWith("image/");
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (!isImage && !isPdf) {
    return { ok: false, error: "Unsupported file type. Upload a PDF or image." };
  }

  const userParts: LlmContentPart[] = [
    {
      type: "text",
      text:
        "Extract the structured GST purchase bill data from this supplier invoice. " +
        "Return ONLY the JSON object described in the system instructions. " +
        (isPdf
          ? "The attachment is a PDF — read every page and aggregate the totals."
          : "The attachment is a photo or scan — be careful with handwritten or low-contrast text."),
    },
    isImage
      ? { type: "image", image: dataUrl }
      : // For PDFs we still pass it as an "image" part — the toolkit gateway
        // will hand it to a multimodal model that supports document inputs.
        // If it cannot, we surface the error to the UI.
        { type: "image", image: dataUrl },
  ];

  const messages: LlmMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userParts },
  ];

  console.log("[billOcr] sending to AI", {
    endpoint: LLM_ENDPOINT,
    fileName: file.name,
    fileType: file.type,
    fileSizeKb: Math.round(file.size / 1024),
    isImage,
    isPdf,
  });

  let res: Response;
  try {
    res = await fetch(LLM_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    });
  } catch (e) {
    console.error("[billOcr] network error", e);
    return {
      ok: false,
      error:
        "Network error contacting AI service: " +
        (e instanceof Error ? e.message : String(e)),
    };
  }

  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    return {
      ok: false,
      error: `AI service error ${res.status}: ${body.slice(0, 240) || res.statusText}`,
    };
  }

  let json: LlmResponse;
  try {
    json = (await res.json()) as LlmResponse;
  } catch (e) {
    return {
      ok: false,
      error:
        "AI returned non-JSON response: " +
        (e instanceof Error ? e.message : String(e)),
    };
  }

  const completion = json.completion ?? "";
  if (!completion) {
    return { ok: false, error: "AI returned an empty response." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(completion));
  } catch {
    // Try to find first {...} block
    const m = /\{[\s\S]*\}/.exec(completion);
    if (!m) {
      return {
        ok: false,
        error: "AI did not return valid JSON. Try a clearer photo.",
      };
    }
    try {
      parsed = JSON.parse(m[0]);
    } catch (e) {
      return {
        ok: false,
        error:
          "AI JSON parse failed: " +
          (e instanceof Error ? e.message : String(e)),
      };
    }
  }

  const data = coerceExtracted(parsed);
  console.log("[billOcr] extraction ok", {
    confidence: data.confidence,
    items: data.items.length,
    supplierName: data.supplierName,
  });
  return { ok: true, data };
}

/**
 * Pure-text fallback parser. Runs entirely in the browser with no network call,
 * so it works in restricted preview environments where the AI endpoint is
 * blocked. Uses tolerant regex heuristics on labelled bill text.
 */
export function extractBillFromText(text: string): ExtractedBill {
  const src = (text ?? "").replace(/\r\n/g, "\n");
  const lines = src
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const flat = src.replace(/\s+/g, " ");

  const findLabelled = (patterns: RegExp[]): string => {
    for (const re of patterns) {
      const m = re.exec(src);
      if (m && m[1]) return m[1].trim();
    }
    return "";
  };

  const findNumber = (patterns: RegExp[]): number => {
    for (const re of patterns) {
      const m = re.exec(src);
      if (m && m[1]) {
        const n = toNum(m[1]);
        if (n) return n;
      }
    }
    return 0;
  };

  const supplierTin = findLabelled([
    /supplier\s*tin\s*[:#-]?\s*([A-Z0-9\-]{4,})/i,
    /\btin\s*(?:no\.?|number)?\s*[:#-]?\s*([A-Z0-9\-]{4,})/i,
    /tax\s*id\s*[:#-]?\s*([A-Z0-9\-]{4,})/i,
  ]);

  const taxableActivityNo = findLabelled([
    /taxable\s*activity\s*(?:no\.?|number)\s*[:#-]?\s*([A-Z0-9\-]{3,})/i,
    /\btan\s*[:#-]?\s*([A-Z0-9\-]{3,})/i,
    /activity\s*(?:no\.?|number)\s*[:#-]?\s*([A-Z0-9\-]{3,})/i,
  ]);

  const supplierInvoiceNo = findLabelled([
    /invoice\s*(?:no\.?|number|#)\s*[:#-]?\s*([A-Z0-9\-\/]+)/i,
    /bill\s*(?:no\.?|number|#)\s*[:#-]?\s*([A-Z0-9\-\/]+)/i,
  ]);

  const dateRaw = findLabelled([
    /(?:invoice\s*date|bill\s*date|date)\s*[:#-]?\s*([0-9]{1,4}[\/\-.][0-9]{1,2}[\/\-.][0-9]{1,4})/i,
  ]);
  const invoiceDate = normaliseDate(dateRaw);

  // Supplier name — try "Supplier: <name>" or "From: <name>"; otherwise pick the
  // first reasonably long line that isn't an address/number row.
  let supplierName = findLabelled([
    /supplier\s*name\s*[:#-]?\s*([^\n]+)/i,
    /supplier\s*[:#-]\s*([^\n]+)/i,
    /from\s*[:#-]\s*([^\n]+)/i,
    /vendor\s*[:#-]\s*([^\n]+)/i,
  ]);
  if (!supplierName && lines.length > 0) {
    const cand = lines.find(
      (l) =>
        l.length >= 3 &&
        l.length <= 80 &&
        !/invoice|bill|tin|gst|vat|tax|date|qty|total|amount|subtotal/i.test(l) &&
        !/^\d+[\d\s\-\/]*$/.test(l)
    );
    if (cand) supplierName = cand;
  }

  const gstCharged = findNumber([
    /gst\s*(?:charged)?\s*(?:at\s*)?8\s*%\s*[:#-]?\s*([0-9.,]+)/i,
    /vat\s*(?:at\s*)?8\s*%\s*[:#-]?\s*([0-9.,]+)/i,
    /\bgst\b[^0-9\n]*([0-9]+[0-9.,]*)/i,
    /\bvat\b[^0-9\n]*([0-9]+[0-9.,]*)/i,
    /\btax\b[^0-9\n]*([0-9]+[0-9.,]*)/i,
  ]);

  let invoiceTotalExclGst = findNumber([
    /(?:total\s*excl(?:uding)?\s*gst|excl\.?\s*gst|net\s*total|sub\s*total|subtotal)\s*[:#-]?\s*([0-9.,]+)/i,
    /total\s*before\s*(?:gst|tax)\s*[:#-]?\s*([0-9.,]+)/i,
  ]);
  if (!invoiceTotalExclGst) {
    const grand = findNumber([
      /(?:grand\s*total|total\s*amount|amount\s*due|invoice\s*total|total)\s*[:#-]?\s*([0-9.,]+)/i,
    ]);
    if (grand && gstCharged && grand > gstCharged) {
      invoiceTotalExclGst = Number((grand - gstCharged).toFixed(2));
    } else if (grand && !gstCharged) {
      // Assume total is excl. GST if no GST line is detected.
      invoiceTotalExclGst = grand;
    }
  }

  // Items: best-effort. Looks for lines like
  //   2 x Widget @ 5.00 = 10.00
  //   Widget   2   5.00   10.00
  const items: ExtractedBillItem[] = [];
  const lineRe1 = /^(\d+(?:\.\d+)?)\s*[xX*]?\s+(.+?)\s+@?\s*([0-9.,]+)\s*[=]?\s*([0-9.,]+)$/;
  const lineRe2 = /^(.+?)\s{2,}(\d+(?:\.\d+)?)\s+([0-9.,]+)\s+([0-9.,]+)$/;
  for (const l of lines) {
    let m = lineRe1.exec(l);
    if (m) {
      items.push({
        description: m[2].trim(),
        qty: toNum(m[1]),
        unitPrice: toNum(m[3]),
        lineTotal: toNum(m[4]),
      });
      continue;
    }
    m = lineRe2.exec(l);
    if (m) {
      items.push({
        description: m[1].trim(),
        qty: toNum(m[2]),
        unitPrice: toNum(m[3]),
        lineTotal: toNum(m[4]),
      });
    }
  }

  // Confidence: how many of the 7 official fields we managed to fill.
  const filled = [
    supplierTin,
    supplierName,
    supplierInvoiceNo,
    invoiceDate,
    invoiceTotalExclGst > 0 ? "y" : "",
    gstCharged > 0 ? "y" : "",
    taxableActivityNo,
  ].filter((v) => !!v).length;
  const confidence = Math.max(0, Math.min(1, filled / 7));

  void flat;
  return {
    supplierTin,
    supplierName,
    supplierInvoiceNo,
    invoiceDate,
    invoiceTotalExclGst,
    gstCharged,
    taxableActivityNo,
    items,
    confidence,
    rawText: src,
    notes:
      filled === 7
        ? "All 7 fields parsed from pasted text."
        : `Parsed ${filled}/7 fields from pasted text — please review and complete the rest.`,
  };
}

export const fileToDataUrl = (f: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => {
      const r = reader.result;
      if (typeof r === "string") resolve(r);
      else reject(new Error("File read produced non-string result"));
    };
    reader.onerror = (): void => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(f);
  });
