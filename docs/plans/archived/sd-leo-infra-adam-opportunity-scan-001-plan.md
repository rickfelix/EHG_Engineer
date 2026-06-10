<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\_adam1_scancore.md -->
<!-- SD Key: SD-LEO-INFRA-ADAM-OPPORTUNITY-SCAN-001 -->
<!-- Archived at: 2026-06-09T19:42:44.525Z -->

# Adam opportunity-scan core: portfolio scope registry + per-scope briefings + rationale bar (read-only, flag OFF)

## Type
infrastructure

## Priority
high

## Objective
Build Adam's read-only proactive scan engine — enumerate portfolio scopes, load a light per-scope strategy briefing, apply the hard rationale bar, and return ADAM_OK (silence) or a ranked rationale-bearing shortlist — entirely read-only and behind `ADAM_GOVERNANCE_HEARTBEAT_V1=OFF`.

## Scope
- NEW `lib/adam/scope-registry.js`: `enumerateScopes(supabase)` -> [{scope_key, kind, app_name, repo_path, venture_id}] REUSING `lib/repo-paths.js` (query applications WHERE status='active' AND deleted_at IS NULL; classify via the existing PLATFORM_REPOS/isVentureRepo; per-venture INNER JOIN ventures WHERE status='active' AND is_demo=false). No new table, no new classifier. Today this yields harness + platform + exactly 2 active ventures (CronGenius, DataDistill).
- NEW `scripts/adam-opportunity-scan.cjs` (read-only; subcommands `--briefing`/`--scan`/`--ledger`; `--scope harness|platform|venture:<id>|auto`, default auto=weighted round-robin ONE scope per tick). Writes NOTHING to strategy tables; only appends to the decision ledger and shells to `scripts/adam-advisory.cjs` on a surfaced item.
- NEW `lib/adam/briefings/{harness,platform,venture}.js` per-scope light briefings over EXISTING tables: harness (feedback category='harness_backlog', retrospectives, gate-health, EVA recs domain-filtered); platform (venture_stages SSOT integrity + cross-venture gate-failure/stall clustering behind the liveness guard); venture (competitors, venture_stage_work health+advisory_data, venture_separability_scores, L2 vision; treat empty tables as "no signal" not "missing"). PER-VENTURE DATA GAPS (dry telemetry, no feature-backlog store, stale competitive deltas) are surfaced as DRAFT-SD proposals to light up the pipes — the chairman-chosen "bootstrap the data layer" outputs (fix once, unlock all ventures).
- NEW `lib/adam/liveness-guard.js`: suppress cross-venture advisories below K=3 distinct active+non-demo ventures evaluated in 7d (today's 7 synthetic ventures suppress class-B reads).
- THE RATIONALE BAR: each candidate must cite a live objective/KR (or L2-vision + live metric per-venture), score via `lib/eva/okr-priority-integrator.js` (off-track KR x3), dedup vs open strategic_directives_v2, pass the CONST-002/CONST-010 self-check, and carry a counterfactual — else it stays silent. GLOBAL <=1-advisory cap across scopes.
- Everything behind `ADAM_GOVERNANCE_HEARTBEAT_V1=OFF`; add npm aliases (adam:scan / adam:briefing) so WIRE_CHECK sees the entry points.

## Acceptance Criteria
- `enumerateScopes` returns harness + platform + the 2 active ventures (excludes cancelled/demo).
- `--scan` returns ADAM_OK or a ranked rationale-bearing shortlist per scope, fully read-only.
- The liveness guard suppresses class-B advisories on the synthetic corpus; flag defaults OFF.

## Success Metrics
- Scan runs read-only with zero writes to strategy tables.
- Every surfaced candidate carries the full rationale structure or is suppressed.

## Rationale
Reuse-first: enumeration reuses repo-paths.js (no new classifier/table); the single-scope design becomes the harness briefing module, platform+venture added alongside. The honest per-venture data gaps become Adam's own high-value proposals. Depends on the contract SD (the loop must be canonically specified first). EHG_Engineer. See the proactive-Adam design.
