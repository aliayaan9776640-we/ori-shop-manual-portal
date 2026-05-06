# Ori Shop Management Portal

Full-stack retail shop management portal: inventory, sales, supplier ordering, credit customers, reports.

## Stack
- **Frontend:** Vite + React + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Supabase (Postgres + Auth + Edge Functions) — already wired via `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- **State/data:** @tanstack/react-query
- **Charts:** recharts
- **Currency:** MVR (Maldivian Rufiyaa)

---

## 1. Run locally

```bash
# 1. Clone / unzip the project
cd web

# 2. Install deps (uses bun, but npm/pnpm also works)
bun install
# or: npm install

# 3. Create .env (see Environment Variables below)
cp .env.example .env

# 4. Start dev server
bun run dev
# → http://localhost:5173
```

Default admin login (seeded):
- Email: `admin@ori.mv`
- Password: `admin123`

---

## 2. Environment variables

Create a `.env` file in `/web` with:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

The app also reads the legacy `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` if present.

---

## 3. Database schema (SQL)

Run this in the Supabase SQL editor.

```sql
-- USERS (mirrors auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role text not null check (role in ('admin','storekeeper','cashier')) default 'cashier',
  active boolean default true,
  created_at timestamptz default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text,
  phone text,
  viber text,
  email text,
  address text,
  notes text,
  created_at timestamptz default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  barcode text unique,
  category_id uuid references public.categories(id),
  supplier_id uuid references public.suppliers(id),
  unit_type text check (unit_type in ('piece','kg','tin','box','case')) default 'piece',
  pieces_per_case int default 1,
  purchase_price numeric(12,2) default 0,
  boat_fee numeric(12,2) default 0,
  other_cost numeric(12,2) default 0,
  landed_cost numeric(12,2) generated always as (purchase_price + boat_fee + other_cost) stored,
  margin_pct numeric(6,2) default 20,
  selling_price numeric(12,2) default 0,
  reorder_level int default 0,
  expiry_date date,
  photo_url text,
  stock_pieces int default 0,
  created_at timestamptz default now()
);

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  type text check (type in ('in','out','adjust','damage','sale','receive')),
  qty int not null,
  note text,
  user_id uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique,
  customer_id uuid,
  payment_method text check (payment_method in ('cash','card','bank','credit')) default 'cash',
  total numeric(12,2) default 0,
  profit numeric(12,2) default 0,
  user_id uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references public.sales(id) on delete cascade,
  product_id uuid references public.products(id),
  qty int not null,
  unit_type text,
  unit_price numeric(12,2),
  landed_cost numeric(12,2),
  line_total numeric(12,2),
  line_profit numeric(12,2)
);

create table public.damaged_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id),
  qty int not null,
  unit_type text,
  reason text,
  landed_cost_per_unit numeric(12,2),
  loss_amount numeric(12,2),
  stock_before int,
  stock_after int,
  user_id uuid references public.profiles(id),
  date date default current_date,
  notes text,
  created_at timestamptz default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id),
  status text check (status in ('pending','loaded','received','partial','cancelled')) default 'pending',
  boat_name text,
  boat_contact text,
  loading_date date,
  sent_date date,
  expected_date date,
  received_date date,
  notes text,
  created_at timestamptz default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  qty int not null,
  unit_type text,
  received_qty int default 0,
  notes text
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  opening_balance numeric(12,2) default 0,
  credit_limit numeric(12,2) default 0,
  balance numeric(12,2) default 0,
  notes text,
  created_at timestamptz default now()
);

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  type text check (type in ('sale','payment','adjust')),
  amount numeric(12,2) not null,
  sale_id uuid references public.sales(id),
  note text,
  user_id uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  action text,
  entity text,
  entity_id uuid,
  meta jsonb,
  created_at timestamptz default now()
);

-- RLS
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
-- ... (apply policies per role)

create policy "auth read" on public.products for select using (auth.role() = 'authenticated');
create policy "admin write" on public.products for all using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','storekeeper'))
);
```

Seed script: `web/supabase/seed.sql` (sample categories, suppliers, products, admin user).

---

## 4. Deploy on Vercel

1. Push the `/web` folder to a GitHub repo.
2. Go to [vercel.com/new](https://vercel.com/new) → Import the repo.
3. **Framework preset:** Vite
4. **Root directory:** `web` (if monorepo) or leave blank
5. **Build command:** `bun run build` (or `npm run build`)
6. **Output directory:** `dist`
7. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
8. Click **Deploy**.

That's it — Vercel auto-redeploys on every push.

---

## 5. Project structure

```
web/
├── src/
│   ├── pages/          # Dashboard, Inventory, Sales, Suppliers, Orders, Credit, Reports, Login
│   ├── components/     # Layout, Sidebar, Header, charts, ui/ (shadcn)
│   ├── lib/            # supabase client, currency (MVR), calculations
│   ├── hooks/          # useAuth, useProducts, useSales, etc.
│   └── App.tsx
├── public/             # logo, favicon
├── supabase/           # schema.sql, seed.sql
└── package.json
```

---

## 6. Download

The full source is bundled at: **`/ori-shop-portal.zip`** (served from this same site root).
