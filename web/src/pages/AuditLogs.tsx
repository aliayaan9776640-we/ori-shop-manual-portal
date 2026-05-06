import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuditLogs, type AuditAction, type AuditLog } from "@/lib/audit";
import { useStore, useCurrentUser } from "@/lib/store";
import { formatDateTime } from "@/lib/format";
import {
  humanizeAudit,
  statusForAudit,
  moduleLabel,
  entityLabel,
} from "@/lib/auditHumanize";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  XCircle,
  Pencil,
  Plus,
  Trash2,
  Eye,
  ScrollText,
  RefreshCw,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
} from "lucide-react";

const ACTION_META: Record<
  AuditAction,
  { label: string; icon: React.ElementType; tone: string }
> = {
  create: { label: "Create", icon: Plus, tone: "bg-blue-100 text-blue-700" },
  update: { label: "Update", icon: Pencil, tone: "bg-amber-100 text-amber-700" },
  delete: { label: "Delete", icon: Trash2, tone: "bg-rose-100 text-rose-700" },
  approve: {
    label: "Approve",
    icon: CheckCircle2,
    tone: "bg-emerald-100 text-emerald-700",
  },
  reject: { label: "Reject", icon: XCircle, tone: "bg-rose-100 text-rose-700" },
  other: { label: "Other", icon: ScrollText, tone: "bg-slate-100 text-slate-700" },
};

const csvCell = (v: unknown): string => {
  const s =
    v === null || v === undefined
      ? ""
      : typeof v === "string"
        ? v
        : JSON.stringify(v);
  return `"${s.replace(/"/g, '""')}"`;
};

const downloadCsv = (filename: string, rows: string[][]): void => {
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function AuditLogs() {
  const me = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const users = useStore((s) => s.users);
  const logs = useAuditLogs((s) => s.logs);
  const loaded = useAuditLogs((s) => s.loaded);
  const loading = useAuditLogs((s) => s.loading);
  const load = useAuditLogs((s) => s.load);

  const [entity, setEntity] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [user, setUser] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [target, setTarget] = useState<AuditLog | null>(null);
  const [showTechnical, setShowTechnical] = useState<boolean>(false);

  const clearFilters = () => {
    setEntity("");
    setAction("");
    setUser("");
    setFrom("");
    setTo("");
    setSearch("");
  };

  const hasFilters =
    !!entity || !!action || !!user || !!from || !!to || !!search.trim();

  useEffect(() => {
    if (!loaded && me) void load();
  }, [loaded, load, me]);

  const userById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) m.set(u.id, u.fullName);
    return m;
  }, [users]);

  const filtered = useMemo(() => {
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toTs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
    const q = search.trim().toLowerCase();
    const entityNorm = entity.trim().toLowerCase();
    const actionNorm = action.trim().toLowerCase();
    const userNorm = user.trim();
    const userName = userNorm ? userById.get(userNorm)?.toLowerCase() ?? null : null;

    return logs.filter((l) => {
      if (entityNorm) {
        const e = (l.entity ?? "").toLowerCase();
        if (e !== entityNorm && !e.includes(entityNorm)) return false;
      }
      if (actionNorm) {
        const a = (l.action ?? "").toLowerCase();
        if (a !== actionNorm && !a.includes(actionNorm)) return false;
      }
      if (userNorm) {
        const byId = l.performedBy === userNorm;
        const byName =
          !!userName &&
          !!l.performedByName &&
          l.performedByName.toLowerCase() === userName;
        if (!byId && !byName) return false;
      }
      if (fromTs !== null || toTs !== null) {
        const ts = new Date(l.createdAt).getTime();
        if (Number.isNaN(ts)) return false;
        if (fromTs !== null && ts < fromTs) return false;
        if (toTs !== null && ts > toTs) return false;
      }
      if (q) {
        const description = humanizeAudit(l).toLowerCase();
        const hay = [
          description,
          l.entity ?? "",
          l.entityId ?? "",
          l.action ?? "",
          l.performedByName ?? "",
          l.reason ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, entity, action, user, from, to, search, userById]);

  const entities = useMemo(
    () =>
      Array.from(
        new Set(logs.map((l) => l.entity).filter((e): e is string => !!e))
      ).sort(),
    [logs]
  );

  const actions = useMemo(
    () =>
      Array.from(
        new Set(logs.map((l) => l.action).filter((a): a is string => !!a))
      ).sort(),
    [logs]
  );

  const usersWithLogs = useMemo(() => {
    const ids = new Set(
      logs.map((l) => l.performedBy).filter((id): id is string => !!id)
    );
    const list = users.filter((u) => ids.has(u.id));
    return list.length > 0 ? list : users;
  }, [logs, users]);

  const exportFriendly = () => {
    const rows: string[][] = [
      ["Date/Time", "User", "Action", "Module", "Description", "Status"],
      ...filtered.map((l) => [
        formatDateTime(l.createdAt),
        l.performedByName ?? "System",
        ACTION_META[l.action]?.label ?? l.action,
        moduleLabel(l.entity),
        humanizeAudit(l),
        statusForAudit(l).label,
      ]),
    ];
    downloadCsv(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const exportTechnical = () => {
    const rows: string[][] = [
      [
        "ID",
        "Date/Time",
        "User ID",
        "User",
        "Action",
        "Entity",
        "Entity ID",
        "Reason",
        "Before",
        "After",
        "IP",
        "User Agent",
      ],
      ...filtered.map((l) => [
        l.id,
        l.createdAt,
        l.performedBy ?? "",
        l.performedByName ?? "",
        l.action,
        l.entity,
        l.entityId ?? "",
        l.reason ?? "",
        JSON.stringify(l.beforeValue ?? null),
        JSON.stringify(l.afterValue ?? null),
        l.ip ?? "",
        l.userAgent ?? "",
      ]),
    ];
    downloadCsv(
      `audit-log-technical-${new Date().toISOString().slice(0, 10)}.csv`,
      rows
    );
  };

  // Allow admin, cashier, storekeeper to view; others blocked.
  const role = me?.role;
  const canView =
    role === "admin" || role === "cashier" || role === "storekeeper";

  if (!canView) {
    return (
      <>
        <PageHeader title="Audit Logs" description="Restricted" />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-800">
          You do not have permission to view the audit trail.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Audit Logs"
        description={
          isAdmin
            ? "Plain-language activity trail. Expand any entry for full technical details."
            : "Plain-language activity trail across the system."
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportFriendly}
              disabled={filtered.length === 0}
              className="gap-2"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={exportTechnical}
                disabled={filtered.length === 0}
                className="gap-2"
              >
                <FileText className="h-3.5 w-3.5" />
                Technical
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Field label="Module">
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
          >
            <option value="">All</option>
            {entities.map((en) => (
              <option key={en} value={en}>
                {moduleLabel(en)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Action">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
          >
            <option value="">All</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {ACTION_META[a as AuditAction]?.label ?? a}
              </option>
            ))}
          </select>
        </Field>
        <Field label="User">
          <select
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
          >
            <option value="">All</option>
            {usersWithLogs.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
          />
        </Field>
        <Field label="Search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Description, user, id…"
              className="h-9 w-full rounded-lg border border-input bg-background pl-7 pr-2 text-sm"
            />
          </div>
        </Field>
        <div className="sm:col-span-2 lg:col-span-6 flex items-center justify-between gap-2 pt-1">
          <div className="text-xs text-muted-foreground">
            Showing {filtered.length} of {logs.length} entries
          </div>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="gap-1 text-xs"
            >
              <X className="h-3.5 w-3.5" /> Clear filters
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading && logs.length === 0 ? (
          <div className="px-6 py-16 text-center text-muted-foreground">
            <RefreshCw className="mx-auto mb-2 h-8 w-8 animate-spin opacity-50" />
            Loading audit trail…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-muted-foreground">
            <ScrollText className="mx-auto mb-2 h-8 w-8 opacity-50" />
            {logs.length === 0
              ? "No audit entries yet."
              : hasFilters
                ? "No audit logs found for selected filters."
                : "No audit entries match the current filters."}
          </div>
        ) : (
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date/Time</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Module</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((l) => {
                  const meta = ACTION_META[l.action] ?? ACTION_META.other;
                  const Icon = meta.icon;
                  const status = statusForAudit(l);
                  return (
                    <tr key={l.id} className="hover:bg-secondary/30">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {formatDateTime(l.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {l.performedByName ?? "System"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${meta.tone}`}
                        >
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {moduleLabel(l.entity)}
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {humanizeAudit(l)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${status.tone}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setTarget(l)}
                            className="gap-1"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile list view */}
        {filtered.length > 0 && (
          <div className="divide-y divide-border md:hidden">
            {filtered.map((l) => {
              const meta = ACTION_META[l.action] ?? ACTION_META.other;
              const Icon = meta.icon;
              const status = statusForAudit(l);
              return (
                <div key={l.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${meta.tone}`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground">
                        {humanizeAudit(l)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(l.createdAt)} ·{" "}
                        {moduleLabel(l.entity)}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium ${status.tone}`}
                    >
                      {status.label}
                    </span>
                  </div>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setTarget(l)}
                      className="self-end gap-1"
                    >
                      <Eye className="h-3.5 w-3.5" /> Details
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={!!target}
        onOpenChange={(o) => {
          if (!o) {
            setTarget(null);
            setShowTechnical(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Activity Detail</DialogTitle>
          </DialogHeader>
          {target && (
            <div className="space-y-3 text-sm">
              <div className="rounded-xl border border-border bg-secondary/30 p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  What happened
                </div>
                <div className="mt-1 text-base font-medium text-foreground">
                  {humanizeAudit(target)}
                </div>
              </div>
              <Row label="When" value={formatDateTime(target.createdAt)} />
              <Row label="User" value={target.performedByName ?? "System"} />
              <Row
                label="Action"
                value={ACTION_META[target.action]?.label ?? target.action}
              />
              <Row label="Module" value={moduleLabel(target.entity)} />
              <Row label="Status" value={statusForAudit(target).label} />
              {target.reason && <Row label="Reason" value={target.reason} />}

              {isAdmin && (
                <div className="rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => setShowTechnical((v) => !v)}
                    className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:bg-secondary/40"
                  >
                    <span className="inline-flex items-center gap-2">
                      {showTechnical ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      View technical details (Admin)
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {entityLabel(target.entity)}
                      {target.entityId ? ` · ${target.entityId}` : ""}
                    </span>
                  </button>
                  {showTechnical && (
                    <div className="space-y-3 p-3">
                      <div>
                        <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          Before
                        </div>
                        <pre className="max-h-48 overflow-auto rounded-lg bg-secondary/40 p-3 text-xs">
                          {JSON.stringify(target.beforeValue ?? null, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          After
                        </div>
                        <pre className="max-h-48 overflow-auto rounded-lg bg-secondary/40 p-3 text-xs">
                          {JSON.stringify(target.afterValue ?? null, null, 2)}
                        </pre>
                      </div>
                      {(target.ip || target.userAgent) && (
                        <div className="space-y-1 text-[11px] text-muted-foreground">
                          {target.ip && <div>IP: {target.ip}</div>}
                          {target.userAgent && (
                            <div className="break-all">
                              UA: {target.userAgent}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary/40 px-3 py-2">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}
