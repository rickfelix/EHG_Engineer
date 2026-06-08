# Ship Record — Disable public signup on the EHG app (SD-LEO-GEN-DISABLE-PUBLIC-SIGNUP-001)

## Metadata

- **Category**: Report
- **Status**: Approved
- **Version**: 1.0.0
- **Last Updated**: 2026-06-08
- **Tags**: security, auth, ehg, cross-repo, ship-record
- **Author**: SD-LEO-GEN-DISABLE-PUBLIC-SIGNUP

---

Cross-repo ship record. The code for this **security** SD lives in the sibling **EHG** repo
(`rickfelix/ehg`, `target_repos=['EHG']`); this EHG_Engineer-side record documents the merged
change so the LEO SD has a traceable in-repo artifact.

## Change

- **EHG PR**: [rickfelix/ehg#692](https://github.com/rickfelix/ehg/pull/692) — **merged** to `main` as `ffb1541b00`.
- **Branch**: `feat/SD-LEO-GEN-DISABLE-PUBLIC-SIGNUP-001` (EHG repo).

## Problem

The EHG app's sign-in is intended for the **chairman only** (single-user, chairman-confirmed
2026-06-08), but the deployed Vite SPA shipped **open public registration**: `supabase/config.toml`
had `enable_signup=true` (both `[auth]` and `[auth.email]`) with `enable_confirmations=false`, and
`src/pages/LoginPage.tsx` shipped a live `supabase.auth.signUp` UI. Because the app ships the anon
key in the browser bundle and is publicly deployed, any stranger who found the URL could
self-register and instantly receive an authenticated session.

## FR delivery (each delivered in EHG PR #692)

| FR | Delivered |
|----|-----------|
| **FR-1** Disable signup at the Supabase config layer | `ehg/supabase/config.toml`: `enable_signup=false` in both `[auth]` and `[auth.email]`; `enable_anonymous_sign_ins` stays `false`. Server-side enforced by Supabase Auth/GoTrue. |
| **FR-2** Remove the public signup UI + call path | `ehg/src/pages/LoginPage.tsx`: removed the Sign Up tab/form and the `supabase.auth.signUp` path (`handleSignUp` + signup-only password-strength/validation helpers + state). Login-only (single Sign In tab). |
| **FR-3** No regression to legitimate auth | `signInWithPassword` (sign-in) and `resetPasswordForEmail` (forgot-password) untouched. SECURITY review confirmed no regression and no residual self-registration vectors. |
| **FR-4** Document the hosted-dashboard source-of-truth | This record + the EHG PR note: `config.toml` governs local dev; the **hosted Supabase project dashboard "Enable signup" toggle is the live source of truth** and is the chairman's out-of-band action. |

## Verification

- SECURITY sub-agent review: **PASS** (config + UI fully close the public self-registration vector;
  `enable_signup=false` is server-side enforced; no OAuth/magic-link/anonymous/admin-invite vector
  reachable by an anon browser client).
- TESTING sub-agent: **PASS** (verified on merged `origin/main`; `LoginPage.tsx` lints clean; ehg
  pre-commit build verification passed).

## ⚠️ Operator / chairman action required for LIVE enforcement

`config.toml` is a **local** artifact (governs `supabase start`). The **hosted Supabase project
(`dedlbzhpgkmetvhbkyzq`) dashboard Auth → "Enable signup" must be set OFF** for this change to be
self-enforcing on the deployed app. Until then the code aligns config + UI but the hosted project
is the authoritative enforcement point. (Designated chairman action in the SD scope.)
