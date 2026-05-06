import type { ExpiryStatus, Product, StockBatch } from "./types";

/** Calendar-day difference between expiryDate and today (negative => expired). */
export const daysUntilExpiry = (expiryDate?: string | null): number | null => {
  if (!expiryDate) return null;
  const exp = new Date(expiryDate);
  if (isNaN(exp.getTime())) return null;
  exp.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((exp.getTime() - today.getTime()) / 86_400_000);
};

export const expiryStatus = (
  expiryDate: string | null | undefined,
  nearDays: number
): ExpiryStatus => {
  const d = daysUntilExpiry(expiryDate);
  if (d === null) return "none";
  if (d < 0) return "expired";
  if (d <= nearDays) return "near";
  return "ok";
};

/** Sort batches FIFO: earliest expiry first (nulls last), then by createdAt. */
export const sortBatchesFifo = (batches: StockBatch[]): StockBatch[] =>
  batches.slice().sort((a, b) => {
    const ax = a.expiryDate ? new Date(a.expiryDate).getTime() : Number.POSITIVE_INFINITY;
    const bx = b.expiryDate ? new Date(b.expiryDate).getTime() : Number.POSITIVE_INFINITY;
    if (ax !== bx) return ax - bx;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

/**
 * Compute the most-relevant expiry status for a product, based on its batches
 * (FIFO, oldest unexpired first). Falls back to product-level expiryDate when
 * there are no batches.
 */
export const productExpiryStatus = (
  product: Product,
  batches: StockBatch[],
  nearDays: number
): { status: ExpiryStatus; nextExpiry?: string; days: number | null } => {
  const own = batches
    .filter((b) => b.productId === product.id && b.remainingPieces > 0)
    .filter((b) => !!b.expiryDate);
  if (own.length > 0) {
    const sorted = sortBatchesFifo(own);
    const next = sorted[0];
    return {
      status: expiryStatus(next.expiryDate, nearDays),
      nextExpiry: next.expiryDate,
      days: daysUntilExpiry(next.expiryDate),
    };
  }
  // Fallback: product-level expiry (legacy items without batches)
  if (product.expiryDate) {
    return {
      status: expiryStatus(product.expiryDate, nearDays),
      nextExpiry: product.expiryDate,
      days: daysUntilExpiry(product.expiryDate),
    };
  }
  return { status: "none", days: null };
};

export const formatExpiryStatusLabel = (status: ExpiryStatus): string => {
  switch (status) {
    case "expired":
      return "Expired";
    case "near":
      return "Near expiry";
    case "ok":
      return "OK";
    default:
      return "—";
  }
};
