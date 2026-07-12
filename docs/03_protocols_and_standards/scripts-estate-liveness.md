---
category: protocol
status: active
version: 1.1.0
author: SD-LEO-INFRA-SCRIPTS-ESTATE-RECONCILIATION-001
last_updated: 2026-07-12
tags: [protocol, scripts, liveness, hygiene]
---
# Scripts-Estate Liveness Norm

## The norm

**Every script kept under `scripts/` (outside `scripts/archive/`) MUST be reachable from
at least one liveness anchor:**

1. a `package.json` npm alias,
2. a git hook (`.husky/**`) or Claude Code hook (`.claude/settings*.json`),
3. a GitHub workflow (`.github/**`),
4. a skill/command/agent definition (`.claude/commands/**`, `.claude/agents/**`),
5. a cron registry (`STANDARD_LOOPS` in `scripts/coordinator-startup-check.mjs` /
   `COORDINATOR_CRONS` in `lib/coordinator/teardown-coordinator.cjs`),
6. another reachable script/module, or a doc that tells humans/agents to run it
   (`docs/**`, `CLAUDE*.md`, `templates/**`).

A script nothing reaches is an **orphan**. Orphans are not kept "just in case":

- **Throwaway work** goes in `scripts/tmp/` or `scripts/temp/` — these are sweepable
  (auto-pruned by `scripts/maintenance/sweep-worker-scratch.mjs` once untracked files
  are older than 7 days) — or in `scripts/one-off/` when it must be tracked.
- **Superseded/dead work** is moved to `scripts/archive/` via `git mv`
  (see `scripts/archive/README.md` for the convention).

**Preferred liveness anchor: an npm alias.** If a script is worth keeping, it is worth
one line in `package.json` — that line is what makes it discoverable, greppable, and
provably alive (WIRE_CHECK and the reachability gauge both treat `package.json` as an
entry-point source).

## Enforcement seams (both advisory-first, neither CI-blocking)

| Direction | Tool | When it runs |
|---|---|---|
| Forward — "which scripts does NOTHING reference?" | `npm run sre:scripts-reachability` (`scripts/scripts-reachability-gauge.mjs`) | Weekly coordinator cron (`40 9 * * 1`); persists a `coordination_events` `SCRIPTS_REACHABILITY_SNAPSHOT` baseline series; alerts the coordinator inbox only on orphan growth (+>=10/week) or broken npm aliases |
| Reverse — "does every reference point at a real file?" | `scripts/validate-script-references.js` | Pre-commit (`.husky/pre-commit`, `--staged`); blocks deleting/moving a script something still references |

## Known blind spots (why the gauge is advisory)

The gauge matches basenames against a filesystem haystack. It cannot see references
stored only in the database (cron prompt strings, `leo_protocol_sections`), dynamically
constructed paths, or references from the EHG sibling repo. **An orphan flag is a triage
candidate, never a deletion warrant** — archive in verified batches, with the pre-commit
reverse check as the safety net.

## Provenance

SD-LEO-INFRA-SCRIPTS-ESTATE-RECONCILIATION-001, productizing the chairman's 2026-06-10
scripts-sprawl review (4,562 files; 717/2,091 live candidates orphaned; scratch dirs
accumulating ~600 files with no lifecycle).

## Periodic-process registry (runtime liveness, SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-A)

Static reachability (above) answers "does anything reference this file?"; the
`periodic_process_registry` regime answers "did this recurring process actually RUN?"

- **Single registry, zero shadows.** Every recurring process — fleet GHA cron workflows,
  `scripts/cron/*`, coordinator `STANDARD_LOOPS` — maps to exactly one registry row.
  Enforced by `node scripts/enumerate-periodic-processes.mjs` (non-zero exit on any
  shadow; `--report-only` to inspect). Registration is mechanical:
  `node scripts/seed-periodic-process-registry.mjs` (owner-preserving upserts).
- **Owner is REQUIRED** (`owner NOT NULL`, migration `20260711_..._owner_not_null.sql`,
  rollback alongside). New rows default to the interim owner `coordinator-fleet`;
  `node scripts/backfill-registry-owners.mjs` prints the reassignment worklist that
  converges interim owners to addressable agents.
- **Class-split watcher venues.** The liveness watcher runs from TWO complementary
  invokers: `.github/workflows/periodic-liveness-watcher-cron.yml` (every 15 min,
  `LIVENESS_CLASSES=self_stamped,eva_scheduler_heartbeat` — timestamp comparisons only)
  and the coordinator `STANDARD_LOOPS` dev-host entry
  (`LIVENESS_CLASSES=claude_sessions_heartbeat` — PID-anchored role sessions, which a CI
  runner cannot evaluate without false-OVERDUE). No row is double-evaluated.
- **UNVERIFIED is by design** for freshly registered rows: visible on the dashboard,
  never false-alarming, until the process wires `lib/periodic-liveness/stamp-last-fired.js`.

### Post-activation verification (QF-20260712-741, retro follow-up to SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001)

- **Dormant-collector sweep**: `node scripts/enumerate-periodic-processes.mjs --report-only`
  found **zero shadows** across all 103 discovered recurring processes (68 `gha_cron` +
  9 `cron_script` + 26 `standard_loop`) — every registrable collector, including the
  ops-actuals trio, is already registered. No dormant candidates remain.
- **First-live-cycle check**: `ops_product_health` is advancing on its 6h cadence (rows
  for both live ventures on both 2026-07-11 and 2026-07-12, `computed_at` tracking each
  cron fire) with an honestly-empty `data_state` (0/0/0 requests) because its upstream
  source, `service_telemetry`, has zero rows — expected, since no venture service-task has
  reported an outcome yet, not a collector defect. `venture_telemetry` (the daily GHA pull)
  is also advancing (10 rows, latest today).
