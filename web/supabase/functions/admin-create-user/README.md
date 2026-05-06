# admin-create-user — Edge Function

Creates a Supabase Auth user with `email_confirm: true` (so the new user
can login immediately) and upserts the matching `public.profiles` row.

The caller must be authenticated as an `admin` (verified against
`public.profiles`).

## Deploy

```bash
# 1. Install the Supabase CLI (one-time)
#    https://supabase.com/docs/guides/cli

# 2. Login & link your project
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>

# 3. Deploy this function
supabase functions deploy admin-create-user --no-verify-jwt
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
auto-provided to Edge Functions — no manual secret setup needed.

## Verify

In the Users page → Add User. On success you should see
`User created successfully and can login now` and the new account can
log in straight away with no email confirmation step.

## Why it's needed

The browser cannot safely use the service-role key, and `auth.signUp()`
respects the project's "Confirm email" setting — meaning newly created
users would need to click an email link before logging in. This function
runs server-side with the service-role key and uses
`admin.createUser({ email_confirm: true, ... })` to bypass that.
