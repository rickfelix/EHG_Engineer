<!-- Archived from: docs/plans/venture-telemetry-pull-pipeline-plan.md -->
<!-- SD Key: SD-LEO-INFRA-VENTURE-TELEMETRY-PULL-001 -->
<!-- Archived at: 2026-05-29T12:45:24.627Z -->

# Plan: Venture Telemetry Pull Pipeline

## Goal

Establish a **venture telemetry pull pipeline** so the Chairman gets daily KILL/SCALE signals from every active venture, piloted on CronGenius (the first venture) and built as a **reusable pattern for ventures 2..N** — not a CronGenius one-off. EHG runs a daily scheduled PULL of each active venture's authenticated `GET /v1/metrics` endpoint into a new EHG `venture_telemetry` table surfaced on a Chairman dashboard panel. Ventures keep isolated databases; EHG only PULLS aggregated rollups and never writes into a venture DB (one-way). This is the D4=PULL architecture confirmed by the Chairman on 2026-05-29.

## Background and Decision Context

- **D4 = PULL model**, confirmed by Chairman 2026-05-29. Do not re-litigate. Primary purpose = KILL/SCALE signals; MINIMAL rollups; DAILY cadence.
- Closes the CronGenius first-venture-pilot telemetry gap (pilot assessment Bucket D) and the two deferred feedback items: `ca2465cb` (Layer 2, EHG consumer) and `0a3a9d9f` (Layer 1, CronGenius producer).
- **Chairman directive 2026-05-29**: CronGenius is the PILOT — every venture-side enhancement here must be reusable for future ventures. The producer-side capability (durable store adapter, `/v1/metrics` auth, versioned contract) must ship as a documented, reusable venture-pipeline standard, separating the generic pattern from venture-specific config.

## Verify-First Findings (already exists — reuse, do not rebuild)

CronGenius (Layer 1 producer) ALREADY ships most of the producer surface:
- `GET /v1/metrics` endpoint handler — `src/api/metrics-handler.ts`
- The `MetricsAggregate` contract — `src/audit/metrics.ts` (total, by_verdict, by_mode, by_model, avg_confidence, dry_run_count, window_days, since, generated_at) — matches the Chairman's D2 metric set exactly
- `AuditLogStore` interface — `src/audit/store.ts` — with `InMemoryAuditStore` and `SupabaseRestAuditStore` adapters; store selection in `src/api/deps.ts` is `cfg ? SupabaseRest : InMemory`
- API-key auth infrastructure — `src/api/access.ts` + `src/auth/verifier.ts` (`ApiKeyVerifier`, `REQUIRE_API_KEY`, `CRONGENIUS_API_KEYS`, rate-limiting) — currently applied to `/v1/cron`, NOT yet to `/v1/metrics`

EHG (Layer 2 consumer) is GREENFIELD — verified nothing exists:
- No `venture_telemetry` table (PostgREST PGRST205)
- `applications` registry has NO `metrics_base_url` / `api_key_ref` columns

## Architecture: Two Layers, One Shared Contract

The shared interface is the **versioned `/v1/metrics` response contract** (= `MetricsAggregate` + a version field). Both layers depend on it; it is the first PLAN-phase artifact and must be defined as a venture-pipeline standard.

### Layer 1 — CronGenius PRODUCER (target_application = CronGenius)
Remaining work only (contract + endpoint already exist):
1. Add a durable `DATABASE_URL` Postgres `AuditLogStore` adapter so the operational store (request_audit_log) is durable and isolated, instead of Supabase-REST-or-ephemeral-in-memory. Wire as a third branch in `deps.ts`: `DATABASE_URL` > Supabase REST > in-memory.
2. Apply the existing `access.ts` API-key auth to `GET /v1/metrics` (currently unauthenticated).
3. Version the `/v1/metrics` contract (add an explicit schema/contract version field).
4. Deliver 1–3 as a **reusable venture pattern** (generic core separated from CronGenius-specific config) + a documented venture-pipeline standard.

### Layer 2 — EHG_Engineer CONSUMER (target_application = EHG_Engineer)
New work (greenfield):
1. New `venture_telemetry` table (per-venture, per-pull rollup rows).
2. Per-venture endpoint + key resolution from `applications` (add `metrics_base_url` + `api_key_ref` columns or use `metadata`), reusing the `lib/repo-paths.js` resolver pattern.
3. A DAILY scheduled cron-pull ingestion job that lists active ventures with a metrics endpoint, `GET {base}/v1/metrics` with API-key auth, validates the contract version, and upserts the rollup — strictly one-way, never writes a venture DB.
4. A Chairman dashboard panel surfacing the rollups for KILL/SCALE decisions.
5. D5 per-venture read-key issuance/rotation (store a key reference, not the raw secret).

## Decomposition (parent orchestrator + 2 children)

This parent coordinates two independent child SDs, each in its own repo, both depending on the versioned contract:
- Child A — Layer 1 CronGenius producer (target_application = CronGenius)
- Child B — Layer 2 EHG_Engineer consumer (target_application = EHG_Engineer)

Sequencing: pull model = producer first. The contract already exists, so Child A is the smaller scope; Child B is greenfield and can begin against the existing contract in parallel and wire to the authenticated endpoint once Child A lands.

## Implementation Surface (children own the detail)

| path | action | layer |
|------|--------|-------|
| crongenius: src/audit/postgres-store.ts | CREATE | L1 |
| crongenius: src/api/deps.ts | MODIFY | L1 |
| crongenius: src/api/metrics-handler.ts | MODIFY | L1 |
| crongenius: src/audit/metrics.ts | MODIFY | L1 |
| EHG_Engineer: database/migrations/venture_telemetry.sql | CREATE | L2 |
| EHG_Engineer: database/migrations/applications_metrics_columns.sql | CREATE | L2 |
| EHG_Engineer: scripts/venture-telemetry-pull.js | CREATE | L2 |
| EHG_Engineer: dashboard chairman telemetry panel | CREATE | L2 |
| docs/reference venture telemetry standard | CREATE | both |

## Success Criteria

- [ ] Versioned `/v1/metrics` contract is defined and documented as a venture-pipeline standard (generic core + per-venture extensions)
- [ ] CronGenius `GET /v1/metrics` requires API-key auth (401 without a valid key; authenticated pull succeeds)
- [ ] CronGenius persists audit rows durably via a `DATABASE_URL` Postgres store adapter (no longer ephemeral when a DB URL is set)
- [ ] EHG `venture_telemetry` table exists and stores one rollup row per venture per daily pull
- [ ] EHG resolves each venture's metrics endpoint + key from the `applications` registry
- [ ] The daily cron-pull job ingests CronGenius rollups one-way (never writes the venture DB) and validates the contract version
- [ ] Chairman dashboard panel displays per-venture KILL/SCALE rollups
- [ ] Producer-side pattern is reusable: a second venture could adopt it by config, not by re-implementation
- [ ] Both feedback items `ca2465cb` and `0a3a9d9f` are resolved

## Demo (30-second human-verifiable outcome)

1. Run the EHG venture-telemetry pull job → expected: a fresh `venture_telemetry` row for CronGenius with total/by_verdict/avg_confidence populated.
2. Open the Chairman dashboard telemetry panel → expected: CronGenius rollup visible with KILL/SCALE-relevant metrics.
3. Call CronGenius `GET /v1/metrics` without an API key → expected: HTTP 401 UNAUTHENTICATED.

## Risks

- **Contract drift between producer and consumer**: the consumer must validate the contract version on every pull and fail soft (log, skip) on mismatch rather than corrupting rollups. Mitigation: explicit version field + consumer-side version check.
- **Secret handling (D5)**: storing raw API keys in the `applications` table is a security risk. Mitigation: store a key reference (env var name / secret ref), never the raw secret; support rotation.
- **One-way invariant**: the pull job must never write to a venture DB. Mitigation: read-only HTTP GET only; no venture DB credentials in the consumer.
- **Venture-specificity creep**: building producer code that only fits CronGenius defeats the pilot. Mitigation: separate generic pattern from venture config; document as a reusable standard; bake reusability into acceptance criteria.
- **Cross-repo coordination**: changes span CronGenius + EHG_Engineer. Mitigation: parent orchestrator with per-child target_application; contract defined once at the parent.

## Reusability (Chairman Directive — binding)

CronGenius is the first venture pilot. The producer-side telemetry capability MUST be delivered as a reusable pattern/template plus a documented venture-pipeline standard, so ventures 2..N adopt telemetry by configuration rather than re-implementation. The generic contract shape, store-adapter interface, and auth wiring are the reusable core; CronGenius-specific config (env var names, domain metric fields, audit-row schema) is the per-venture layer.
