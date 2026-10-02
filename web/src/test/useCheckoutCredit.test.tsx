import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn(), callbacks: [] as (() => void)[], filters: [] as unknown[] }));
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true, customerSupabase: {
  rpc: mock.rpc, removeChannel: mock.remove,
  channel: () => { const channel = {
    on: (_: string, filter: unknown, cb: () => void) => { mock.filters.push(filter); mock.callbacks.push(cb); return channel; },
    subscribe: () => channel,
  }; return channel; },
} }));
import { useCheckoutCredit } from "@/lib/useCheckoutCredit";
const credit = (balance: number) => ({ data: [{id:"credit-1",credit_limit:1000,balance}], error:null });
describe("live checkout credit", () => {
  beforeEach(() => { mock.rpc.mockReset(); mock.remove.mockClear(); mock.callbacks.length=0; mock.filters.length=0; });
  afterEach(() => vi.useRealTimers());
  it("updates an open checkout on payment events using only the matched account", async () => {
    mock.rpc.mockResolvedValueOnce(credit(800)).mockResolvedValue(credit(500));
    const {result,unmount} = renderHook(()=>useCheckoutCredit(true,"Buyer","123"));
    await waitFor(()=>expect(result.current.credit?.balance).toBe(800));
    expect(mock.filters).toContainEqual(expect.objectContaining({table:"credit_refresh_signals",filter:"customer_id=eq.credit-1"}));
    await act(async()=>{mock.callbacks[0]();});
    await waitFor(()=>expect(result.current.credit?.balance).toBe(500));
    unmount(); expect(mock.remove).toHaveBeenCalledTimes(1);
  });
  it("recovers on foreground and clears eligibility when the credit request fails", async () => {
    mock.rpc.mockResolvedValueOnce(credit(200)).mockResolvedValueOnce({data:null,error:{message:"offline"}}).mockResolvedValue(credit(100));
    const {result,unmount} = renderHook(()=>useCheckoutCredit(true,"Buyer","123"));
    await waitFor(()=>expect(result.current.credit?.balance).toBe(200));
    await act(async()=>window.dispatchEvent(new Event("focus")));
    expect(result.current.credit).toBeNull(); expect(result.current.error).toContain("retrying");
    await act(async()=>window.dispatchEvent(new Event("online")));
    expect(result.current.credit?.balance).toBe(100); expect(result.current.error).toBeNull(); unmount();
  });
  it("polls without overlapping slow requests and stops after closing", async () => {
    vi.useFakeTimers();
    let resolve: (value: ReturnType<typeof credit>)=>void = ()=>{};
    mock.rpc.mockReturnValueOnce(new Promise(r=>{resolve=r;})).mockResolvedValue(credit(300));
    const {result,unmount}=renderHook(()=>useCheckoutCredit(true,"Buyer","123"));
    await act(async()=>vi.advanceTimersByTime(10000));
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    await act(async()=>resolve(credit(500)));
    expect(mock.rpc).toHaveBeenCalledTimes(2); expect(result.current.credit?.balance).toBe(300);
    unmount(); await act(async()=>vi.advanceTimersByTime(10000)); expect(mock.rpc).toHaveBeenCalledTimes(2);
  });
  it("ignores a previous customer's delayed response", async () => {
    let resolve: (value: ReturnType<typeof credit>)=>void=()=>{};
    mock.rpc.mockReturnValueOnce(new Promise(r=>{resolve=r;})).mockResolvedValue(credit(50));
    const {result,rerender,unmount}=renderHook(({name})=>useCheckoutCredit(true,name,"123"),{initialProps:{name:"First"}});
    rerender({name:"Second"}); await waitFor(()=>expect(result.current.credit?.balance).toBe(50));
    await act(async()=>resolve(credit(900))); expect(result.current.credit?.balance).toBe(50); unmount();
  });
  it("does not fetch while checkout is closed",()=>{
    const {unmount}=renderHook(()=>useCheckoutCredit(false,"Buyer","123")); expect(mock.rpc).not.toHaveBeenCalled(); unmount();
  });
});
