import { describe, it, expect } from "vitest";
import { closingCash, maldivesDay } from "@/components/SalesFinanceOverview";
describe('finance cash reconciliation',()=>{
  it('uses net sales and cash-outs, with excess already in counted cash',()=>{
    expect(closingCash({opening_cash:50,cash_sales:100,deductions:20,counted_cash:135})).toEqual({expected:130,difference:5});
  });
  it('reports shortages and exact cents without subtracting them from actual cash again',()=>{
    expect(closingCash({opening_cash:20,cash_sales:30.10,deductions:10.05,counted_cash:37})).toEqual({expected:40.05,difference:-3.05});
  });
  it('preserves the actual drawer report without adding excess twice',()=>{
    expect(closingCash({opening_cash:1300,cash_sales:1035.58,deductions:575,counted_cash:525,recorded_expected:184.57,difference:340.43})).toEqual({expected:184.57,difference:340.43});
  });
  it('uses Maldives business dates across UTC midnight',()=>{
    expect(maldivesDay('2026-10-01T20:00:00Z')).toBe('2026-10-02');
  });
});
