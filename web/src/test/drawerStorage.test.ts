import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("drawer storage", () => {
  it("keeps server-backed drawer state usable when browser storage is full", async () => {
    vi.doMock("@/lib/supabase", () => ({ isSupabaseConfigured: true, supabase: {} }));
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage blocked", "SecurityError");
    });
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    const { useCashDrawers } = await import("@/lib/cashDrawer");
    expect(() => useCashDrawers.setState({ loaded: true, drawers: [] })).not.toThrow();
    expect(useCashDrawers.getState().loaded).toBe(true);
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("retains local drawer persistence when no server is configured", async () => {
    vi.doMock("@/lib/supabase", () => ({ isSupabaseConfigured: false, supabase: {} }));
    const write = vi.spyOn(Storage.prototype, "setItem");
    const { useCashDrawers } = await import("@/lib/cashDrawer");
    useCashDrawers.setState({ drawers: [], loaded: true });
    expect(write).toHaveBeenCalledWith("ori-cash-drawers", expect.any(String));
  });
});
