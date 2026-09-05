---
Category: Feature
Status: Approved
Version: 1.3.0
Author: SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A
Last Updated: 2026-08-28
Tags: feature, media-generation, creative, storage, variant-scoring, rls-security
---

# Media Generation: Unified Adapter Seam

## Metadata
- **Category**: Feature
- **Status**: Approved
- **Version**: 1.3.0
- **Author**: SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A
- **Last Updated**: 2026-08-28
- **Tags**: feature, media-generation, creative, storage, variant-scoring, rls-security, ehg-app, edge-function

## Overview

`lib/creative/generate-asset.js#generateAsset()` is the single call path for image/video
generation in EHG_Engineer, replacing two previously-orphaned, uncoordinated systems
(`lib/marketing/ai/{image,video}-generator.js`, now deprecated with zero new call sites).
It is a provider-per-capability routing table (`image: [runway, gemini]`, `video: [runway]`)
with ordered fallback — if a configured provider throws, the next provider in that capability's
list is attempted before the call fails.

This document describes the real, shipped state as of PR #7571 — **not** a roadmap or
aspirational design. See `docs/04_features/34a_creative_media_automation.md` for an earlier,
DOCMON-auto-generated speculative draft that does not reflect any implemented system; it
describes a fictional `EnhancedCreativeMediaAgent` class hierarchy with no corresponding code.

## What changed (SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A)

1. **Mandatory `venture_id`.** `generateAsset(ventureId, capability, spec, constraints, deps)`
   rejects a missing venture before any provider request is made. This exists so the HARD FENCE
   (child B, `SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B`, now shipped -- see "Read/view fence"
   below) always has a venture to key its S23+S24 check against.
2. **Private asset storage.** `lib/creative/asset-storage.js` (new) uploads a generated asset's
   bytes to a **private** Supabase Storage bucket (`creative-assets-private`, `public: false`) via
   `lib/storage/private-signed-upload.js`, and returns only the storage **path** — never a public
   or signed URL — for persistence on the `creative_assets.storage_path` column. Previously the
   provider's own URL/bytes were discarded entirely.
   - Runway (`asset.url`, a provider-hosted CloudFront link) is fetched server-side and re-hosted.
     The fetch is host-allowlisted to Runway's actual confirmed output host
     (`dnznrvs05pmza.cloudfront.net`), uses `redirect: 'manual'` (a redirect response is refused,
     never silently followed), and enforces an https-only, image/video-content-type-only, 200MB
     size cap.
   - Gemini (`asset.raw`, inline base64 bytes) is decoded directly.
3. **MVP-scoped quality gate.** `lib/creative/quality-gate.js`'s two stages, which previously
   failed closed **unconditionally** (no real generation could ever pass), now have narrow interim
   implementations: a structural brand-source-ref check, and a keyword deny-list anti-fabrication
   screen. The non-negotiable stub-output rejection (a test-mode/placeholder generation is always
   rejected) is unchanged. A full claims-registry/brand-token comparator remains out of scope,
   deferred to a follow-up SD if these interim checks prove insufficient.

## Read/view fence (SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B, PR #7575)

Storage above is **write-side only** — it deliberately returns a path and never a URL. The
matching read side is `lib/creative/asset-view-gate.js`, the sole sanctioned way to view a
persisted asset: `checkAssetViewAuthorized()` (chairman S23 `product_review` approval **and**
S24 `current_lifecycle_stage >= 24`, fail-closed on every ambiguity) and `mintAssetViewUrl()`
(the only permitted `createSignedUrl()` caller against `creative-assets-private`, TTL-capped,
venture-bound `storagePath`). That module's own header comment is the authoritative contract —
including why `armed:true` is a hardcoded literal and why `shouldEnforceBlock()` is never used.
No other code path may mint a URL for this bucket.

## Variant scoring bridge (SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C, PR #7596)

A produced creative asset (above) can now feed the existing marketing variant-scoring
substrate instead of being a dead end after storage.

1. **Bridge table.** `creative_asset_variant_scores` (new, TIER-1) links `creative_assets(id)`
   to `marketing_content_variants(id)` via plain (`NO ACTION`) foreign keys, scoped by
   `creative_assets.venture_id`. `NO ACTION` was a deliberate FR-1 tradeoff to stay TIER-1
   (auto-appliable); the corresponding gap is that `delete_venture()` cannot cascade through
   this table today — tracked, not silent (see Known limitations).
2. **Outcome derivation.** `lib/marketing/ai/variant-outcome-derivation.js#deriveVariantOutcomes()`
   is the sole, pure utility turning `daily_rollups` rows into `{id, successes, failures}` tuples.
   `daily_rollups` has **no writer anywhere in the codebase today**; `marketing_attribution` has a
   writer (`lib/marketing/publisher/index.js`) but records dispatch provenance only, never an
   outcome/conversion signal. Every test exercises this against fixture data — there is no live
   production outcome data to score against yet.
3. **Selection bridge.** `lib/creative/variant-scoring-bridge.js#selectAssetVariant({supabase,
   ventureId})` gates eligibility through the existing `asset-view-gate.js` S23+S24 predicate
   (venture-uniform, not per-asset), then selects via the **sole canonical** sampler,
   `lib/marketing/ai/thompson-sampler.js`. `lib/eva/experiments/experiment-assignment.js` has a
   second, unrelated Thompson-sampling implementation over `experiment_assignments` — explicitly
   out of scope here, enforced by a static regression test.
4. **Chairman CLI.** `scripts/eva/variant-scoring-cli.mjs` (`npm run eva:variant-scoring:status`)
   surfaces the current bridge/scoring state per venture with a 5-state contract
   (`query_error`, `gate_excluded`, `no_bridged_rows`, `no_writer_yet`, `selected`).
5. **Retention.** `creative_asset_variant_scores` is registered in `lib/retention/policies.js`
   (archive mode, matching this repo's other creative/marketing tables).

### Security: cross-tenant RLS hole found and contained, fix pending chairman ceremony

A SECURITY sub-agent proved **live** (rolled-back transaction) that the original
`cavs_venture_access` RLS policy constrained `creative_asset_id` but left `variant_id`
entirely unconstrained, with a `NULL with_check` (Postgres silently reuses `USING` for
writes when `WITH CHECK` is omitted). A tenant of venture A could plant a row referencing
venture B's variant; because the FKs are `NO ACTION`, that row would then permanently block
venture B's own delete of that variant.

The natural fix — an inline `EXISTS` checking the variant's venture — was **also measured
live and found wrong in the opposite direction**: it blocked the attack but also blocked
every legitimate same-venture write, because `marketing_content`/`marketing_content_variants`
scope `authenticated` through `ventures.created_by` (a different ownership model than this
table's `user_company_access` model), and Postgres evaluates an RLS policy expression as the
querying role — so the joined tables' own RLS silently zeroes out every row.

The correct fix needs a `SECURITY DEFINER` resolver function, which this repo's
migration-tier-classifier marks TIER-2 (chairman-gated). Rather than self-approving that
migration, the live, auto-applied policy was made **fail-closed** (the vulnerable
`authenticated` policy was removed entirely — only a `service_role` policy ships today) and
the real fix is staged at
`database/chairman-gated/20260826_creative_asset_variant_scores_rls_fix.sql`
(`@approved-by: PENDING`). **As of this writing the ceremony has not run** — the table is
safe only because nothing currently writes to it as an authenticated (non-service-role)
user; this must be applied before any future SD adds such a writer.

## ehg app reconciliation (SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-D, PR ehg#802 + EHG_Engineer#7620)

The `ehg` app (a separate repo, `C:\Users\rickf\Projects\_EHG\ehg`) has its own live,
nav-linked creative-media UI (`src/components/creative-media/`, `src/services/video-generation/
RunwayVideoService.ts`) that predates this seam and was never wired to it. Both repos share one
Supabase project, so reconciliation is table-level, not API-level.

1. **Fixed a live production defect.** `/creative-media`'s components query `video_prompts` —
   a table whose migration (`supabase/migrations/20251004030000_create_video_prompts_table.sql`)
   was never applied to the consolidated DB (it used invalid `CREATE POLICY IF NOT EXISTS`
   syntax). Corrected and applied as
   `database/migrations/20260828120000_create_video_prompts_table_corrected.sql`, RLS-scoped
   through `user_company_access` (not `ventures.created_by`, which is `NULL` on all 152 live
   ventures — the same ownership-model trap this doc's RLS section above describes).
2. **`creative_assets.campaign_id`** (nullable `uuid`, additive) groups sibling variants from one
   `RunwayVideoService` generation run. `RunwayVideoService.ts` now mints real
   `crypto.randomUUID()` ids instead of `campaign-${Date.now()}` string ids, and persists
   generated variants — gated behind `VITE_ENABLE_VARIANT_PERSISTENCE_BRIDGE` (client, default
   off) **and** a server-side `ENABLE_VARIANT_PERSISTENCE_BRIDGE` secret on the Edge Function
   below, so the write path stays dormant until the RLS ceremony two paragraphs down completes.
3. **New Edge Function**, `supabase/functions/variant-scoring-bridge` (deployed, live-verified),
   is the server-side bridge `ehg`'s `VideoVariantTesting.tsx` reads/writes through instead of a
   direct client query — necessary because `creative_assets`/`creative_asset_variant_scores`
   (company-access model) and `marketing_content_variants` (created_by model, structurally empty
   today) cannot both be read correctly from one client-side RLS context. It imports the real
   `thompson-sampler.js`/`variant-outcome-derivation.js` (no second scoring implementation), and a
   new `lib/creative/asset-write-fields.js` allow-list (shared with the Node-side bridge) prevents
   mass assignment on the write path.
4. **`creative_media_assets`/`creative_campaigns`/`research_creative_workflows`** (a *third*,
   never-applied ehg-app schema for the same concept) were deliberately **not** applied — see
   `docs/adr/0013-defer-creative-media-assets-schema.md`. Their only real consumers
   (`CreativeMediaIntegrationService.ts`, `RDDepartmentService.ts`) are called from pages with zero
   routing references today.
5. **`/video-variants`** was a URL-only orphan (no nav entry anywhere); it's now reachable via
   `nav_routes` (seeded by `database/migrations/20260828140000_seed_video_variants_nav_route.sql`)
   and `navigationTaxonomy.ts`.

## Known limitations (tracked, not silent)

- The anti-fabrication keyword screen is a **prompt**-side check, not an **output**-side one, and
  is bypassable by spacing/homoglyph tricks. Acceptable for MVP; a real claims-registry screen is
  future work.
- All of the above controls (venture check, quality gate, storage) are overridable via an
  injectable `deps` parameter (mirroring this codebase's existing test-injection pattern). This is
  intentional for testability, but meant **the HARD FENCE could not be implemented as something
  living behind this same injection point** — it needed its own chokepoint. Satisfied: the fence
  ships as a separate read-side module (`lib/creative/asset-view-gate.js`), not as a `deps` entry
  on this write-side seam.
- Kling was not added as a second configured video provider (Runway already is one, real and
  working); this is an explicit, documented scope decision, not an oversight.
- `delete_venture()` cannot cascade through `creative_asset_variant_scores` (child -C): its FKs
  are plain `NO ACTION` by deliberate TIER-1 tradeoff, so an orphaned row can block a venture
  teardown. Tracked as an explicit follow-up, not a silent gap.
- The `cavs_venture_access` RLS fix for `creative_asset_variant_scores` (child -C) is staged but
  **not yet applied** pending a chairman ceremony — see "Variant scoring bridge" above. Child -D's
  new write path (RunwayVideoService persistence, Edge Function `write` action) is what will arm
  this gap once its own feature flags are enabled, so both flags must stay off until the ceremony
  lands.
- Child -D's Edge Function does not enforce the S23/S24 taste-gate (`checkAssetViewAuthorized`)
  the Node-side `selectAssetVariant()` path enforces — its dependency chain is not Deno-bundle-safe
  (bare `crypto`/`@supabase/supabase-js` imports in `lib/feature-flags/evaluator.js`). Documented
  in the function's own docblock; company-access tenancy is enforced on both paths regardless.

## Related

- `database/migrations/20260826_creative_assets_storage_path.sql` — additive `storage_path` column.
  **Not yet applied live** (live `42703` undefined_column as of 2026-08-26; DDL permission required,
  raised to the coordinator as signal `8714aa90-b4aa-41ed-8050-9cde5a7cfc76`).
- `lib/creative/asset-view-gate.js` — the gated read/view primitive (child -B).
- `lib/creative/variant-scoring-bridge.js`, `scripts/eva/variant-scoring-cli.mjs` — the
  variant-scoring bridge and chairman CLI (child -C).
- `database/chairman-gated/20260826_creative_asset_variant_scores_rls_fix.sql` — the staged,
  pending cross-tenant RLS fix (child -C).
- `SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001` (parent orchestrator) — the reconciliation effort
  this child is one part of; see children -B (fence), -C (variant scoring), -D (ehg app reconciliation).
- `docs/adr/0013-defer-creative-media-assets-schema.md` — why the ehg app's own
  `creative_media_assets` schema was deliberately not applied (child -D).
- `ehg` repo: `src/services/video-generation/RunwayVideoService.ts`,
  `src/components/creative-media/VideoVariantTesting.tsx`, `src/hooks/useVariantPersistence.ts`,
  `src/hooks/useVariantScoring.ts` — the client-side half of child -D.
- `supabase/functions/variant-scoring-bridge/index.ts` — the EHG-callable server-side bridge
  (child -D), deployed to the shared `dedlbzhpgkmetvhbkyzq` project.
