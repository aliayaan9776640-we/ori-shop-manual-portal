export type PresetKey =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "lastYear"
  | "custom";

export interface Preset {
  key: PresetKey;
  label: string;
}

export const PRESETS: Preset[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This Week" },
  { key: "lastWeek", label: "Last Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "thisYear", label: "This Year" },
  { key: "lastYear", label: "Last Year" },
  { key: "custom", label: "Custom" },
];

const iso = (d: Date): string => d.toISOString().slice(0, 10);

const startOfWeek = (d: Date): Date => {
  const x = new Date(d);
  const day = x.getDay(); // 0=Sun
  const diff = (day + 6) % 7; // make Mon = 0
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const presetRange = (key: PresetKey): { from: string; to: string } => {
  const now = new Date();
  if (key === "today") return { from: iso(now), to: iso(now) };
  if (key === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: iso(y), to: iso(y) };
  }
  if (key === "thisWeek") {
    const s = startOfWeek(now);
    return { from: iso(s), to: iso(now) };
  }
  if (key === "lastWeek") {
    const s = startOfWeek(now);
    const lwStart = new Date(s);
    lwStart.setDate(lwStart.getDate() - 7);
    const lwEnd = new Date(s);
    lwEnd.setDate(lwEnd.getDate() - 1);
    return { from: iso(lwStart), to: iso(lwEnd) };
  }
  if (key === "thisMonth") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: iso(s), to: iso(now) };
  }
  if (key === "lastMonth") {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: iso(s), to: iso(e) };
  }
  if (key === "thisYear") {
    const s = new Date(now.getFullYear(), 0, 1);
    return { from: iso(s), to: iso(now) };
  }
  if (key === "lastYear") {
    const s = new Date(now.getFullYear() - 1, 0, 1);
    const e = new Date(now.getFullYear() - 1, 11, 31);
    return { from: iso(s), to: iso(e) };
  }
  // custom default = last 7 days
  const s = new Date(now);
  s.setDate(s.getDate() - 7);
  return { from: iso(s), to: iso(now) };
};

export const formatRangeLabel = (from: string, to: string): string => {
  const f = new Date(from).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const t = new Date(to).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return f === t ? f : `${f} to ${t}`;
};
