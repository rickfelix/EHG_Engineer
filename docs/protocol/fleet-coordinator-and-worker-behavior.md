# Fleet Coordinator & Worker Behavior (durable protocol)

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
2. **Keep workers busy.** Continuously source claimable work; idle workers + available work is a problem
   to solve, not a reason to idle. The coordinator is EITHER productively delegating/sourcing OR torn
   down — never idling in between.
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

## Recurring self-improvement loop (fleet retro)

The fleet continuously improves how the coordinator and workers collaborate — like recurring performance reviews, not a one-time fix.
- **Trigger (worker):** at EVERY SD completion, the worker `/signal`s a one-line **FLEET-RETRO** — what worked / what was friction (coordinator, queue, claim, handoff, tooling) / one improvement idea. (Enforced in the wake-up prompt Step 5.)
- **Capture + synthesize (coordinator):** `scripts/coordinator-fleet-retro.mjs` (recurring cron) captures FLEET-RETRO signals into the durable `feedback` table (`category='fleet_retro'`) so they survive the coordination-message sweep and ACCUMULATE, then prints a synthesis.
- **Adjust (coordinator):** cluster the retros (what-worked / friction / suggestions) and ADJUST — update the wake-up prompt or coordinator behavior, file a harness SD for recurring friction, and surface a digest to the operator when a clear pattern emerges.
- Distinct from `/learn` (which retros the SD WORK → `issue_patterns` / `retrospectives`); this retros the FLEET PROCESS. The two are complementary.

## Known attrition root causes (live-confirmed 2026-06-06, from revival diagnostics)

Workers silently stop looping for these reasons. On revival a worker `/signal`s which one hit it.
1. **AskUserQuestion self-kill** — worker called `AskUserQuestion` (no human watching → `/loop` hangs). FIXED (worker rule 1). 1/3 diagnostics.
2. **SD-boundary `/compact` pause** — worker finished an SD with HIGH context; the Pre-SD-Start Context Check / `/leo-complete` Step 5 told it to emit `/compact` and pause, but the built-in `/compact` can ONLY be typed by the user (a worker cannot self-invoke it) → the worker waits indefinitely for an operator-typed `/compact`. **2/3 diagnostics — the bigger cause.** FIX: at the SD boundary the worker must AUTO-compact via the `/context-compact` SKILL (agents CAN invoke skills) and CONTINUE — or just continue (the harness auto-summarizes) — NEVER pause for a user-typed `/compact`. Worker-prompt Step 5 updated; the harness-side Pre-SD-Start Context Check / `/leo-complete` Step 5 still needs the same change (auto-compact-and-continue, not pause-for-user) — file as a harness SD.
3. **Claim-sweep reaps an in-flight worktree during an idle gap** — CONFIRMED 2026-06-06 (worker 6c3c6656). The sweep released the session via `STALE_CLEANUP/HEARTBEAT_TIMEOUT` during a no-heartbeat stretch and removed the worktree, leaving a **LOCKED empty husk** (a process-cwd handle) that blocks `rm`/rename for hours — this is the orphan-worktree residue the coordinator keeps failing to delete. **Recovery:** `git worktree add --force` into the husk succeeds even when delete is OS-locked (writes work though delete is blocked) → then `sd-start` resume. Fix shipped (`SD-LEO-INFRA-ENABLE-CLAIM-SWEEP-001`, `sweep_respect_inflight_agent` / `expected_silence_until`) but is NOT fully preventing idle-gap reaps → needs hardening (harness SD). **RED HERRING (do not chase):** the same worker also reported a "~4h clock skew → spurious HEARTBEAT_TIMEOUT"; the coordinator VERIFIED node UTC == system UTC (no skew) — the worker read Windows LOCAL time (EDT, UTC−4 ≈ 4h) as UTC. There is no real clock skew.
4. **Idle-gap stall — no `ScheduleWakeup` pacing the loop** — CONFIRMED 2026-06-06 (worker 6c3c6656). In autonomous `/loop`, the agent is only re-invoked by (a) a `ScheduleWakeup` tick it previously scheduled, or (b) a human message. If a worker reaches an idle/decision point (between SDs, after a `/model` switch, waiting on something) and ends its turn WITHOUT having scheduled a `ScheduleWakeup`, the loop simply stops firing — it sits quiet until the operator types something. 6c3c6656 went silent ~2.5h this way (*"operator stepped away after /model; NO ScheduleWakeup was pacing me"*), and the now-idle worktree was then reaped by the claim-sweep (cause #3) — so **#4 is frequently the TRIGGER and #3 the consequence.** FIX: a worker must call `ScheduleWakeup` at the END of EVERY iteration (short ~2-5 min when it has in-flight work to resume, ~20 min when the queue is empty) so the loop always re-fires — NOT only in the "no workable SD" branch. Wake-prompt Step 5 updated to mandate this.

### Heartbeat masks a stalled loop — "active" ≠ "building" (CONFIRMED 2026-06-06)

The 30-second `session-tick` timer (and the PostToolUse `heartbeat-hook`) keep `claude_sessions.heartbeat_at` fresh **independently of whether the `/loop` is iterating.** A worker stalled at a pause point (waiting for a user-typed `/compact`, blocked on `AskUserQuestion`, or just not auto-claiming the next SD) therefore still shows `heartbeat=0m, status=active` — it LOOKS alive but is doing no work, and the stale-session sweep never reaps it (fresh heartbeat = looks healthy). **Consequence:** the fleet-dashboard `ACTIVE WORKERS (N)` headline OVERCOUNTS — it counts heartbeat-alive sessions regardless of claim. **The honest "builder" count = sessions that are heartbeat-live AND hold an `sd_key` claim** (this is what `scripts/coordinator-email-summary.mjs` counts — so the 15-min email gauge is accurate; the dashboard headline is not). **Diagnosis recipe:** query `claude_sessions` for live sessions with NO `sd_key` while the queue has claimable SDs → those are stalled-at-boundary workers, not capacity. The fix is the same as cause #2 (auto-continue at the SD boundary) + re-paste the updated wake prompt into those windows so the loop resumes claiming.

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

Run it at `/coordinator start` (after identity assignment) and any time you need to TRUST signal delivery. **Worker rule:** poll your coordination inbox each loop iteration (`node scripts/fleet-dashboard.cjs inbox` / worker-inbox) and ACK a comms check in one line, then continue.
