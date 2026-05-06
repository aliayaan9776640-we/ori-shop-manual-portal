import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  buildSnapshot,
  downloadExcel,
  downloadJson,
  getBackupHistory,
  getLastAutoBackupAt,
  getLatestSnapshot,
  recordManualBackup,
  runDailyAutoBackupIfDue,
  type BackupHistoryEntry,
  type BackupSnapshot,
} from "@/lib/backup";
import {
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  RefreshCw,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useCashDrawers } from "@/lib/cashDrawer";
import { useQuotations } from "@/lib/quotations";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleString();
}

function timeUntilNext(lastIso: string | null): string {
  if (!lastIso) return "Due now";
  const next = new Date(lastIso).getTime() + 24 * 60 * 60 * 1000;
  const ms = next - Date.now();
  if (ms <= 0) return "Due now";
  const hrs = Math.floor(ms / (60 * 60 * 1000));
  const mins = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${hrs}h ${mins}m`;
}

export default function Backup() {
  // Subscribe to data slices so the counts update live.
  const users = useStore((s) => s.users);
  const products = useStore((s) => s.products);
  const sales = useStore((s) => s.sales);
  const customers = useStore((s) => s.customers);
  const orders = useStore((s) => s.orders);
  const quotations = useQuotations((s) => s.quotations);
  const drawers = useCashDrawers((s) => s.drawers);

  const [tick, setTick] = useState(0);
  const refresh = (): void => setTick((n) => n + 1);

  useEffect(() => {
    const id = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const lastAuto = useMemo<string | null>(
    () => getLastAutoBackupAt(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick]
  );
  const history = useMemo<BackupHistoryEntry[]>(
    () => getBackupHistory(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick]
  );
  const latest = useMemo<BackupSnapshot | null>(
    () => getLatestSnapshot(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick]
  );

  const totals = useMemo(
    () => ({
      users: users.length,
      products: products.length,
      sales: sales.length,
      customers: customers.length,
      orders: orders.length,
      quotations: quotations.length,
      drawers: drawers.length,
    }),
    [users, products, sales, customers, orders, quotations, drawers]
  );

  const handleExcel = (): void => {
    try {
      const snap = downloadExcel();
      recordManualBackup(snap);
      toast.success("Excel backup downloaded");
      refresh();
    } catch (e) {
      console.error(e);
      toast.error("Excel export failed");
    }
  };

  const handleJson = (): void => {
    try {
      const snap = downloadJson();
      recordManualBackup(snap);
      toast.success("JSON backup downloaded");
      refresh();
    } catch (e) {
      console.error(e);
      toast.error("JSON export failed");
    }
  };

  const handleRunNow = (): void => {
    // Force an auto-style backup now by clearing the timestamp first.
    try {
      localStorage.removeItem("ori_backup_last_auto");
    } catch {
      /* ignore */
    }
    const ok = runDailyAutoBackupIfDue();
    if (ok) toast.success("Daily snapshot saved");
    else toast.error("Could not create snapshot");
    refresh();
  };

  const handleDownloadLatestAuto = (): void => {
    const snap = getLatestSnapshot();
    if (!snap) {
      toast.error("No saved snapshot yet");
      return;
    }
    downloadExcel(snap);
    toast.success("Latest snapshot downloaded");
  };

  return (
    <>
      <PageHeader
        title="Backup & Export"
        description="Daily automatic snapshots and on-demand Excel / JSON downloads of all your store data."
      />

      {/* Status row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="pos-card p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Last automatic backup
              </div>
              <div className="text-sm font-semibold text-foreground">
                {formatDate(lastAuto)}
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Snapshot kept locally in this browser. Download regularly to keep an
            off-device copy.
          </div>
        </div>

        <div className="pos-card p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Next scheduled backup
              </div>
              <div className="text-sm font-semibold text-foreground">
                in {timeUntilNext(lastAuto)}
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Runs automatically when an admin opens the portal at least once every
            24 hours.
          </div>
        </div>

        <div className="pos-card p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Stored snapshot size
              </div>
              <div className="text-sm font-semibold text-foreground">
                {latest ? formatBytes(new Blob([JSON.stringify(latest)]).size) : "—"}
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {latest
              ? `Captured ${new Date(latest.generatedAt).toLocaleString()}`
              : "No snapshot saved yet."}
          </div>
        </div>
      </div>

      {/* Counts */}
      <div className="mt-6 pos-card p-5">
        <div className="mb-4 text-sm font-semibold text-foreground">
          What will be backed up
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {[
            { label: "Users", value: totals.users },
            { label: "Products", value: totals.products },
            { label: "Sales", value: totals.sales },
            { label: "Customers", value: totals.customers },
            { label: "Orders", value: totals.orders },
            { label: "Quotations", value: totals.quotations },
            { label: "Cash drawers", value: totals.drawers },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-border bg-secondary/40 px-3 py-3"
            >
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {c.label}
              </div>
              <div className="mt-1 text-xl font-bold text-foreground tabular-nums">
                {c.value}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          Plus damaged items, credit transactions, activity logs, and POS settings.
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="pos-card p-6">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">
                Manual download
              </div>
              <div className="text-xs text-muted-foreground">
                Generate a fresh snapshot and save it to your computer.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleExcel} className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Download Excel (.xlsx)
            </Button>
            <Button variant="outline" onClick={handleJson} className="gap-2">
              <FileJson className="h-4 w-4" />
              Download JSON
            </Button>
          </div>
        </div>

        <div className="pos-card p-6">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <RefreshCw className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">
                Automatic snapshot
              </div>
              <div className="text-xs text-muted-foreground">
                Run an immediate snapshot, or download the last saved one.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleRunNow} variant="secondary" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Run snapshot now
            </Button>
            <Button
              onClick={handleDownloadLatestAuto}
              variant="outline"
              className="gap-2"
              disabled={!latest}
            >
              <Download className="h-4 w-4" />
              Download last snapshot
            </Button>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="mt-6 pos-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">
            Backup history
          </div>
          <div className="text-xs text-muted-foreground">
            Last {history.length} of 30
          </div>
        </div>
        {history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-8 text-center text-sm text-muted-foreground">
            No backups yet. Click <strong>Run snapshot now</strong> or
            <strong> Download Excel</strong> to create the first one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">When</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Size</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr
                    key={`${h.date}-${i}`}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="py-2 pr-4 tabular-nums text-foreground">
                      {new Date(h.date).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          h.type === "auto"
                            ? "inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700"
                            : "inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary"
                        }
                      >
                        {h.type}
                      </span>
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                      {formatBytes(h.sizeBytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
