import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface TaxSettings {
  gstPct: number;
  plasticBagFee: number;
  cardChargePct: number;
}

interface TaxState extends TaxSettings {
  set: (patch: Partial<TaxSettings>) => void;
}

export const useTaxSettings = create<TaxState>()(
  persist(
    (set) => ({
      gstPct: 8,
      plasticBagFee: 2,
      cardChargePct: 3,
      set: (patch) => set(patch),
    }),
    { name: "ori-tax-settings" }
  )
);

export interface PriceInputs {
  purchasePrice: number;
  boatFee: number;
  otherCost: number;
  marginPct: number;
  applyGst: boolean;
  gstPct: number;
}

export interface PriceBreakdown {
  landed: number;
  baseSelling: number;
  gstAmount: number;
  finalPrice: number;
  profit: number;
}

export const computePrice = (i: PriceInputs): PriceBreakdown => {
  const landed = i.purchasePrice + i.boatFee + i.otherCost;
  const baseSelling = landed * (1 + (i.marginPct || 0) / 100);
  const gstAmount = i.applyGst ? (baseSelling * i.gstPct) / 100 : 0;
  const finalPrice = baseSelling + gstAmount;
  const profit = baseSelling - landed;
  return { landed, baseSelling, gstAmount, finalPrice, profit };
};
