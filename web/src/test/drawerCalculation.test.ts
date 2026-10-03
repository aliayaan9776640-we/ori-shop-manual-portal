import { describe, it, expect } from "vitest";
import { expectedDrawerCash } from "@/lib/drawerCalculation";
describe("expected drawer cash", () => {
  it("uses net sales without deducting customer change again", () => {
    expect(expectedDrawerCash(1300, 600.29, 234.54)).toBe(1665.75);
  });
  it("retains the float when no sales or cash out occurred", () => {
    expect(expectedDrawerCash(1300, 0, 0)).toBe(1300);
  });
  it("deducts approved spending once, including a deficit", () => {
    expect(expectedDrawerCash(100, 20.10, 150.25)).toBe(-30.15);
  });
});
