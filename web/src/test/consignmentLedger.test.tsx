import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { computeOwnerBalance, useConsignment, type ConsignmentItem, type ConsignmentSale, type ConsignmentSettlement } from "@/lib/consignment";
import ConsignmentOwnerHistory, { ConsignmentOwnerContext } from "@/components/ConsignmentOwnerHistory";
import { useDropdowns } from "@/lib/dropdowns";
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured:false, supabase:{} }));
const item: ConsignmentItem = {id:"item",ownerId:"owner",name:"Packets",unitType:"packet",qtyReceived:17,qtySold:3,qtyReturned:4,sellingPrice:10,ownerPayout:5,commissionPct:90,receivedDate:"2026-10-10",notes:"",active:true,createdAt:"2026-10-10T00:00:00Z"};
const sale: ConsignmentSale = {id:"sale",itemId:"item",ownerId:"owner",qty:3,unitPrice:10,ownerPayout:5,totalAmount:30,payableAmount:15,commission:15,createdAt:"2026-10-12T00:00:00Z"};
const settlement: ConsignmentSettlement = {id:"payment",ownerId:"owner",amount:20,paymentMethod:"cash",paidAt:"2026-10-12T00:00:00Z",createdAt:"2026-10-12T00:00:00Z"};
beforeEach(()=>{cleanup();useConsignment.setState({items:[item],sales:[sale],settlements:[settlement],returns:[],receipts:[],owners:[{id:"owner",name:"Owner A",phone:"",address:"",paymentMethod:"",notes:"",active:true,createdAt:"2026-10-10"}]});});
describe("consignment balances and history",()=>{
 it("preserves sale-time payout after commission edits and carries payment credit forward",()=>{
  const b=computeOwnerBalance("owner",[item],[sale],[settlement]);
  expect(b.totalPayable).toBe(15);expect(b.remainingPayable).toBe(-5);expect(b.qtyBalance).toBe(10);
 });
 it("applies a correction without removing the original payment",()=>{
  const b=computeOwnerBalance("owner",[item],[sale],[settlement,{...settlement,id:"correction",adjustsId:"payment",amount:-10}]);
  expect(b.totalPaid).toBe(10);expect(b.remainingPayable).toBe(5);
 });
 it("shows current owner stock alongside the selected section history",()=>{
  render(<ConsignmentOwnerContext.Provider value={{ownerId:"owner",select:()=>{}}}><ConsignmentOwnerHistory tab="sales"/></ConsignmentOwnerContext.Provider>);
  expect(screen.getByText("Packets")).toBeInTheDocument();
  expect(screen.getByText(/3 sold/)).toBeInTheDocument();
  expect(screen.queryByText(/Payment ·/)).not.toBeInTheDocument();
 });
 it("rejects duplicate category values before they can make Packed select Coffee",async()=>{
  useDropdowns.setState({options:[{id:"coffee",groupKey:"product_category",label:"Coffee",value:"gram",active:true,sortOrder:1}]});
  await expect(useDropdowns.getState().add("product_category","Packed","gram")).rejects.toThrow(/unique/);
  await useDropdowns.getState().add("product_category","Packed","packed");
  expect(useDropdowns.getState().options.find(o=>o.label==="Packed")?.value).toBe("packed");
 });
});
