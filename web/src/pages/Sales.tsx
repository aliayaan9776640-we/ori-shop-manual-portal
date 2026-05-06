import { useMemo, useState } from "react";
import { useStore, landedCostPerPiece, useCurrentUser } from "@/lib/store";
import type { PaymentMethod, SaleItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime, isSameDay } from "@/lib/format";
import { computeProfitParts, formatPct } from "@/lib/profitCalc";
import {
  Search,
  Trash2,
  Receipt,
  CreditCard,
  Banknote,
  Building2,
  HandCoins,
  Printer,
  Plus,
  Minus,
  X,
  User as UserIcon,
  ScanLine,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/lib/settings";
import { productExpiryStatus } from "@/lib/expiry";
import NumInput from "@/components/NumInput";
import { printReceipt as printReceiptDoc, downloadReceiptHtml, type ReceiptData } from "@/lib/receipt";
import {
  printCreditBill,
  generateCreditBillPdf,
  type CreditBillData,
} from "@/lib/creditBill";
import {
  downloadBlob,
  printPdfBlob,
  sharePdfFile,
  canSharePdfFile,
  emailPdf,
} from "@/lib/pdf";
import { useCreditSends } from "@/lib/creditSends";
import { Send, Share2, Mail, FileDown } from "lucide-react";
import { useCashDrawers } from "@/lib/cashDrawer";
import { useDropdownGroup } from "@/lib/dropdowns";
import { Link } from "react-router-dom";
import { Lock, DoorOpen } from "lucide-react";

interface CartLine {
  productId: string;
  name: string;
  unitQty: number;
  pieces: number;
  pricePerPiece: number;
  costPerPiece: number;
  unit: string;
  piecesPerCase: number;
  gstApplicable: boolean;
  /** "case" = unitQty is number of cases; "piece" = unitQty is number of pieces. */
  mode: "case" | "piece";
}

export default function Sales() {
  const products = useStore((s) => s.products);
  const sales = useStore((s) => s.sales);
  const customers = useStore((s) => s.customers);
  const batches = useStore((s) => s.batches);
  const addSale = useStore((s) => s.addSale);
  const user = useCurrentUser();
  const isAdmin = user?.role === "admin";

  const settings = useSettings();

  const [search, setSearch] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [customerId, setCustomerId] = useState<string>("");
  const [bagCount, setBagCount] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<string>("");

  const drawers = useCashDrawers((s) => s.drawers);
  const addChangeGiven = useCashDrawers((s) => s.addChangeGiven);
  // Shop-wide: a single open drawer is shared across all cashiers.
  const openDrawer = drawers.find((d) => d.status === "open");
  // Daily-session rule: the open drawer must belong to today's business date.
  // A drawer left open from a previous day must be closed first; POS stays
  // locked until a fresh drawer is opened today.
  const openDrawerIsToday = !!openDrawer && isSameDay(openDrawer.openedAt, new Date());
  const staleDrawer = !!openDrawer && !openDrawerIsToday;
  const posReady = !!openDrawer && openDrawerIsToday;

  // Editable per-sale tax/fee overrides (defaults from admin settings)
  const [gstPercent, setGstPercent] = useState<number>(settings.gstPercent);
  const [gstEnabled, setGstEnabled] = useState<boolean>(settings.gstEnabled);
  const [cardPct, setCardPct] = useState<number>(settings.cardChargePercent);
  const [bagFeeUnit, setBagFeeUnit] = useState<number>(settings.plasticBagFee);

  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
  const [lastCreditBill, setLastCreditBill] = useState<CreditBillData | null>(null);
  const enqueueSend = useCreditSends((s) => s.enqueue);

  // Admin-managed dropdowns
  const paymentDropdown = useDropdownGroup("payment_method");
  const discountReasons = useDropdownGroup("discount_reason");
  const bagOptions = useDropdownGroup("plastic_bag_option");
  void discountReasons;
  void bagOptions;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as typeof products;
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [products, search]);

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return [] as typeof customers;
    // Only approved customers can be selected for credit sales
    return customers
      .filter((c) => c.approvalStatus === "approved")
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone || "").toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [customers, customerQuery]);

  const todaysSales = useMemo(
    () => sales.filter((s) => isSameDay(s.date, new Date())),
    [sales]
  );
  const todaysTotal = todaysSales.reduce((s, x) => s + x.total, 0);
  const todaysProfit = todaysSales.reduce((s, x) => s + x.profit, 0);

  // Recent / fast-moving items: prefer items sold today, fallback to last 7 days
  const recentItems = useMemo(() => {
    interface Agg {
      productId: string;
      name: string;
      qty: number;
      lastDate: string;
    }
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const map = new Map<string, Agg>();
    for (const s of sales) {
      if (new Date(s.date).getTime() < since) continue;
      for (const it of s.items) {
        const ex = map.get(it.productId);
        if (ex) {
          ex.qty += it.qty;
          if (new Date(s.date) > new Date(ex.lastDate)) ex.lastDate = s.date;
        } else {
          map.set(it.productId, {
            productId: it.productId,
            name: it.name,
            qty: it.qty,
            lastDate: s.date,
          });
        }
      }
    }
    return Array.from(map.values())
      .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime())
      .slice(0, 8);
  }, [sales]);

  const addToCart = (productId: string): void => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    if (p.stockPieces <= 0) {
      toast.error(`${p.name} is out of stock`);
      return;
    }
    const exp = productExpiryStatus(p, batches, settings.nearExpiryDays);
    if (exp.status === "expired") {
      if (settings.blockExpiredSale) {
        toast.error(`${p.name} has expired — sale blocked by admin`);
        return;
      }
      toast.warning(`${p.name} has expired — selling at your discretion`);
    } else if (exp.status === "near") {
      toast.warning(
        `${p.name} expires in ${exp.days} day${exp.days === 1 ? "" : "s"}`
      );
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === productId);
      if (existing) {
        return prev.map((c) => {
          if (c.productId !== productId) return c;
          const nextUnit = c.unitQty + 1;
          const mult = c.mode === "case" ? Math.max(1, c.piecesPerCase) : 1;
          return { ...c, unitQty: nextUnit, pieces: nextUnit * mult };
        });
      }
      const ppCase = Math.max(1, p.piecesPerCase);
      console.log("[pos] price used:", { id: p.id, name: p.name, sellingPrice: p.sellingPrice, pricePerPiece: p.sellingPrice / ppCase });
      const defaultMode: "case" | "piece" = ppCase > 1 ? "piece" : "piece";
      const piecesAdded = defaultMode === "case" ? ppCase : 1;
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          unitQty: 1,
          pieces: piecesAdded,
          pricePerPiece: p.sellingPrice / ppCase,
          costPerPiece: landedCostPerPiece(p),
          unit: p.unit,
          piecesPerCase: ppCase,
          gstApplicable: p.gstApplicable !== false,
          mode: defaultMode,
        },
      ];
    });
    setSearch("");
  };

  const setQty = (productId: string, unitQty: number): void => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.productId !== productId) return c;
          const mult = c.mode === "case" ? Math.max(1, c.piecesPerCase) : 1;
          return {
            ...c,
            unitQty,
            pieces: Math.max(0, unitQty) * mult,
          };
        })
        .filter((c) => c.unitQty > 0)
    );
  };

  const setLineMode = (productId: string, mode: "case" | "piece"): void => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.productId !== productId) return c;
        if (c.mode === mode) return c;
        const ppc = Math.max(1, c.piecesPerCase);
        // Preserve total pieces when switching modes; round sensibly.
        const totalPieces = c.pieces;
        if (mode === "case") {
          const cases = Math.max(1, Math.round(totalPieces / ppc));
          return { ...c, mode, unitQty: cases, pieces: cases * ppc };
        }
        const pieces = Math.max(1, totalPieces);
        return { ...c, mode, unitQty: pieces, pieces };
      })
    );
  };

  const incQty = (productId: string): void => {
    const c = cart.find((x) => x.productId === productId);
    if (!c) return;
    setQty(productId, c.unitQty + 1);
  };
  const decQty = (productId: string): void => {
    const c = cart.find((x) => x.productId === productId);
    if (!c) return;
    setQty(productId, Math.max(0, c.unitQty - 1));
  };

  const setLinePrice = (productId: string, displayPrice: number): void => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.productId !== productId) return c;
        const div = c.mode === "case" ? Math.max(1, c.piecesPerCase) : 1;
        return { ...c, pricePerPiece: displayPrice / div };
      })
    );
  };

  const removeLine = (productId: string): void => {
    setCart((prev) => prev.filter((c) => c.productId !== productId));
  };

  const itemCount = cart.length;
  const totalQty = cart.reduce((s, c) => s + c.unitQty, 0);

  const lineTotal = (c: CartLine): number => c.pieces * c.pricePerPiece;
  // taxInclusive=true means prices already include GST.
  // taxInclusive=false (default) means GST is added on top once.
  const taxInclusive = settings.taxInclusive === true;
  const gstSubtotal = cart
    .filter((c) => c.gstApplicable)
    .reduce((s, c) => s + lineTotal(c), 0);
  const nonGstSubtotal = cart
    .filter((c) => !c.gstApplicable)
    .reduce((s, c) => s + lineTotal(c), 0);
  const subtotal = gstSubtotal + nonGstSubtotal;
  const profit = cart.reduce(
    (s, c) => s + c.pieces * (c.pricePerPiece - c.costPerPiece),
    0
  );
  const bagFee = bagCount * bagFeeUnit;
  const discountAmt = Math.min(discount, subtotal);
  // Distribute discount proportionally between GST and non-GST items so GST is
  // only computed on the discounted portion of GST-applicable items.
  const discGst =
    subtotal > 0 ? (discountAmt * gstSubtotal) / subtotal : 0;
  const discNonGst = discountAmt - discGst;
  const taxableGstBase = Math.max(0, gstSubtotal - discGst);
  const taxableNonGstBase = Math.max(0, nonGstSubtotal - discNonGst);
  const taxableBase = taxableGstBase + taxableNonGstBase;
  const gstRate = gstPercent / 100;
  // Compute GST exactly ONCE.
  // - Exclusive prices (default): GST = base * rate, then ADDED to total.
  // - Inclusive prices: GST = base - base/(1+rate), already INSIDE total.
  const gstTaxableBase =
    taxableGstBase + (settings.bagFeeTaxable ? bagFee : 0);
  const gstAmount = !gstEnabled
    ? 0
    : taxInclusive
    ? +(gstTaxableBase - gstTaxableBase / (1 + gstRate)).toFixed(2)
    : +(gstTaxableBase * gstRate).toFixed(2);
  // Pre-tax base used to build the final total. When tax is inclusive the GST
  // is already part of taxableBase so we must NOT add gstAmount again.
  const baseForTotal = taxInclusive ? taxableBase : taxableBase + gstAmount;
  const cardFee =
    payment === "card" && cardPct > 0
      ? +(((baseForTotal + bagFee) * cardPct) / 100).toFixed(2)
      : 0;
  const grandTotal = +(baseForTotal + bagFee + cardFee).toFixed(2);

  const paidNum = Number(paidAmount) || 0;
  const changeAmt = +(paidNum - grandTotal).toFixed(2);
  const remainingAmt = changeAmt < 0 ? Math.abs(changeAmt) : 0;

  const cancelSale = (): void => {
    if (cart.length === 0) return;
    setCart([]);
    setPayment("cash");
    setCustomerId("");
    setCustomerQuery("");
    setBagCount(0);
    setDiscount(0);
    setPaidAmount("");
    toast("Sale cancelled");
  };

  const checkout = (printAfter: boolean): void => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    if (!openDrawer) {
      toast.error("Open the cash drawer with Opening Cash before making sales");
      return;
    }
    if (!openDrawerIsToday) {
      toast.error("Previous drawer must be closed before starting today.");
      return;
    }
    if (payment === "credit") {
      if (!customerId) {
        toast.error("Select a credit customer");
        return;
      }
      const cust = customers.find((c) => c.id === customerId);
      if (!cust) {
        toast.error("Customer not found");
        return;
      }
      if (cust.approvalStatus !== "approved") {
        toast.error(
          `Customer not approved (${cust.approvalStatus}). Admin approval required before credit sale.`
        );
        return;
      }
      const remaining = Math.max(0, cust.creditLimit - cust.balance);
      // grandTotal already computed below; recompute snapshot for clarity
      if (grandTotal > remaining) {
        toast.error(
          `Credit limit exceeded. Remaining: ${formatCurrency(remaining)}`
        );
        return;
      }
    }
    for (const c of cart) {
      const p = products.find((x) => x.id === c.productId);
      if (!p || p.stockPieces < c.pieces) {
        toast.error(`Insufficient stock for ${c.name}`);
        return;
      }
      if (settings.blockExpiredSale) {
        const exp = productExpiryStatus(p, batches, settings.nearExpiryDays);
        if (exp.status === "expired") {
          toast.error(`${c.name} has expired — cannot sell expired items`);
          return;
        }
      }
    }
    const items: SaleItem[] = cart.map((c) => ({
      productId: c.productId,
      name: c.name,
      qty: c.pieces,
      unit: c.unit as SaleItem["unit"],
      unitQty: c.unitQty,
      price: c.pricePerPiece,
      landedCost: c.costPerPiece,
      total: c.pieces * c.pricePerPiece,
      profit: c.pieces * (c.pricePerPiece - c.costPerPiece),
      gstApplicable: c.gstApplicable,
    }));
    const cashChangeForSale =
      payment === "cash" && paidNum > 0 && paidNum > grandTotal
        ? +(paidNum - grandTotal).toFixed(2)
        : 0;
    const sale = addSale(
      items,
      payment,
      payment === "credit" ? customerId : undefined,
      cashChangeForSale
    );
    const cust = customers.find((c) => c.id === customerId);
    const effectivePaid =
      payment === "credit" ? 0 : paidNum > 0 ? paidNum : grandTotal;
    const effectiveChange =
      payment === "credit" ? 0 : +(effectivePaid - grandTotal).toFixed(2);
    // Track change given to drawer running total (cash payments only)
    if (payment === "cash" && effectiveChange > 0 && user) {
      addChangeGiven(user.id, effectiveChange);
    }
    const receipt: ReceiptData = {
      saleId: sale.id,
      invoiceNo: sale.id.slice(-8).toUpperCase(),
      date: sale.date,
      cashierName: user?.fullName,
      customerName: cust?.name,
      customerPhone: cust?.phone,
      items: cart.map((c) => ({
        name: c.name,
        qty: c.pieces,
        price: c.pricePerPiece,
        total: c.pieces * c.pricePerPiece,
        gstApplicable: c.gstApplicable,
      })),
      subtotal,
      gstSubtotal,
      nonGstSubtotal,
      discount: discountAmt,
      bag: bagFee,
      cardFee,
      gstAmount,
      gstPercent,
      total: grandTotal,
      paid: effectivePaid,
      change: effectiveChange,
      payment,
      shopName: settings.shopName,
      footer: settings.receiptFooter,
    };
    setLastReceipt(receipt);

    // Build credit bill slip when payment is credit
    if (payment === "credit" && cust) {
      const previousBalance = cust.balance;
      const newBalance = previousBalance + grandTotal;
      const remaining = Math.max(0, cust.creditLimit - newBalance);
      const cb: CreditBillData = {
        invoiceNo: receipt.invoiceNo ?? sale.id.slice(-8).toUpperCase(),
        saleId: sale.id,
        date: sale.date,
        cashierName: user?.fullName,
        customerName: cust.name,
        customerPhone: cust.phone,
        customerAddress: cust.address,
        items: cart.map((c) => ({
          name: c.name,
          qty: c.pieces,
          unit: c.unit,
          price: c.pricePerPiece,
          total: c.pieces * c.pricePerPiece,
          gstApplicable: c.gstApplicable,
        })),
        subtotal,
        gstSubtotal,
        nonGstSubtotal,
        discount: discountAmt,
        bag: bagFee,
        gstPercent,
        gstAmount,
        total: grandTotal,
        previousBalance,
        newBalance,
        creditLimit: cust.creditLimit,
        remainingCreditLimit: remaining,
        shopName: settings.shopName,
        footer: settings.receiptFooter,
      };
      setLastCreditBill(cb);
    } else {
      setLastCreditBill(null);
    }

    toast.success(`Sale recorded · ${formatCurrency(grandTotal)}`);
    if (payment === "cash") {
      toast.message("Cash drawer updated with POS sale.");
    }
    setCart([]);
    setPayment("cash");
    setCustomerId("");
    setCustomerQuery("");
    setBagCount(0);
    setDiscount(0);
    setPaidAmount("");
    if (printAfter) {
      setTimeout(() => {
        if (payment === "credit" && cust) {
          // print both: credit bill slip (full A4) and the small POS receipt
          const previousBalance = cust.balance;
          const newBalance = previousBalance + grandTotal;
          const remaining = Math.max(0, cust.creditLimit - newBalance);
          printCreditBill({
            invoiceNo: receipt.invoiceNo ?? sale.id.slice(-8).toUpperCase(),
            saleId: sale.id,
            date: sale.date,
            cashierName: user?.fullName,
            customerName: cust.name,
            customerPhone: cust.phone,
            customerAddress: cust.address,
            items: cart.map((c) => ({
              name: c.name,
              qty: c.pieces,
              unit: c.unit,
              price: c.pricePerPiece,
              total: c.pieces * c.pricePerPiece,
              gstApplicable: c.gstApplicable,
            })),
            subtotal,
            gstSubtotal,
            nonGstSubtotal,
            discount: discountAmt,
            bag: bagFee,
            gstPercent,
            gstAmount,
            total: grandTotal,
            previousBalance,
            newBalance,
            creditLimit: cust.creditLimit,
            remainingCreditLimit: remaining,
            shopName: settings.shopName,
            footer: settings.receiptFooter,
          });
        } else {
          printReceiptDoc(receipt);
        }
      }, 50);
    }
  };

  const printReceipt = (r?: ReceiptData): void => {
    const data = r ?? lastReceipt;
    if (!data) {
      toast.error("No receipt to print");
      return;
    }
    printReceiptDoc(data);
  };

  const downloadPdf = (): void => {
    if (!lastReceipt) {
      toast.error("No receipt to download");
      return;
    }
    downloadReceiptHtml(lastReceipt);
    toast.success("Receipt downloaded — open & use 'Save as PDF'");
  };

  const selectedCustomer = customers.find((c) => c.id === customerId);

  return (
    <div className="-mx-4 -my-4 sm:-mx-6 sm:-my-6 flex min-h-[calc(100vh-4rem)] flex-col bg-slate-50 text-slate-900 lg:h-[calc(100vh-4rem)] overflow-x-hidden">
      {/* Top bar */}
      <div className="flex flex-col gap-2 border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <ScanLine className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered.length > 0) {
                addToCart(filtered[0].id);
              }
            }}
            placeholder="Scan barcode or search item..."
            className="h-12 w-full rounded-lg border border-slate-300 bg-white pl-11 pr-3 text-base font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/30"
            autoFocus
          />
          {search && filtered.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p.id)}
                  disabled={p.stockPieces === 0}
                  className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left last:border-b-0 hover:bg-slate-50 disabled:opacity-50"
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                    {p.photo ? (
                      <img
                        src={p.photo}
                        alt={p.name}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-wider text-slate-400">
                        No img
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      {p.barcode} · {p.stockPieces} in stock
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {formatCurrency(p.sellingPrice / Math.max(1, p.piecesPerCase))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative w-full sm:w-72">
          <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={selectedCustomer ? selectedCustomer.name : customerQuery}
            onChange={(e) => {
              setCustomerQuery(e.target.value);
              setCustomerId("");
            }}
            placeholder="Search customer (name or phone)"
            className="h-12 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-9 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
          {selectedCustomer && (
            <button
              onClick={() => {
                setCustomerId("");
                setCustomerQuery("");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {customerQuery && !customerId && filteredCustomers.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {filteredCustomers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCustomerId(c.id);
                    setCustomerQuery("");
                  }}
                  className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-2.5 text-left last:border-b-0 hover:bg-slate-50"
                >
                  <div>
                    <div className="font-medium text-slate-900">{c.name}</div>
                    <div className="text-xs text-slate-500">{c.phone || "—"}</div>
                  </div>
                  <div className="text-xs font-semibold text-amber-600">
                    {formatCurrency(c.balance)} owed
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Drawer-locked banner */}
      {!posReady && (
        <div className="flex flex-col gap-2 border-b border-amber-300 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <div className="text-sm font-bold text-amber-900">
                {staleDrawer
                  ? "Previous drawer must be closed before starting today."
                  : "POS sales are locked"}
              </div>
              <div className="text-xs text-amber-800">
                {staleDrawer
                  ? `A drawer opened on ${formatDateTime(openDrawer!.openedAt).split(",")[0]} by ${openDrawer!.openedByName ?? openDrawer!.cashierName} is still open. Close it, then open a new drawer for today.`
                  : "Please open cash drawer and enter opening cash before starting sales."}
              </div>
            </div>
          </div>
          <Link
            to="/cash-drawer"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-amber-700"
          >
            <DoorOpen className="h-4 w-4" /> {staleDrawer ? "Close Previous Drawer" : "Open Cash Drawer"}
          </Link>
        </div>
      )}

      {/* Stats strip */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-white px-4 py-2 text-xs">
        <Stat label="Today's Sales" value={formatCurrency(todaysTotal)} />
        <Stat label="Transactions" value={String(todaysSales.length)} />
        {isAdmin && (
          <Stat
            label="Today's Profit"
            value={formatCurrency(todaysProfit)}
            tone="success"
          />
        )}
        <div className="ml-auto text-slate-500">
          Cashier: <span className="font-medium text-slate-800">{user?.fullName ?? "—"}</span>
          {posReady ? (
            <span className="ml-3 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
              Drawer open
            </span>
          ) : staleDrawer ? (
            <span className="ml-3 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
              Previous drawer
            </span>
          ) : (
            <span className="ml-3 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
              Drawer closed
            </span>
          )}
        </div>
      </div>

      {/* Main grid */}
      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        {/* Cart table */}
        <div className="flex flex-1 min-h-0 flex-col bg-white lg:border-r lg:border-slate-200">
          <div className="hidden md:grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            <div className="col-span-1">#</div>
            <div className="col-span-5">Item</div>
            <div className="col-span-3 text-center">Qty</div>
            <div className="col-span-2 text-right">Price</div>
            <div className="col-span-1 text-right">Total</div>
          </div>
          <div className="flex-1 overflow-auto">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col p-4">
                {recentItems.length > 0 ? (
                  <>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                        Recent / Fast-moving items
                      </div>
                      <div className="text-[10px] text-slate-400">Tap to add</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                      {recentItems.map((it) => {
                        const p = products.find((pp) => pp.id === it.productId);
                        const price = p
                          ? p.sellingPrice / Math.max(1, p.piecesPerCase)
                          : 0;
                        return (
                          <button
                            key={it.productId}
                            onClick={() => addToCart(it.productId)}
                            disabled={!p || p.stockPieces === 0}
                            className="group flex flex-col items-start gap-1 rounded-lg border border-slate-200 bg-white p-2.5 text-left shadow-sm transition hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                          >
                            <div className="mb-1 h-20 w-full overflow-hidden rounded-md border border-slate-100 bg-slate-50">
                              {p?.photo ? (
                                <img
                                  src={p.photo}
                                  alt={it.name}
                                  className="h-full w-full object-cover"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-wider text-slate-400">
                                  No image
                                </div>
                              )}
                            </div>
                            <div className="line-clamp-2 text-xs font-semibold text-slate-900">
                              {it.name}
                            </div>
                            <div className="flex w-full items-center justify-between text-[10px] text-slate-500">
                              <span>Last: {it.qty} pcs</span>
                              <span>{formatDateTime(it.lastDate).split(",")[0]}</span>
                            </div>
                            <div className="mt-0.5 flex w-full items-center justify-between">
                              <span className="text-xs font-bold text-slate-900">
                                {formatCurrency(price)}
                              </span>
                              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 group-hover:bg-emerald-100">
                                + Add
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center py-20 text-center text-slate-400">
                    <Receipt className="mb-3 h-12 w-12 opacity-40" />
                    <div className="text-sm">Scan or search an item to start</div>
                  </div>
                )}
              </div>
            ) : (
              cart.map((c, idx) => (
                <div
                  key={c.productId}
                  className="grid grid-cols-[24px_1fr] md:grid-cols-12 items-center gap-x-2 gap-y-2 border-b border-slate-100 px-3 sm:px-4 py-3 hover:bg-slate-50"
                >
                  <div className="md:col-span-1 text-sm font-semibold text-slate-500">
                    {idx + 1}
                  </div>
                  <div className="md:col-span-5 min-w-0">
                    <div className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-900">
                      <span className="truncate">{c.name}</span>
                      {!c.gstApplicable && (
                        <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-700">
                          Non-GST
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <span>{c.pieces} pcs</span>
                      {c.piecesPerCase > 1 && (
                        <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
                          <button
                            type="button"
                            onClick={() => setLineMode(c.productId, "case")}
                            className={`px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                              c.mode === "case"
                                ? "bg-primary text-primary-foreground"
                                : "bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            Case
                          </button>
                          <button
                            type="button"
                            onClick={() => setLineMode(c.productId, "piece")}
                            className={`px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                              c.mode === "piece"
                                ? "bg-primary text-primary-foreground"
                                : "bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            Piece
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 md:col-start-auto md:col-span-3 flex items-center justify-start md:justify-center gap-1">
                    <button
                      onClick={() => decQty(c.productId)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <NumInput
                      min={0}
                      step={0.5}
                      value={c.unitQty}
                      onChange={(n) => setQty(c.productId, n)}
                      className="h-8 w-14 rounded-md border border-slate-300 bg-white px-1 text-center text-sm font-semibold text-slate-900 outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => incQty(c.productId)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="col-span-2 md:col-start-auto md:col-span-2 flex items-center justify-start md:justify-end">
                    {(() => {
                      const mult = c.mode === "case" ? Math.max(1, c.piecesPerCase) : 1;
                      const display = c.pricePerPiece * mult;
                      return isAdmin ? (
                        <NumInput
                          min={0}
                          step={0.01}
                          value={+display.toFixed(2)}
                          onChange={(n) => setLinePrice(c.productId, n)}
                          className="h-8 w-20 sm:w-24 rounded-md border border-slate-300 bg-white px-2 text-right text-sm text-slate-900 outline-none focus:border-primary"
                        />
                      ) : (
                        <span className="text-sm text-slate-700">
                          {formatCurrency(display)}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="col-span-2 md:col-span-1 flex items-center justify-end gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {formatCurrency(c.pricePerPiece * c.pieces)}
                    </span>
                    <button
                      onClick={() => removeLine(c.productId)}
                      className="rounded p-1 text-rose-500 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Recent sales (compact) — today only */}
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Recent sales · today
              </div>
              <Link
                to="/bills"
                className="text-[10px] font-semibold uppercase tracking-wider text-primary hover:underline"
              >
                View past dates
              </Link>
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {todaysSales.slice(0, 6).map((s) => (
                <div
                  key={s.id}
                  className="min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm"
                >
                  <div className="text-slate-500">{formatDateTime(s.date)}</div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-700">
                      {s.paymentMethod}
                    </span>
                    <span className="font-bold text-slate-900">
                      {formatCurrency(s.total)}
                    </span>
                  </div>
                </div>
              ))}
              {todaysSales.length === 0 && (
                <div className="text-xs text-slate-400">No sales yet today.</div>
              )}
            </div>
          </div>
        </div>

        {/* Right summary panel — compact */}
        <div className="flex w-full flex-col bg-slate-50 lg:w-[340px] lg:shrink-0">
          <div className="flex-1 space-y-2 overflow-auto p-3">
            {/* Items count strip */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm">
              <span className="font-semibold text-slate-600">
                {itemCount} item{itemCount === 1 ? "" : "s"}
              </span>
              <span className="font-semibold text-slate-600">Qty: {totalQty}</span>
            </div>

            {/* Adjustments */}
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Tax & Charges
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <Field label="GST %">
                  <div className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={gstEnabled}
                      onChange={(e) => setGstEnabled(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <NumInput
                      min={0}
                      step={0.5}
                      disabled={!gstEnabled}
                      value={gstPercent}
                      onChange={(n) => setGstPercent(n)}
                      className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-primary disabled:bg-slate-100"
                    />
                  </div>
                </Field>
                <Field label="Card fee %">
                  <NumInput
                    min={0}
                    step={0.1}
                    value={cardPct}
                    onChange={(n) => setCardPct(n)}
                    className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-primary"
                  />
                </Field>
                <Field label="Bag fee">
                  <NumInput
                    min={0}
                    step={0.01}
                    value={bagFeeUnit}
                    onChange={(n) => setBagFeeUnit(n)}
                    className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-primary"
                  />
                </Field>
                <Field label="Bags qty">
                  <NumInput
                    min={0}
                    allowDecimal={false}
                    value={bagCount}
                    onChange={(n) => setBagCount(Math.max(0, n))}
                    className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-primary"
                  />
                </Field>
                <Field label="Discount" full>
                  <NumInput
                    min={0}
                    value={discount}
                    onChange={(n) => setDiscount(Math.max(0, n))}
                    className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-primary"
                  />
                </Field>
              </div>
            </div>

            {/* Totals */}
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              {nonGstSubtotal > 0 && (
                <>
                  <SumRow
                    label="GST items"
                    value={formatCurrency(gstSubtotal)}
                  />
                  <SumRow
                    label="Non-GST items"
                    value={formatCurrency(nonGstSubtotal)}
                  />
                </>
              )}
              <SumRow label="Subtotal" value={formatCurrency(subtotal)} />
              {discountAmt > 0 && (
                <SumRow
                  label="Discount"
                  value={`-${formatCurrency(discountAmt)}`}
                />
              )}
              {gstEnabled && (
                <SumRow
                  label={`GST (${gstPercent}%)${
                    nonGstSubtotal > 0 ? " · GST items only" : ""
                  }`}
                  value={formatCurrency(gstAmount)}
                />
              )}
              {bagFee > 0 && (
                <SumRow
                  label={`Plastic bag (${bagCount})`}
                  value={formatCurrency(bagFee)}
                />
              )}
              {cardFee > 0 && (
                <SumRow
                  label={`Card charge (${cardPct}%)`}
                  value={formatCurrency(cardFee)}
                />
              )}
              {isAdmin && (() => {
                const totalCost = cart.reduce(
                  (s, c) => s + c.pieces * c.costPerPiece,
                  0
                );
                const totalSelling = cart.reduce(
                  (s, c) => s + c.pieces * c.pricePerPiece,
                  0
                );
                const parts = computeProfitParts(totalCost, totalSelling);
                return (
                  <>
                    <SumRow
                      label="Est. profit"
                      value={formatCurrency(profit)}
                      tone="success"
                    />
                    <SumRow
                      label="Margin % (of sale)"
                      value={formatPct(parts.marginPct)}
                      tone="success"
                    />
                    <SumRow
                      label="Markup % (of cost)"
                      value={formatPct(parts.markupPct)}
                    />
                  </>
                );
              })()}
              <div className="my-1.5 border-t border-slate-200" />
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  TOTAL
                </span>
                <span className="text-xl font-extrabold text-slate-900">
                  {formatCurrency(grandTotal)}
                </span>
              </div>
              <div className="mt-1.5 rounded-md bg-amber-50 px-2.5 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    Amount Due
                  </span>
                  <span className="text-base font-extrabold text-amber-700">
                    {formatCurrency(grandTotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment method */}
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Payment
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {(() => {
                  const ICONS: Record<string, typeof Banknote> = {
                    cash: Banknote,
                    card: CreditCard,
                    bank: Building2,
                    credit: HandCoins,
                  };
                  const VALID = ["cash", "card", "bank", "credit"] as const;
                  type V = (typeof VALID)[number];
                  // Use admin-managed labels when available; fall back to defaults.
                  const list: { k: V; l: string; i: typeof Banknote }[] =
                    paymentDropdown.length > 0
                      ? paymentDropdown
                          .filter((d) => (VALID as readonly string[]).includes(d.value))
                          .map((d) => ({
                            k: d.value as V,
                            l: d.label,
                            i: ICONS[d.value] ?? Banknote,
                          }))
                      : [
                          { k: "cash", l: "Cash", i: Banknote },
                          { k: "card", l: "Card", i: CreditCard },
                          { k: "bank", l: "Bank", i: Building2 },
                          { k: "credit", l: "Credit", i: HandCoins },
                        ];
                  return list.map((m) => (
                    <button
                      key={m.k}
                      onClick={() => setPayment(m.k)}
                      className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-semibold transition ${
                        payment === m.k
                          ? "border-primary bg-primary text-primary-foreground shadow"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <m.i className="h-3.5 w-3.5" /> {m.l}
                    </button>
                  ));
                })()}
              </div>
              {payment === "credit" && !customerId && (
                <div className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  Select a credit customer above to continue.
                </div>
              )}
              {payment === "credit" && selectedCustomer && (() => {
                const remaining = Math.max(
                  0,
                  selectedCustomer.creditLimit - selectedCustomer.balance
                );
                const exceeds = grandTotal > remaining;
                const notApproved = selectedCustomer.approvalStatus !== "approved";
                return (
                  <div
                    className={`mt-2 rounded-md px-3 py-2 text-xs font-medium ${
                      notApproved || exceeds
                        ? "bg-rose-50 text-rose-700"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {notApproved ? (
                      <>
                        Customer is <b>{selectedCustomer.approvalStatus}</b> — admin approval required before credit sale.
                      </>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span>
                          Limit {formatCurrency(selectedCustomer.creditLimit)} ·
                          Balance {formatCurrency(selectedCustomer.balance)}
                        </span>
                        <span className={exceeds ? "font-bold" : ""}>
                          {exceeds
                            ? `Exceeds by ${formatCurrency(grandTotal - remaining)}`
                            : `Remaining ${formatCurrency(remaining)}`}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Tendered / Change */}
            {payment === "cash" && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Customer paid
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*\.?[0-9]*"
                  value={paidAmount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) setPaidAmount(v);
                  }}
                  placeholder={grandTotal.toFixed(2)}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-right text-base font-bold text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {[1000, 500, 100, 50, 20, 10, 5, 2, 1].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() =>
                        setPaidAmount(
                          (
                            Math.round(((paidNum || 0) + v) * 100) / 100
                          ).toString()
                        )
                      }
                      className="h-11 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-800 shadow-sm transition active:scale-95 active:bg-slate-100 hover:bg-slate-50"
                    >
                      +{v}
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPaidAmount(grandTotal.toFixed(2))}
                    className="h-11 rounded-lg border border-emerald-400 bg-emerald-500 text-sm font-bold text-white shadow-sm transition active:scale-95 hover:bg-emerald-600"
                  >
                    Exact ({formatCurrency(grandTotal)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaidAmount("")}
                    className="h-11 rounded-lg border border-rose-300 bg-white text-sm font-bold text-rose-700 shadow-sm transition active:scale-95 hover:bg-rose-50"
                  >
                    Clear
                  </button>
                </div>
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Total</span>
                    <span className="font-semibold text-slate-900">
                      {formatCurrency(grandTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Paid</span>
                    <span className="font-semibold text-slate-900">
                      {formatCurrency(paidNum)}
                    </span>
                  </div>
                  {remainingAmt > 0 ? (
                    <div className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
                        Remaining
                      </span>
                      <span className="text-lg font-extrabold text-rose-700">
                        {formatCurrency(remainingAmt)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                        Change
                      </span>
                      <span className="text-lg font-extrabold text-emerald-700">
                        {formatCurrency(Math.max(0, changeAmt))}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom action buttons */}
          <div className="border-t border-slate-200 bg-white p-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={cancelSale}
                className="h-12 border-slate-300 text-slate-700"
              >
                <X className="mr-1 h-4 w-4" /> Cancel
              </Button>
              <Button
                onClick={() => checkout(false)}
                disabled={cart.length === 0 || !openDrawer}
                className="h-12"
              >
                <Save className="mr-1 h-4 w-4" /> Save
              </Button>
              <Button
                onClick={() => checkout(true)}
                disabled={cart.length === 0 || !openDrawer}
                className="col-span-2 h-14 bg-emerald-600 text-base font-bold hover:bg-emerald-700"
              >
                {openDrawer ? (
                  <>
                    <Printer className="mr-2 h-5 w-5" />
                    Save &amp; Print · {formatCurrency(grandTotal)}
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-5 w-5" />
                    Open cash drawer to start sales
                  </>
                )}
              </Button>
              {lastReceipt && !lastCreditBill && (
                <>
                  <button
                    onClick={() => printReceipt()}
                    className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Printer className="h-3.5 w-3.5" /> Reprint
                  </button>
                  <button
                    onClick={downloadPdf}
                    className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Save className="h-3.5 w-3.5" /> Download PDF
                  </button>
                </>
              )}
              {lastCreditBill && (
                <CreditBillActions bill={lastCreditBill} customerId={customerId} enqueue={enqueueSend} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success";
}) {
  return (
    <div className="rounded-md bg-slate-100 px-3 py-1.5">
      <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span
        className={`text-sm font-bold ${
          tone === "success" ? "text-emerald-600" : "text-slate-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function CreditBillActions({
  bill,
  customerId,
  enqueue,
}: {
  bill: CreditBillData;
  customerId: string;
  enqueue: ReturnType<typeof useCreditSends.getState>["enqueue"];
}) {
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState<{ blob: Blob; file: File; filename: string } | null>(null);

  const ensurePdf = async (): Promise<{ blob: Blob; file: File; filename: string } | null> => {
    if (pdf) return pdf;
    setBusy(true);
    try {
      const out = await generateCreditBillPdf(bill);
      setPdf(out);
      return out;
    } catch (e) {
      console.error("[creditBill] pdf gen failed", e);
      toast.error("Could not generate PDF");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const baseMessage = `Hello ${bill.customerName},\nYour credit bill #${bill.invoiceNo} for MVR ${bill.total.toFixed(2)} is attached.\nNew balance: MVR ${bill.newBalance.toFixed(2)}.\nThank you.`;

  const onDownload = async (): Promise<void> => {
    const out = await ensurePdf();
    if (out) {
      downloadBlob(out.blob, out.filename);
      toast.success("PDF downloaded");
    }
  };
  const onPrint = async (): Promise<void> => {
    const out = await ensurePdf();
    if (out) printPdfBlob(out.blob);
  };
  const onEmail = async (): Promise<void> => {
    const out = await ensurePdf();
    if (!out) return;
    emailPdf(out.blob, out.filename, undefined, `Credit Bill ${bill.invoiceNo}`, baseMessage);
  };
  const onShare = async (): Promise<void> => {
    const out = await ensurePdf();
    if (!out) return;
    if (canSharePdfFile(out.file)) {
      const r = await sharePdfFile(out.file, `Credit Bill ${bill.invoiceNo}`, baseMessage);
      if (r.ok) toast.success("Shared");
      else if (r.reason === "cancelled") return;
      else if (r.reason === "unsupported") {
        downloadBlob(out.blob, out.filename);
        try {
          await navigator.clipboard.writeText(baseMessage);
          toast.message("Sharing not supported \u2014 PDF downloaded & message copied");
        } catch {
          toast.message("PDF downloaded \u2014 attach it manually");
        }
      } else {
        toast.error("Share failed");
      }
    } else {
      downloadBlob(out.blob, out.filename);
      try {
        await navigator.clipboard.writeText(baseMessage);
        toast.message("PDF downloaded & message copied \u2014 attach manually in your chat app");
      } catch {
        toast.message("PDF downloaded \u2014 attach it manually");
      }
    }
  };
  const onQueue = async (): Promise<void> => {
    await ensurePdf();
    void enqueue({
      customerId,
      customerName: bill.customerName,
      customerPhone: bill.customerPhone ?? null,
      amount: bill.total,
      kind: "bill",
      message: baseMessage,
      link: null,
    });
    toast.success("Queued in Pending Sends");
  };

  return (
    <div className="col-span-2 mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-amber-900">
        <span>Credit Bill PDF · {bill.invoiceNo}</span>
        {busy && <span className="text-amber-700 normal-case">Generating PDF…</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <button
          disabled={busy}
          onClick={() => { void onDownload(); }}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
        >
          <FileDown className="h-3.5 w-3.5" /> Download
        </button>
        <button
          disabled={busy}
          onClick={() => { void onPrint(); }}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
        >
          <Printer className="h-3.5 w-3.5" /> Print PDF
        </button>
        <button
          disabled={busy}
          onClick={() => { void onEmail(); }}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
        >
          <Mail className="h-3.5 w-3.5" /> Email
        </button>
        <button
          disabled={busy}
          onClick={() => { void onShare(); }}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
        >
          <Share2 className="h-3.5 w-3.5" /> Share
        </button>
        <button
          disabled={busy}
          onClick={() => { void onQueue(); }}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
        >
          <Send className="h-3.5 w-3.5" /> Queue
        </button>
      </div>
      <p className="mt-2 text-[10px] text-amber-800">
        Customer receives the bill as a PDF file — no public link is sent. Use Share on supported devices, or Email/Download to attach manually.
      </p>
    </div>
  );
}

function SumRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success";
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-slate-600">{label}</span>
      <span
        className={`text-sm font-semibold ${
          tone === "success" ? "text-emerald-600" : "text-slate-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
