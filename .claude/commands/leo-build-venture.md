<!-- reasoning_effort: high -->

---
description: Drive a build-ready leo_bridge venture's generated SD tree to completion (session-hosted consumer; holds at S19, never advances)
argument-hint: [--venture-id <uuid> | --venture <name>] [--dry-run] [--max-leaves N]
---

# /leo-build-venture — leo_bridge build CONSUMER (session-hosted)

You are the **session host** for the leo_bridge build consumer (SD-LEO-INFRA-AUTO-EXECUTE-LEO-002).
The detector (`scripts/cron/leo-build-starter.mjs`) has signalled a venture as build-ready
(orchestrator `metadata.build_ready_at`). This skill drives that venture's **nested** SD tree to
completion by repeatedly driving the next workable **leaf** SD to LEAD-FINAL-APPROVAL via an
`orchestrator-child-agent` teammate, until no draft/active descendant remains.

The pure logic (introspection, bounds, completion, finalize) lives in
`lib/eva/bridge/venture-build-consumer.js`. This skill is the **driver** the lib's `runConsume`
expects — you ARE `driveLeaf`, because per-child builds need a live Claude session (Task/TeamCreate).

## ⚠️ NEVER-ADVANCE invariant (RCA a14ff998 — the S19 gate-bypass incident)

You MUST NOT, under any circumstance:
- advance the venture, write `ventures.current_lifecycle_stage`, or call any `_advanceStage` path
- create or approve a `chairman_decision`, set `chairman_approved`, or approve a vision
- treat a `cancelled` child as something to force-complete (cancelled is an accepted terminal)

The venture **stays at Stage 19** the entire time. The existing `stage-execution-worker` advances
S19→S20 **itself**, via its existing exit-gated path, once every child is terminal. You only drive
the child SDs and (optionally) run `--finalize` to set the idempotency marker + idle-nudge.

## Step 1 — Resolve the venture and confirm eligibility

Determine the `<venture-id>` (from `--venture-id`, or resolve `--venture <name>` against
`ventures.name`). Then introspect — this makes **zero writes**:

```bash
node lib/eva/bridge/venture-build-consumer.js --venture-id <venture-id> --dry-run
```

- If it prints `skipped=true` (reason `not_leo_bridge`, `no_approved_l2_vision`, `not_at_s19`,
  `already_consumed`, …) → **STOP** and report the reason. Do not drive.
- If it prints `nextLeaf=(none)` and the tree is complete → go to Step 3 (finalize).
- Otherwise it prints the next workable **LEAF** sd_key (a grandchild, not just a child-orchestrator)
  and the `workableLeaves` count. Note the bounds: a per-venture start budget (`--max-leaves`,
  default 60), a wall-clock cap, and a per-leaf attempt cap of 2.

If `--dry-run` was passed by the operator, stop here after reporting — that is the smoke demo.

## Step 2 — Drive loop (bounded, fail-closed)

Track: `leavesDriven` (start budget), `attemptsByLeaf` (per-leaf attempt cap = 2), and wall-clock.
Repeat:

1. Run the `--dry-run` introspection again to get the current `nextLeaf` and `workableLeaves`.
   - `skipped`/complete/`nextLeaf=(none)` → exit the loop.
2. **Bounds check** — if `leavesDriven >= max-leaves`, the wall-clock cap is exceeded, or this leaf
   has already been attempted twice, **STOP the loop and HOLD** (leave the venture at S19). Report
   which bound tripped. Do NOT spin.
3. **Drive the leaf** — spawn an `orchestrator-child-agent` teammate (via the Task tool) whose job is
   to take SD `<nextLeaf>` through its **full LEO cycle to LEAD-FINAL-APPROVAL** in its own worktree
   (LEAD-TO-PLAN → PLAN-TO-EXEC → EXEC → PLAN-TO-LEAD → LEAD-FINAL-APPROVAL, with all sub-agent
   evidence — the child runs the normal protocol). It MUST NOT touch the venture stage or any
   chairman/vision row. Increment `attemptsByLeaf[nextLeaf]` and `leavesDriven`.
4. **Verify** — re-query the SD's status. If it reached `completed`, continue the loop (the next
   introspection will surface the next leaf; child-orchestrators bubble-complete automatically). If
   it did not, loop again (the same leaf will be re-selected until its attempt cap, then HOLD per
   step 2).

This is exactly the algorithm of `runConsume` in the lib — keep it identical; the lib's unit tests
(TS-1..TS-11) are the contract.

## Step 3 — Finalize (only when the tree is complete)

When the loop exits because the tree is complete, set the idempotency marker and idle-nudge the
worker (safe — it only writes when genuinely complete, never advances):

```bash
node lib/eva/bridge/venture-build-consumer.js --venture-id <venture-id> --finalize
```

Report: leaves driven, completion status, and whether the idle-nudge fired. The
`stage-execution-worker` will advance the venture S19→S20 on its next poll — confirm by re-reading
`ventures.current_lifecycle_stage` (it is the WORKER, not you, that advances it).

## Step 4 — Report

Summarize: venture, leaves driven / total, completed vs held (and which bound if held), and the
final venture stage. If HELD, the venture is safe at S19 and a later `/leo-build-venture` re-run
resumes from the remaining draft leaves (idempotent — `build_consumed_at` blocks a completed re-run).
