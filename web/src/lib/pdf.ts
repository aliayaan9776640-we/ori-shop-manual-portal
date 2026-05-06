import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { LOGO_URL } from "@/components/Logo";

/* ------------------------------------------------------------------ */
/*                       Logo data-url cache                           */
/* ------------------------------------------------------------------ */

let logoDataUrlCache: string | null = null;

const fetchAsDataUrl = async (url: string): Promise<string> => {
  const res = await fetch(url, { mode: "cors", cache: "force-cache" });
  if (!res.ok) throw new Error(`fetch failed ${res.status}`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(blob);
  });
};

const getLogoDataUrl = async (): Promise<string> => {
  if (logoDataUrlCache) return logoDataUrlCache;
  try {
    logoDataUrlCache = await fetchAsDataUrl(LOGO_URL);
    return logoDataUrlCache;
  } catch {
    return LOGO_URL;
  }
};

/* ------------------------------------------------------------------ */
/*                       HTML → PDF rendering                          */
/* ------------------------------------------------------------------ */

const inlineLogo = async (html: string): Promise<string> => {
  const data = await getLogoDataUrl();
  if (!data.startsWith("data:")) return html;
  // Replace every occurrence of the remote URL with the inlined data URL.
  return html.split(LOGO_URL).join(data);
};

const waitForImages = (doc: Document): Promise<void> => {
  const imgs = Array.from(doc.images);
  return Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        })
    )
  ).then(() => undefined);
};

/**
 * Render a complete HTML document into a real PDF Blob (multi-page A4).
 * The HTML must contain a top-level `.page` element styled at A4 size.
 */
export const htmlToPdfBlob = async (
  rawHtml: string,
  filename: string
): Promise<{ blob: Blob; file: File; filename: string }> => {
  const html = await inlineLogo(rawHtml);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "210mm";
  iframe.style.height = "297mm";
  iframe.style.border = "0";
  iframe.style.background = "#fff";
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) throw new Error("iframe unavailable");
    // Strip any auto-print scripts so rendering doesn't trigger a print dialog.
    const safeHtml = html.replace(/<script[\s\S]*?<\/script>/gi, "");
    doc.open();
    doc.write(safeHtml);
    doc.close();

    await new Promise<void>((resolve) => {
      if (doc.readyState === "complete") resolve();
      else win.addEventListener("load", () => resolve(), { once: true });
    });
    await waitForImages(doc);
    // Settle: small delay for layout/fonts.
    await new Promise((r) => setTimeout(r, 150));

    const target =
      (doc.querySelector(".page") as HTMLElement | null) ?? doc.body;

    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      windowWidth: target.scrollWidth,
      windowHeight: target.scrollHeight,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    if (imgH <= pageH + 0.5) {
      pdf.addImage(imgData, "JPEG", 0, 0, imgW, imgH);
    } else {
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
        heightLeft -= pageH;
      }
    }

    const blob = pdf.output("blob") as Blob;
    const file = new File([blob], filename, { type: "application/pdf" });
    return { blob, file, filename };
  } finally {
    document.body.removeChild(iframe);
  }
};

/* ------------------------------------------------------------------ */
/*                           Output helpers                            */
/* ------------------------------------------------------------------ */

export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

export const printPdfBlob = (blob: Blob): void => {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    // Popup blocked – fall back to download.
    downloadBlob(blob, "document.pdf");
    return;
  }
  // Try to invoke print once the PDF viewer has loaded.
  const tryPrint = (): void => {
    try {
      w.focus();
      w.print();
    } catch {
      // ignore – user can still print from the viewer toolbar
    }
  };
  setTimeout(tryPrint, 800);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export interface ShareResult {
  ok: boolean;
  reason?: "unsupported" | "cancelled" | "error";
}

/** Returns true if the browser can share files via Web Share API. */
export const canSharePdfFile = (file: File): boolean => {
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };
  return Boolean(nav.share && nav.canShare && nav.canShare({ files: [file] }));
};

export const sharePdfFile = async (
  file: File,
  title: string,
  text: string
): Promise<ShareResult> => {
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };
  if (!nav.share || !nav.canShare || !nav.canShare({ files: [file] })) {
    return { ok: false, reason: "unsupported" };
  }
  try {
    await nav.share({ files: [file], title, text });
    return { ok: true };
  } catch (e) {
    const err = e as { name?: string };
    if (err?.name === "AbortError") return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "error" };
  }
};

/**
 * Open the user's email client with a pre-filled subject and body.
 * Browsers cannot attach binary files via mailto, so the PDF is also
 * downloaded so the user can attach it manually from their mail client.
 */
export const emailPdf = (
  blob: Blob,
  filename: string,
  to: string | undefined,
  subject: string,
  body: string
): void => {
  downloadBlob(blob, filename);
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", `${body}\n\n(Please attach the downloaded PDF: ${filename})`);
  const mailto = `mailto:${to ?? ""}?${params.toString()}`;
  window.location.href = mailto;
};
