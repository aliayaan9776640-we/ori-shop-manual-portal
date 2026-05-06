# Ori Shop Management Portal

Production-ready inventory, sales, supplier ordering and credit-customer
portal for **Ori Barakah Store / Ori Brothers**.

Stack: **Vite + React + TypeScript + Tailwind + shadcn/ui + Supabase**.

---

## 1. Local development

```bash
bun install
bun run dev
```

The portal runs at <http://localhost:5173>.

If `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are not set, the app falls
back to a local in-memory store with the demo accounts shown on the login
screen — useful for quick UI testing.

## 2. Supabase setup

1. Create a project at <https://supabase.com>.
2. Open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](./supabase/schema.sql) and run it. This creates
   every table (`profiles`, `products`, `categories`, `suppliers`,
   `inventory_transactions`, `sales`, `sale_items`, `damaged_items`,
   `orders`, `order_items`, `customers`, `credit_transactions`, `payments`,
   `activity_logs`), the role-based RLS policies and an
   `on_auth_user_created` trigger that auto-creates a profile row whenever
   someone signs up.
3. **Authentication → Providers → Email** — turn off "Confirm email" if you
   want users to log in immediately without verifying.
4. **Authentication → Users → Add user** — create your first account, e.g.
   `admin@oribrothers.com` with a password.
5. Promote that user to admin in **SQL Editor**:
   ```sql
   update public.profiles set role = 'admin'
   where email = 'admin@oribrothers.com';
   ```
6. From **Settings → API** copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon / public key** → `VITE_SUPABASE_ANON_KEY`

### Creating staff accounts

Once logged in as an admin, open **Users → Add User**. The form creates a
real Supabase Auth account and a matching `profiles` row. Roles available:

- `admin` — full access
- `storekeeper` — inventory, suppliers, orders, damaged items
- `cashier` — sales, products (read), credit customers

## 3. Environment variables

Create a `.env.local` in `web/`:

```bash
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

Both variables must be prefixed with `VITE_` to be exposed to the browser.

## 4. Deploying to Vercel

1. Push this repo to GitHub.
2. On <https://vercel.com> → **Add New → Project** → import the repo.
3. **Root Directory:** `web`
4. **Build command:** `bun run build` (or `npm run build`)
5. **Output directory:** `dist`
6. Add the two environment variables under **Settings → Environment
   Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
7. Click **Deploy**.

After the first deploy, attach a custom domain under **Settings → Domains**.

### Single-page-app rewrites

The portal uses client-side routing (`react-router-dom`). Vercel auto-detects
Vite SPAs and serves `index.html` for all paths, so no extra config is
required. If you ever switch hosts, add a fallback rewrite of
`/* → /index.html`.

## 5. How data persistence works

- All reads/writes go to **Supabase Postgres**. Data is shared across every
  device and network.
- Auth is handled by **Supabase Auth** (email + password). Sessions are
  stored in `localStorage` and auto-refresh.
- Row-Level Security policies enforce role-based access on the database
  itself, so even a tampered client cannot bypass them.
- The Zustand store keeps an in-memory cache for instant UI updates;
  mutations are persisted to Supabase in the background and reconciled.

## 6. Useful SQL snippets

Promote a user:
```sql
update public.profiles set role = 'admin' where email = '...';
```

Deactivate a user (admin can also do this from the Users page):
```sql
update public.profiles set active = false where email = '...';
```

Reset all transactional data (keep masters):
```sql
truncate public.sale_items, public.sales, public.damaged_items,
         public.order_items, public.orders, public.credit_transactions,
         public.payments, public.activity_logs,
         public.inventory_transactions restart identity cascade;
```
