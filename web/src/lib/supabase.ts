import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Read from VITE_ vars first, fall back to platform-provided EXPO_PUBLIC_ vars
// so the live preview keeps working without extra config.
const SUPABASE_URL: string =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  (import.meta.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined) ??
  "";

const SUPABASE_ANON_KEY: string =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ??
  "";

export const isSupabaseConfigured: boolean =
  SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. " +
      "The app will run with a local in-memory store until configured."
  );
}

// Use a stable storage key so a stale session from the previous build
// doesn't lock users out.
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY || "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "ori-shop-portal-auth",
    },
  }
);

/**
 * Build a *secondary* Supabase client that does NOT persist its session.
 * Used by the admin "Add User" flow so creating a new account does not
 * replace the currently logged-in admin's session in the main client.
 */
export const buildAdminSignupClient = (): SupabaseClient =>
  createClient(
    SUPABASE_URL || "https://placeholder.supabase.co",
    SUPABASE_ANON_KEY || "placeholder-anon-key",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

/**
 * Customer-facing storefront uses its OWN Supabase client with a separate
 * storage key so customer login at /store does not clobber the staff
 * session in the admin portal (and vice-versa).
 */
export const customerSupabase: SupabaseClient = createClient(
  SUPABASE_URL || "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY || "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "ori-shop-customer-auth",
    },
  }
);

/** Synthetic email used for customer auth (Supabase Auth requires an email). */
export const customerEmailFromPhone = (phone: string): string => {
  const clean = phone.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();
  return `c${clean}@customers.ori.local`;
};
