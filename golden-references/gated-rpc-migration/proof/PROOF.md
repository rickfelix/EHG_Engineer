# Consumption proof — gated-rpc-migration

**Verdict: PASS** · live runs: **2** (each first-attempt against its lock set) · date: 2026-07-06 · session: FABLE-MAX Bravo (4901448b)

## Run history (nothing hidden)

**Run 1** — Sonnet agent, given ONLY problem-prompt + reference + guide, applied the
reference to the fixture and passed all 12 v1 locks first attempt (18/18). One
judge amendment was made BEFORE judgment and recorded: the kind-aware header lock
(a delegate correctly swaps the REFERENCE ONLY header for the staged application
header; the judge must not punish guide compliance).

**Deep adversarial review (non-Fable) then BLOCKED the v1 reference itself**, with
two CRITICALs the locks had also missed:
- the in-function AUTHZ was **dead code** (`current_user` inside a SECURITY
  DEFINER function is the *owner*, not the caller; PostgREST sets
  `request.jwt.claims` for every caller including anon), and
- `grant_named_roles_only` captured only the first grantee, so
  `GRANT ... TO authenticated, anon` passed green.
Plus: the marquee search_path lesson was factually wrong (pg_catalog is always
searched first regardless; the real CVE-2018-1058 hazard is `pg_temp` being
implicitly FIRST for relations), the cited estate "hardening lineage" did not
support the claims, and `requested_by = current_user` recorded the definer.

**The reference, guide, and locks were rebuilt** (caller-identity AUTHZ via
`request.jwt.claims->>'role'` with `session_user` fallback; `SET search_path =
public, pg_temp`; full-grantee-list GRANT lock; single-statement REVOKE scope;
`no_current_user_authz` + `single_function_scope` + DOWN-requires-DROPs locks;
honest lineage text). Canonical suite: 37/37.

**Run 2** — the SAME fixture task against the corrected documents. The Sonnet
agent transferred the hardened patterns first attempt: caller-identity AUTHZ,
pg_temp-last pin, jwt-sub `requested_by`, plus all fixture-forced changes.
`judgeSql` → `{ ok: true, failed: [] }` under the application map; **25/25**
vitest under `GOLDEN_REF_KIND=application`.

## Setup (both runs)

Adaptation-forcing fixture: `escalation_requests` / `submit_escalation_request`
with a new `severity` argument (enum CHECK, absent from the reference — changes
the RPC signature and validation surface), `detail` min-20 (reference: 10), and
a different disposition enum. Transcription cannot pass.

## What this proves

The transfer gate works in both directions: a real delegate-tier agent applies
the guide faithfully (including *corrected* doctrine after hardening — evidence
the guide, not luck, carries the invariants), and the adversarial pass catches
content defects the structural locks alone would have shipped at scale.

## CI determinism

The committed `sonnet-applied.sql` (run 2) is the CI artifact; the acceptance
suite re-judges it every build with zero LLM calls.
