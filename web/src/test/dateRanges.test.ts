import { describe, expect, it, vi } from "vitest";
import { formatRangeLabel, presetRange } from "@/lib/dateRanges";

describe("report date ranges", () => {
  it("keeps month boundaries in the local calendar timezone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 3, 10, 0, 0));

    expect(presetRange("thisMonth")).toEqual({
      from: "2026-09-01",
      to: "2026-09-03",
    });
    expect(formatRangeLabel("2026-09-01", "2026-09-03")).toBe(
      "01 Sept 2026 to 03 Sept 2026"
    );

    vi.useRealTimers();
  });
});
