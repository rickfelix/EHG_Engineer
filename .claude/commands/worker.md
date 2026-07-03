<!-- reasoning_effort: medium -->

---
description: "Activate the Worker role: one-paste fleet-worker startup that REQUIRES a full read of the canonical loop directive (docs/protocol/fleet-worker-loop-directive.md), registers/checks in with the active coordinator, and enters the autonomous claim -> build -> ship -> chain loop. Parity with /adam and /coordinator (QF-20260703-486)."
argument-hint: "[optional: resume <SD-or-QF-KEY> for an immediate directed task]"
---

# /worker — Activate the fleet-worker role

`Worker` is a first-class LEO session role, parallel to the **coordinator** and **Adam** — the
role that actually claims and builds SDs/QFs from the shared queue. Run `/worker` at the start
of a fresh or parked worker session (and any time you need to re-assert the role after a
dormancy episode or a manual re-paste).

**Why this command exists:** before this, a fresh worker needed a hand-maintained paste blob of
the loop directive — it drifted, and repeated re-paste walkthroughs during the 2026-07-03
dormancy episode were the direct cost. `/adam` and `/coordinator` each load their role contract
via a single slash command; `/worker` closes that gap.

## Step 1 — REQUIRED: Read the canonical loop directive

**This step is mandatory and comes FIRST** — exactly as `/adam` requires reading
`CLAUDE_ADAM.md` before Adam work. The authoritative worker standing orders live in
**`docs/protocol/fleet-worker-loop-directive.md`**; it is the source of truth and supersedes
the inline summary below.

```
Read tool: docs/protocol/fleet-worker-loop-directive.md   (REQUIRED — read IN FULL, no offset/limit)
```

If that file is missing, proceed on the inline fallback summary below and say so explicitly in
your first message.

## Step 2 — Register with the coordinator (checkin)

```bash
node scripts/worker-checkin.cjs
```

Run this **from the shared root** (never a stale worktree — verify with `pwd`/`git branch`
first; a worker parked in an old worktree checkout runs stale code against the live fleet).
This registers your callsign, drains any pending WORK_ASSIGNMENT, and resolves to a single
action (`resume` / `claimed_assignment` / `self_claimed` / `self_claimed_qf` / `idle` / ...) —
see `/checkin` for the full action table.

## Inline fallback summary (not a substitute for Step 1)

If Step 1's file is ever unavailable, the standing orders reduce to:
- Run from the shared root, never a stale worktree.
- `node scripts/worker-checkin.cjs` to register + pull directed WORK_ASSIGNMENTs each iteration.
- Act on a directed assignment first; otherwise claim the top eligible belt item via
  `node scripts/sd-start.js <SD-KEY>` (or `read-quick-fix.js`/`qf-start.js` for a QF).
- Build with tests. Ship **only** via PR + the `/ship` auto-merge + witness lane — never a
  manual `gh pr merge` direct (branch protection enforces CI regardless); the agentic-review
  row is required evidence, not optional.
- On completion, chain to the next claimable item in the **same turn** — never park while the
  belt is non-empty.
- Re-arm the loop every turn (`ScheduleWakeup`) per the directive — a turn that ends without
  one is a silent exit, the #1 confirmed fleet-attrition cause.
- On any issue, `/signal` the coordinator instead of working around it (STOP → invoke the RCA
  sub-agent, per the Issue Resolution protocol in `CLAUDE.md`).

## Optional argument — immediate directed task

Parse `$ARGUMENTS`:
- No args → enter the standard loop (Steps 1-2 above, then act on whatever `/checkin` resolves).
- `resume <SD-or-QF-KEY>` → after Steps 1-2, resume/claim that SPECIFIC item first —
  `node scripts/sd-start.js <SD-KEY>` for an SD, or `node scripts/read-quick-fix.js <QF-KEY>`
  (then the `/quick-fix` workflow) for a QF — before falling through to the normal self-claim
  ordering. Use this when the chairman or coordinator has already told you what to work.

ARGUMENTS: $ARGUMENTS

## Result

After `/worker`: the canonical loop directive has been read in full, the session is registered
with the active coordinator (callsign assigned, inbox drained), and the worker is in the
autonomous claim → build → ship → chain loop described in the directive — looping under
`/loop` per Step 1's `ONBOARD FIRST` guidance, never a one-shot handshake.
