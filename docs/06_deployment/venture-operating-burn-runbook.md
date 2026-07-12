---
category: deployment
status: approved
version: 1.0.0
author: SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-E1
last_updated: 2026-07-12
tags: [deployment, operator, cash-burn, cloudflare, ai-gateway, chairman-action, venture]
---

# Venture Operating-Burn Instrumentation Runbook

## Overview

`venture_operating_burn` is a shared, venture-scoped burn ledger — the per-venture sibling
of the fleet-wide `operator_cash_burn_monthly` gauge. It never writes into that table or
into `income_capture_monthly`; the two are deliberately disjoint (a per-venture write into
the fleet singleton would corrupt the portfolio-wide aggregate). Keyed by
`(venture_id, source_application, period_month)` so any venture onboards onto the same
table — ApexNiche AI is the first, MarketLens and future ventures follow the same pattern.

Implemented in SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-E1. Mirrors the fail-soft
cron+direct-writer structure of `scripts/operator/feed-operator-cash-burn.mjs` /
`lib/operator/cash-burn-substrate.js` — NULL (`unattested`) on a missing source, never a
fabricated `0`.

## Two independently fail-soft inputs

- **Infra burn** (`infra_cost_usd`) — Cloudflare Workers usage (via the GraphQL Analytics
  API) × published unit pricing. Buildable today; requires `CLOUDFLARE_API_TOKEN` +
  `CLOUDFLARE_ACCOUNT_ID`. An empty usage dataset is left unattested, never an attested `$0`
  (F6 fix — see `scripts/operator/feed-venture-operating-burn.mjs`'s `sumWorkersUsage`).
- **AI burn** (`ai_cost_usd`, `ai_cost_status`) — Cloudflare AI Gateway's Logs API, scoped
  per venture via `CLOUDFLARE_AI_GATEWAY_ID_<SOURCE_APPLICATION>`. As of this SD's ship date,
  **ApexNiche AI has no LLM-calling code and no AI Gateway** — `ai_cost_status` stays
  `'unattested'` by design. This is a forward dependency, not a bug: whichever future SD adds
  ApexNiche AI's real content-generation calls must route them through a dedicated Cloudflare
  AI Gateway for this field to ever report `'measured'`.

## Prerequisites (chairman/operator-provisioned, not fleet-automated)

- A Cloudflare API token scoped to Account Analytics:Read (least-privilege) + the account ID,
  set as the `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` GitHub Actions secrets consumed
  by `.github/workflows/venture-operating-burn-cron.yml`.
- The `database/migrations/20260712_venture_operating_burn.sql` migration applied. It ships
  **chairman-gated and staged** (`-- @chairman-gated: staged, not yet applied`) — additive
  only, zero risk to existing tables, but still requires the standard chairman sign-off
  ceremony before a live apply.

## After the migration applies

1. Run `npm run schema:snapshot:lint` to regenerate `database/schema-reference-snapshot.json`.
2. Remove the `venture_operating_burn` entry from
   `scripts/lint/schema-reference-allowlist.json`'s `tables` array (and its accompanying
   `_venture_operating_burn_note`) — the pending-apply exemption is no longer needed once the
   table is live. **This step is easy to miss**: `schema-reference-lint` only complains about
   the table's *absence*, never about a stale allowlist entry once it's live, so nothing forces
   this cleanup — check manually.

## Reusable lesson for other chairman-gated-migration SDs

Any SD shipping a chairman-gated, staged-not-applied migration whose code references the new
table will trip `schema-reference-lint` in CI (it correctly flags the reference as absent from
the live schema snapshot). The fix is the same allowlist mechanism used here — add the table
name to `scripts/lint/schema-reference-allowlist.json`'s `tables` array with a dated note
(mirrors the pre-existing `door_routing_ledger` "apply-at-cutover" precedent) — not a
migration-file change, not a snapshot regen (the snapshot reflects live schema; regenerating
it does nothing until the migration is actually applied).

## Manual verification

```bash
# Dry-run against a specific venture (no write)
node scripts/operator/feed-venture-operating-burn.mjs --venture-id <uuid> --source-application apex_niche_ai --dry-run

# Live run (writes to venture_operating_burn once the migration has been applied)
npm run operator:venture-burn:feed -- --venture-id <uuid> --source-application apex_niche_ai
```

Absent Cloudflare credentials, both `infra` and `ai` degrade to `{written:false}` and the
script still exits `0` — this is the expected, fail-soft steady state until the operator
provisions the API token.
