---
Category: Deployment
Status: Approved
Version: 1.1.0
Author: Claude (multiple SDs — see per-section provenance; SD-LEO-INFRA-SOURCING-ENGINE-CONSUMPTION-001 added FR-6)
Last Updated: 2026-08-24
Tags: [sourcing-engine, activation, runbook, disposition]
---

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

**RETIRED flags** (SD-LEO-INFRA-SOURCING-ENGINE-BELT-GATED-001, FR-5) — `SOURCING_ENGINE_V1`,
`SOURCING_ROADMAP_ENGINE_V1`, `SOURCING_PROACTIVE_POPULATOR_V1`, `LEO_ROADMAP_AUTOSOURCE`.
This section previously described them as display-only, which was honest as far as it went; they are
now **removed from the state probe entirely**, so they are no longer read anywhere. Setting them does
nothing and never did — a decorative flag in a display list reads as activation while changing zero
behaviour, which is the failure mode this runbook exists to prevent. `RETIRED_SOURCING_FLAGS` in
`scripts/adam-startup-check.mjs` keeps the removal on record. If a switch is wanted for one of these
lanes, wire it at a real read-site FIRST; do not re-add a name to a display list.

**The operative gate is a DB row, not an env flag.** `sourcing_engine_activation_state.arm` governs the
live arms (`auto-refill`, `gauge-gap-miner`, `deferred-watcher`); it is read at
`scripts/lib/sourcing-engine-awareness.mjs` and consumed at `scripts/sourcing-engine/refill-cron.mjs`.
The `/adam` startup probe prints these marked **OPERATIVE**, in three states — on / off /
`NO ROW: state unknown, not "off"` (a missing row is unknown, and rendering it as "off" would be a
confident lie about a state nobody read).

**Belt-demand gating (why "on" no longer means "floods").** The **four** producers that mint belt depth
now consult `lib/governance/demand-gate.js` before producing. They mint only when depth is at or below a
floor (`BELT_DEMAND_FLOOR`, default 3; a garbage value yields NaN → `unmeasurable` → withhold, never a
silent revert to the default). An unreadable gauge is `unmeasurable` and **withholds** — it is never a
licence to produce.

**They do not all read the same gauge, and that is the point** (SD-LEO-INFRA-GATE-SIDE-BELT-001):

| producer | mints into | gauge |
|---|---|---|
| `refill-auto-promote` | `strategic_directives_v2` | `countDispatchableBacklog` (SD depth) |
| `fr-c-generator` | `strategic_directives_v2` | `countDispatchableBacklog` (SD depth) |
| `feedback-fingerprint-promoter` | `quick_fixes` | `countClaimableQuickFixes` (QF depth) |
| `promote-retro-action-items` | `quick_fixes` | `countClaimableQuickFixes` (QF depth) |

The QF pair inject their gauge through `measureDemand`'s `gauge` parameter, because the DEFAULT gauge is
`countDispatchableBacklog` — which reads `strategic_directives_v2` and cannot see a single quick fix.
Gating QF minting on it would be an open loop failing in both directions: below the floor, minted QFs
never raise the reading so the gate never closes; above it, minting is blocked no matter how starved the
QF lane is.

**One floor, two lanes.** `BELT_DEMAND_FLOOR` is a single global env var with no per-producer override,
and the two lanes' depths differ by roughly 6× (SD ~21, QF ~145 at the time of writing). A floor tuned
for one lane is not tuned for the other; a per-producer override is a known follow-up, not a shipped
capability.

**The gate guards MINTING, not reporting.** The QF producers gate only under `--apply`. A dry-run still
prints its `[PROMOTABLE]` lines and records no decision — so on a dry-run-only day the startup badge
reads `NEVER RAN`, which is correct: a recorded decision for a run that could never have minted would be
a measurement of nothing.
Every run emits `{engine, gauge_value, floor, decision, reason, measured_at}` to `audit_log` and the
startup badge prints the last verdict per producer, so a correctly-quiet engine is distinguishable
from a dead one.

The crons in the table above stage/advise only — none promotes to belt or creates an SD (promotion
stays the separate, gated `leo-create-sd --from-roadmap-item` step). `refill-cron` is the exception
and is not in that table: it promotes on an hourly `--apply`, which is precisely why it is the
primary subject of the demand gate.

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

## FR-6 — Per-tier disposition table (SD-LEO-INFRA-SOURCING-ENGINE-CONSUMPTION-001)

**Why this table exists**: this is the third SD to investigate an "auto-refill promotes 0"-shaped
symptom (after `SD-LEO-INFRA-AUTO-REFILL-414-NULL-TITLES-001` and
`SD-LEO-INFRA-AUTO-REFILL-READ-DB-ACTIVATION-FLAG-001`, both completed 2026-06-29, both fixing real
but different root causes). This SD's LEAD-phase VALIDATION (evidence `1e5eb721-560e-4ffc-b9e1-742614e680c0`)
and Explore (evidence `8cdedf7a-3f37-4705-93ed-3784bef3c135`) passes produced a complete,
evidence-cited disposition for all three named tiers — published here so a fourth SD does not
re-derive it from scratch.

| Tier | Mechanism | Consumes `roadmap_wave_items`? | Deployment state (as of 2026-08-24) | Disposition |
|---|---|---|---|---|
| `auto-refill` | `scripts/sourcing-engine/refill-cron.mjs`, hourly `--apply` | **Yes — the ONLY consumer of the three.** Scoped to `item_disposition IN ('pending','selected') AND wave_id IN activeWaveIds AND promoted_to_sd_key IS NULL` (`refill-cron.mjs:188-195`, active-wave scoping at `:93-108`). | `active` (all-success runs through ship date) | **WORKING-BY-DESIGN.** Armed, running, correctly scoped. Not broken. |
| `gauge-gap-miner` | `lib/sourcing-engine/gauge-gap-miner.js`, driven by `scripts/sourcing-engine/gauge-gap-miner-sweep.mjs` | **No — writer only.** Only reads `roadmap_wave_items` for idempotency (`source_type='vdr_gauge'`); has no disposition-based consumption path. | `disabled_manually` (deliberate) | **WRITER-ONLY, deliberately disabled.** Cannot ever drain the queue by design — 5 rows ever written, all one date, all `dropped`. |
| `deferred-watcher` | `lib/sourcing-engine/deferred-watcher.js`, driven by `scripts/sourcing-engine-deferred-watcher-sweep.mjs` | **No — different surface entirely.** Reads `conversion_ledger` where `lane LIKE 'blocked-on-%'`; never touches `roadmap_wave_items`. | `disabled_manually` (deliberate) | **DIFFERENT-SURFACE, deliberately disabled.** Was never a consumer of this queue in the first place. |

**The corrected framing**: the original symptom ("a 504-row queue with zero consumption") measured
the wrong surface — `roadmap_wave_items`'s raw table count, which includes rows under archived
roadmaps that no consumer reads (502 of the 504 sat under 3 archived "EVA Intake Roadmap" entries;
the true eligible depth via `v_plan_of_record_remainder` was 1-2). Only `auto-refill` was ever a
real consumer, and it is working. The genuine, narrower defect this SD fixed instead: an
activation-state SSOT inversion (the DB said all 3 arms `enabled=true` while 2 were actually
`disabled_manually` in GitHub Actions — see `scripts/lib/sourcing-engine-awareness.mjs`'s
`diffSourcingArmStateVsDeployment()`), plus the misleading raw-count measurement path itself (see
"Sourcing engine + Roadmap-SSOT awareness" in `.claude/commands/coordinator.md`), plus a dangling
citation in `lib/governance/drive-state/axes/roadmap-motion.cjs` unrelated to this queue but found
during the same audit.

**Remaining open question, NOT resolved by this SD**: whether `gauge-gap-miner` and
`deferred-watcher` should be re-enabled is a chairman-gated activation decision (per the existing
`SOURCING_*` activation doctrine) — explicitly out of this SD's scope. This table documents their
current disposition, not a recommendation to flip it.

**Live observation (2026-08-24, EXEC phase, `diffSourcingArmStateVsDeployment()` run against real
production state — not mocked)**: reproduced the LEAD-phase VALIDATION finding exactly —
`gauge-gap-miner`: db_state=true, deployment_state=disabled_manually, mismatched=true;
`deferred-watcher`: db_state=true, deployment_state=disabled_manually, mismatched=true;
`auto-refill`: db_state=true, deployment_state=active, mismatched=false. This is a point-in-time
observation, not a pinned test assertion — the corresponding unit test (TS-7) asserts result
*shape* (3 entries, each resolvable), not this specific count, since the count changes the moment
someone flips a workflow's enabled state.
