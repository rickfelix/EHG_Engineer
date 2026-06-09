# The LEO Harness

> **Status:** Canonical overview (authored by the Chairman 2026-06-09; finalized + committed via `QF-20260609-874`). The authoritative role specs remain `docs/protocol/fleet-coordinator-and-worker-behavior.md`, `.claude/commands/coordinator.md`, `.claude/commands/adam.md` / `CLAUDE_ADAM.md`, and `docs/protocol/fleet-worker-loop-directive.md`; this README is the overview/index that ties them together.

## What the LEO Harness is

The **LEO Harness** is the whole multi-agent system that runs EHG_Engineer autonomously: one **Coordinator**, one **Adam** advisor, ~6 **Workers**, and the **database as a durable session-log**, plus the loop / check-in / signal / claim / sweep / gate machinery that wraps them.

The **LEO Protocol** is the *per-worker workflow* — **LEAD → PLAN → EXEC** with gates and phase handoffs — that a single worker runs *inside* the harness.

> "Harness" is used deliberately, in the sense of Anthropic's *Effective harnesses for long-running agents*: the durable external scaffolding (state + verification + recovery + scheduling) that wraps a frontier model so long-horizon, multi-context-window work succeeds. The model is the engine; the harness is what keeps it on the road across days and context resets.

**Protocol vs Harness — the boundary:**

| | LEO Protocol | LEO Harness |
|---|---|---|
| Scope | One worker, one SD | The whole fleet |
| Concern | *How* an SD is built (LEAD→PLAN→EXEC, gates, handoffs) | *That* work flows: sourcing, routing, liveness, recovery, escalation, verification, safety |
| Artifacts | `strategic_directives_v2`, `product_requirements_v2`, `sd_phase_handoffs`, `sub_agent_execution_results` | `claude_sessions`, `session_coordination`, `feedback`, `quick_fixes`, the cron loops, the hooks |

## The operating model

```
            CHAIRMAN (human, solo)
              │  intent · ideation · the rare ❓decision
              ▼
       ┌─────ADAM─────┐        exec-summary email (NEEDS-YOU ❓)
       │ advisor /    │◄──────────────────────────────────────┐
       │ analyst      │   advisory lane (INFO rows, non-friction)│
       └──────┬───────┘   PROPOSES — never executes             │
              │                                                  │
              ▼                                                  │
         COORDINATOR ── SRE/router: sources work, dispatches, ───┘
              │           sweeps, revives, escalates (30-min email)
              │  WORK_ASSIGNMENT rows ▼     ▲ /signal · roll-call rows
      ┌───────┴────────────────────────────────────────┐
      ▼        ▼        ▼        ▼        ▼        ▼
    Alpha    Bravo   Charlie   Delta    Echo   Foxtrot   (~6 workers)
   each: claim ONE SD → LEAD→PLAN→EXEC → ship → /checkin for the next
```

**No agent calls another directly.** Every interaction is a row in the database — the only state that survives a session dying and the only state every agent and every gate can query.

## Roles

### Worker (the unit of execution)
A long-lived Claude Code `/loop` session that pulls and drives **exactly one** Strategic Directive (or quick-fix) end-to-end through LEAD→PLAN→EXEC→ship, then checks in for the next. It is the **worker-PULL** counterpart to the coordinator-PUSH model: the coordinator never fires a worker's next turn, so each worker re-arms itself with `ScheduleWakeup` every turn and pulls its own work via `/checkin`.
- **Gets work** via `node scripts/worker-checkin.cjs` — a tiered ladder: resume current claim → coordinator `WORK_ASSIGNMENT` → stranded-final recovery → baselined queue → un-baselined draft → quick-fix → idle.
- **Claims atomically** through the `claim_sd` RPC (one claim at a time; live-foreign-holder rejection; stale-takeover at ≥900s heartbeat age).
- **Stays collision-free** via per-SD claims + per-session **git worktrees**.
- **Never pauses for a human** while autonomous (`AskUserQuestion` would freeze the loop forever) — it routes friction up via `/signal`.
- Key files: `scripts/worker-checkin.cjs`, `.claude/commands/checkin.md`, `scripts/park-worker.cjs`, `scripts/hooks/concurrent-session-worktree.cjs`, `docs/protocol/fleet-worker-loop-directive.md`.

### Coordinator (the manager / SRE)
A dedicated session (started via `/coordinator start`) that **manages the fleet but never builds SDs itself**. It runs hands-free on **eight cron loops** and has four SRE-style duties: resource-pool management, liveness supervision, flow + silent-failure detection, and dependency watching. Its prime KPI: **an idle worker while sourceable work exists is a failure.**
- **Sources** a surplus "conveyor belt" of claimable work (mines harness backlog / feedback / retro follow-ups into draft SDs — proactively, because workers can't create SDs).
- **Dispatches** conflict-free work to live workers (full session UUID; never an orchestrator parent).
- **Sweeps** dead claims/worktrees every 5 min; **revives** dead workers (requests a spawn — it can't itself start a worker); **escalates** genuine human questions to the chairman via the 30-min executive email.
- Key files: `.claude/commands/coordinator.md`, `scripts/coordinator-audit.mjs`, `scripts/coordinator-startup-check.mjs`, `scripts/stale-session-sweep.cjs`, `lib/coordinator/dispatch.cjs` (fail-closed), `lib/coordinator/resolve.cjs`, `scripts/coordinator-email-summary.mjs`.

### Adam (the chairman's advisor)
A first-class, non-fleet session attached to the Chairman. Adam **diagnoses** (RCA, audits, whole-board pattern-spotting) and **sources** (grooms feedback/backlog into draft SDs), then hands findings to the coordinator. The hard rule: **Adam PROPOSES, the coordinator DECIDES.** Adam executes directly *only* a Chairman-directed task. It is `metadata.role='adam'` + `non_fleet=true` (excluded from worker counts/ETA/revival), is survivor-agnostic (the coordinator runs fully without it), and ideally grows *less* necessary as the coordinator matures.
- Key files: `.claude/commands/adam.md`, `CLAUDE_ADAM.md`, `scripts/adam-advisory.cjs` (the non-friction advisory lane), `scripts/adam-exec-summary.mjs`, `lib/coordinator/adam-action-ack.cjs`.

> **Note (honesty):** Anthropic's harness research validates the **coordinator→worker** split (their *initializer → coder* pattern) but frames single-vs-multi-agent specialization as an **open question**. Adam-as-advisor is *our own* bet, justified by our evidence — not by lab guidance.

## Durable state: the database as session-log
The model is treated as disposable working memory; durability lives in the DB. A parked or crashed worker reconstructs everything from durable rows, not from an in-context transcript.

| Table | Holds |
|---|---|
| `strategic_directives_v2` | SD state, phase, claim fields, dependencies |
| `product_requirements_v2` / `sd_phase_handoffs` | PRDs and gate-validated phase transitions |
| `sub_agent_execution_results` | Formal sub-agent evidence (gates query this) |
| `claude_sessions` | Liveness: `heartbeat_at`, `process_alive_at`, `loop_state`, `expected_silence_until`, `sd_key`, `metadata` (role/callsign/coordinator) |
| `session_coordination` | The message bus (see below) |
| `feedback` / `quick_fixes` | Harness backlog, escalations, QFs |

## The loop model (verified against Claude Code docs)
- Workers run **self-paced `/loop`**: each iteration picks a delay of **1 min–1 hr**, parks (`loop_state=awaiting_tick`), and can self-terminate by **not re-arming** `ScheduleWakeup`.
- **Liveness is judged by `loop_state`, NOT heartbeat age** — a parked worker has an aging heartbeat but is alive (`awaiting_tick`); `exited` = dead; `active` = mid-iteration.
- **`/loop` is ephemeral plumbing:** session-scoped, fires only while the terminal is open and Claude is idle, and **hard-expires 7 days after creation** (one final fire, then self-deletes). A fleet running for days must re-arm loops before that boundary, or move durable scheduling to Routines / Desktop tasks / GitHub Actions.
- **No catch-up for missed fires** (coalesced to one) — so emit a heartbeat during long sub-agent recon, and don't treat tick count as liveness.

## Communication & escalation
One table, `session_coordination`, carries everything; the row's purpose is discriminated by JSONB `payload` keys (no new enum values needed).
- **Worker → coordinator:** `/signal <type>` (types: `stuck | need-sweep | prd-ambiguous | gate-bug | spec-conflict | harness-bug | feedback | other`) sets `payload.signal_type`; roll-call availability sets `payload.kind='roll_call'`.
- **Coordinator → worker:** `WORK_ASSIGNMENT`, `COACHING` (comms-check), `SET_IDENTITY`, `SPAWN_REQUEST`.
- **Signal aggregation:** `lib/coordinator/signal-router.cjs` promotes a fingerprinted signal to a `harness_backlog` feedback row at ≥3 distinct callsigns OR any critical signal (route-not-promote below that).
- **Coordinator → chairman:** genuine human questions become `feedback` rows (`category='operator_question'`) surfaced as a ❓N flag in the 30-min executive email. Non-critical questions **auto-proceed** on the coordinator's recommended default after a timeout (when enabled); **critical** questions always hard-wait.
- **Adam ↔ coordinator:** advisories ride a deliberately non-friction lane (`payload.kind='adam_advisory'`, no `signal_type`).

## Verification: the oracle, and the Ralph loop
The harness already embodies the 2026 best practice that **the agent that does the work must not be the agent that decides it's done**:
- The **gate pipeline + `sub_agent_execution_results`** are the external verification oracle a worker must satisfy before a phase advances ("manual DB checks are not evidence; the row is").
- The **post-completion-tail-enforcement Stop hook** is the harness's **Ralph loop** — it re-injects continuation work (`/document → /heal → /learn`) when a worker claims done, rather than letting it stop on a self-declared completion. The five Canonical Pause Points (CLAUDE.md) bound when stopping is actually legitimate.

## Known failure modes & their guards
| Failure mode | Guard |
|---|---|
| Worker ends a turn without re-arming → silent attrition | `stop-loop-wakeup-reminder` Stop hook (loop_state-keyed) |
| Heartbeat looks fresh but loop is stalled | judge by `loop_state`; `STALLED_LOOP` detector (shipped — SD-LEO-INFRA-LOOP-LIVENESS-DETECTORS-001) |
| `/loop` 7-day silent expiry | `LOOP_EXPIRY_WARNING` detector (shipped — SD-LEO-INFRA-LOOP-LIVENESS-DETECTORS-001) + re-arm discipline |
| Duplicate / lost work on collision | `claim_sd` arbitration + in-flight/foreign-claim guards + worktrees |
| Parked SD treated as workable (resume-loop) | (planned) claim-lifecycle hardening |
| False-RED gate burns cycles | bypass with audit; gate false-positive leaderboard (shipped — SD-LEO-INFRA-GATE-FALSE-POSITIVE-001) |
| Secret leak via `--no-verify` | (planned) PreToolUse hook-bypass guard |

## How current loop-engineering research maps
The fleet is a near-exact instance of Anthropic's long-running-agent harness pattern: **initializer→coder ≈ coordinator→workers**; their requirements-JSON + progress-file + git ≈ our DB-as-session-log (stronger). Validated here: externalize state to the DB, give the agent a real verification oracle, keep the loop controller external to the agent, log failed approaches so the next worker doesn't repeat them, and keep autonomous loops on reversible/repo-contained surfaces. (Cost circuit-breakers — the field's top 2026 anxiety — are intentionally *out of scope* for this fleet per the Chairman.)

## Glossary
- **Callsign** — NATO name (Alpha…Hotel) identifying a worker session.
- **Conveyor belt** — the coordinator's surplus of sourced, claimable work.
- **Parked** — a worker on `loop_state=awaiting_tick` waiting for its next `ScheduleWakeup`; alive, not dead.
- **Self-claim ladder** — the tiered work-pull order in `worker-checkin.cjs`.
- **Sweep** — `stale-session-sweep.cjs`, the 5-min reaper of dead claims/worktrees.

## Authoritative sources
- Coordinator: `.claude/commands/coordinator.md`, `docs/protocol/fleet-coordinator-and-worker-behavior.md`
- Adam: `.claude/commands/adam.md`, `CLAUDE_ADAM.md` (generated from `leo_protocol_sections` id=601)
- Worker loop: `docs/protocol/fleet-worker-loop-directive.md`, `.claude/commands/checkin.md`
- Signaling: `.claude/commands/signal.md`, `lib/coordinator/signal-router.cjs`
- Protocol root: `CLAUDE.md`, `CLAUDE_CORE/LEAD/PLAN/EXEC.md`

## Current improvement backlog (filed 2026-06-09)
SDs: `SD-LEO-INFRA-LOOP-LIVENESS-DETECTORS-001`, `SD-LEO-INFRA-GATE-FALSE-POSITIVE-001`, `SD-LEO-INFRA-CLAIM-LIFECYCLE-HARDENING-002`. Plus a batch of quick-fixes across continuity, state-durability, CI-noise, chairman-observability, comms, safety, the learning loop, and this documentation. See the `feedback`/`quick_fixes` queue and the coordinator's conveyor belt.
