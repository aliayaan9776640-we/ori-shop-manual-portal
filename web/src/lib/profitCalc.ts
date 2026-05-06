// Profit math helpers.
//
// Margin % = profit / selling price  (how much of revenue is profit)
// Markup % = profit / cost           (how much we add on top of cost)
//
// These are NOT the same. Stored `marginPct` on products is historically
// used as a markup (cost-plus), so callers should use these helpers when
// displaying values to users.

export interface ProfitParts {
  cost: number;
  selling: number;
  profit: number;
  marginPct: number; // based on selling
  markupPct: number; // based on cost
}

export const computeProfitParts = (
  cost: number,
  selling: number
): ProfitParts => {
  const profit = selling - cost;
  const marginPct = selling > 0 ? (profit / selling) * 100 : 0;
  const markupPct = cost > 0 ? (profit / cost) * 100 : 0;
  return { cost, selling, profit, marginPct, markupPct };
};

export const formatPct = (n: number, digits = 1): string => {
  if (!isFinite(n)) return "0%";
  return `${n.toFixed(digits)}%`;
};
