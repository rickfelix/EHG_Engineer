# Fleet Coordinator & Worker Behavior (durable protocol)

## Metadata

- **Category**: Protocol
- **Status**: Approved
- **Version**: 1.1.0
- **Last Updated**: 2026-06-08
- **Tags**: fleet, coordinator, worker, cron, self-review, adam
- **Author**: SD-LEO-INFRA-ARM-CANONICALIZE-WORK-001

Memory-independent source of truth for how the LEO fleet **coordinator** and its **worker** sessions
behave. It exists so these behaviors survive even if an agent's personal auto-memory is lost, or a
different agent/machine runs the fleet. Enforced by `.claude/commands/coordinator.md` (the
`/coordinator` skill + the fleet-worker wake-up prompt), the `scripts/coordinator-*.mjs` scripts, and
`templates/session-prologue.md`. (An agent's personal `~/.claude/.../memory/` mirrors this for fast
recall but is NOT the source of truth.)

## Coordinator responsibilities

1. **Manager, not IC.** Delegate mechanical/parallelizable work (SD creation, investigations, audits,
   cleanups) to sub-agents or the fleet queue — never grind it inline. Reserve own cycles for judgment
   (prioritization, sensitive RCA, the *execute* step of destructive actions). Parallelize independent
   delegations. Verify sub-agent output; delegate the plan, execute destruction yourself after sign-off.
2. **Keep workers busy — maximize utilization without conflict** (operator directive 2026-06-07).
   Continuously source claimable work; idle workers + available work is a problem to solve, not a reason
   to idle. The coordinator is EITHER productively delegating/sourcing OR torn down — never idling in
   between. **The active form:** when idle workers exist AND there is claimable, **independent,
   no-conflict** work, **ASSIGN it** — do not narrate that it can wait. Idle capacity is pure waste
   *regardless of the work's priority*; low-value progress beats none. **HOLD (do not assign) only when:**
   (a) the SD has unmet dependencies or would conflict with in-flight work (same SD, same file/branch a
   peer holds, or an explicit ordering Adam/the chairman set), or (b) higher-priority claimable work
   should go first (but when the only work is low-priority, still assign it). **Verify before assigning:**
   `unmet_deps == 0`, not already claimed, no peer on the same branch; **NEVER dispatch an orchestrator
   PARENT as buildable work** (parents auto-complete when children finish — dispatch only children/leaf
   SDs); dispatch to the worker's full session UUID. (memory:
   `feedback-coordinator-maximize-utilization-without-conflict`.)
   **Mental model — the conveyor belt (operator analogy 2026-06-07):** run the line so it never empties.
   (1) **PARSE the belt** — inventory all claimable + in-flight work (open SDs by status/phase/claim, open
   QFs, orchestrator children), classifying each *conflict-free* vs *blocked by SAME-WRITE-SURFACE* (same
   files/rows/branch a peer holds), NOT just the formal `dependencies` field; (2) **SOURCE** more belt-able
   work from the harness backlog (filtering out ~80% completion-flag / fleet_retro / coordinator_review
   noise), open feedback, retro follow-ups, and decomposable parent stages — promote via `sd-create
   --from-feedback`, delegated to a sub-agent (DOC-001: workers can't create SDs), grouping same-file items
   into ONE SD and deferring items that share a write-surface with in-flight work; (3) keep the belt at
   **SURPLUS** so a self-claiming worker never finds it empty (idle worker + sourceable work = failure).
   (codified in the `/coordinator start` section of `.claude/commands/coordinator.md`; QF-20260607-720.)
3. **Recurring 3-source audit** (`scripts/coordinator-audit.mjs`, 15-min cron): check (a) SD queue,
   (b) **harness backlog** (`feedback` where `category='harness_backlog'`, open), (c) inbox. Source
   backlog → DRAFT SDs ONLY when the queue would starve available workers; when the queue already has
   surplus (more unclaimed SDs than builders) it's **worker-bound** → wake workers, don't flood it.
4. **Background monitoring during operator conversations.** Run the cron ticks but respond minimally;
   surface ONLY important events (stuck/struggling worker, empty-queue+idle, claim/worktree conflict,
   a worker question, a completion). Keep one coherent conversation; don't dump a dashboard every tick.
5. **Executive email** (`scripts/coordinator-email-summary.mjs`, 15-min): dynamic scope (live fleet, no
   hardcoded campaign list). Single gauge = **active workers vs `min(workable SDs, target)`** → 🔴/🟡/🟢
   + trend vs the previous email. GREEN = every workable SD has a builder (full throttle); YELLOW =
   work waiting with no builder; RED = work exists and nobody building.
6. **Question escalation — rides in the executive email.** When a worker `/signal`s a question it
   couldn't self-resolve: ANSWER it yourself if you can (the reply routes back to the worker). ONLY for a
   genuinely-human question, escalate with `scripts/coordinator-escalate-question.mjs` — it writes a
   durable `feedback` row (`category='operator_question'`, `status='new'`) that the **15-minute executive
   email surfaces** (a `❓N` flag in the subject + a "questions need your input" section). One channel the
   operator already watches, NOT a separate email (add `COORD_ESCALATE_URGENT=1` only for a truly
   time-sensitive one). The script dedups identical still-open questions. When the operator answers:
   route the answer back to the worker's inbox AND mark the row `status='resolved'` so it drops off the
   next email. Workers NEVER block waiting — they signal, then proceed on a best-guess default or a
   different SD (worker rule 2).
7. **Auto-teardown.** When the campaign is genuinely done — no claimable AND no sourceable work AND zero
   workers, sustained — tear down: `CronDelete` ALL loops FIRST, then `clearActiveCoordinator` + a final
   email (durable path: `COORD_TEARDOWN_SAFETY_V2`). Don't idle cron loops indefinitely past a finished
   campaign. An explicit operator `/coordinator start` is NOT idle — arm the loops and trust work is coming.
8. **The coordinator cannot start a worker's execution** — only `/loop` or a human paste in the worker
   window can. To restore a thinned fleet, hand the operator the wake-up prompt.

## Coordinator standing responsibilities (SRE charter)

Operating a fleet of *AI agents* (not humans) requires supervisor-process duties humans do not self-perform: **agents fail SILENTLY on resource exhaustion, fall asleep when their loop is not self-rescheduling, and do not escalate** — so the coordinator must pull the andon cord on their behalf. These are the four standing SRE-style duties. Each names the mechanism that already implements it (this charter ties scattered behaviors together; it does not replace them). They are surfaced together by the SRE-gauges block of `scripts/coordinator-audit.mjs`.

1. **Resource-pool management.** Treat worktrees, claim-locks, CI minutes, and API rate-limits as finite pools; monitor utilization and reclaim *before* exhaustion hard-stops the line. *Why:* a saturated pool (e.g. the worktree 20/20 stall) makes `sd-start` take-then-release every claim, so the whole fleet goes quiet with no error. *Mechanism:* `lib/worktree-quota.js` (`countActiveWorktrees` / `MAX_WORKTREE_COUNT`), the worktree reaper, and the dedicated watchdog SD-MAN-INFRA-COORDINATOR-WORKTREE-POOL-001. *Gauge:* worktree pool utilization (N/20).
2. **Liveness supervision.** Monitor heartbeat + `loop_state` to distinguish **working / idle-alive / dead**, auto-recover, and ensure every worker `/loop` is self-rescheduling. *Why:* an "active" heartbeat can mask a stalled loop, and a worker whose loop stops self-arming a wakeup sleeps forever with work waiting. *Mechanism:* `stale-session-sweep.cjs` (`ALIVE_NO_HEARTBEAT` / `DEAD` classification, `LOOP_STATE_EXITED`), the worker `/loop` + `ScheduleWakeup` cadence (SD-LEO-INFRA-FLEET-WAKE-UNDER-001). *Gauge:* loop_state distribution across live workers.
3. **Flow + silent-failure detection.** Track SD cycle-time / stuck-aging, enforce WIP limits, and detect incognito / repeated-gate-fail / dead-letter workers from telemetry — then intervene. *Why:* agents do not raise their hand; a stuck SD or a worker polling a dead-lettered inbox stays invisible until someone looks. *Mechanism:* `stale-session-sweep.cjs` (`WIP_GUARD`, `WORKER_STRUGGLING` for `handoff_fail_count>3`, dead-letter `CLAIM_RELEASED`). *Gauges:* stuck-SD aging + idle-with-work workers.
4. **Dependency watching.** Continuously track the SD dependency graph + critical path — which SDs are BLOCKED (deps unmet), which are unblocked-and-claimable, the longest chain, and parent/orchestrator child-completion gating. Detect anomalies (e.g. a child shown BLOCKED while its dependency is already COMPLETED — a dep-resolver staleness / flow impediment) and intervene. *Mechanism:* `strategic_directives_v2.dependencies` + the next-candidates view. *Gauge:* dependency / critical-path (blocked-count / ready-count / stale-blocked).

**Deploy-verification practice — SYNC → RESTART → CANARY-VERIFY.** Merged + git-synced ≠ RUNNING. On ANY worker-code refresh the coordinator must (1) **sync** the checkout to `origin/main`, (2) **restart** the long-lived worker process (a synced file is not loaded until the process restarts — verify the process StartTime is *after* the sync), and (3) **canary-verify** at runtime (have a worker re-run one stage and confirm the new behavior is live) BEFORE declaring a deploy-gap closed. Never declare a deploy closed on git state alone. *(credit: Adam canary loop, 2026-06-07.)*

**Relationship to sibling SDs (complementary, no duplication):** this charter is the **ongoing-operations** duty set. The one-time **startup ritual** is SD-LEO-INFRA-COORDINATOR-STARTUP-ONBOARDING-001; **self-sustaining loop-wake** is SD-LEO-INFRA-FLEET-WAKE-UNDER-001; the **worktree pool watchdog mechanics** live in SD-MAN-INFRA-COORDINATOR-WORKTREE-POOL-001 (this charter only references it).

## Worker rules (the fleet-worker `/loop`)

1. **NEVER call `AskUserQuestion`** or otherwise stop to ask the human directly. No human watches a
   worker window, so it **hangs the `/loop` indefinitely** — the #1 confirmed cause of workers going
   incognito (attrition). The whole point of the fleet is that the operator does not babysit.
2. **Questions / ambiguous decisions:** (a) self-resolve under AUTO-PROCEED — weigh the options, pick
   the highest-value one, state a one-line rationale, and proceed; (b) if truly blocked, `/signal` the
   coordinator (`prd-ambiguous` / `stuck`) with the options already weighed, then IMMEDIATELY proceed on
   a best-guess default OR claim a DIFFERENT workable SD. **Never sit idle waiting** — that is the loop death.
3. **On revival** (re-pasted after going incognito): FIRST `/signal feedback` the attrition diagnostic —
   what you were doing / why the loop stopped / last context — BEFORE claiming work.
4. Claim atomically (`sd-start.js`); re-affirm the claim after long sub-agent runs and right before handoffs.
5. On any issue: STOP and invoke `rca-agent` (no blind retries). `/signal` the coordinator on friction.
6. **Check in AS a `/loop` step, never a one-shot.** When activated or told to "check in", run/continue under `/loop` and poll your coordination inbox (`/checkin`, or `node scripts/fleet-dashboard.cjs inbox`) as a loop-iteration step. **NEVER hand-roll a bounded `Bash` poll loop** (`while sleep …`) to wait for an assignment — those overshoot the 120000ms default Bash timeout and die with **exit-143** (RCA-confirmed 2026-06-07). The `/loop` + per-iteration `ScheduleWakeup` cadence (short ~2-5min with in-flight work, ~20min when idle) IS the re-poll mechanism. A bare one-shot `/checkin` that does not re-arm a wakeup leaves the worker idle-forever with a non-empty queue — the #1 attrition cause (SD-LEO-INFRA-FLEET-WAKE-UNDER-001). See the canonical directive: `docs/protocol/fleet-worker-loop-directive.md`.

## Recurring self-improvement loop (fleet retro)

The fleet continuously improves how the coordinator and workers collaborate — like recurring performance reviews, not a one-time fix.
- **Trigger (worker):** at EVERY SD completion, the worker `/signal`s a one-line **FLEET-RETRO** — what worked / what was friction (coordinator, queue, claim, handoff, tooling) / one improvement idea. (Enforced in the wake-up prompt Step 5.)
- **Capture + synthesize (coordinator):** `scripts/coordinator-fleet-retro.mjs` (recurring cron) captures FLEET-RETRO signals into the durable `feedback` table (`category='fleet_retro'`) so they survive the coordination-message sweep and ACCUMULATE, then prints a synthesis.
- **Adjust (coordinator):** cluster the retros (what-worked / friction / suggestions) and ADJUST — update the wake-up prompt or coordinator behavior, file a harness SD for recurring friction, and surface a digest to the operator when a clear pattern emerges.
- Distinct from `/learn` (which retros the SD WORK → `issue_patterns` / `retrospectives`); this retros the FLEET PROCESS. The two are complementary.

### Work-triggered tri-party coordinator self-review (`coordinator-self-review.mjs`)

Separate from the FLEET-RETRO capture above, the coordinator runs a **performance self-review** that is **work-triggered, not wall-clock** (operator 2026-06-06: cadence should track work volume, not a clock). It is the **7th** canonical standard cron loop (armed by `scripts/coordinator-startup-check.mjs`; `cron */5`, a cheap poller). SD-LEO-INFRA-ARM-CANONICALIZE-WORK-001.
- **Capture (every tick):** harvests any worker `COORDINATOR-FEEDBACK` and Adam `ADAM-COORD-FEEDBACK` responses (cheap, always runs).
- **Solicit + synthesize (when due):** once the completed-SD delta reaches `COORD_REVIEW_EVERY` (default 8), it solicits fresh candid critique from the live fleet — **tri-party**: coordinator ↔ workers, and coordinator ↔ **Adam** (the bidirectional lane, gated by `COORD_ADAM_REVIEW_V1`, now `on` in `.claude/settings.json`; FR-4/FR-5 of the Adam role formalization). Then it synthesizes and resets the counter in `.coord-review-last.json`.
- **No-op below threshold** so it is safe to leave armed through idle stretches; the coordinator tears down during genuine idle so nothing runs while nothing happens.
- **Stuck-counter guard:** the `*/15` audit (`coordinator-audit.mjs`) prints a **REVIEW HEALTH** gauge (via `lib/fleet/review-health.mjs`) that flags **STUCK** when the completed-SD delta is ≥ 2× the threshold with no fire — the signature of the self-review cron not being armed (the dormancy this SD fixed: the counter had frozen at delta 45 vs threshold 8).

## Known attrition root causes (live-confirmed 2026-06-06, from revival diagnostics)

Workers silently stop looping for these reasons. On revival a worker `/signal`s which one hit it.
1. **AskUserQuestion self-kill** — worker called `AskUserQuestion` (no human watching → `/loop` hangs). FIXED (worker rule 1). 1/3 diagnostics.
2. **SD-boundary `/compact` pause** — worker finished an SD with HIGH context; the Pre-SD-Start Context Check / `/leo-complete` Step 5 told it to emit `/compact` and pause, but the built-in `/compact` can ONLY be typed by the user (a worker cannot self-invoke it) → the worker waits indefinitely for an operator-typed `/compact`. **2/3 diagnostics — the bigger cause.** FIX: at the SD boundary the worker must AUTO-compact via the `/context-compact` SKILL (agents CAN invoke skills) and CONTINUE — or just continue (the harness auto-summarizes) — NEVER pause for a user-typed `/compact`. Worker-prompt Step 5 updated; the harness-side Pre-SD-Start Context Check / `/leo-complete` Step 5 still needs the same change (auto-compact-and-continue, not pause-for-user) — file as a harness SD.
3. **Claim-sweep reaps an in-flight worktree during an idle gap** — CONFIRMED 2026-06-06 (worker 6c3c6656). The sweep released the session via `STALE_CLEANUP/HEARTBEAT_TIMEOUT` during a no-heartbeat stretch and removed the worktree, leaving a **LOCKED empty husk** (a process-cwd handle) that blocks `rm`/rename for hours — this is the orphan-worktree residue the coordinator keeps failing to delete. **Recovery:** `git worktree add --force` into the husk succeeds even when delete is OS-locked (writes work though delete is blocked) → then `sd-start` resume. Fix shipped (`SD-LEO-INFRA-ENABLE-CLAIM-SWEEP-001`, `sweep_respect_inflight_agent` / `expected_silence_until`) but is NOT fully preventing idle-gap reaps → needs hardening (harness SD). **RED HERRING (do not chase):** the same worker also reported a "~4h clock skew → spurious HEARTBEAT_TIMEOUT"; the coordinator VERIFIED node UTC == system UTC (no skew) — the worker read Windows LOCAL time (EDT, UTC−4 ≈ 4h) as UTC. There is no real clock skew.
4. **Idle-gap stall — no `ScheduleWakeup` pacing the loop** — CONFIRMED 2026-06-06 (worker 6c3c6656). In autonomous `/loop`, the agent is only re-invoked by (a) a `ScheduleWakeup` tick it previously scheduled, or (b) a human message. If a worker reaches an idle/decision point (between SDs, after a `/model` switch, waiting on something) and ends its turn WITHOUT having scheduled a `ScheduleWakeup`, the loop simply stops firing — it sits quiet until the operator types something. 6c3c6656 went silent ~2.5h this way (*"operator stepped away after /model; NO ScheduleWakeup was pacing me"*), and the now-idle worktree was then reaped by the claim-sweep (cause #3) — so **#4 is frequently the TRIGGER and #3 the consequence.** FIX: a worker must call `ScheduleWakeup` at the END of EVERY iteration (short ~2-5 min when it has in-flight work to resume, ~20 min when the queue is empty) so the loop always re-fires — NOT only in the "no workable SD" branch. Wake-prompt Step 5 updated to mandate this.

### Heartbeat masks a stalled loop — "active" ≠ "building" (CONFIRMED 2026-06-06)

The 30-second `session-tick` timer (and the PostToolUse `heartbeat-hook`) keep `claude_sessions.heartbeat_at` fresh **independently of whether the `/loop` is iterating.** A worker stalled at a pause point (waiting for a user-typed `/compact`, blocked on `AskUserQuestion`, or just not auto-claiming the next SD) therefore still shows `heartbeat=0m, status=active` — it LOOKS alive but is doing no work, and the stale-session sweep never reaps it (fresh heartbeat = looks healthy). **Consequence:** the fleet-dashboard `ACTIVE WORKERS (N)` headline OVERCOUNTS — it counts heartbeat-alive sessions regardless of claim. **The honest "builder" count = sessions that are heartbeat-live AND hold an `sd_key` claim** (this is what `scripts/coordinator-email-summary.mjs` counts — so the 15-min email gauge is accurate; the dashboard headline is not). **Diagnosis recipe:** query `claude_sessions` for live sessions with NO `sd_key` while the queue has claimable SDs → those are stalled-at-boundary workers, not capacity. The fix is the same as cause #2 (auto-continue at the SD boundary) + re-paste the updated wake prompt into those windows so the loop resumes claiming.

### Parked-worker heartbeat DEATH (distinct from heartbeat-MASKS — OUT OF SCOPE of the wake/loop fix)

There is a SEPARATE failure mode (feedback `34113d39`, `category='harness_backlog'`, 2026-06-07): the detached `session-tick.cjs` watches the Claude Code parent PID captured at SessionStart, but that PID changes over a long session (`/clear`, reconnect, compaction). When the watched PID dies the tick exits and is **never re-spawned**, so `heartbeat_at`/`process_alive_at` go stale and the session is marked stale mid-loop. (It also only refreshes `process_alive_at`, while `cleanup_stale_sessions` staleness-checks `heartbeat_at`.) **This is a heartbeat-liveness / staleness-sweep problem, NOT a loop-iteration / `ScheduleWakeup` problem** — SD-LEO-INFRA-FLEET-WAKE-UNDER-001 fixes the worker's *own loop flow* (always re-arm a wakeup, check in as a loop step). The two are complementary but independent: the wake-fix keeps the loop re-firing; the tick-fix keeps the heartbeat fresh so the sweep does not reap the parked worker between re-fires. **Deliberately DEFERRED here** to keep this a tight prompt/skill/doc delta; tracked separately in feedback `34113d39` (fix ideas: re-discover the live CC PID via ancestry/SSE-port instead of pinning the SessionStart PID; have the tick PATCH `heartbeat_at` too; auto-respawn the tick on loop wake when its marker is missing).

## Recovery / where each behavior is enforced

| Behavior | Enforced in (repo) |
|---|---|
| Coordinator skill, subcommands, wake-up prompt | `.claude/commands/coordinator.md` |
| Worker: no AskUserQuestion, AUTO-PROCEED, revival diagnostic | `.claude/commands/coordinator.md` (wake-up prompt, Step 4 + REGISTER), `templates/session-prologue.md` |
| Dynamic exec email | `scripts/coordinator-email-summary.mjs` |
| Recurring 3-source audit | `scripts/coordinator-audit.mjs` |
| Question→operator escalation (surfaced in the 15-min email, ❓N) | `scripts/coordinator-escalate-question.mjs` (writes `operator_question` row) + `scripts/coordinator-email-summary.mjs` (renders it) |
| Teardown ordering / flag | `lib/coordinator/teardown-coordinator.cjs` (`COORD_TEARDOWN_SAFETY_V2`) |

## Comms check (radio check) — verify the two-way link at startup

Before relying on the worker<->coordinator channel (especially overnight / unattended), the coordinator runs a NASA-style **radio check** to PROVE both legs of the link rather than assume them:
- **worker → coordinator** is proven when the worker's startup `/signal feedback "online"` is received.
- **coordinator → worker** is proven by `scripts/coordinator-comms-check.mjs`: it sends a `comms_check` COACHING ping; the worker reads its inbox and replies `/signal feedback "comms-check ack — read you"`. **No ack within the timeout ⇒ the worker loop is NOT polling its inbox (a silent break)** — fix its prompt.

Run it at `/coordinator start` (after identity assignment) and any time you need to TRUST signal delivery. **Worker rule:** poll your coordination inbox **as a `/loop` step each iteration** (`/checkin`, or `node scripts/fleet-dashboard.cjs inbox` / worker-inbox) — never a hand-rolled bounded Bash poll (overshoots the 120000ms Bash timeout → exit-143) — ACK a comms check in one line, then continue and `ScheduleWakeup` so the next iteration re-fires.

---
### Related documentation
- [The LEO Harness](./README.md) — canonical overview tying the roles, channels, loop model, and failure modes together.
