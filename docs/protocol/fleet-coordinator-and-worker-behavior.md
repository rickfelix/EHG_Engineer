---
category: documentation
status: approved
version: 1.0.0
author: rickfelix
last_updated: 2026-06-09
tags: [documentation, protocol]
---

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
   **Canonical sourcing command (file-free, DB-direct — SD-LEO-INFRA-OPERATOR-SOURCING-DBDIRECT-001):**
   an operator-attached session (Adam or coordinator) running on `main` with no claim is hard-blocked
   by the worktree-hygiene Write guard, so materialize a DRAFT SD from a proposal WITHOUT writing a
   payload file and WITHOUT a throwaway worktree:
   `SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js --proposal-b64 "$(node -e "process.stdout.write(Buffer.from(JSON.stringify(PROPOSAL_OBJ)).toString('base64'))")"`
   (or pipe the JSON: `… | SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js --proposal-stdin`). Both
   flow through the same validate → idempotency → create core as `--from-proposal` (add `--dry-run` to
   validate without writing). The `SD_CREATE_VIA_SKILL=1` prefix is REQUIRED — the `ENF-SD-CREATE-SKILL`
   PreToolUse hook (`scripts/hooks/pre-tool-enforce.cjs`) blocks every direct `leo-create-sd.js` call
   (including `--from-proposal`) without it; proposal ingest is the sanctioned non-interactive path so the
   prefix is the documented bypass. Base64-on-the-wire is preferred — it is immune to the Bash
   single-quote mangling that defeats inline JSON. Do **not** Write-then-`--from-proposal` and do **not**
   spin a worktree just to source.
4. **Background monitoring during operator conversations.** Run the cron ticks but respond minimally;
   surface ONLY important events (stuck/struggling worker, empty-queue+idle, claim/worktree conflict,
   a worker question, a completion). Keep one coherent conversation; don't dump a dashboard every tick.
5. **Chairman email — RETIRED coordinator leg (chairman email cutover 2026-06-10, advisory b7b73b86 /
   QF-20260609-024).** The coordinator fleet email (`scripts/coordinator-email-summary.mjs`) is NO LONGER
   armed — the chairman asked for ONE chairman-facing email: the **Adam exec-summary**, scheduled durably
   via GitHub Actions (`.github/workflows/adam-exec-email-cron.yml`, live when repo var
   `ADAM_EMAIL_LIVE=true`). Do not re-arm the coordinator email loop. The fleet-health gauge concept
   (active workers vs `min(workable SDs, target)` → 🔴/🟡/🟢) lives on inside the Adam exec email scope.
6. **Question escalation — durable row + the chairman email.** When a worker `/signal`s a question it
   couldn't self-resolve: ANSWER it yourself if you can (the reply routes back to the worker). ONLY for a
   genuinely-human question, escalate with `scripts/coordinator-escalate-question.mjs` — it writes a
   durable `feedback` row (`category='operator_question'`, `status='new'`). Post-cutover (2026-06-10) the
   rendering email is the **Adam exec-summary** (daily GHA), not the retired coordinator email — for
   anything that can't wait for the daily send, surface it directly in the operator conversation (add
   `COORD_ESCALATE_URGENT=1` only for a truly time-sensitive one). The script dedups identical still-open questions. When the operator answers:
   route the answer back to the worker's inbox AND mark the row `status='resolved'` so it drops off the
   next email. Workers NEVER block waiting — they signal, then proceed on a best-guess default or a
   different SD (worker rule 2).
7. **Auto-teardown.** When the campaign is genuinely done — no claimable AND no sourceable work AND zero
   workers, sustained — tear down: `CronDelete` ALL loops FIRST, then `clearActiveCoordinator` + a final
   email. Don't idle cron loops indefinitely past a finished campaign. An explicit operator
   `/coordinator start` is NOT idle — arm the loops and trust work is coming.
   (SD-APEXNICHE-AI-LEO-FIX-FLAG-GOVERNANCE-CLEANUP-001, escalated from QF-20260712-716: the
   governance-flag-gated consistent-teardown helper was removed — disabled-aging flag, never
   turned on in practice; the crons-first/pointer-second ordering above is still the intended contract,
   just not yet wired to a helper. See `.claude/commands/coordinator.md` "For stop".)
8. **The coordinator cannot start a worker's execution** — only `/loop` or a human paste in the worker
   window can. To restore a thinned fleet, hand the operator the wake-up prompt.

## Coordinator standing responsibilities (SRE charter)

> **CANONICAL — generated, do not hand-edit here.** The coordinator role + SRE charter — the six standing duties, conveyor-belt loading, the quiet-tick protocol, the maximize-utilization directive, the belt-low→ask-Adam default, and the deploy-verification practice — is the single source of truth in the governed `leo_protocol_sections` row `section_type=coordinator_role_contract`, published to **CLAUDE_COORDINATOR.md** (+ `CLAUDE_COORDINATOR_DIGEST.md`) by `node scripts/generate-claude-md-from-db.js`. **Load CLAUDE_COORDINATOR.md for the charter; to change it, edit the DB section and regenerate — do not re-add the charter prose here** (de-duplicated by SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-001).

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

**RESOLVED (2026-07-04, SD-LEO-INFRA-FIX-WINDOWS-SESSION-001):** all three deferred fix ideas shipped. `rediscoverParentPid()` in `scripts/session-tick.cjs` no longer relies on the structurally-inert Windows ancestry walk (it never worked on Windows — no `/proc`, and the process-tree scan found no matching process) — it now re-queries the session's own DB row for a live PID. The steady-state PATCH's live-status filter was widened so it survives an idle stretch instead of narrowly excluding it (the original bug this whole doc's diagnosis recipe exists to catch). A first-tick merge-duplicates POST hard-failure path is now guarded against resurrecting an already-released row. Stage-flagged behind `LEO_DORMANCY_WATCHDOG_ENABLED` (the other flag, `LEO_MASKED_S...`, is deferred separately). See `tests/unit/session-tick-*.test.mjs` for the spawn-and-observe regression coverage.

## Recovery / where each behavior is enforced

| Behavior | Enforced in (repo) |
|---|---|
| Coordinator skill, subcommands, wake-up prompt | `.claude/commands/coordinator.md` |
| Worker: no AskUserQuestion, AUTO-PROCEED, revival diagnostic | `.claude/commands/coordinator.md` (wake-up prompt, Step 4 + REGISTER), `templates/session-prologue.md` |
| Chairman email (post-cutover 2026-06-10: Adam exec-summary, NOT the retired coordinator email) | `.github/workflows/adam-exec-email-cron.yml` → `scripts/adam-exec-summary.mjs` |
| Recurring 3-source audit | `scripts/coordinator-audit.mjs` |
| Capacity forecasting + predictive belt refill (duty 5) | `scripts/coordinator-capacity-forecast.mjs` (armed cron `3,13,…`, `--dispatch`) |
| Backlog prioritization + dispatch ordering (duty 6) | `scripts/coordinator-backlog-rank.mjs` (armed cron `9,24,39,54 * * * *`, ~15min) → `metadata.dispatch_rank`, honored by `scripts/worker-checkin.cjs` `sortByDispatchRank`. Event-driven refresh (SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C) also fires on SD creation, `needs_coordinator_review` clearance (`lib/coordinator/clear-coordinator-review.js` / `scripts/clear-coordinator-review.mjs`), and predecessor SD completion, via `lib/coordinator/trigger-rank-pass.mjs` — so a freshly-claimable SD is ranked within seconds instead of waiting for the next cron tick |
| Question→operator escalation (durable row; rendered by the Adam exec email / operator conversation) | `scripts/coordinator-escalate-question.mjs` (writes `operator_question` row) |
| Teardown cron inventory + matcher | `lib/coordinator/teardown-coordinator.cjs` (`listCoordinatorCrons`, `selectCoordinatorCronJobs`) |

## Comms check (radio check) — verify the two-way link at startup

Before relying on the worker<->coordinator channel (especially overnight / unattended), the coordinator runs a NASA-style **radio check** to PROVE both legs of the link rather than assume them:
- **worker → coordinator** is proven when the worker's startup `/signal feedback "online"` is received.
- **coordinator → worker** is proven by `scripts/coordinator-comms-check.mjs`: it sends a `comms_check` COACHING ping; the worker reads its inbox and replies `/signal feedback "comms-check ack — read you"`. **No ack within the timeout ⇒ the worker loop is NOT polling its inbox (a silent break)** — fix its prompt.

Run it at `/coordinator start` (after identity assignment) and any time you need to TRUST signal delivery. **Worker rule:** poll your coordination inbox **as a `/loop` step each iteration** (`/checkin`, or `node scripts/fleet-dashboard.cjs inbox` / worker-inbox) — never a hand-rolled bounded Bash poll (overshoots the 120000ms Bash timeout → exit-143) — ACK a comms check in one line, then continue and `ScheduleWakeup` so the next iteration re-fires.

**Role canaries (Solomon leg — SD-LEO-INFRA-SEND-TIME-TARGET-001):** a canary/radio-check directed at **Solomon** must ride `kind=comms_check` — NEVER a default `adam_advisory` (Solomon's inbox never auto-drains that kind; the 2026-07-17 good-morning canary orphaned exactly this way). `solomon-advisory.cjs inbox` surfaces Solomon-directed `comms_check` rows first-class with the ack instruction. More generally, every send path now emits a `[target-drain]` WARN when the outgoing `payload.kind` is not in the target role's drain set (`DRAIN_SETS` in `lib/fleet/worker-status.cjs`) — warn-only; treat a warn as "this delivery will orphan, pick a kind the role drains."

---
### Related documentation
- [The LEO Harness](./README.md) — canonical overview tying the roles, channels, loop model, and failure modes together.
