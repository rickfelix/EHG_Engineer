<!-- Archived from: C:/Users/rickf/Projects/_EHG/_plan-orphaned-routes.md -->
<!-- SD Key: SD-LEO-INFRA-ORPHANED-BACKEND-ROUTE-001 -->
<!-- Archived at: 2026-05-31T15:44:01.502Z -->

# Orphaned backend-route disposition: verify true consumers of client-uncalled EHG_Engineer HTTP routes, then retire dead API surface or flag for a separate decision

<!-- target_application: EHG_Engineer -->

## Type
infrastructure

## Priority
medium

## Target Application
EHG_Engineer

## Goal
A 2026-05-31 hidden-work audit traced all 124 routes in EHG_Engineer/server/routes/*.js against their callers. EHG_Engineer is an API-only service (no client of its own); the ehg app increasingly reads and writes the shared control-plane DB directly via Supabase, stranding a large EHG_Engineer HTTP API surface (~80 routes with zero caller in either repo). This SD is scoped to the SERVER/API layer only: verify the true consumer set of each orphaned route (scripts, cron, tests, server-internal, external/CLI callers — a substring grep alone is not authoritative), then either RETIRE the dead route, handler, and mount; or KEEP-WITH-JUSTIFICATION; or FLAG it as a half-shipped capability whose client-side decision belongs to a separate SD. No client-side work and no route deletion happen before consumer verification.

## Objectives
- Confirm each flagged-orphaned route's real consumer set across the whole system (not just the ehg app). A route with any non-presentation consumer is internal, not orphaned, and is kept.
- Retire, in small consumer-verified batches, the dead API surface superseded by the ehg-to-Supabase-direct divergence: v2-apis.js (naming / financial / content-forge / brand-genome engines plus venture-scoped SD/PRD/backlog), discovery.js (scan / opportunities / blueprints — the ehg app uses its own /api/v2/blueprints), calibration.js, sdip.js (full submission intake), eva-launch.js (status / checklist / timeline), the dead ventures.js CRUD (GET/POST/PATCH stage / artifacts / create plus competitor-analysis — keep the teardown routes), and the dead dashboard.js LEO-detail routes (prd-v3, ees, context, progress, handoff, metrics, eva/status, integrity-metrics).
- FLAG (do not implement here) the half-shipped backend capabilities whose intended client was never built, for a separate product decision: EVA Chat conversation-history CRUD (eva-chat.js conversations / message — only /stream is wired); EVA Exit scoring plus data-room generation (eva-exit.js scores / data-room / readiness — the ehg app uses Supabase plus an edge function); Stage17 select / approve / qa / upload (stage17.js — only strategy-recommendation and refine are wired).
- Produce a disposition table (route, consumer set, verdict) and record the flagged half-shipped items as follow-up.

## Risks
- Retiring an HTTP route that an undiscovered script / cron / external caller depends on would break it. Mitigate with a consumer-verification gate before any deletion; retire in small batches behind the gate.
- Some orphaned routes may be intentional future or external API surface — keep-with-justification is a valid verdict; do not delete reflexively.
- Excludes POST /api/stage19/:ventureId/deployment-url and the stage19 deployment work (handled by SD-LEO-FEAT-STAGE-REPLIT-DEPLOYMENT-001).

## Success Metrics
- 100% of the ~80 caller-less routes have a recorded consumer set and verdict.
- Zero broken consumers after retirement (server boots; no script / cron / test references a removed route).

## Smoke Test Steps
- Start the EHG_Engineer server; confirm it boots with no route-mount errors after retirements.
- Grep scripts/, tests/, and cron configs for any reference to a retired route path; expect none.
- Exercise the retained called routes (status / state / sd / prd / ventures teardown / protocol-lint) and confirm unchanged behavior.

## Acceptance
- A verified disposition table covering every ~80 caller-less route: consumer set plus verdict (retire / keep-with-justification / flag-as-followup).
- Safe dead-surface retirements executed (routes, handlers, and mounts removed) with no broken consumers; large clusters scoped into child SDs if needed.
- Half-shipped backend capabilities recorded as separate follow-up items (no client-side work in this SD).
- No regression to the live called routes.

## Files
- server/routes/v2-apis.js | MODIFY | Verify consumers plus retire dead engine / venture-scoped API surface
- server/routes/discovery.js | MODIFY | Verify consumers plus retire (ehg app uses its own /api/v2/blueprints)
- server/routes/calibration.js | MODIFY | Verify consumers plus retire stranded calibration API
- server/routes/sdip.js | MODIFY | Verify consumers plus retire legacy SDIP submission intake
- server/routes/eva-launch.js | MODIFY | Verify consumers plus retire superseded launch-tracking API
- server/routes/ventures.js | MODIFY | Retire dead CRUD (GET/POST/PATCH / artifacts / competitor-analysis); keep teardown routes
- server/routes/dashboard.js | MODIFY | Retire dead LEO-detail routes (prd-v3 / ees / context / progress / handoff / metrics / eva-status / integrity-metrics)
- server/index.js | MODIFY | Remove route mounts for any fully-retired route modules
