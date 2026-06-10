<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/adam-plans/sec-disable-public-signup.md -->
<!-- SD Key: SD-LEO-GEN-DISABLE-PUBLIC-SIGNUP-001 -->
<!-- Archived at: 2026-06-08T16:38:32.246Z -->

# Disable public signup on the EHG app — align config + UI to single-user (chairman-only) intent

## Type
security

## Priority
high

## Summary
The EHG app's sign-in is intended for the chairman ONLY (single-user, chairman-confirmed 2026-06-08), but the deployed Vite SPA is configured for OPEN public registration: ehg/supabase/config.toml has enable_signup=true and enable_confirmations=false (no email verification), and src/pages/LoginPage.tsx ships a live supabase.auth.signUp UI with no invite/allowlist gating. Because the app ships the anon key in the browser bundle and is publicly deployed (Vercel), any stranger who finds the URL could self-register and instantly receive an authenticated session. The destructive SECURITY DEFINER functions are already revoked from authenticated (migration 20260603_03, live-verified), so the residual risk of the gap is unauthorized authenticated-role data access — but the correct fix is to close the gap so config matches the single-user intent.

## Root Cause
Config + UI were scaffolded for open signup; intent is chairman-only. The deployed/hosted dashboard Auth setting is the authoritative toggle (chairman to confirm) and the repo config + UI drifted from intent.

## Success Criteria
- Public signup is disabled so only the chairman's existing account can authenticate (no new self-registration).
- Repo config.toml set to enable_signup=false so a future supabase config push cannot silently re-open registration.
- The signup UI is removed or hidden/gated on LoginPage.tsx (login-only surface).
- Chairman confirms the hosted Supabase dashboard Auth setting (enable_signup) is OFF in production — the authoritative control.

## Scope
- ehg/supabase/config.toml: enable_signup=false (+ keep enable_anonymous_sign_ins=false).
- ehg/src/pages/LoginPage.tsx: remove/hide the supabase.auth.signUp path; login-only.
- Documentation note that production auth is single-user; dashboard toggle is the source of truth (chairman action, out of code scope).
- target_repos: EHG (frontend) — the migration/config/UI live in the ehg repo.

## Notes
- ASSESS-ONLY origin: Adam Supabase-linter triage. Cross-repo: this is EHG-app frontend/config work. Chairman has an existing account, so disabling signup has no downside for him.
