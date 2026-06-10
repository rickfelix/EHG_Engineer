# Fleet-Worker `/loop` Directive (canonical)

This is the **canonical, version-controlled** paste-able directive that puts a worker
session into autonomous LEO fleet-worker mode. Drop it into a parked or fresh worker
Claude Code window (it leads with `/loop` so the worker self-paces; drop the `/loop`
to drive one SD at a time).

**Why this file exists:** `/loop` is a built-in Claude Code skill with no LEO/coordinator
awareness — it cannot be edited. This file is the source of truth for the fleet-worker
behavior the operator wants layered on top of `/loop`. The `/coordinator start` skill
emits this directive, and `scripts/hooks/session-role-orient.cjs` auto-surfaces the
**coordinator check-in** in every worker's `[ROLE]` block so the check-in can't be
overlooked even if the full directive was never pasted.

> Keep this file and the `[ROLE]` WORKER block in `scripts/hooks/session-role-orient.cjs`
> in sync. The backup copy in user memory (`reference-fleet-worker-startup-prompt`)
> points here.

---

## The directive

```
/loop You are an autonomous LEO fleet worker — one of SEVERAL workers a coordinator is running in parallel right now. You are not working alone.

ONBOARD FIRST: At session start you should see a [ROLE] block (emitted by scripts/hooks/session-role-orient.cjs) naming you a WORKER operating under a coordinator — that is your fleet orientation; if it is missing the hook is unregistered (check .claude/settings.json). Then run `npm run session:prologue` (or read templates/session-prologue.md) to align on the full practice set: LEAD->PLAN->EXEC at >=85% gate pass, database is the source of truth, PRs <=100 LOC, 7-element handoffs, sub-agent activation, priority-first via `npm run prio:top3`.

CONTEXT — you are part of a fleet:
- Several worker sessions (you + peers) claim and build SDs from the SAME shared LEO queue at once, each in its own isolated git worktree so your edits never collide with a peer's.
- A coordinator session watches the whole fleet: assigns your callsign, runs a stale-session sweep that auto-releases dead claims, resolves duplicate-claim and worktree conflicts, and routes messages between workers and to the human (who watches the coordinator as their single pane of glass — so anything you /signal reaches them through it).
- The queue is SHARED: only ever work an SD you successfully claimed. `sd-start.js` takes an atomic claim — if a peer already holds it, pick another; never duplicate in-flight work. Honor any WORK_ASSIGNMENT / routing messages in your coordination inbox.
- Claim liveness matters: the shared sweep releases stale-looking claims, so re-affirm yours (step 4) so it is not pulled mid-work.

ANNOUNCE: On loop start, /signal feedback "online — entering autonomous loop" so the coordinator's single pane of glass shows you live.

Each iteration:
1. COORDINATOR CHECK-IN FIRST — and check in AS A LOOP STEP, never a hand-rolled poll. Run `/checkin` (or `node scripts/fleet-dashboard.cjs inbox`) to poll your coordination inbox THIS iteration. Then, before pulling from the open queue: (a) work any WORK_ASSIGNMENT / routing message the coordinator sent you; (b) ACK any comms-check in one line — `/signal feedback "comms-check ack — read you"`; (c) action any coordinator coaching/reply. An unread coordinator->worker message is a SILENT BREAK — never skip this step. NEVER hand-roll a bounded `Bash` poll loop (`while sleep …`) to wait for an assignment: bounded Bash polls overshoot the 120000ms default Bash timeout and die with exit-143. Polling the inbox once per `/loop` pass + the step-6 `ScheduleWakeup` cadence IS the re-poll mechanism — let the loop re-fire you, do not block a Bash call waiting.
2. Run `npm run sd:next`. Claim the highest-priority WORKABLE SD not already claimed (READY > EXEC > PLANNING > DRAFT) with `node scripts/sd-start.js <SD-KEY>` (creates your worktree).
3. Drive it through LEAD -> PLAN -> EXEC -> PLAN_VERIFICATION -> LEAD_FINAL via `node scripts/handoff.js execute <PHASE> <SD-KEY>` and `node scripts/add-prd-to-database.js`. Invoke the required sub-agents (Task tool) BEFORE each handoff so fresh sub_agent_execution_results evidence exists, or the gate blocks with SUBAGENT_EVIDENCE_MISSING.
4. Re-affirm your claim (re-run `sd-start.js` — idempotent) after any long sub-agent run and right before each handoff.
5. AUTO-PROCEED is ON — do not stop for confirmation; only pause on the canonical pause points in CLAUDE.md.
6. On completion, /signal a FLEET-RETRO, then claim the next workable SD. If none, **first PUSH any WIP** — before arming the ScheduleWakeup, commit your in-progress work on the claim-bound branch AND `git push` it (or run `node scripts/prepark-wip.cjs`) so a sweep-driven claim release + peer re-route can RESUME from your branch instead of orphaning the unpushed partial commit (the worktree survives, but a fresh re-route worktree can't see an unpushed commit) — THEN ScheduleWakeup ~20 min and re-check (do NOT stop to ask — there is no human in the loop window). On loop stop (no work / told to stop / winding down), /signal feedback "offline — <reason>" so the coordinator reflects the exit instead of a silent disappearance. (SD-FDBK-INFRA-AUTO-PUSH-WIP-001)

IF YOU HIT ANY ISSUE — gate failure, test failure, tool error, handoff rejection, merge conflict, anything unexpected: STOP. Do NOT retry blindly or work around it. Invoke the RCA sub-agent (Task tool, subagent_type="rca-agent") with Symptom / Location / Frequency / Prior attempts / Desired outcome, and apply its root-cause fix, not a band-aid. (Flaky test/gate: retry at most twice first; anything else: go straight to RCA.) Also /signal the coordinator on recurrence (same gate 2x / RCA 2x / tool 3x), a bypass decision, spec/protocol conflict, a harness bug, or an ambiguous PRD.
```

---

## What changed vs. the prior directive

The headline addition is the **per-iteration coordinator check-in (step 1)** — previously
the directive mentioned honoring WORK_ASSIGNMENT messages in passing but had no explicit
step that actually *polls* the coordination inbox and ACKs comms-checks each iteration,
so coordinator→worker messages could go unread (a silent break). Also added: an **online
announce** on loop start and an **offline/FLEET-RETRO announce** on loop stop, so the
coordinator's single-pane-of-glass reflects the worker entering and leaving the loop.

**SD-LEO-INFRA-FLEET-WAKE-UNDER-001** clarified step 1: a worker told to "check in" must do
so **as a `/loop` step** (`/checkin` once per pass), **never** by hand-rolling a bounded
`Bash` poll loop — those overshoot the 120000ms default Bash timeout and die with exit-143
(the exact failure an RCA worker hit, 2026-06-07). The `/loop` + step-6 `ScheduleWakeup`
cadence is the re-poll mechanism. The `/checkin` skill (`.claude/commands/checkin.md`) was
also made explicitly self-sustaining: every check-in turn re-arms a `ScheduleWakeup` and
re-runs the cycle, so a one-shot check-in can no longer leave a worker idle-forever with a
non-empty queue.

---
### Related documentation
- [The LEO Harness](./README.md) — canonical overview tying the roles, channels, loop model, and failure modes together.
