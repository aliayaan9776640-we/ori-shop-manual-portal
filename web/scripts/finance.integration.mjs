import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
  create function public.is_admin() returns boolean language sql as $$ select coalesce(current_setting('test.admin',true),'false')='true' $$;
  create table public.profiles(id uuid primary key);
  insert into public.profiles values ('00000000-0000-0000-0000-000000000001');
  create table public.cash_drawers(id text primary key, status text not null default 'open', cashier_name text,
    opening_cash numeric(12,2) not null default 0, cash_sales numeric(12,2) not null default 0,
    card_sales numeric(12,2) not null default 0, bank_sales numeric(12,2) not null default 0,
    cash_used numeric(12,2) not null default 0, change_given numeric(12,2) not null default 0,
    counted_cash numeric(12,2) not null default 0, difference numeric(12,2) not null default 0,
    closed_at timestamptz, notes text);
  create publication supabase_realtime;
`);
await db.exec(await readFile(new URL('../supabase/migrations/0042_sales_finance.sql', import.meta.url),'utf8'));
await db.exec(`set test.admin='true'`);
const post = async (kind,amount,account=null,reason='Test reference',drawer=null,fee=0,id=crypto.randomUUID()) =>
  (await db.query('select public.finance_post($1,$2,$3,$4,$5,$6,$7) id',[id,kind,amount,account,reason,drawer,fee])).rows[0].id;
const snapshot = async () => (await db.query('select public.finance_snapshot() data')).rows[0].data;
const balances = async () => Object.fromEntries((await snapshot()).accounts.map(a => [a.kind,Number(a.balance)]));
await db.exec(`insert into cash_drawers(id,opening_cash) values ('legacy-open',100)`);
await assert.rejects(post('initialize',1000), /Close all drawers/);
await db.exec(`update cash_drawers set status='closed',counted_cash=700,closed_at=now() where id='legacy-open'`);
await post('initialize',1000);
assert.equal((await snapshot()).closings.length,0,'Historical cash must not be replayed');
await assert.rejects(post('initialize',1000),/already initialized/);
await post('bank_opening',100,null,'Business account');
const bank = (await snapshot()).accounts.find(a => a.kind==='bank').id;
await db.exec(`insert into cash_drawers(id,opening_cash) values ('day1',200)`);
assert.deepEqual(await balances(),{cash:800,bank:100});
assert.equal((await snapshot()).open_float,200);
await db.exec(`update cash_drawers set status='closed',cash_sales=300,cash_used=50,counted_cash=450,card_sales=80,bank_sales=40,closed_at=now() where id='day1'`);
assert.deepEqual(await balances(),{cash:1250,bank:100});
assert.equal((await snapshot()).open_float,0);
await db.exec(`update cash_drawers set status='approved' where id='day1'`);
assert.equal((await balances()).cash,1250,'Approval must not double credit closing');
await assert.rejects(db.exec(`update cash_drawers set counted_cash=999 where id='day1'`),/cannot be edited/);
await assert.rejects(db.exec(`delete from cash_drawers where id='day1'`),/foreign key/);
const retry = crypto.randomUUID();
await post('deposit',1000,bank,'Bank slip #1',null,0,retry);
await post('deposit',1000,bank,'Bank slip #1',null,0,retry);
assert.deepEqual(await balances(),{cash:250,bank:1100},'Retry must be idempotent');
await assert.rejects(post('deposit',251,bank),/Insufficient/);
assert.deepEqual(await balances(),{cash:250,bank:1100},'Overdraft must roll back both balances');
await post('bank_expense',100,bank,'Goods invoice #1');
await post('cash_expense',50,null,'Delivery');
await post('card_settlement',80,bank,'Settlement #1','day1',2);
await assert.rejects(post('card_settlement',80,bank,'Duplicate','day1',2),/already settled/);
await assert.rejects(post('transfer_settlement',39,bank,'Wrong amount','day1'),/does not match/);
await post('transfer_settlement',40,bank,'Transfer #1','day1');
assert.deepEqual(await balances(),{cash:200,bank:1118});
await db.exec(`insert into cash_drawers(id,opening_cash) values ('day2',200)`);
await db.exec(`update cash_drawers set status='closed',cash_used=200,counted_cash=0,closed_at=now() where id='day2'`);
assert.equal((await balances()).cash,0,'Float carried forward must not create money');
await post('cash_receipt',800,null,'Owner funding');
await post('deposit',800,bank,'Full deposit');
assert.deepEqual(await balances(),{cash:0,bank:1918},'Full cash deposit clears on-hand cash');
await assert.rejects(post('bank_expense',1,bank,' '),/reason is required/);
await assert.rejects(post('cash_receipt',1.001),/two decimal/);
await assert.rejects(post('cash_receipt','NaN'),/valid amount/);
await assert.rejects(db.exec(`insert into cash_drawers(id,opening_cash) values ('overdraft',1)`),/Not enough cash/);
await db.exec(`set test.admin='false'; set role authenticated;`);
assert.equal((await db.query('select * from finance_accounts')).rows.length,0,'Non-admin RLS');
await assert.rejects(snapshot(),/Admin access required/);
await assert.rejects(post('cash_receipt',1000),/Admin access required/);
await assert.rejects(db.exec(`update finance_accounts set balance=9999`),/permission denied/);
await db.exec(`reset role; set test.admin='true'`);
assert.equal((await snapshot()).entries.length,13);
await db.exec(await readFile(new URL('../supabase/migrations/0043_finance_auto_bank.sql', import.meta.url),'utf8'));
await db.query('select finance_set_receiving_bank($1)', [bank]);
await post('cash_receipt',100);
await db.exec(`insert into cash_drawers(id,opening_cash) values ('auto-day',100)`);
await db.exec(`update cash_drawers set status='closed',cash_sales=300,cash_used=50,counted_cash=350,card_sales=80,bank_sales=40,closed_at=now() where id='auto-day'`);
assert.deepEqual(await balances(),{cash:350,bank:2038},'Closing credits counted cash and both bank payment types');
await db.exec(`update cash_drawers set status='approved' where id='auto-day'`);
assert.deepEqual(await balances(),{cash:350,bank:2038},'Approval never duplicates auto credits');
await assert.rejects(post('card_settlement',80,bank,'Duplicate','auto-day'),/already settled/);
await post('deposit',350,bank,'Full deposit after automatic closing');
await post('bank_expense',88,bank,'Goods purchased');
assert.deepEqual(await balances(),{cash:0,bank:2300},'Deposit clears cash and bank spending deducts immediately');
await db.exec(`set test.admin='false'; set role authenticated;`);
await assert.rejects(db.query('select finance_set_receiving_bank($1)',[bank]),/Admin access required/);
await db.exec(`reset role; set test.admin='true'`);
await db.exec('begin; truncate finance_entries, finance_closings, finance_accounts cascade;');
await post('initialize',0);
await post('bank_opening',500,null,'First receiving account');
assert.equal((await snapshot()).accounts.find(a=>a.kind==='bank').auto_receipts,true,'First bank receives automatically');
await post('bank_opening',100,null,'Second account');
assert.equal((await snapshot()).accounts.filter(a=>a.auto_receipts).length,1,'Only one automatic receiving bank');
await db.exec('rollback;');
await post('cash_receipt',100);
await db.exec(`insert into cash_drawers(id,opening_cash) values ('excess-day',50)`);
await db.exec(`update cash_drawers set status='closed',cash_sales=50,cash_used=20,change_given=10,counted_cash=85,closed_at=now() where id='excess-day'`);
assert.equal((await balances()).cash,135,'Actual count includes excess exactly once; neither cash-out nor change is subtracted again');
await db.exec(`insert into cash_drawers(id,opening_cash) values ('short-day',20)`);
await db.exec(`update cash_drawers set status='closed',cash_sales=30,cash_used=10,counted_cash=37,closed_at=now() where id='short-day'`);
assert.equal((await balances()).cash,152,'Actual count includes shortage exactly once');
await db.exec(`alter table profiles add column full_name text;
create table sales(id text,created_at timestamptz,total numeric,payment_method text,cash_amount numeric,bank_amount numeric,voided boolean);
insert into sales values
('cash','2026-10-01T20:00:00Z',100,'cash',null,null,false),
('split','2026-10-02T10:00:00Z',200,'split',50,150,false),
('card','2026-10-02T11:00:00Z',80,'card',null,null,false),
('credit','2026-10-02T12:00:00Z',30,'credit',null,null,false),
('void','2026-10-02T12:00:00Z',999,'card',null,null,true),
('nextday','2026-10-02T19:00:00Z',90,'cash',null,null,false);`);
await db.exec(await readFile(new URL('../supabase/migrations/0045_finance_dashboard.sql',import.meta.url),'utf8'));
const dashboard=(await db.query("select finance_dashboard('2026-10-02') data")).rows[0].data;
assert.deepEqual(dashboard.days,[{day:'2026-10-02',total:410,cash:150,bank:150,card:80,credit:30}], 'Daily sales honor Maldives midnight, split payments and void exclusions');
await db.exec(`set test.admin='false'`);
await assert.rejects(db.query("select finance_dashboard('2026-10-02')"),/Admin access required/);
await db.close();
console.log('PASS: setup, history cutoff, drawer cash, approval deduplication, float carry-forward, deposits, expenses, settlement fees, retries, overdrafts, immutability, validation and admin-only database access.');

