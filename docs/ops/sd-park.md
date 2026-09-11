---
category: documentation
status: approved
version: 1.1.0
author: rickfelix
last_updated: 2026-09-11
tags: [documentation, ops]
---

# Parking a Strategic Directive (cancel ≠ park)

**SD-LEO-INFRA-PARKED-STATUS-REPLACE-001**

To set an SD aside **without abandoning it**, *park* it — do **not** cancel it.

## TL;DR

```bash
# Park (set aside, recoverable, excluded from sd:next + the sweep):
node scripts/sd-park.js park SD-XXX-001 --reason "fleet wind-down; resume after epic #3"

# Unpark (back to a workable, claimable status). --reason is REQUIRED, like park:
node scripts/sd-park.js unpark SD-XXX-001 --reason "epic #3 shipped; resuming"
# (equivalent: npm run sd:unpark -- SD-XXX-001 --reason "...")
# then re-claim normally:
node scripts/sd-start.js SD-XXX-001
```

## `deferred` is the canonical parked state

Parking sets `strategic_directives_v2.status = 'deferred'`. That value already exists in
the status CHECK constraint and is already excluded from every live work-selection path
(`sd:next` recommendations, `sd-start`, the fleet dashboard) and from the claim-liveness
sweep — but it was previously unused. Park adopts it and records `metadata.park_reason`,
`parked_at`, `parked_by`, and `parked_from_status`, so a parked SD stays **fully queryable
and reversible**.

Park also **releases the atomic claim** across both `strategic_directives_v2`
(`claiming_session_id`, `is_working_on`) and `claude_sessions` (`sd_key` + worktree fields,
cleared together) in one transaction, and **never touches `current_phase`**.

## Why not `cancel` (the anti-pattern)

Using `status='cancelled'` to defer an SD is harmful:

- It fires **cancel-only side-effects** — the `trg_reset_patterns_on_sd_cancel` trigger
  resets assigned `issue_patterns`, and other cancel cascades run — that you do **not**
  want for work you intend to resume.
- It pollutes the `cancelled` set, mixing truly-abandoned SDs with merely-parked ones.

Park (`deferred`) fires **none** of those cascades.

## Unpark: the audited exit (SD-LEO-INFRA-DEFERRED-STATE-ENTRANCE-001)

`deferred` is **parked, not finished**. Claim paths say so: the claim-guard banner and
`sd-start`'s `TARGET_ALREADY_TERMINAL` message name the exact exit command
(`npm run sd:unpark -- <SD-KEY> --reason "<why>"`) for a deferred SD instead of the old
"finished/closed" wording. `completed` / `cancelled` wording is unchanged.

Unpark now mirrors park's discipline:

- **`--reason` is required.** Unpark stamps `metadata.unparked_by`, `unparked_at`,
  `unparked_reason` and `stamped_by_session` through the same provenanced-stamp helper park
  uses. A later re-park strips those fields so a park → unpark → park cycle never leaves a
  stale "last unparked at" reading as current.
- **The restore status is never guessed.** Unpark restores `metadata.parked_from_status`
  only when it was genuinely recorded by `park()`. If it is missing, not a workable status,
  or was **backfill-inferred** (`parked_from_status_source='backfill_inferred'` — the 25 of
  29 live deferred rows that predated recording), unpark refuses with
  `UNPARK_RESTORE_STATUS_REQUIRED` and you must pass `--restore <status>` explicitly.
- **`--restore` must itself be workable** (`draft`, `active`, `planning`, `in_progress`).
  `--restore completed` or `--restore cancelled` is refused with
  `UNPARK_RESTORE_STATUS_INVALID`: an unpark straight into a terminal status would fire the
  full SD-completion trigger cascade through the allowlisted writer and skip
  LEAD-FINAL-APPROVAL.
- **The write is guarded by `WHERE status='deferred'`**, so two operators unparking the same
  SD cannot both succeed.
- **Actor rule is the same as park**: non-EXEC actor required (CLI default `cli`).

```bash
# Row parked before parked_from_status was recorded (backfill-inferred) — be explicit:
node scripts/sd-park.js unpark SD-XXX-001 --reason "resuming" --restore in_progress
```

The pure planner `computeUnparkPlan()` in `lib/sd-park.js` holds these decisions and is
unit-tested (`tests/unit/sd-park.computeUnparkPlan.test.js`), because the DB-tier
integration suite runs zero tests where no non-production target is designated.

## Retired: `metadata.do_not_auto_start`

The `metadata.do_not_auto_start` flag is **dead** — it never had a production consumer
(the live work-selection paths use positive status allowlists, which the flag was never
wired into). It is **superseded by park**. Do not set it; park instead.

## Edge cases (documented, intentional)

- **`progress >= 100` in EXEC/PLAN**: park normalizes `progress` to 99 in the same update
  so `auto_transition_status` does not flip the SD to `pending_approval`; the original
  value is restored on unpark (`metadata.parked_progress_original`).
- **Actor role**: park/unpark must run under a **non-EXEC** actor
  (`enforce_doctrine_of_constraint` raises under `EXEC`). The CLI defaults to `cli`.
- **Parked child of an orchestrator**: a parked (deferred) child keeps the parent in
  `WAITING_FOR_CHILDREN` — correct, since the child is deliberately not done.
- **Venture teardown**: `delete_venture`/`kill_venture` still force-cancel a parked SD on
  a killed venture — reasonable teardown behavior; left as-is.
