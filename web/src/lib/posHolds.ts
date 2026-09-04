export const POS_HOLDS_KEY = "pos-payment-holds-v1";

export interface PosHold {
  id: string;
  label: string;
  createdAt: string;
  cart: unknown[];
  payment: string;
  customerId: string;
  customerQuery: string;
  bagCount: number;
  discount: number;
  paidAmount: string;
  bankTransferName: string;
  bankTransferPhone: string;
}

export const readPosHolds = (): PosHold[] => {
  try {
    const value = JSON.parse(localStorage.getItem(POS_HOLDS_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

export const writePosHolds = (holds: PosHold[]): void => {
  localStorage.setItem(POS_HOLDS_KEY, JSON.stringify(holds));
};
