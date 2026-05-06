import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useStore, landedCostPerPiece } from "@/lib/store";
import { useSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { FileSpreadsheet, FileText, Printer, Search, Calendar } from "lucide-react";
import { toast } from "sonner";
import { LOGO_URL } from "@/components/Logo";
import { PRESETS, presetRange, formatRangeLabel, type PresetKey } from "@/lib/dateRanges";
import SalesActivityReport from "@/components/SalesActivityReport";

type ReportKind =
  | "daily"
  | "monthly"
  | "yearly"
  | "gst"
  | "profit"
  | "fast"
  | "low"
  | "damage"
  | "orders"
  | "purchaseLog"
  | "credit"
  | "creditMonthly"
  | "creditOverdue"
  | "stock"
  | "expiry"
  | "expiryLoss";

interface ReportTab {
  k: ReportKind;
  l: string;
}

const TABS: ReportTab[] = [
  { k: "daily", l: "Daily Sales" },
  { k: "monthly", l: "Monthly Sales" },
  { k: "yearly", l: "Yearly Sales" },
  { k: "gst", l: "GST / Non-GST" },
  { k: "profit", l: "Profit" },
  { k: "fast", l: "Fast Movers" },
  { k: "low", l: "Low Stock" },
  { k: "damage", l: "Damaged" },
  { k: "orders", l: "Supplier Orders" },
  { k: "purchaseLog", l: "Purchase Log" },
  { k: "credit", l: "Credit Customers" },
  { k: "creditMonthly", l: "Monthly Credit" },
  { k: "creditOverdue", l: "Overdue Credit" },
  { k: "stock", l: "Stock Value" },
  { k: "expiry", l: "Expiry Watch" },
  { k: "expiryLoss", l: "Expired Loss" },
];

interface Row {
  [key: string]: string | number;
}

export default function Reports() {
  const products = useStore((s) => s.products);
  const sales = useStore((s) => s.sales);
  const damaged = useStore((s) => s.damaged);
  const orders = useStore((s) => s.orders);
  const customers = useStore((s) => s.customers);
  const suppliers = useStore((s) => s.suppliers);
  const batches = useStore((s) => s.batches);
  const inventoryTx = useStore((s) => s.inventoryTx);
  const allUsers = useStore((s) => s.users);
  const [buyingPersonFilter, setBuyingPersonFilter] = useState<string>("");
  const [supplierFilter, setSupplierFilter] = useState<string>("");

  const [tab, setTab] = useState<ReportKind>("daily");
  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState<PresetKey>("thisMonth");
  const initial = presetRange("thisMonth");
  const [from, setFrom] = useState<string>(initial.from);
  const [to, setTo] = useState<string>(initial.to);

  const applyPreset = (k: PresetKey): void => {
    setPreset(k);
    if (k === "custom") return;
    const r = presetRange(k);
    setFrom(r.from);
    setTo(r.to);
  };

  const fromTs = new Date(from).getTime();
  const toTs = new Date(to).getTime() + 24 * 60 * 60 * 1000;

  const inRange = (iso: string): boolean => {
    const t = new Date(iso).getTime();
    return t >= fromTs && t <= toTs;
  };

  const rangeLabel = formatRangeLabel(from, to);

  const filteredSales = useMemo(
    () => sales.filter((s) => inRange(s.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sales, fromTs, toTs]
  );

  const summary = useMemo(() => {
    const totalSales = filteredSales.reduce((a, b) => a + b.total, 0);
    const totalProfit = filteredSales.reduce((a, b) => a + b.profit, 0);
    let gstItemRev = 0;
    let nonGstItemRev = 0;
    filteredSales.forEach((s) =>
      s.items.forEach((it) => {
        const prod = products.find((p) => p.id === it.productId);
        const isGst =
          it.gstApplicable !== undefined
            ? it.gstApplicable
            : prod?.gstApplicable !== false;
        if (isGst) gstItemRev += it.total;
        else nonGstItemRev += it.total;
      })
    );
    const cash = filteredSales
      .filter((s) => s.paymentMethod === "cash")
      .reduce((a, b) => a + b.total, 0);
    const card = filteredSales
      .filter((s) => s.paymentMethod === "card")
      .reduce((a, b) => a + b.total, 0);
    const bank = filteredSales
      .filter((s) => s.paymentMethod === "bank")
      .reduce((a, b) => a + b.total, 0);
    const credit = filteredSales
      .filter((s) => s.paymentMethod === "credit")
      .reduce((a, b) => a + b.total, 0);
    const damageLoss = damaged
      .filter((d) => inRange(d.date))
      .reduce((a, b) => a + b.valueLoss, 0);
    return {
      totalSales,
      totalProfit,
      cash,
      card,
      bank,
      credit,
      damageLoss,
      gstItemRev,
      nonGstItemRev,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredSales, damaged, products, fromTs, toTs]);

  const data = useMemo<{ headers: string[]; rows: Row[]; title: string }>(() => {
    const filterRow = (cells: (string | number)[]): boolean => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return cells.some((c) => String(c).toLowerCase().includes(q));
    };

    if (tab === "daily" || tab === "monthly" || tab === "yearly") {
      // Rendered by <SalesActivityReport /> — return empty table model.
      const title =
        tab === "daily" ? "Daily Sales Report" : tab === "monthly" ? "Monthly Sales Report" : "Yearly Sales Report";
      return { title, headers: [], rows: [] };
    }
    if (tab === "gst") {
      const map = new Map<
        string,
        { date: string; gstRev: number; nonGstRev: number; total: number; count: number }
      >();
      filteredSales.forEach((s) => {
        const key = formatDate(s.date);
        const cur =
          map.get(key) ?? {
            date: key,
            gstRev: 0,
            nonGstRev: 0,
            total: 0,
            count: 0,
          };
        s.items.forEach((it) => {
          const prod = products.find((p) => p.id === it.productId);
          const isGst =
            it.gstApplicable !== undefined
              ? it.gstApplicable
              : prod?.gstApplicable !== false;
          if (isGst) cur.gstRev += it.total;
          else cur.nonGstRev += it.total;
        });
        cur.total += s.total;
        cur.count += 1;
        map.set(key, cur);
      });
      const rows: Row[] = Array.from(map.values())
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((v) => ({
          Date: v.date,
          Sales: v.count,
          "GST Sales": v.gstRev,
          "Non-GST Sales": v.nonGstRev,
          Total: v.total,
        }))
        .filter((r) => filterRow(Object.values(r)));
      return {
        title: "GST / Non-GST Sales",
        headers: ["Date", "Sales", "GST Sales", "Non-GST Sales", "Total"],
        rows,
      };
    }

    if (tab === "profit") {
      const map = new Map<string, { qty: number; rev: number; profit: number; name: string }>();
      sales
        .filter((s) => inRange(s.date))
        .forEach((s) =>
          s.items.forEach((it) => {
            const cur = map.get(it.productId) ?? { qty: 0, rev: 0, profit: 0, name: it.name };
            cur.qty += it.qty;
            cur.rev += it.total;
            cur.profit += it.profit;
            map.set(it.productId, cur);
          })
        );
      const rows: Row[] = Array.from(map.values())
        .sort((a, b) => b.profit - a.profit)
        .map((v) => {
          const cost = v.rev - v.profit;
          const marginPct = v.rev > 0 ? (v.profit / v.rev) * 100 : 0;
          const markupPct = cost > 0 ? (v.profit / cost) * 100 : 0;
          return {
            Product: v.name,
            "Qty Sold": v.qty,
            Revenue: v.rev,
            Profit: v.profit,
            "Margin %": `${marginPct.toFixed(1)}%`,
            "Markup %": `${markupPct.toFixed(1)}%`,
          };
        })
        .filter((r) => filterRow(Object.values(r)));
      return { title: "Profit by Product", headers: ["Product", "Qty Sold", "Revenue", "Profit", "Margin %", "Markup %"], rows };
    }
    if (tab === "fast") {
      const map = new Map<string, { qty: number; rev: number; profit: number; name: string }>();
      sales
        .filter((s) => inRange(s.date))
        .forEach((s) =>
          s.items.forEach((it) => {
            const cur = map.get(it.productId) ?? { qty: 0, rev: 0, profit: 0, name: it.name };
            cur.qty += it.qty;
            cur.rev += it.total;
            cur.profit += it.profit;
            map.set(it.productId, cur);
          })
        );
      const rows: Row[] = Array.from(map.entries())
        .sort((a, b) => b[1].qty - a[1].qty)
        .map(([pid, v]) => {
          const p = products.find((x) => x.id === pid);
          return {
            Product: v.name,
            "Qty Sold": v.qty,
            Revenue: v.rev,
            Profit: v.profit,
            Stock: p?.stockPieces ?? 0,
            "Suggested Reorder": p ? Math.max(0, Math.ceil((v.qty / 7) * 14) - p.stockPieces) : 0,
          };
        })
        .filter((r) => filterRow(Object.values(r)));
      return {
        title: "Fast-Moving Items",
        headers: ["Product", "Qty Sold", "Revenue", "Profit", "Stock", "Suggested Reorder"],
        rows,
      };
    }
    if (tab === "low") {
      const rows: Row[] = products
        .filter((p) => p.stockPieces <= p.reorderLevel)
        .map((p) => ({
          Product: p.name,
          Stock: p.stockPieces,
          Reorder: p.reorderLevel,
          Status: p.stockPieces === 0 ? "Out of stock" : "Low",
          Supplier: suppliers.find((s) => s.id === p.supplierId)?.name ?? "",
        }))
        .filter((r) => filterRow(Object.values(r)));
      return { title: "Low Stock", headers: ["Product", "Stock", "Reorder", "Status", "Supplier"], rows };
    }
    if (tab === "damage") {
      const rows: Row[] = damaged
        .filter((d) => inRange(d.date))
        .map((d) => ({
          Date: formatDate(d.date),
          Product: d.name,
          Qty: `${d.unitQty} ${d.unit} (${d.qty} pcs)`,
          "LC/Pc": d.landedCostPerPiece ?? 0,
          Loss: d.valueLoss,
          Reason: d.reason,
          "Stock Before": d.stockBefore ?? 0,
          "Stock After": d.stockAfter ?? 0,
          "Entered By": d.reportedByName ?? "",
        }))
        .filter((r) => filterRow(Object.values(r)));
      return {
        title: "Damaged Items",
        headers: [
          "Date",
          "Product",
          "Qty",
          "LC/Pc",
          "Loss",
          "Reason",
          "Stock Before",
          "Stock After",
          "Entered By",
        ],
        rows,
      };
    }
    if (tab === "purchaseLog") {
      const userName = (id?: string): string =>
        (id && allUsers.find((u) => u.id === id)?.fullName) || "—";
      const supplierName = (sid?: string): string =>
        (sid && suppliers.find((s) => s.id === sid)?.name) || "—";
      // Use stock_batches as the canonical "goods received / purchased" log.
      const rows: Row[] = batches
        .filter((b) => inRange(b.createdAt))
        .filter((b) => !buyingPersonFilter || b.buyingPersonId === buyingPersonFilter)
        .map((b) => {
          const p = products.find((x) => x.id === b.productId);
          const sup = supplierName(p?.supplierId);
          const lcpp = p ? landedCostPerPiece(p) : 0;
          return {
            Date: formatDate(b.createdAt),
            Product: p?.name ?? "—",
            Qty: b.qtyPieces,
            Unit: p?.unit ?? "piece",
            "Cost / Pc": lcpp,
            "Purchase Cost": lcpp * b.qtyPieces,
            Supplier: sup,
            "Buying Person": b.buyingPersonName ?? userName(b.buyingPersonId) ?? "—",
            "Entered By": userName(b.userId),
            Note: b.note ?? "",
          };
        })
        .filter((r) => !supplierFilter || (() => {
          const sup = suppliers.find((s) => s.id === supplierFilter);
          return sup ? r.Supplier === sup.name : true;
        })())
        .filter((r) => filterRow(Object.values(r)))
        .sort((a, b) => (String(a.Date) < String(b.Date) ? 1 : -1));
      // Also include legacy inventory_transactions (stock-ins) that may not
      // have a matching batch row — dedupe by approximate date+product+qty.
      inventoryTx
        .filter((t) => t.type === "in" && inRange(t.date))
        .filter((t) => !buyingPersonFilter || t.buyingPersonId === buyingPersonFilter)
        .forEach((t) => {
          const p = products.find((x) => x.id === t.productId);
          if (!p) return;
          const sameDay = formatDate(t.date);
          const dup = rows.some(
            (r) => r.Date === sameDay && r.Product === p.name && Number(r.Qty) === t.qty
          );
          if (dup) return;
          const lcpp = landedCostPerPiece(p);
          const sup = supplierName(p.supplierId);
          if (supplierFilter) {
            const supObj = suppliers.find((s) => s.id === supplierFilter);
            if (supObj && sup !== supObj.name) return;
          }
          rows.push({
            Date: sameDay,
            Product: p.name,
            Qty: t.qty,
            Unit: p.unit,
            "Cost / Pc": lcpp,
            "Purchase Cost": lcpp * t.qty,
            Supplier: sup,
            "Buying Person": t.buyingPersonName ?? userName(t.buyingPersonId) ?? "—",
            "Entered By": userName(t.userId),
            Note: t.note ?? "",
          });
        });
      return {
        title: "Purchase Log",
        headers: [
          "Date",
          "Product",
          "Qty",
          "Unit",
          "Cost / Pc",
          "Purchase Cost",
          "Supplier",
          "Buying Person",
          "Entered By",
          "Note",
        ],
        rows: rows.filter((r) => filterRow(Object.values(r))),
      };
    }
    if (tab === "orders") {
      const rows: Row[] = orders.map((o) => ({
        Date: formatDate(o.date),
        Supplier: suppliers.find((s) => s.id === o.supplierId)?.name ?? "",
        Items: o.items.length,
        Status: o.status,
        Boat: o.boatName ?? "—",
        ETA: o.expectedDate ? formatDate(o.expectedDate) : "—",
      })).filter((r) => filterRow(Object.values(r)));
      return { title: "Supplier Orders", headers: ["Date", "Supplier", "Items", "Status", "Boat", "ETA"], rows };
    }
    if (tab === "credit") {
      const rows: Row[] = customers.map((c) => ({
        Customer: c.name,
        Phone: c.phone,
        Limit: c.creditLimit,
        Balance: c.balance,
        "Last Payment": c.lastPaymentAt ? formatDate(c.lastPaymentAt) : "—",
        Utilization: c.creditLimit ? `${((c.balance / c.creditLimit) * 100).toFixed(0)}%` : "—",
      })).filter((r) => filterRow(Object.values(r)));
      return {
        title: "Credit Customers",
        headers: ["Customer", "Phone", "Limit", "Balance", "Last Payment", "Utilization"],
        rows,
      };
    }
    if (tab === "creditMonthly") {
      // We need credit transactions; pull from store.
      const creditTx = useStore.getState().creditTx;
      const map = new Map<
        string,
        { rev: number; paid: number; count: number }
      >();
      creditTx
        .filter((t) => inRange(t.date))
        .forEach((t) => {
          const d = new Date(t.date);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          const cur = map.get(key) ?? { rev: 0, paid: 0, count: 0 };
          if (t.type === "sale") cur.rev += t.amount;
          else cur.paid += t.amount;
          cur.count += 1;
          map.set(key, cur);
        });
      const rows: Row[] = Array.from(map.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([k, v]) => ({
          Month: k,
          Entries: v.count,
          "Credit Sales": v.rev,
          "Payments Received": v.paid,
          "Net Outstanding": v.rev - v.paid,
        }))
        .filter((r) => filterRow(Object.values(r)));
      return {
        title: "Monthly Credit",
        headers: [
          "Month",
          "Entries",
          "Credit Sales",
          "Payments Received",
          "Net Outstanding",
        ],
        rows,
      };
    }
    if (tab === "creditOverdue") {
      const now = Date.now();
      const rows: Row[] = customers
        .filter((c) => c.balance > 0)
        .map((c) => {
          const last = c.lastPaymentAt
            ? new Date(c.lastPaymentAt).getTime()
            : 0;
          const daysSince = last
            ? Math.floor((now - last) / (1000 * 60 * 60 * 24))
            : 999;
          return {
            Customer: c.name,
            Phone: c.phone,
            Balance: c.balance,
            "Last Payment": c.lastPaymentAt
              ? formatDate(c.lastPaymentAt)
              : "—",
            "Days Since": daysSince === 999 ? "—" : daysSince,
            Status:
              daysSince >= 60
                ? "Critical"
                : daysSince >= 30
                ? "Overdue"
                : "Current",
          };
        })
        .filter((r) => filterRow(Object.values(r)))
        .sort((a, b) => Number(b.Balance) - Number(a.Balance));
      return {
        title: "Overdue Credit Customers",
        headers: [
          "Customer",
          "Phone",
          "Balance",
          "Last Payment",
          "Days Since",
          "Status",
        ],
        rows,
      };
    }
    if (tab === "expiry" || tab === "expiryLoss") {
      const batches = useStore.getState().batches;
      const settings = useSettings.getState();
      const nearDays = settings.nearExpiryDays;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (tab === "expiry") {
        // Per-batch expiry watch list (batches with stock + an expiry date),
        // plus legacy product-level expiry rows when no batch exists.
        interface ExpRow extends Row {
          [key: string]: string | number;
        }
        const rows: ExpRow[] = [];
        // Per-batch rows
        batches.forEach((b) => {
          if (!b.expiryDate || b.remainingPieces <= 0) return;
          const p = products.find((x) => x.id === b.productId);
          if (!p) return;
          const exp = new Date(b.expiryDate);
          exp.setHours(0, 0, 0, 0);
          const days = Math.floor((exp.getTime() - today.getTime()) / 86_400_000);
          const status =
            days < 0 ? "Expired" : days <= nearDays ? "Near expiry" : "OK";
          const lcpp = landedCostPerPiece(p);
          rows.push({
            Product: p.name,
            Batch: b.batchNo ?? b.id.slice(-8),
            Purchased: formatDate(b.purchaseDate),
            Expiry: formatDate(b.expiryDate),
            "Days Left": days,
            Remaining: b.remainingPieces,
            "Value at Risk": lcpp * b.remainingPieces,
            Status: status,
          });
        });
        // Legacy: products with expiry but no batch coverage
        products.forEach((p) => {
          if (!p.expiryDate) return;
          const hasBatch = batches.some(
            (b) => b.productId === p.id && b.remainingPieces > 0
          );
          if (hasBatch) return;
          const exp = new Date(p.expiryDate);
          exp.setHours(0, 0, 0, 0);
          const days = Math.floor((exp.getTime() - today.getTime()) / 86_400_000);
          const status =
            days < 0 ? "Expired" : days <= nearDays ? "Near expiry" : "OK";
          const lcpp = landedCostPerPiece(p);
          rows.push({
            Product: p.name,
            Batch: "—",
            Purchased: "—",
            Expiry: formatDate(p.expiryDate),
            "Days Left": days,
            Remaining: p.stockPieces,
            "Value at Risk": lcpp * p.stockPieces,
            Status: status,
          });
        });
        const sorted = rows
          .filter((r) => filterRow(Object.values(r)))
          .sort((a, b) => Number(a["Days Left"]) - Number(b["Days Left"]));
        return {
          title: "Expiry Watch",
          headers: [
            "Product",
            "Batch",
            "Purchased",
            "Expiry",
            "Days Left",
            "Remaining",
            "Value at Risk",
            "Status",
          ],
          rows: sorted,
        };
      }

      // expiryLoss: only expired batches/products, sums losses
      const rows: Row[] = [];
      batches.forEach((b) => {
        if (!b.expiryDate || b.remainingPieces <= 0) return;
        const p = products.find((x) => x.id === b.productId);
        if (!p) return;
        const exp = new Date(b.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const days = Math.floor((exp.getTime() - today.getTime()) / 86_400_000);
        if (days >= 0) return;
        const lcpp = landedCostPerPiece(p);
        rows.push({
          Product: p.name,
          Batch: b.batchNo ?? b.id.slice(-8),
          Expiry: formatDate(b.expiryDate),
          "Days Past": Math.abs(days),
          Pieces: b.remainingPieces,
          "Estimated Loss": lcpp * b.remainingPieces,
        });
      });
      products.forEach((p) => {
        if (!p.expiryDate) return;
        const hasBatch = batches.some(
          (b) => b.productId === p.id && b.remainingPieces > 0
        );
        if (hasBatch) return;
        const exp = new Date(p.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const days = Math.floor((exp.getTime() - today.getTime()) / 86_400_000);
        if (days >= 0 || p.stockPieces <= 0) return;
        const lcpp = landedCostPerPiece(p);
        rows.push({
          Product: p.name,
          Batch: "—",
          Expiry: formatDate(p.expiryDate),
          "Days Past": Math.abs(days),
          Pieces: p.stockPieces,
          "Estimated Loss": lcpp * p.stockPieces,
        });
      });
      return {
        title: "Expired Stock Loss",
        headers: [
          "Product",
          "Batch",
          "Expiry",
          "Days Past",
          "Pieces",
          "Estimated Loss",
        ],
        rows: rows.filter((r) => filterRow(Object.values(r))),
      };
    }

    // stock
    const rows: Row[] = products.map((p) => {
      const ppc = Math.max(1, p.piecesPerCase || 1);
      const cs = ppc > 1 ? Math.floor(p.stockPieces / ppc) : 0;
      const ls = ppc > 1 ? p.stockPieces - cs * ppc : p.stockPieces;
      const lcpp = landedCostPerPiece(p);
      const sellPiece = p.sellingPrice / ppc;
      return {
        Product: p.name,
        Cases: cs,
        Loose: ls,
        "Total Pieces": p.stockPieces,
        "Cost / Pc": lcpp,
        "Sell / Pc": sellPiece,
        "Profit / Pc": sellPiece - lcpp,
        "Inventory Value": lcpp * p.stockPieces,
        Supplier: suppliers.find((s) => s.id === p.supplierId)?.name ?? "",
      };
    }).filter((r) => filterRow(Object.values(r)));
    return {
      title: "Stock Value",
      headers: [
        "Product",
        "Cases",
        "Loose",
        "Total Pieces",
        "Cost / Pc",
        "Sell / Pc",
        "Profit / Pc",
        "Inventory Value",
        "Supplier",
      ],
      rows,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, sales, products, suppliers, damaged, orders, customers, fromTs, toTs, batches, inventoryTx, allUsers, buyingPersonFilter, supplierFilter]);

  const exportCSV = (): void => {
    const csv = [
      data.headers.join(","),
      ...data.rows.map((r) =>
        data.headers
          .map((h) => {
            const v = r[h];
            const s = typeof v === "number" ? v.toString() : String(v ?? "");
            return `"${s.replace(/"/g, '""')}"`;
          })
          .join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.title.replace(/\s/g, "_")}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported to CSV");
  };

  const exportPDF = (): void => {
    // simple printable HTML window
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return toast.error("Popup blocked");
    w.document.write(`
      <html><head><title>${data.title} — Ori Barakah Store</title>
      <style>
        @page { size: A4; margin: 16mm; }
        body{font-family:-apple-system,Segoe UI,sans-serif;padding:24px;color:#1f2418;position:relative;margin:0}
        body::before{content:"";position:fixed;inset:0;background:url('${LOGO_URL}') center/45% no-repeat;opacity:.05;pointer-events:none;z-index:0}
        .header{display:flex;align-items:center;gap:16px;border-bottom:3px solid #d97a17;padding-bottom:12px;margin-bottom:16px;position:relative;z-index:1}
        .header img{width:64px;height:64px;border-radius:50%;border:2px solid #1f2418;background:#fff}
        .header h1{margin:0;font-size:20px;color:#5a6b1f}
        .header .sub{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1.5px}
        .meta{display:flex;justify-content:space-between;font-size:11px;color:#666;margin-bottom:14px;position:relative;z-index:1}
        table{width:100%;border-collapse:collapse;font-size:11px;position:relative;z-index:1}
        th{background:#5a6b1f;color:#fff;text-transform:uppercase;font-size:9px;letter-spacing:1px;padding:8px;text-align:left}
        td{border:1px solid #e3e3d8;padding:8px}
        tr:nth-child(even) td{background:#faf8f1}
        .footer{margin-top:18px;font-size:10px;color:#888;text-align:center;border-top:1px solid #e3e3d8;padding-top:8px;position:relative;z-index:1}
      </style></head><body>
      <div class="header">
        <img src="${LOGO_URL}" alt="logo"/>
        <div>
          <h1>${data.title}</h1>
          <div class="sub">Ori Barakah Store · Ori Brothers</div>
        </div>
      </div>
      <div class="meta"><span>Generated: ${new Date().toLocaleString()}</span><span>Records: ${data.rows.length}</span></div>
      <table><thead><tr>${data.headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>
      ${data.rows
        .map(
          (r) =>
            `<tr>${data.headers
              .map((h) => {
                const v = r[h];
                return `<td>${typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v ?? ""}</td>`;
              })
              .join("")}</tr>`
        )
        .join("")}
      </tbody></table>
      <div class="footer">© ${new Date().getFullYear()} Ori Barakah Store · Confidential — Internal Use Only</div>
      <script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
      </body></html>
    `);
    w.document.close();
  };

  const printIt = (): void => exportPDF();

  const isCurrencyCol = (h: string): boolean =>
    [
      "Total",
      "Profit",
      "Revenue",
      "Loss",
      "Limit",
      "Balance",
      "Stock Value",
      "Landed Cost",
      "LC/Pc",
      "GST Sales",
      "Non-GST Sales",
      "Credit Sales",
      "Payments Received",
      "Net Outstanding",
      "Value at Risk",
      "Estimated Loss",
      "Purchase Cost",
      "Cost / Pc",
    ].includes(h);

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${data.title}: ${rangeLabel}`}
        actions={
          <>
            <Button variant="outline" onClick={exportCSV} className="gap-2">
              <FileSpreadsheet className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" onClick={exportPDF} className="gap-2">
              <FileText className="h-4 w-4" /> PDF
            </Button>
            <Button variant="outline" onClick={printIt} className="gap-2">
              <Printer className="h-4 w-4" /> Print
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              preset === p.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-secondary"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
              tab === t.k
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-secondary"
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this report..."
            className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-input bg-card px-3">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }}
            className="h-10 bg-transparent text-sm outline-none"
          />
          <span className="text-muted-foreground">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPreset("custom"); }}
            className="h-10 bg-transparent text-sm outline-none"
          />
        </div>
      </div>

      {tab === "purchaseLog" && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Filter by buying person</label>
            <select
              value={buyingPersonFilter}
              onChange={(e) => setBuyingPersonFilter(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">All buying people</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Filter by supplier</label>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">All suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {(tab === "profit" || tab === "damage") && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <SumCard label="Total Sales" value={formatCurrency(summary.totalSales)} tone="primary" />
          <SumCard label="Total Profit" value={formatCurrency(summary.totalProfit)} tone="success" />
          <SumCard label="Cash" value={formatCurrency(summary.cash)} />
          <SumCard label="Card" value={formatCurrency(summary.card)} />
          <SumCard label="Bank Transfer" value={formatCurrency(summary.bank)} />
          <SumCard label="Credit" value={formatCurrency(summary.credit)} tone="warning" />
        </div>
      )}

      {tab === "gst" && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <SumCard
            label="GST Items Sales"
            value={formatCurrency(summary.gstItemRev)}
            tone="primary"
          />
          <SumCard
            label="Non-GST Items Sales"
            value={formatCurrency(summary.nonGstItemRev)}
          />
          <SumCard
            label="Total Sales"
            value={formatCurrency(summary.totalSales)}
            tone="success"
          />
          <SumCard
            label="GST Share"
            value={
              summary.totalSales
                ? `${((summary.gstItemRev / summary.totalSales) * 100).toFixed(1)}%`
                : "—"
            }
            tone="warning"
          />
        </div>
      )}

      {(tab === "daily" || tab === "monthly" || tab === "yearly") ? (
        <SalesActivityReport period={tab} from={from} to={to} />
      ) : (
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                {data.headers.map((h) => (
                  <th
                    key={h}
                    className={`px-4 py-3 ${isCurrencyCol(h) ? "text-right" : "text-left"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  {data.headers.map((h) => {
                    const v = r[h];
                    const fmt =
                      typeof v === "number"
                        ? isCurrencyCol(h)
                          ? formatCurrency(v)
                          : formatNumber(v)
                        : v;
                    return (
                      <td key={h} className={`px-4 py-3 ${isCurrencyCol(h) ? "text-right font-medium" : ""}`}>
                        {fmt}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={data.headers.length} className="px-4 py-12 text-center text-muted-foreground">
                    No data for this report.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </>
  );
}

interface SumCardProps {
  label: string;
  value: string;
  tone?: "primary" | "success" | "warning" | "default";
}
function SumCard({ label, value, tone = "default" }: SumCardProps) {
  const cls: Record<string, string> = {
    default: "bg-card",
    primary: "bg-primary/5 border-primary/30",
    success: "bg-emerald-50 border-emerald-200 text-emerald-900",
    warning: "bg-amber-50 border-amber-200 text-amber-900",
  };
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${cls[tone]}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}
