import {describe,it,expect} from 'vitest';
import {dashboardAnalysisRecords} from '@/lib/dashboardAnalysis';
describe('dashboard analysis start',()=>{
 it('excludes earlier sales and includes September 1 at Maldives midnight',()=>{
  const records=[{date:'2026-08-31T18:59:59Z',total:4800000},{date:'2026-08-31T19:00:00Z',total:100},{date:'2026-10-03T00:00:00Z',total:200}];
  expect(dashboardAnalysisRecords(records).reduce((sum,r)=>sum+r.total,0)).toBe(300);
  expect(records).toHaveLength(3);
 });
 it('applies the same start to damage losses used in profit',()=>{
  expect(dashboardAnalysisRecords([{date:'2026-08-01',valueLoss:999},{date:'2026-09-02',valueLoss:10}]).map(r=>r.valueLoss)).toEqual([10]);
 });
});
