import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import Logo from "@/components/Logo";
import { Receipt, Wallet, ShieldCheck, Phone, Printer } from "lucide-react";

interface PublicItem {
  name: string;
  qty: number;
  unit: string | null;
  price: number;
  total: number;
}
interface PublicTx {
  id: string;
  type: "sale" | "payment" | "adjust";
  amount: number;
  note: string | null;
  sale_id: string | null;
  cashier: string | null;
  payment_method: string | null;
  created_at: string;
  items: PublicItem[] | null;
}
interface PublicAccount {
  customer: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    balance: number;
    credit_limit: number;
    opening_balance: number;
    last_payment_at: string | null;
    created_at: string;
  };
  transactions: PublicTx[];
}

export default function PublicBill(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const [account, setAccount] = useState<PublicAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!token) {
        setError("Missing link token");
        setLoading(false);
        return;
      }
      if (!isSupabaseConfigured) {
        setError("System not configured");
        setLoading(false);
        return;
      }
      try {
        const { data, error: rpcErr } = await supabase.rpc("get_credit_account", {
          p_token: token,
        });
        if (cancelled) return;
        if (rpcErr) {
          console.error("[publicBill] rpc error", rpcErr);
          setError("Could not load your account. Please contact the store.");
        } else if (!data) {
          setError("This link is no longer valid.");
        } else {
          setAccount(data as unknown as PublicAccount);
        }
      } catch (e) {
        if (cancelled) return;
        console.error("[publicBill]", e);
        setError("Network error. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const totals = useMemo(() => {
    if (!account) return { credit: 0, paid: 0 };
    let credit = 0;
    let paid = 0;
    account.transactions.forEach((t) => {
      if (t.type === "sale") credit += Number(t.amount);
      else paid += Number(t.amount);
    });
    return { credit, paid };
  }, [account]);

  const months = useMemo(() => {
    if (!account) return [] as { key: string; label: string; credit: number; payment: number }[];
    const map = new Map<
      string,
      { key: string; label: string; credit: number; payment: number }
    >();
    account.transactions.forEach((t) => {
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
      const cur = map.get(key) ?? { key, label, credit: 0, payment: 0 };
      if (t.type === "sale") cur.credit += Number(t.amount);
      else cur.payment += Number(t.amount);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) =>
      a.key < b.key ? 1 : -1
    );
  }, [account]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="flex flex-col items-center gap-4">
          <Logo size={56} ring />
          <div className="text-sm text-muted-foreground">
            Loading your account…
          </div>
        </div>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <Logo size={56} ring />
          <h1 className="mt-4 text-xl font-semibold text-destructive">
            {error ?? "Account unavailable"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            If you believe this is a mistake, please contact Ori Barakah Store.
          </p>
        </div>
      </div>
    );
  }

  const c = account.customer;

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/40 via-background to-background pb-16">
      <div className="mx-auto max-w-3xl px-4 pt-8 lg:px-0">
        <div className="rounded-3xl bg-gradient-to-br from-[#5a6b1f] to-[#3d4a14] p-6 text-white shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Logo size={48} ring />
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] opacity-80">
                  Ori Barakah Store
                </div>
                <div className="text-lg font-bold">Credit Account</div>
              </div>
            </div>
            <button
              onClick={() => window.print()}
              className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-[11px] font-medium hover:bg-white/20"
            >
              <Printer className="mr-1 inline h-3 w-3" /> Print
            </button>
          </div>

          <div className="mt-6">
            <div className="text-[11px] uppercase tracking-widest opacity-80">
              Customer
            </div>
            <div className="mt-1 text-2xl font-bold">{c.name}</div>
            {c.phone && (
              <div className="mt-1 flex items-center gap-1.5 text-xs opacity-90">
                <Phone className="h-3 w-3" /> {c.phone}
              </div>
            )}
          </div>

          <div className="mt-6 rounded-2xl bg-white/10 p-4 backdrop-blur">
            <div className="text-[11px] uppercase tracking-widest opacity-80">
              Outstanding Balance
            </div>
            <div className="mt-1 text-4xl font-extrabold">
              {formatCurrency(Number(c.balance))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
              <Stat label="Total Credit" value={formatCurrency(totals.credit)} />
              <Stat label="Total Paid" value={formatCurrency(totals.paid)} />
              <Stat
                label="Last Payment"
                value={c.last_payment_at ? formatDate(c.last_payment_at) : "—"}
              />
            </div>
          </div>
        </div>

        {/* Monthly statements */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              Monthly Statements
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Month</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th className="px-3 py-2 text-right">Paid</th>
                <th className="px-3 py-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const net = m.credit - m.payment;
                return (
                  <tr key={m.key} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{m.label}</td>
                    <td className="px-3 py-2 text-right">
                      {formatCurrency(m.credit)}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-700">
                      {formatCurrency(m.payment)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-semibold ${
                        net > 0 ? "text-rose-600" : "text-emerald-700"
                      }`}
                    >
                      {formatCurrency(net)}
                    </td>
                  </tr>
                );
              })}
              {months.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Transactions */}
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Full Transaction History
          </h2>
          <div className="space-y-3">
            {account.transactions.map((t) => {
              const isSale = t.type === "sale";
              return (
                <div
                  key={t.id}
                  className={`rounded-2xl border bg-card p-4 shadow-sm ${
                    isSale
                      ? "border-rose-100"
                      : "border-emerald-200 bg-emerald-50/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        {isSale ? (
                          <Receipt className="h-4 w-4 text-rose-600" />
                        ) : (
                          <Wallet className="h-4 w-4 text-emerald-600" />
                        )}
                        <span className="text-xs font-semibold uppercase tracking-wider">
                          {isSale ? "Credit Sale" : "Payment Received"}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatDateTime(t.created_at)}
                        {t.cashier ? ` · ${t.cashier}` : ""}
                      </div>
                      {t.note && (
                        <div className="mt-1 text-[11px] italic text-muted-foreground">
                          {t.note}
                        </div>
                      )}
                    </div>
                    <div
                      className={`text-xl font-bold ${
                        isSale ? "text-rose-600" : "text-emerald-700"
                      }`}
                    >
                      {isSale ? "+" : "-"}
                      {formatCurrency(Number(t.amount))}
                    </div>
                  </div>

                  {isSale && t.items && t.items.length > 0 && (
                    <div className="mt-3 overflow-hidden rounded-lg border border-border">
                      <table className="w-full text-xs">
                        <thead className="bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <tr>
                            <th className="px-3 py-1.5 text-left">Item</th>
                            <th className="px-3 py-1.5 text-right">Qty</th>
                            <th className="px-3 py-1.5 text-right">Price</th>
                            <th className="px-3 py-1.5 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {t.items.map((it, i) => (
                            <tr key={i} className="border-t border-border">
                              <td className="px-3 py-1.5">{it.name}</td>
                              <td className="px-3 py-1.5 text-right">
                                {it.qty} {it.unit ?? ""}
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                {formatCurrency(Number(it.price))}
                              </td>
                              <td className="px-3 py-1.5 text-right font-medium">
                                {formatCurrency(Number(it.total))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
            {account.transactions.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
                No credit activity yet.
              </div>
            )}
          </div>
        </section>

        <div className="mt-10 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          © {new Date().getFullYear()} Ori Barakah Store · Secure customer view
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg bg-white/10 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider opacity-70">
        {label}
      </div>
      <div className="text-xs font-semibold">{value}</div>
    </div>
  );
}
