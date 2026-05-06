// deno-lint-ignore-file no-explicit-any
// Supabase Edge Function: admin-create-user
//
// Creates a Supabase Auth user with email confirmation already set,
// then upserts the matching `profiles` row. Requires the caller to be
// authenticated as an admin (verified via the `profiles` table).
//
// Deploy:
//   supabase functions deploy admin-create-user --no-verify-jwt
//
// Required secrets (set in Supabase project):
//   SUPABASE_URL                 (auto-provided)
//   SUPABASE_ANON_KEY            (auto-provided)
//   SUPABASE_SERVICE_ROLE_KEY    (auto-provided)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CreateUserBody {
  email: string;
  password: string;
  fullName: string;
  role: "admin" | "storekeeper" | "cashier";
  active: boolean;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { error: "Server is missing Supabase env vars" });
  }

  // Verify caller is an authenticated admin.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json(401, { error: "Missing auth token" });

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json(401, { error: "Not authenticated" });
  }
  const callerId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("role, active")
    .eq("id", callerId)
    .maybeSingle();
  if (profErr) return json(500, { error: profErr.message });
  if (!profile || profile.role !== "admin" || profile.active === false) {
    return json(403, { error: "Admin role required" });
  }

  let body: CreateUserBody;
  try {
    body = (await req.json()) as CreateUserBody;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const fullName = (body.fullName ?? "").trim();
  const role = body.role;
  const active = body.active !== false;

  if (!email || !password || !fullName || !role) {
    return json(400, { error: "Missing required fields" });
  }
  if (password.length < 6) {
    return json(400, { error: "Password must be at least 6 characters" });
  }
  if (role !== "admin" && role !== "storekeeper" && role !== "cashier") {
    return json(400, { error: "Invalid role" });
  }

  // Create auth user with email already confirmed so they can login immediately.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });
  if (createErr || !created?.user) {
    return json(400, {
      error: createErr?.message ?? "Failed to create auth user",
    });
  }

  const newId = created.user.id;
  const { error: upsertErr } = await admin.from("profiles").upsert(
    {
      id: newId,
      email,
      full_name: fullName,
      role,
      active,
    },
    { onConflict: "id" }
  );
  if (upsertErr) {
    // Best-effort cleanup of the just-created auth user.
    await admin.auth.admin.deleteUser(newId).catch(() => undefined);
    return json(500, { error: upsertErr.message });
  }

  return json(200, {
    ok: true,
    user: {
      id: newId,
      email,
      fullName,
      role,
      active,
      createdAt: new Date().toISOString(),
    },
  });
});
