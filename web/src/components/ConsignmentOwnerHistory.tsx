import { createContext, useContext } from "react";
import { useConsignment, computeOwnerBalance, itemBalance } from "@/lib/consignment";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

export const ConsignmentOwnerContext = createContext({ ownerId: "all", select: (_id: string) => {} });
export const useSelectedConsignmentOwner = () => useContext(ConsignmentOwnerContext);
export function OwnerHistoryLink({ id, name }: { id?: string; name: string }) {
  const { select } = useSelectedConsignmentOwner();
  return id ? <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => select(id)}>{name}</button> : <span>{name}</span>;
}

export default function ConsignmentOwnerHistory({ tab }: { tab: string }) {
  const { ownerId } = useSelectedConsignmentOwner();
  const { owners, items, sales, settlements, returns, receipts } = useConsignment();
  const owner = owners.find(o => o.id === ownerId);
  if (!owner) return null;
  const balance = computeOwnerBalance(owner.id, items, sales, settlements);
  const stock = items.filter(i => i.ownerId === owner.id);
  const name = (id: string) => items.find(i => i.id === id)?.name ?? "Archived item";
  const events = [
    ...receipts.filter(r => r.owner_id === ownerId).map(r => ({ id: r.id, type: "stock", date: r.received_date, detail: `${name(r.item_id)} · +${r.qty} received`, notes: r.notes })),
    ...sales.filter(s => s.ownerId === ownerId).map(s => ({ id: s.id, type: "sales", date: s.createdAt, detail: `${name(s.itemId)} · ${s.qty} sold · owner payable ${formatCurrency(s.payableAmount)}`, notes: s.notes })),
    ...returns.filter(r => r.ownerId === ownerId).map(r => ({ id: r.id, type: "returns", date: r.createdAt, detail: `${name(r.itemId)} · ${r.qty} returned${r.returnValue == null ? "" : ` · stock value ${formatCurrency(r.returnValue)}`}`, notes: r.notes })),
    ...settlements.filter(s => s.ownerId === ownerId).map(s => ({ id: s.id, type: "settlements", date: s.paidAt, detail: `${s.adjustsId ? "Correction" : "Payment"} · ${formatCurrency(s.amount)} · ${s.paymentMethod}${s.adjustsId ? ` · original ${s.adjustsId.slice(0,8)}` : ""}`, notes: s.notes })),
  ].filter(e => tab === "owners" || (tab === "stock" ? ["stock","sales","returns"].includes(e.type) : e.type === tab))
    .sort((a,b) => b.date.localeCompare(a.date));
  return <section className="my-4 space-y-3 rounded-xl border bg-card p-4" aria-label="Selected owner history">
    <h2 className="font-bold">{owner.name} — {tab === "owners" ? "Full history" : `${tab} history`}</h2>
    <div className="flex flex-wrap gap-5 text-sm"><span>Owner payable: {formatCurrency(balance.totalPayable)}</span><span>Paid: {formatCurrency(balance.totalPaid)}</span><strong>{balance.remainingPayable < 0 ? "Credit carried forward" : "Outstanding"}: {formatCurrency(Math.abs(balance.remainingPayable))}</strong></div>
    <p className="text-xs text-muted-foreground">Unsold stock carries forward when restocked. Returning unsold goods reduces stock, not money owed for goods already sold.</p>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>Current stock</th><th>Received</th><th>Sold</th><th>Returned</th><th>Remaining</th><th>Last receipt</th></tr></thead><tbody>{stock.map(i => <tr key={i.id}><td>{i.name}</td><td>{i.qtyReceived}</td><td>{i.qtySold}</td><td>{i.qtyReturned}</td><td>{itemBalance(i)} {i.unitType}</td><td>{formatDate(receipts.filter(r=>r.item_id===i.id).map(r=>r.received_date).sort().at(-1) ?? i.receivedDate)}</td></tr>)}</tbody></table></div>
    <div className="max-h-72 overflow-auto divide-y">{events.length ? events.map(e => <div key={`${e.type}-${e.id}`} className="py-2 text-sm"><span className="mr-3 text-xs text-muted-foreground">{e.date.length === 10 ? formatDate(e.date) : formatDateTime(e.date)}</span>{e.detail}{e.notes && <p className="text-xs text-muted-foreground">{e.notes}</p>}</div>) : <p className="text-sm">No history in this section.</p>}</div>
  </section>;
}
