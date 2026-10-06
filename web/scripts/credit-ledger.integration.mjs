import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  do $$ begin create role anon; exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  create schema if not exists auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
  create table public.profiles(id uuid primary key);
  insert into public.profiles values ('00000000-0000-0000-0000-000000000001');
  create function public.has_role(text[]) returns boolean language sql stable as $$ select true $$;
  create table public.customers(
    id uuid primary key default gen_random_uuid(), name text not null,
    opening_balance numeric(12,2) not null default 0,
    credit_limit numeric(12,2) not null default 0,
    balance numeric(12,2) not null default 0,
    last_payment_at timestamptz, created_at timestamptz not null default now()
  );
  create table public.sales(
    id uuid primary key default gen_random_uuid(), customer_id uuid references public.customers(id),
    payment_method text not null, total numeric(12,2) not null,
    user_id uuid references public.profiles(id), created_at timestamptz not null default now()
  );
  create table public.credit_transactions(
    id uuid primary key default gen_random_uuid(), customer_id uuid references public.customers(id) on delete cascade,
    type text not null check(type in ('sale','payment','adjust')), amount numeric(12,2) not null,
    sale_id uuid references public.sales(id) on delete set null, note text,
    user_id uuid references public.profiles(id), created_at timestamptz not null default now()
  );
  create table public.public_customers(id uuid primary key default gen_random_uuid(), auth_user_id uuid, name text, phone text);
  create table public.credit_refresh_signals(
    auth_user_id uuid not null references auth.users(id), customer_id uuid not null references public.customers(id),
    changed_at timestamptz not null default now(), primary key(auth_user_id, customer_id)
  );
`);

const customer = "10000000-0000-0000-0000-000000000001";
const missedSale = "20000000-0000-0000-0000-000000000001";
await db.query(`insert into customers(id,name,opening_balance,balance) values($1,'Test',100,999)`, [customer]);
await db.query(`insert into sales(id,customer_id,payment_method,total,user_id) values($1,$2,'credit',50,$3)`, [missedSale, customer, "00000000-0000-0000-0000-000000000001"]);
await db.query(`insert into credit_transactions(customer_id,type,amount,note) values($1,'sale',100,'Opening balance')`, [customer]);
await db.query(`insert into credit_transactions(customer_id,type,amount,sale_id,note) values($1,'sale',50,$2,'Credit sale')`, [customer, missedSale]);

await db.exec(await readFile(new URL("../supabase/migrations/0051_credit_ledger_integrity.sql", import.meta.url), "utf8"));

const balance = async () => Number((await db.query(`select balance from customers where id=$1`, [customer])).rows[0].balance);
assert.equal(await balance(), 150, "migration recalculates the derived balance without rewriting history");

const liveSale = "20000000-0000-0000-0000-000000000002";
await db.query(`insert into sales(id,customer_id,payment_method,total,user_id) values($1,$2,'credit',25.11,$3)`, [liveSale, customer, "00000000-0000-0000-0000-000000000001"]);
assert.equal(await balance(), 175.11, "credit sale updates ledger and balance atomically");

await db.query(`select * from record_credit_payment($1, $2, $3)`, [customer, 75.11, "cash"]);
assert.equal(await balance(), 100, "payment updates ledger and balance atomically");

await assert.rejects(
  db.query(`select * from record_credit_payment($1, $2, $3)`, [customer, 100.01, "too much"]),
  /exceeds outstanding balance/,
  "overpayment is rejected"
);
assert.equal(await balance(), 100, "failed overpayment changes nothing");

await db.query(`update sales set voided=true, void_reason='cancelled', voided_at=now(), voided_by=$2 where id=$1`, [liveSale, "00000000-0000-0000-0000-000000000001"]);
assert.equal(await balance(), 74.89, "void creates an equal reversal and recalculates balance");

await db.query(`update sales set payment_method='cash' where id=$1`, [missedSale]);
assert.equal(await balance(), 24.89, "changing payment method removes stale credit debt");

const totals = await db.query(`
  select round(coalesce(sum(case when type='payment' then -amount else amount end),0),2) as ledger
  from credit_transactions where customer_id=$1
`, [customer]);
assert.equal(Number(totals.rows[0].ledger), await balance(), "history total always equals displayed balance");

console.log("credit ledger integration passed");
