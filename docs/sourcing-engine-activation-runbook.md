# Sourcing Engine — Activation Runbook

SD-LEO-INFRA-SOURCING-ENGINE-ACTIVATION-001 (go-live, chairman-authorized 2026-06-20).

The sourcing engine (10/10 children shipped) was built **dormant by design**. This runbook records
how it was activated and how to revert each step.

## FR-1 — Migrations (APPLIED to prod)

Applied via `scripts/apply-migration.js --prod-deploy` (chairman 3-factor: `@approved-by` header +
single-use `MIGRATION_APPLY_TOKEN` + git user.email). All additive-only + reversible. **Order matters**
for the two source_type widenings (adam_direct omits vdr_gauge; apply adam_direct first, vdr_gauge last):

1. `20260619_sourcing_engine_lane_column.sql` — nullable `lane` column + CHECK on conversion_ledger + roadmap_wave_items
2. `20260620_sourcing_chairman_queue.sql` — CREATE TABLE sourcing_chairman_queue
3. `20260620_roadmap_wave_items_adam_direct_source_type.sql` — widen source_type CHECK += adam_direct
4. `20260620_roadmap_wave_items_vdr_gauge_source_type.sql` — widen source_type CHECK += vdr_gauge (full set; LAST)

Revert: drop the added columns/table/CHECK additions (all additive, so reverting is safe but rarely needed).

## FR-2 — Disposition / quality gate (CODE)

`lib/sourcing-engine/proactive-populator.js::dispositionGate()` curates the routed corpus to KEEPERS
before staging. Drops: `already_staged`, `noise` (empty/short/untitled), `raw_intake`
(todoist/youtube — personal-productivity intake, chairman policy; `--keep-raw` re-includes), `decline`,
`terminal_dup` (lane=dedup), `already_covered` (dedup_match set & not re_emit). Keeps novel/gated/re_emit.

Also fixed the real dedup bug: `loadContext` hit PostgREST's 1000-row cap, so dedup only saw 1000 of
3994 SDs (`fetchAllRows` now paginates). The dormant lane column governs PERSISTENCE, not MATCHING —
that was the SD's mis-hypothesis.

Curated dry-run: 814 corpus -> **kept 208** (188 harness_backlog + 20 estate_corpus), dropped 606
(raw_intake 599, terminal_dup 7).

## FR-3 — Activation flags

**Behavioral flags** (actually gate code; set ON in the new cron workflows' `env:`):

| Flag | Gates | Activated via | Kill-switch |
|------|-------|---------------|-------------|
| `SOURCING_DEFERRED_WATCHER_V1` | deferred-watcher sweep (advisory lane re-eval) | `.github/workflows/sourcing-deferred-watcher-cron.yml` (every 6h) | set env `off` / disable workflow |
| `SOURCING_GAUGE_GAP_MINER_V1` | gauge-gap miner sweep (stages vdr_gauge roadmap items) | `.github/workflows/sourcing-gauge-gap-miner-cron.yml` (daily, `--apply`) | set env `off` / disable workflow |
| `POPULATOR_CHAIRMAN_APPROVED` / `--chairman-approved` | proactive-populator STAGING | per-run flag (`npm run sourcing:populate -- --apply --chairman-approved`) | omit the flag (dry-run) |

**Display-only flags** (read by `adam-startup-check.readSourcingFlags` for the state probe; they signal
intended-on state but do **not** gate code today — documented honestly, not false-gating):
`SOURCING_ENGINE_V1`, `SOURCING_ROADMAP_ENGINE_V1`, `SOURCING_PROACTIVE_POPULATOR_V1`, `LEO_ROADMAP_AUTOSOURCE`.
If/when these are meant to gate, wire them at the relevant read-sites and add to the cron envs.

All crons stage/advise only — none promotes to belt or creates an SD (promotion stays the separate,
gated `leo-create-sd --from-roadmap-item` step).

## FR-4 — E2E verification

1. Dry-run report (chairman review artifact): `npm run sourcing:populate`
2. Stage curated keepers (chairman-gated): `npm run sourcing:populate -- --apply --chairman-approved [--cap=N]`
3. Promote a sample: `node scripts/leo-create-sd.js --from-roadmap-item <id>`
4. Confirm belt depth rises with curated keepers, without hand-sourcing and without raw-intake noise.

## FR-5 — Accepted-known-state disposition (SD-LEO-INFRA-GAUGE-FINDING-KNOWN-STATE-ACK-001, staged not yet applied)

Some gauge/governance findings (e.g. `WAVE_LINKAGE_STARVATION`, `lib/roadmap/wave-linkage-coverage.js`)
are legitimately known and accepted pending a future chairman decision, yet re-fire on every cycle and
get re-promoted as fresh SD candidates — churn the coordinator has to re-triage by hand. This mechanism
lets the coordinator mark a finding accepted-known-state until a dated re-review, without silencing new
variants or permanently muting the finding.

**Migration** (`database/migrations/20260716_gauge_finding_dispositions.sql`, chairman-gated, staged):
new `gauge_finding_dispositions` table (`fingerprint` UNIQUE, `re_review_at`, `reason`,
`dispositioned_by`), RLS + service_role-only policy in the same migration.

**Usage** (once applied):
```bash
# Accept a finding as known-state pending re-review
node scripts/gauge-findings/disposition.js accept WAVE_LINKAGE_STARVATION \
  --re-review 2026-07-30 --reason "pending chairman D1-D9 ruling" --by coordinator

# Check / list current dispositions
node scripts/gauge-findings/disposition.js status WAVE_LINKAGE_STARVATION
node scripts/gauge-findings/disposition.js list
```

**Mechanism**: `scripts/sourcing-engine/refill-cron.mjs` builds a Set of fingerprints with a LIVE
disposition (`re_review_at` in the future) once per run and threads it into
`evaluateRefillCandidate()` (`lib/sourcing-engine/refill-candidate-validity.js`) as
`opts.acceptedFingerprintSet` — a candidate whose `roadmap_wave_items.metadata.dedup_key` matches is
suppressed (`REFILL_INVALID_REASONS.accepted_known_state`). Suppression auto-expires at `re_review_at`
via query-time filtering — no cleanup job, and the finding promotes again exactly once when due.
Requires the originating `feedback` row to carry a `dedup_key` (now persisted at
`lib/governance/emit-feedback.js` into `metadata.dedup_key` — previously only hashed and discarded).

**Status**: code shipped and tested (PR #6097); migration is `@chairman-gated` and not yet applied, so
the mechanism is inert until applied and a disposition is written.
