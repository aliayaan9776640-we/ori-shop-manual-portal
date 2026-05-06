import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// If Supabase redirected the recovery email to the site root (or any other
// path) instead of /reset-password, detect it and bounce to the proper page
// before the rest of the app boots. This handles all known link formats:
//   - ?code=... (PKCE)
//   - ?token_hash=...&type=recovery (modern OTP)
//   - #access_token=...&type=recovery (legacy implicit)
(function ensureRecoveryRoute() {
  try {
    const path = window.location.pathname;
    if (path.startsWith("/reset-password")) return;

    const search = window.location.search;
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const queryParams = new URLSearchParams(search);
    const hashParams = new URLSearchParams(hash);

    const isRecovery =
      queryParams.get("type") === "recovery" ||
      hashParams.get("type") === "recovery" ||
      queryParams.has("token_hash") ||
      (queryParams.has("code") && /recovery|reset/i.test(search)) ||
      // If the URL has access_token + refresh_token in the hash, it's almost
      // certainly a recovery/magic-link landing.
      (hashParams.has("access_token") && hashParams.has("refresh_token"));

    if (isRecovery) {
      console.log("[main] recovery link detected, redirecting to /reset-password");
      const newUrl = `/reset-password${search}${window.location.hash}`;
      window.history.replaceState({}, document.title, newUrl);
    }
  } catch (e) {
    console.error("[main] recovery redirect check failed", e);
  }
})();

createRoot(document.getElementById("root")!).render(<App />);
