---
category: documentation
status: approved
version: 1.0.0
author: rickfelix
last_updated: 2026-06-10
tags: [documentation, protocol]
---

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
>
> **CANON SOURCE (SD-LEO-INFRA-LOOP-CONTINUITY-ENFORCE-001):** the enforced never-exit
> contract is `leo_protocol_sections#fleet_worker_loop_continuity` (regenerated into
> CLAUDE_EXEC.md + CLAUDE_CORE.md) and is enforced by the Stop hook
> `scripts/hooks/stop-loop-wakeup-reminder.cjs`. This doc, that DB section, and the WORKER
> block must all carry the same four exit-modes (4a-4d) + the allow-path (operator-stop /
> canonical pause point / announced `/signal` wind-down).

---

## The directive

```
/loop REVIVAL DIAGNOSTIC FIRST (troubleshooting the dormant-loop bug — chairman-directed): If this paste is REVIVING you (you were previously running the fleet-worker loop in this session and went quiet), then BEFORE anything else, send a dormancy report so we can find the root cause: /signal harness-bug "DORMANCY REPORT: last item I completed=<X at time T>; last ScheduleWakeup I armed=<delay + when I armed it, or NONE>; did it ever fire=<yes/no/unknown>; my last visible action before going quiet=<what>; anything unusual in my context (error, permission prompt, tool failure, Stop-hook message)=<what or none>; gap between my last activity and this revival=<estimate>". Be precise — your own transcript is the evidence. ALSO adopt this permanent habit for this loop: every time you arm a ScheduleWakeup, ALSO run /signal feedback "wakeup-armed +<N>s at <time>" (one line) so the coordinator can detect armed-but-never-fired from outside. If this is your FIRST time in the loop this session, skip the report and just proceed.

You are an autonomous LEO fleet worker — one of SEVERAL workers a coordinator is running in parallel right now. You are not working alone.

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
6. On completion, /signal a FLEET-RETRO, run the post-completion tail, then claim the next workable SD IN THIS SAME TURN and start building it — never park between SDs while the belt is non-empty (KPI: median completion→next-claim ≤3 min, p90 ≤8 min). Park ONLY when the belt is genuinely EMPTY: **first PUSH any WIP** — before arming the ScheduleWakeup, commit your in-progress work on the claim-bound branch AND `git push` it (or run `node scripts/prepark-wip.cjs`) so a sweep-driven claim release + peer re-route can RESUME from your branch instead of orphaning the unpushed partial commit (the worktree survives, but a fresh re-route worktree can't see an unpushed commit) — THEN ScheduleWakeup ~20 min (crash-recovery heartbeat, NOT the work trigger) and re-check (do NOT stop to ask — there is no human in the loop window). This same-turn rule is mirrored in the `[ROLE]` WORKER block (`scripts/hooks/session-role-orient.cjs`) — keep the two in sync. REMEMBER the diagnostic habit: every ScheduleWakeup arm gets its one-line "wakeup-armed" /signal (see REVIVAL DIAGNOSTIC above). On loop stop (no work / told to stop / winding down), /signal feedback "offline — <reason>" so the coordinator reflects the exit instead of a silent disappearance. (SD-FDBK-INFRA-AUTO-PUSH-WIP-001, SD-MAN-INFRA-SAME-TURN-NEXT-001)
7. WIND-DOWN HANDSHAKE (before you finish an SD or go idle — operator 2026-06-10). Two hard rules so you never strand work or vanish without warning: (a) NEVER drop an in-progress SD to claim a different one — FINISH it through LEAD_FINAL or hand it off explicitly; a half-done SD left `in_progress` + unclaimed is an orphan the next worker can't safely resume (live example: REVIVE-EVA-MASTER stranded at EXEC 87%). (b) Before going quiet, give the coordinator a GRACE WINDOW: `/signal feedback "winding down — finished <SD>, anything queued for me? idling ~180s"`, then arm a SHORT `ScheduleWakeup` (~180s) and on that next tick RE-CHECK your inbox for a coordinator reply/assignment BEFORE you settle into the ~20min idle cadence. Announce → grace → idle; never disappear mid-stream. Enforced (backstop) by the Stop hook `stop-loop-wakeup-reminder.cjs`, which now also fires for a claim-holding worker whose loop_state never entered the machine.

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

**QF-20260703-821** canonicalized two chairman-directed diagnostic additions used to
troubleshoot the dormant-loop class confirmed by QF-20260703-076 (armed `ScheduleWakeup`s
that never fire, a harness-level bug): (1) a **REVIVAL DIAGNOSTIC** block at the top of the
directive — a worker revived after going quiet mid-loop files a `/signal harness-bug`
dormancy report (last completed item, last `ScheduleWakeup` armed and whether it fired, last
visible action, anything unusual in context, gap estimate) before doing anything else, since
its own transcript is the evidence the RCA otherwise lacks; a worker's first time in the loop
this session skips it. (2) A **step-6 addition**: every `ScheduleWakeup` arm is paired with a
one-line `/signal feedback "wakeup-armed +<N>s at <time>"` so the coordinator can compute
armed-but-never-fired externally, with timestamps, instead of only detecting silence after
the fact.

---
### Related documentation
- [The LEO Harness](./README.md) — canonical overview tying the roles, channels, loop model, and failure modes together.
