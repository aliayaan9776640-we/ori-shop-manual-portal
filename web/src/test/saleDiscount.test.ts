import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: false, supabase: {} }));
import { useStore } from "@/lib/store";
import type { Product, PaymentMethod, SaleItem } from "@/lib/types";
const item: SaleItem = {productId:"discount-test",name:"Test",unitQty:1,qty:1,unit:"piece",price:100,landedCost:60,total:100,profit:40};
describe("saved POS discounts", () => {
 beforeEach(() => useStore.setState({ products:[{id:"discount-test",name:"Test",stockPieces:10} as Product], sales:[], batches:[], customers:[], creditTx:[] }));
 it.each<PaymentMethod>(["cash","card","bank","split","credit"])("saves the final discounted amount for %s", (method) => {
   const sale=useStore.getState().addSale([item],method,undefined,10,{totalOverride:90,discountAmount:10,cashAmount:30,bankAmount:60});
   expect(sale.total).toBe(90);
   expect(sale.profit).toBe(30);
   expect(useStore.getState().sales[0].total).toBe(90);
   if(method === "split") expect(sale.cashAmount!+sale.bankAmount!).toBe(sale.total);
 });
 it("keeps tax and fees in the final amount without treating them as a discount", () => {
   const sale=useStore.getState().addSale([item],"card",undefined,0,{totalOverride:99.2,discountAmount:10});
   expect(sale.total).toBe(99.2); expect(sale.profit).toBe(30);
 });
 it("accepts a fully discounted sale", () => {
   const sale=useStore.getState().addSale([item],"cash",undefined,0,{totalOverride:0,discountAmount:100});
   expect(sale.total).toBe(0); expect(sale.profit).toBe(-60);
 });
 it("preserves callers with no checkout adjustments", () => {
   const sale=useStore.getState().addSale([item],"cash");
   expect(sale.total).toBe(100); expect(sale.profit).toBe(40);
 });
});
