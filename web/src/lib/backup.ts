import * as XLSX from "xlsx";
import { useStore } from "@/lib/store";
import { useCashDrawers } from "@/lib/cashDrawer";
import { useQuotations } from "@/lib/quotations";
import { useSettings } from "@/lib/settings";

export interface BackupSnapshot {
  generatedAt: string; // ISO
  version: 1;
  users: unknown[];
  products: unknown[];
  suppliers: unknown[];
  sales: unknown[];
  damaged: unknown[];
  orders: unknown[];
  customers: unknown[];
  creditTx: unknown[];
  logs: unknown[];
  quotations: unknown[];
  cashDrawers: unknown[];
  settings: unknown;
}

const LAST_AUTO_KEY = "ori_backup_last_auto";
const LATEST_SNAPSHOT_KEY = "ori_backup_latest_snapshot";
const HISTORY_KEY = "ori_backup_history"; // array of { date, sizeBytes }

export interface BackupHistoryEntry {
  date: string; // ISO
  sizeBytes: number;
  type: "auto" | "manual";
}

export function buildSnapshot(): BackupSnapshot {
  const s = useStore.getState();
  const cd = useCashDrawers.getState();
  const qt = useQuotations.getState();
  const st = useSettings.getState();
  const { set: _omit, ...settingsValue } = st as unknown as { set: unknown } & Record<string, unknown>;
  return {
    generatedAt: new Date().toISOString(),
    version: 1,
    users: s.users,
    products: s.products,
    suppliers: s.suppliers,
    sales: s.sales,
    damaged: s.damaged,
    orders: s.orders,
    customers: s.customers,
    creditTx: s.creditTx,
    logs: s.logs,
    quotations: qt.quotations,
    cashDrawers: cd.drawers,
    settings: settingsValue,
  };
}

const flatten = <T extends Record<string, unknown>>(rows: T[]): Record<string, unknown>[] =>
  rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (v == null) {
        out[k] = "";
      } else if (Array.isArray(v) || typeof v === "object") {
        out[k] = JSON.stringify(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  });

export function snapshotToWorkbook(snap: BackupSnapshot): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const meta = [
    { key: "Generated At", value: snap.generatedAt },
    { key: "Version", value: snap.version },
    { key: "Users", value: snap.users.length },
    { key: "Products", value: snap.products.length },
    { key: "Suppliers", value: snap.suppliers.length },
    { key: "Sales", value: snap.sales.length },
    { key: "Damaged", value: snap.damaged.length },
    { key: "Orders", value: snap.orders.length },
    { key: "Customers", value: snap.customers.length },
    { key: "Credit Tx", value: snap.creditTx.length },
    { key: "Quotations", value: snap.quotations.length },
    { key: "Cash Drawers", value: snap.cashDrawers.length },
    { key: "Activity Logs", value: snap.logs.length },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(meta), "Summary");

  const sheets: Array<[string, unknown[]]> = [
    ["Users", snap.users],
    ["Products", snap.products],
    ["Suppliers", snap.suppliers],
    ["Sales", snap.sales],
    ["Damaged", snap.damaged],
    ["Orders", snap.orders],
    ["Customers", snap.customers],
    ["CreditTx", snap.creditTx],
    ["Quotations", snap.quotations],
    ["CashDrawers", snap.cashDrawers],
    ["ActivityLogs", snap.logs],
  ];

  for (const [name, rows] of sheets) {
    const flat = flatten(rows as Record<string, unknown>[]);
    const ws =
      flat.length > 0
        ? XLSX.utils.json_to_sheet(flat)
        : XLSX.utils.aoa_to_sheet([["(empty)"]]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  // Settings (single row)
  const settingsRow = flatten([snap.settings as Record<string, unknown>]);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(settingsRow),
    "Settings"
  );

  return wb;
}

export function fileStamp(d: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(
    d.getHours()
  )}${pad(d.getMinutes())}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadExcel(snap?: BackupSnapshot): BackupSnapshot {
  const s = snap ?? buildSnapshot();
  const wb = snapshotToWorkbook(s);
  const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const blob = new Blob([arr], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(blob, `ori-backup_${fileStamp()}.xlsx`);
  return s;
}

export function downloadJson(snap?: BackupSnapshot): BackupSnapshot {
  const s = snap ?? buildSnapshot();
  const blob = new Blob([JSON.stringify(s, null, 2)], {
    type: "application/json",
  });
  triggerDownload(blob, `ori-backup_${fileStamp()}.json`);
  return s;
}

export function getLastAutoBackupAt(): string | null {
  try {
    return localStorage.getItem(LAST_AUTO_KEY);
  } catch {
    return null;
  }
}

export function getBackupHistory(): BackupHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BackupHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pushHistory(entry: BackupHistoryEntry): void {
  try {
    const list = getBackupHistory();
    list.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    /* ignore */
  }
}

export function getLatestSnapshot(): BackupSnapshot | null {
  try {
    const raw = localStorage.getItem(LATEST_SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BackupSnapshot;
  } catch {
    return null;
  }
}

function storeLatest(snap: BackupSnapshot): number {
  const json = JSON.stringify(snap);
  try {
    localStorage.setItem(LATEST_SNAPSHOT_KEY, json);
  } catch {
    // localStorage may be full; still report bytes
  }
  return new Blob([json]).size;
}

/**
 * Run an automatic backup if it has been more than ~24 hours since the last one.
 * Stores the snapshot in localStorage for later download. Does NOT trigger a file
 * download (that requires a user action). Returns true if a new backup was created.
 */
export function runDailyAutoBackupIfDue(): boolean {
  try {
    const last = getLastAutoBackupAt();
    const now = Date.now();
    const due =
      !last || now - new Date(last).getTime() > 24 * 60 * 60 * 1000;
    if (!due) return false;
    const snap = buildSnapshot();
    const size = storeLatest(snap);
    localStorage.setItem(LAST_AUTO_KEY, snap.generatedAt);
    pushHistory({
      date: snap.generatedAt,
      sizeBytes: size,
      type: "auto",
    });
    // eslint-disable-next-line no-console
    console.log("[backup] Daily auto-backup created", {
      at: snap.generatedAt,
      sizeBytes: size,
    });
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[backup] auto backup failed", e);
    return false;
  }
}

export function recordManualBackup(snap: BackupSnapshot): void {
  const size = storeLatest(snap);
  pushHistory({ date: snap.generatedAt, sizeBytes: size, type: "manual" });
}
