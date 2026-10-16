import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { maldivesDay } from "@/components/SalesFinanceOverview";

type Closing = { drawer_id: string; closed_at: string; cashier_name: string; counted_cash: number; opening_cash: number; deductions: number; difference: number };
export const collectionRange = (closings: Closing[], from: string, to: string) => closings.filter(c => {
  const date = maldivesDay(c.closed_at);
  return (!from || date >= from) && (!to || date <= to);
});
const money = (value: number) => formatCurrency(value);
const cents = (value: number) => Math.round(Number(value) * 100);

export default function CashCollectionRange({ closings }: { closings: Closing[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const range = { from, to };
  const error = from && to && from > to ? "From date must be on or before To date." : "";
  const [expanded, setExpanded] = useState(false);
  const rows = (error ? [] : collectionRange(closings, range.from, range.to)).sort((a,b) => b.closed_at.localeCompare(a.closed_at));
  const actual = rows.reduce((sum,c) => sum + cents(c.counted_cash),0)/100;
  const opening = rows.reduce((sum,c) => sum + cents(c.opening_cash),0)/100;
  const net = rows.reduce((sum,c) => sum + cents(c.counted_cash) - cents(c.opening_cash),0)/100;
  const apply = (start: string, end: string) => {
    setFrom(start); setTo(end); setExpanded(true);
  };
  return <section className="rounded-xl border bg-white p-4" aria-label="Cash collection range">
    <h2 className="text-sm font-bold">Daily Cash Collections · All Recorded Closings</h2>
    <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); apply(from,to); }}>
      <label className="text-sm">Collected from<input aria-label="Collected from" type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1 block rounded-md border bg-background p-2"/></label>
      <label className="text-sm">Collected to<input aria-label="Collected to" type="date" value={to} onChange={event => setTo(event.target.value)} className="mt-1 block rounded-md border bg-background p-2"/></label>
      <Button type="submit">Check range</Button>
      <Button type="button" variant="outline" onClick={() => { const today=maldivesDay(new Date()); apply(today,today); }}>Today</Button>
      <Button type="button" variant="outline" onClick={() => { const today=maldivesDay(new Date()); apply(today.slice(0,8)+"01",today); }}>This month</Button>
      <Button type="button" variant="outline" onClick={() => apply("","")}>All dates</Button>
    </form>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    {!error && <>
    <p className="mt-3 text-xs text-slate-500" role="status">Showing {range.from || "earliest record"} to {range.to || "latest record"} · Both dates included · Maldives closing dates</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <div><p className="text-xs text-slate-500">Net cash collected across {rows.length} closings</p><strong className="text-xl" data-testid="collection-net">{money(net)}</strong></div>
      <div><p className="text-xs text-slate-500">Actual counted cash in range</p><strong className="text-xl">{money(actual)}</strong></div>
      <div><p className="text-xs text-slate-500">Opening float excluded</p><strong className="text-xl">{money(opening)}</strong></div>
    </div>
    <p className="mt-3 text-xs text-slate-500">Daily collection = actual counted cash − opening float. Actual counts already include excess, shortages and drawer cash-outs. This total is before later deposits and spending. Selecting a range does not change current account balances.</p>
    <Button className="mt-3" type="button" variant="outline" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Hide collection records" : "View collection records"}</Button>
    {expanded && <div className="mt-3 max-h-96 overflow-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted"><tr>{["Closed / cashier","Actual cash","Opening float","Net collected","Cash out (already deducted)","Excess / shortage (already included)"].map(h => <th className="whitespace-nowrap p-3 text-left" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(c => <tr key={c.drawer_id} className="border-t"><td className="p-3">{new Date(c.closed_at).toLocaleString("en-GB",{timeZone:"Indian/Maldives",dateStyle:"medium",timeStyle:"short"})}<div className="text-xs text-muted-foreground">{c.cashier_name}</div></td>{[Number(c.counted_cash),Number(c.opening_cash),(cents(c.counted_cash)-cents(c.opening_cash))/100,Number(c.deductions),Number(c.difference)].map((value,index) => <td className="whitespace-nowrap p-3" key={index}>{money(value)}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="p-4 text-muted-foreground">No cash drawer closings in this range.</p>}</div>}
    </>}
  </section>;
}
