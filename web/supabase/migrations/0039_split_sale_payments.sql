-- Persist cash + bank split payments without changing legacy sale behavior.
alter table public.sales
  add column if not exists cash_amount numeric(12,2) not null default 0,
  add column if not exists bank_amount numeric(12,2) not null default 0;

comment on column public.sales.cash_amount is
  'Cash portion when payment_method is split; zero for legacy payment methods.';
comment on column public.sales.bank_amount is
  'Bank portion when payment_method is split; zero for legacy payment methods.';

alter table public.sales drop constraint if exists sales_payment_method_check;
alter table public.sales
  add constraint sales_payment_method_check
  check (payment_method in ('cash', 'card', 'bank', 'credit', 'split'));
