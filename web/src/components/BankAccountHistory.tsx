import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
type Bank = {id:string;name:string;balance:number};
type Transfer = {id:string;date:string;name:string|null;reference:string|null;invoice:string|null;amount:number};
type Entry = {id:string;created_at:string;kind:string;amount:number;fee:number;change:number;balance_after:number;reason:string;source_name:string;destination_name:string;drawer_id:string|null;transfers:Transfer[]};
const money=(v:number)=>formatCurrency(Number(v));
const date=(v:string)=>new Date(v).toLocaleString('en-GB',{timeZone:'Indian/Maldives',dateStyle:'medium',timeStyle:'short'});
const names:Record<string,string>={bank_opening:'Opening balance',deposit:'Deposit from on-hand cash',bank_receipt:'Deposit from other source',bank_expense:'Money used',card_settlement:'Card payments',transfer_settlement:'Customer bank transfers'};
export default function BankAccountHistory({banks,updated,onAdd}:{banks:Bank[];updated:string;onAdd:()=>void}) {
 const [account,setAccount]=useState(''); const [offset,setOffset]=useState(0);
 const [rows,setRows]=useState<Entry[]>([]); const [count,setCount]=useState(0); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [retry,setRetry]=useState(0);
 const generation=useRef(0); const loadedKey=useRef<string | null>(null);
 useEffect(()=>{
  const current=++generation.current; const key=JSON.stringify([account,offset,retry]); if(loadedKey.current!==key)setLoading(true); setError('');
  void (async()=>{try {
   const result=await supabase.rpc('finance_bank_history',{p_account:account||null,p_offset:offset});
   if(current!==generation.current)return;
   if(result.error)throw result.error;
   loadedKey.current=key; setRows(result.data?.entries??[]);setCount(Number(result.data?.count??0));
  } catch(e){if(current===generation.current)setError((e as {message?:string}).message??'Unable to load bank history');}
  finally{if(current===generation.current)setLoading(false);}})();
  return()=>{++generation.current;};
 },[account,offset,updated,retry]);
 return <div className="space-y-4">
  <div className="flex flex-wrap items-end gap-3"><label className="flex-1 text-sm">History account<select aria-label="History account" className="mt-1 block w-full rounded-md border bg-background p-2" value={account} onChange={e=>{setAccount(e.target.value);setOffset(0);}}><option value="">All bank accounts</option>{banks.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select></label><Button onClick={onAdd} variant="outline">Add bank account</Button></div>
  <div className="rounded-xl bg-blue-50 p-4"><p className="text-xs text-slate-600">Current recorded bank balance</p><strong className="text-2xl">{money(banks.filter(b=>!account||b.id===account).reduce((s,b)=>s+Number(b.balance),0))}</strong></div>
  <p className="text-xs text-muted-foreground">Bank credits and debits recorded in this portal. Expand a customer-transfer entry to check the linked sales transfer details. These details explain the posted receipt and are not credited again.</p>
  {loading ? <p role="status">Loading bank history…</p> : error ? <div role="alert">{error}<Button variant="outline" onClick={()=>setRetry(retry+1)}>Retry history</Button></div> : <>
  <div className="max-h-[45vh] space-y-2 overflow-auto">{rows.map(e=><details key={e.id} className="rounded-lg border p-3"><summary className="cursor-pointer list-none"><div className="flex justify-between gap-3"><div><p className="text-sm font-semibold">{names[e.kind]??e.kind}</p><p className="text-xs text-muted-foreground">{date(e.created_at)}</p></div><div className="text-right"><strong className={Number(e.change)<0?'text-red-700':'text-emerald-700'}>{Number(e.change)>0?'+':''}{money(e.change)}</strong><p className="text-xs text-muted-foreground">Balance after: {money(e.balance_after)}</p></div></div><p className="mt-1 text-xs">{e.reason}</p><span className="text-xs text-blue-700">View details</span></summary><div className="mt-3 space-y-2 border-t pt-3 text-sm"><p>From: {e.source_name} → To: {e.destination_name}</p><p>Amount: {money(e.amount)} · Fee: {money(e.fee)}</p>{e.drawer_id&&<p className="break-all text-xs">Drawer: {e.drawer_id}</p>}{e.kind==='transfer_settlement'&&<><h3 className="font-semibold">Sales transfer details</h3>{e.transfers.length ? e.transfers.map(t=><div key={t.id} className="rounded bg-muted p-2"><div className="flex justify-between"><span>{t.name||'Customer not recorded'}</span><strong>{money(t.amount)}</strong></div><p className="text-xs">{date(t.date)} · Invoice: {t.invoice||'—'}</p><p className="text-xs">Phone / reference: {t.reference||'Not recorded'}</p></div>):<p>No linked sales transfer details available for this receipt.</p>}</>}</div></details>)}{!rows.length&&<p>No recorded bank transactions for this account.</p>}</div>
  <div className="flex items-center justify-between"><Button variant="outline" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Newer</Button><span className="text-xs">{count?offset+1:0}–{Math.min(offset+50,count)} of {count}</span><Button variant="outline" disabled={offset+50>=count} onClick={()=>setOffset(offset+50)}>Older</Button></div>
  </>}
 </div>;
}
