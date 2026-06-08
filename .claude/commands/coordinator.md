<!-- reasoning_effort: medium -->

# /coordinator - Fleet Coordination Command

Coordinate parallel Claude Code sessions: monitor workers, resolve conflicts, run QA checks, and forecast completion.

## Arguments

Parse `$ARGUMENTS` to determine the subcommand:
- No args or `all` → Full dashboard (all sections)
- `start` → Initialize coordinator mode: run initial sweep + dashboard, then set up automated cron loops
- `workers` or `w` → Active workers and their progress
- `orchestrator` or `o` → Orchestrator children progress
- `available` or `a` → SDs available for claim
- `coordination` or `c` → Pending coordination messages
- `health` or `h` → Fleet health summary
- `qa` or `q` → QA checks (completed SD claims, duplicates, orphans)
- `forecast` or `f` → Burn rate, velocity, and ETA for orchestrator + full queue
- `predictions` or `p` → Predictive signals (capacity, unlock forecast, heartbeat aging)
- `sweep` or `s` → Run stale session sweep (release dead claims, resolve conflicts, QA fixes)
- `identity` or `id` → Assign colors and callsigns to active workers
- `revive [callsign]` → Request revival for a single callsign (e.g., `revive Bravo`)
- `revive-all` → Request revival for every callsign without an active session
- `team` or `t` → /execute team banner (active multi-session execution teams, Mockup A)
- `inbox` or `in` → Worker-signal inbox (FR-3a, signals from workers via /signal)
- `stop` → Clear active-coordinator pointer (DB metadata + .claude/active-coordinator.json)
- `help` → Show usage help

ARGUMENTS: $ARGUMENTS

---

## Coordinator standing responsibilities (SRE charter)

Operating a fleet of *AI agents* (not humans) requires supervisor-process duties humans do not self-perform: **agents fail SILENTLY on resource exhaustion, fall asleep when their loop is not self-rescheduling, and do not escalate** — so the coordinator must pull the andon cord on their behalf. These are the four standing SRE-style duties. Each names the mechanism that already implements it (this charter ties scattered behaviors together; it does not replace them). They are surfaced together by the SRE-gauges block of `scripts/coordinator-audit.mjs`.

1. **Resource-pool management.** Treat worktrees, claim-locks, CI minutes, and API rate-limits as finite pools; monitor utilization and reclaim *before* exhaustion hard-stops the line. *Why:* a saturated pool (e.g. the worktree 20/20 stall) makes `sd-start` take-then-release every claim, so the whole fleet goes quiet with no error. *Mechanism:* `lib/worktree-quota.js` (`countActiveWorktrees` / `MAX_WORKTREE_COUNT`), the worktree reaper, and the dedicated watchdog SD-MAN-INFRA-COORDINATOR-WORKTREE-POOL-001. *Gauge:* worktree pool utilization (N/20).
2. **Liveness supervision.** Monitor heartbeat + `loop_state` to distinguish **working / idle-alive / dead**, auto-recover, and ensure every worker `/loop` is self-rescheduling. *Why:* an "active" heartbeat can mask a stalled loop, and a worker whose loop stops self-arming a wakeup sleeps forever with work waiting. *Mechanism:* `stale-session-sweep.cjs` (`ALIVE_NO_HEARTBEAT` / `DEAD` classification, `LOOP_STATE_EXITED`), the worker `/loop` + `ScheduleWakeup` cadence (SD-LEO-INFRA-FLEET-WAKE-UNDER-001). *Gauge:* loop_state distribution across live workers.
3. **Flow + silent-failure detection.** Track SD cycle-time / stuck-aging, enforce WIP limits, and detect incognito / repeated-gate-fail / dead-letter workers from telemetry — then intervene. *Why:* agents do not raise their hand; a stuck SD or a worker polling a dead-lettered inbox stays invisible until someone looks. *Mechanism:* `stale-session-sweep.cjs` (`WIP_GUARD`, `WORKER_STRUGGLING` for `handoff_fail_count>3`, dead-letter `CLAIM_RELEASED`). *Gauges:* stuck-SD aging + idle-with-work workers.
4. **Dependency watching.** Continuously track the SD dependency graph + critical path — which SDs are BLOCKED (deps unmet), which are unblocked-and-claimable, the longest chain, and parent/orchestrator child-completion gating. Detect anomalies (e.g. a child shown BLOCKED while its dependency is already COMPLETED — a dep-resolver staleness / flow impediment) and intervene. *Mechanism:* `strategic_directives_v2.dependencies` + the next-candidates view. *Gauge:* dependency / critical-path (blocked-count / ready-count / stale-blocked).

**Deploy-verification practice — SYNC → RESTART → CANARY-VERIFY.** Merged + git-synced ≠ RUNNING. On ANY worker-code refresh the coordinator must (1) **sync** the checkout to `origin/main`, (2) **restart** the long-lived worker process (a synced file is not loaded until the process restarts — verify the process StartTime is *after* the sync), and (3) **canary-verify** at runtime (have a worker re-run one stage and confirm the new behavior is live) BEFORE declaring a deploy-gap closed. Never declare a deploy closed on git state alone. *(credit: Adam canary loop, 2026-06-07.)*

**Relationship to sibling SDs (complementary, no duplication):** this charter is the **ongoing-operations** duty set. The one-time **startup ritual** is SD-LEO-INFRA-COORDINATOR-STARTUP-ONBOARDING-001; **self-sustaining loop-wake** is SD-LEO-INFRA-FLEET-WAKE-UNDER-001; the **worktree pool watchdog mechanics** live in SD-MAN-INFRA-COORDINATOR-WORKTREE-POOL-001 (this charter only references it).

**Adam — your standing assistant (augmentation lane).** When an Adam session is live and the Chairman is not actively using it, Adam is the coordinator's **official standing assistant** (per the Adam Role Contract / CLAUDE_ADAM.md). Delegate the augmentation lane to him: pre-merge / full-row **canary verification** against intent, **harness-backlog grooming/triage** into a sourceable shortlist, **cross-program / cross-session pattern-spotting** (dedup + same-write-surface conflict catches you can't get from the weeds), continuity bridging, and **authoring the DRAFT SDs you delegate** (you are DOC-001-barred from asking a *worker* to create SDs — Adam is the right lane). Resolve the live Adam via `claude_sessions.metadata.role='adam'`; reach him on the advisory lane. **Reviewer / augmentation, NOT a safety-net (hard line):** Adam raises the bar, but you stay **100% accountable** for every dispatch, assignment, and KPI, and you MUST run **fully without Adam** — survivor-agnostic, as if he vanishes tomorrow. A healthy Adam grows *less* necessary as you mature (his catches trend toward zero). He never claims/dispatches/owns fleet work — assistant = augmentation, not authority. *(Operator-canonical 2026-06-07: "Adam is your assistant when not being used by the human.")*

---

## Instructions for Claude

### Step 1: Parse Arguments

Map the argument to the appropriate action:
- `start` → initialize coordinator (sweep + dashboard + cron setup)
- `workers`, `w` → dashboard workers section
- `orchestrator`, `o` → dashboard orchestrator section
- `available`, `a` → dashboard available section
- `coordination`, `c` → dashboard coordination section
- `health`, `h` → dashboard health section
- `qa`, `q` → dashboard qa section
- `forecast`, `f` → dashboard forecast section
- `predictions`, `p` → dashboard predictions section
- `sweep`, `s` → run sweep script
- `identity`, `id` → assign fleet identities
- `revive <callsign>` → run coordinator-revive.cjs with the callsign arg
- `revive-all` → run coordinator-revive.cjs with `all`
- `team`, `t` → dashboard team section (/execute Mockup A banner — Phase 2)
- `inbox`, `in` → dashboard inbox section (worker signals)
- `stop` → clear active-coordinator pointer
- `all`, no args → full dashboard
- `help` → show help

### Step 2: Execute

#### For dashboard sections (workers, orchestrator, available, coordination, health, qa, forecast, team, all):

```bash
node scripts/fleet-dashboard.cjs <section>
```

Where `<section>` is the full section name (e.g., `workers`, `orchestrator`, `forecast`, `team`).

The `team` section renders the /execute multi-session team banner (Mockup A from VISION-EXECUTE-COMMAND-L2-001). It shows each active worker's callsign, current SD, phase, progress bar, and heartbeat. When no `execute_teams` rows have status `active` or `stopping`, the section prints `(no active teams)`.

Display the output directly to the user.

**IMPORTANT — Assessment Rules:**

**Session identity and CLAUDE_SESSION_ID (added 2026-04-06, updated 2026-04-08):**
- Each Claude Code conversation has a unique `CLAUDE_SESSION_ID` (UUID) set by the `capture-session-id.cjs` SessionStart hook.
- The fail-closed claim gate (`lib/claim-validity-gate.js`) uses `assertValidClaim()` to verify 3 conditions: (1) deterministic identity via CLAUDE_SESSION_ID, (2) claim ownership matches `claiming_session_id` on the SD, (3) worktree isolation — cwd must be inside the SD's registered `worktree_path`.
- **Session stability (2026-04-08):** `generateSessionId()` now uses the birth certificate UUID as `session_id` when `getTerminalId()` returns a UUID. This means workers maintain the **same session_id across all script invocations** within a conversation. Previously, each invocation could generate a new session_id, causing false stale detection and claim loss.
- **PID liveness skip:** `findExistingSession()` now skips PID liveness checks for UUID-based sessions. This prevents valid sessions from being skipped when child processes have ephemeral PIDs.
- **UUID caching:** `getTerminalId()` caches the resolved UUID in `process.env.CLAUDE_SESSION_ID`, propagating identity to child processes without re-walking marker files.
- **NPX exclusion:** `findClaudeCodePid()` excludes `npx`, `npx.exe`, `npx.cmd` to prevent misidentifying intermediary launchers as Claude Code.
- **ClaimIdentityError patterns**: When the dashboard shows a worker blocked, check for these error reasons:
  - `no_deterministic_identity` — CLAUDE_SESSION_ID env var not set. Worker needs to restart CC so the SessionStart hook fires.
  - `foreign_claim` — SD claimed by a different session. Check if owning session is still alive or stale.
  - `wrong_worktree` — Worker's cwd doesn't match the SD's registered worktree path. Likely the worktree was recreated.
  - `ambiguous` — Multiple sessions share terminal_id without unique CLAUDE_SESSION_IDs. (Should be rare after 2026-04-08 fix.)
- **Terminal_id collisions**: Two CC Desktop windows on the same machine share SSE port 25565, producing identical terminal_ids. The stale-session-sweep's Layer 1 collision detection now uses `claude_session_id` from marker files (`pid-*.json`) to disambiguate and split them into separate DB sessions.
- **Terminal churn diagnostic:** If multiple workers attempt the same SD and all stall at ~5-10m with different terminal IDs each time, suspect session identity instability (not the SD itself). Check if the session identity fix is deployed — prior to 2026-04-08, this was a known failure mode.
- **All script invocations** (sd-start, handoff, etc.) must prefix with `CLAUDE_SESSION_ID=<uuid>` inline env var.

**Heartbeat reliability (updated 2026-03-14):**
The `heartbeat-hook.cjs` (PostToolUse) now updates heartbeats on every tool call (throttled to 30s). This makes heartbeat data significantly more reliable than before. A session that hasn't heartbeated in 2+ minutes is likely genuinely between operations, not "mid-operation with stale heartbeat."

**Determining active worker count:**
- Count all sessions that heartbeated within the last **5 minutes** as "likely active" — the PostToolUse hook ensures frequent updates during active work.
- Sessions that haven't heartbeated in **5-10 minutes** are likely idle or between context loads — not actively processing.
- Sessions that haven't heartbeated in **10+ minutes** are likely dead or exited — flag for release.
- **Ghost filter**: A session must have **ever claimed an SD** (currently or previously) to count as a real worker. Sessions that appear idle with no history of SD claims are likely ghosts (e.g., coordinator sessions, stale terminals, automated processes).
- Sessions labeled "idle" with a heartbeat within 5 minutes **AND a history of SD claims** are alive but between tasks — count them as available capacity.
- The coordinator session itself (this session) is NOT a worker — exclude it from worker counts.
- **Derived worker count** = sessions with heartbeat < 5 min that have claimed an SD (currently or historically), minus the coordinator session. Use this for ETA calculations.

**Enriched heartbeat signals (when available):**
The dashboard may show additional columns from the heartbeat intelligence system:
- **Phase** (LEAD/PLAN/EXEC): Use for phase-aware ETA refinement instead of flat SD medians
- **Fails** (handoff failure count): Flag WORKER_STRUGGLING when fails > 3. Suggest /rca at fails > 5.
- **WIP** (uncommitted changes): If a stale session has WIP=yes, **do NOT recommend release** — flag as "stale with uncommitted work, needs SAVE_WARNING"
- **Branch**: Cross-check for worktree conflicts. Two workers on the same branch = WORKTREE_CONFLICT. Exception: QF-type SDs on main branch are expected.
- **LoopState** (`claude_sessions.loop_state`): `awaiting_tick` means the worker is in a /loop parked on ScheduleWakeup — do not dispatch new work; it will resume autonomously. `active` = mid-iteration; `exited` = loop ended (safe to dispatch); `--` = no /loop state recorded.

When these columns show `-` (not yet populated), fall back to heartbeat-age-only assessment.

**Worktree lock contention (added 2026-04-06, PRs #2795/#2796):**
- `sd-start.js` now **hard-fails** (`process.exit(1)`) when worktree creation fails, instead of silently falling back to main (which caused data loss from wrong-branch commits + `reset --hard`).
- Lock primitives in `lib/worktree-guards.js` use atomic `openSync('wx')` with PID-based staleness detection (`process.kill(pid, 0)`).
- **LOCK_CONTENTION pattern**: When a worker reports "Worktree lock held by session X (PID Y)", this is **not a bug** — it means another session is actively creating that worktree. The correct response is to route the worker to a different SD, not retry or investigate.
- **Stale lock auto-steal**: If the lock-holding PID is dead (`ESRCH`), the next claimant automatically steals the lock. Locks older than 1 hour with unverifiable PID are also treated as stale. Manual intervention is rarely needed.
- **Orphaned `.lock` files**: During sweep, if `.worktrees/<SD-KEY>.lock` files exist with dead PIDs, they can be safely removed — but the lock system handles this automatically on next claim attempt.
- **Never work around hard-fail**: If `sd-start` exits with worktree failure, do NOT advise workers to run without worktree isolation. The hard-fail is intentional — working on main without isolation caused the original data loss incident.

**Status language:**
- **"Stale" now more likely means genuinely inactive** — the PostToolUse hook ensures active sessions heartbeat every 30s.
- A session that heartbeated 5+ minutes ago with no enriched signals is likely between tasks or exiting.
- **Use direct language**: "worker idle" or "worker likely exited" instead of hedging with "may be mid-operation."
- **Only hedge** when enriched signals show active work (WIP=yes, Phase=EXEC, recent Fails increment).

#### For `start`:

Initialize coordinator mode. This runs an initial sweep and dashboard, then sets up automated cron loops so the coordinator runs hands-free.

**Step 0: Broadcast coordinator identity (FR-1)**
```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { setActiveCoordinator } = require('./lib/coordinator/resolve.cjs');
(async () => {
  const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  await setActiveCoordinator(sb, process.env.CLAUDE_SESSION_ID);
  console.log('✓ Coordinator identity broadcast: session_id=' + process.env.CLAUDE_SESSION_ID);
})();
"
```
This writes `.claude/active-coordinator.json` and sets `claude_sessions.metadata.is_coordinator=true` so workers running `/signal` can resolve this session as the target. Also drains any `target_session=broadcast-coordinator` rows from the last 24h and re-targets them to this session_id (queryable via `/coordinator inbox`).

**Step 1: Run initial sweep to clean up fleet state**
```bash
node scripts/stale-session-sweep.cjs
```
Display the output and summarize actions taken.

**Step 2: Assign fleet identities (colors and callsigns)**
```bash
node scripts/assign-fleet-identities.cjs
```
This assigns each active worker a unique color and NATO callsign (Alpha, Bravo, Charlie...).
Workers receive a `SET_IDENTITY` coordination message and their statusline updates automatically.
Display the assignment table output.

**Step 3: Run full dashboard to show current fleet status**
```bash
node scripts/fleet-dashboard.cjs all
```
Display the output.

**Step 4: Coordinator onboarding check (surface role + verify the six-loop set)**
```bash
node scripts/coordinator-startup-check.mjs
```
This (a) surfaces the durable coordinator role context and prints a roles/responsibilities summary (MANAGER-not-IC, keep-workers-busy=KPI, recurring 3-source audit, teardown discipline), and (b) emits the canonical set of **six** standard cron loops, each with a ready CronCreate spec. It is fail-open (warns, exits 0). `CronList`/`CronCreate` are HARNESS tools (not Node-callable), so the helper EMITS the spec — YOU compare it against `CronList` and arm only the loops not already present. To get an explicit armed|MISSING verdict, re-run with the prompts already in CronList: `node scripts/coordinator-startup-check.mjs --armed "<prompt1>,<prompt2>,…"`.

**Step 5: Set up automated cron loops using CronCreate**

Arm all **six** standard loops (idempotent — skip any already in `CronList`):
1. **Sweep every 5 minutes**: `cron: "*/5 * * * *"`, `prompt: "node scripts/stale-session-sweep.cjs"`, `recurring: true`
2. **Dashboard every 5 minutes (offset by 2 min)**: `cron: "2,7,12,17,22,27,32,37,42,47,52,57 * * * *"`, `prompt: "node scripts/fleet-dashboard.cjs all"`, `recurring: true`
3. **Identity refresh every 5 minutes (offset by 4 min)**: `cron: "4,9,14,19,24,29,34,39,44,49,54,59 * * * *"`, `prompt: "node scripts/assign-fleet-identities.cjs"`, `recurring: true`
4. **Inbox every 2 minutes**: `cron: "*/2 * * * *"`, `prompt: "node scripts/fleet-dashboard.cjs inbox"`, `recurring: true` — surfaces unread worker `/signal` traffic (also re-asserts the coordinator pointer).
5. **Coordinator 3-source audit every 15 minutes**: `cron: "*/15 * * * *"`, `prompt: "node scripts/coordinator-audit.mjs"`, `recurring: true` — SD queue / harness backlog / inbox, with the source-vs-wake decision.
6. **Executive email summary every 30 minutes (default-on)**: `cron: "*/30 * * * *"`, `prompt: "node scripts/coordinator-email-summary.mjs"`, `recurring: true` — operator is usually away; this is the fleet-health gauge + question escalation.

The identity refresh loop detects new workers that joined since the last assignment and gives them a color/callsign. Existing assignments are preserved (the script reads current metadata and only assigns to workers without an identity).

**Step 6: Confirm setup**

Display:
```
Coordinator initialized (role context surfaced; six standard loops armed).
  Sweep loop: every 5 minutes (auto-releases dead claims, resolves conflicts, QA fixes)
  Dashboard loop: every 5 minutes (offset 2min from sweep)
  Identity loop: every 5 minutes (offset 4min — assigns colors/callsigns to new workers)
  Inbox loop: every 2 minutes (surfaces worker /signal traffic; re-asserts the coordinator pointer)
  Audit loop: every 15 minutes (3-source audit: SD queue / harness backlog / inbox)
  Executive email: every 30 minutes (default-on fleet-health gauge + question escalation)
  All loops auto-expire after 3 days or when this session exits.

  Fleet is now running on autopilot. You will see sweep and dashboard output automatically.
  Use /coordinator help to see all subcommands.
```

**IMPORTANT**: When running scripts from a non-main branch or worktree, prefix with `git show origin/main:scripts/<file> | node -` to ensure you're running the latest merged version. Only use `node scripts/<file>` directly when on main.

#### For `sweep` or `s`:

```bash
node scripts/stale-session-sweep.cjs
```

Display the output and summarize any actions taken (releases, conflict resolutions, QA fixes).

#### For `identity` or `id`:

```bash
node scripts/assign-fleet-identities.cjs
```

Assigns colors and NATO callsigns to all active workers. New workers without an identity get the next available color/callsign. Workers receive a `SET_IDENTITY` coordination message and their statusline updates automatically on the next inbox check.

Display the assignment table output.

#### For `inbox` or `in` (SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-3a):

```bash
node scripts/fleet-dashboard.cjs inbox
```

Renders unread worker signals targeting this coordinator session (signals sent via `/signal` or `node scripts/worker-signal.cjs`). The query filters on `payload->>signal_type IS NOT NULL` to avoid surfacing existing INFO traffic. Surfaced signals are marked `read_at` so they do not re-render on the next call.

If no active coordinator is detected (no `/coordinator start` yet), the section reports it and exits cleanly.

#### For `stop` (SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-1):

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { clearActiveCoordinator } = require('./lib/coordinator/resolve.cjs');
(async () => {
  const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  await clearActiveCoordinator(sb, process.env.CLAUDE_SESSION_ID);
  console.log('✓ Coordinator identity cleared.');
})();
"
```

Removes `.claude/active-coordinator.json` and clears `claude_sessions.metadata.is_coordinator` for this session. Subsequent worker `/signal` invocations will fall back to `target_session=broadcast-coordinator` until a new coordinator runs `/coordinator start`.

> ⚠️ **Self-reversing stop (legacy / flag-OFF behavior):** the command above clears the pointer but leaves the cron loops running. The **inbox loop re-asserts the pointer every ~2 min** (it calls `setActiveCoordinator`), so on the next tick the stop is silently undone. This is the known footgun behind "NEVER run /coordinator stop".

**Teardown safety — `COORD_TEARDOWN_SAFETY_V2` (default-OFF), SD-LEO-INFRA-COORDINATOR-CRON-TEARDOWN-001:**
When `COORD_TEARDOWN_SAFETY_V2=on`, perform a CONSISTENT teardown instead — crons FIRST, pointer SECOND:
1. Run **`CronList`** (harness tool) to get all active cron jobs + their ids.
2. Identify coordinator-owned jobs — any whose command contains `stale-session-sweep.cjs`, `fleet-dashboard.cjs` (covers both `all`/dashboard and `inbox`), or `assign-fleet-identities.cjs` (plus the email loop). Programmatic helper: `selectCoordinatorCronJobs(cronListJobs)` in `lib/coordinator/teardown-coordinator.cjs`.
3. **`CronDelete`** each of those job ids — ALL of them, BEFORE step 4 (deleting the inbox loop is what prevents the re-assert).
4. THEN clear the pointer (session-scoped + fail-open; refuses to clear a pointer this session does not own unless `force:true`):
   ```bash
   node -e "
   require('dotenv').config();
   const { createClient } = require('@supabase/supabase-js');
   const { clearCoordinatorPointer } = require('./lib/coordinator/teardown-coordinator.cjs');
   (async () => {
     const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
     const r = await clearCoordinatorPointer(sb, { sessionId: process.env.CLAUDE_SESSION_ID });
     console.log(JSON.stringify(r, null, 2));
   })();
   "
   ```
   With the flag unset/off this helper is a no-op and the legacy `clearActiveCoordinator` command above remains the path (byte-identical behavior).

#### For `revive [callsign]` or `revive-all` (SD-LEO-INFRA-COORDINATOR-WORKER-REVIVAL-001):

```bash
# Single-callsign revival
node scripts/coordinator-revive.cjs <callsign>      # e.g., 'Bravo'

# Batch revive every callsign without an active session
node scripts/coordinator-revive.cjs all
```

INSERTs a row into `worker_spawn_requests` (one pending per callsign — partial unique index enforces idempotency) and emits a `SPAWN_REQUEST` broadcast on `session_coordination`. An external spawn-execution layer (out of scope for this skill — see `docs/protocol/coordinator-worker-revival.md`) consumes the row and starts a fresh CC instance.

Behavior:
- Single revive of an already-pending callsign reports "already pending" gracefully (no error).
- `revive-all` queries `v_active_sessions` for callsigns without active sessions, batches inserts, and reports inserted/skipped/failed counts.
- The `revival` dashboard section (`/coordinator revival` or part of `/coordinator all`) surfaces pending requests with age + expires-in.

Display the script output directly to the user.

#### Worker request -> coordinator reply round-trip (SD-LEO-INFRA-COMPLETE-TWO-WAY-001, DEFAULT-OFF):

Completes the two-way channel: a worker can ask a question and block until the coordinator's correlated reply arrives (or a timeout), instead of fire-and-forget signalling. **Gated by `COORDINATOR_TWOWAY_V2=on`** (unset/`off` = no-op; the channel behaves exactly as before). No DB migration — correlation rides in `session_coordination.payload` (`message_type` stays `INFO`).

```bash
# Worker side: send a request and await the coordinator's reply (prints correlation_id)
node scripts/worker-signal.cjs request "<question>" [--timeout <ms>]

# Coordinator side: reply to a specific worker's request by correlation id
node scripts/coordinator-reply.cjs --to <worker_session_id> --correlation <id> "<reply body>"
```

Mechanics: the request row carries `payload.correlation_id` + `expects_reply` (no `signal_type`, so it is NOT scooped by the FR-3a signal inbox or signal-router). The reply carries `payload.kind='coordinator_reply'` + `reply_to=<correlation_id>` and targets the specific worker (never `broadcast-coordinator`). The worker's inbox hook leaves `coordinator_reply` rows unread (`shouldSkipCoordinatorReply`) so the worker's `awaitCoordinatorReply()` poll consumes them. Resolution itself becomes DB-canonical with deterministic single-coordinator election when the same flag is on (`lib/coordinator/resolve.cjs`).

#### For `help`:

Display:

```
/coordinator — Fleet Coordination Command

Subcommands:
  /coordinator              Full dashboard (default)
  /coordinator start        Initialize coordinator — sweep, dashboard, auto-cron loops
  /coordinator workers  (w) Active workers and their progress
  /coordinator orch     (o) Orchestrator children progress (A-K)
  /coordinator available(a) SDs available for claim
  /coordinator coord    (c) Pending coordination messages
  /coordinator health   (h) Fleet health summary
  /coordinator qa       (q) QA checks — completed SD claims, duplicates, orphans
  /coordinator forecast (f) Burn rate, velocity, ETA for orchestrator + full queue
  /coordinator predict  (p) Predictive signals — capacity, unlock forecast, aging
  /coordinator sweep    (s) Run stale session sweep — release dead, resolve conflicts
  /coordinator identity (id) Assign colors and callsigns to active workers
  /coordinator revive [callsign] Request revival for a callsign (worker_spawn_requests)
  /coordinator revive-all   Request revival for every callsign without an active session
  /coordinator help         Show this help

Getting Started:
  Run `/coordinator start` to initialize. This:
  1. Runs an initial sweep to clean fleet state
  2. Shows the full dashboard
  3. Sets up automated 5-min cron loops for sweep and dashboard
  The cron loops are session-scoped (auto-expire after 3 days or session exit).

Automated QA Fixes (run every sweep):
  - STUCK_100: SDs at 100%/pending_approval auto-completed
  - Churn prevention: stale claiming_session_id cleared on completed SDs
  - Dead message cleanup: coordination messages to dead sessions deleted
  - Bare shell enrichment: empty SD descriptions auto-populated from docs
  - Aging warnings: STALE_WARNING messages sent to aging workers
  - WORKTREE_CONFLICT: two workers on same branch flagged (QF on main excluded)
  - LOCK_CONTENTION: worker hard-failed on worktree lock — route to different SD, do not retry same SD
  - WORKER_STRUGGLING: handoff_fail_count > 3 flagged, /rca suggested at > 5
  - WIP_GUARD: stale sessions with uncommitted changes held, not released
  - Standard: dead claims released, conflicts resolved, orphans cleaned

Related Commands:
  /claim              Manage your own session's SD claim
  /claim list         See all active claims
  npm run sd:next     Show SD queue and pick next work
```

---

## Queue Cleared Celebration

**Trigger conditions** — BOTH must be true:
1. **Queue empty**: Zero SDs remaining (all strategic directives completed)
2. **All workers idle**: No active claims — every session shows idle or no SD claim

If the queue is empty but workers are still active (finishing their last SD), display instead:
```
Queue empty — waiting for N active worker(s) to finish before celebrating.
  Active: [list worker terminals and their SDs]
```
Continue running cron loops normally until workers go idle.

**When both conditions are met**, display this banner AFTER the dashboard output:

```
    ╔══════════════════════════════════════════════════════════════╗
    ║ ╔══════════════════════════════════════════════════════════╗ ║
    ║ ║   ____ ___  __  __ ____  _     _____ _____ _____       ║ ║
    ║ ║  / ___/ _ \|  \/  |  _ \| |   | ____|_   _| ____|     ║ ║
    ║ ║ | |  | | | | |\/| | |_) | |   |  _|   | | |  _|       ║ ║
    ║ ║ | |__| |_| | |  | |  __/| |___| |___  | | | |___      ║ ║
    ║ ║  \____\___/|_|  |_|_|   |_____|_____| |_| |_____|     ║ ║
    ║ ╚══════════════════════════════════════════════════════════╝ ║
    ║                                                              ║
    ║    SDs: NN/NN       Workers: N      Velocity: N.N/hr         ║
    ║    Duration: N.Nh                   Queue: EMPTY              ║
    ╚══════════════════════════════════════════════════════════════╝
```

Fill in the dynamic values from the dashboard output:
- **SDs**: total completed / total (e.g., `18/18`)
- **Workers**: number of sessions that participated
- **Velocity**: overall velocity from forecast
- **Duration**: total elapsed time

This banner signals the fleet has finished all work. Display it once per dashboard cycle where the queue is empty; do not repeat if already shown in the same coordinator session.

**After displaying the banner**, tear down the coordinator:

**Default / flag-OFF (legacy):**
1. Cancel the sweep and dashboard cron loops using `CronDelete`.
2. Confirm to the user:
   ```
   Coordinator shut down. Sweep and dashboard loops cancelled — no more work to monitor.
   ```

> ⚠️ The legacy path above is **asymmetric**: it cancels only sweep+dashboard (leaving identity/inbox/email orphaned) and never clears the coordinator pointer — so `getActiveCoordinatorId` still resolves a dead coordinator and the orphaned inbox loop re-asserts the pointer.

**`COORD_TEARDOWN_SAFETY_V2=on` (SD-LEO-INFRA-COORDINATOR-CRON-TEARDOWN-001) — consistent teardown:**
Use the SAME contract as `/coordinator stop` so both paths converge (crons FIRST, pointer SECOND):
1. `CronList` → identify ALL coordinator-owned jobs (`selectCoordinatorCronJobs` in `lib/coordinator/teardown-coordinator.cjs` — matches sweep/dashboard/identity/inbox; plus the email loop).
2. `CronDelete` every one of them (not just sweep+dashboard).
3. Clear the pointer via `clearCoordinatorPointer(sb, { sessionId: process.env.CLAUDE_SESSION_ID })` (session-scoped, fail-open) — see the `/coordinator stop` section for the exact snippet.
4. Confirm:
   ```
   Coordinator shut down. All coordinator cron loops cancelled and pointer cleared — fleet idle.
   ```

---

## ETA Display

When the dashboard shows SDs still remaining in the queue (not yet complete), display this ETA block AFTER the dashboard output.

### ETA Block Format

Render the estimated finish time as a **single code block** with the ASCII time, progress bar, and stats line together. This prevents line-wrapping and alignment issues across terminals.

**Example (5:08 PM with 0% progress):**
```
  ____              ___      ___
 | ___|      _     / _ \   ( _ )   ____  __  __
 |___ \     (_)   | | | |  / _ \  |  _ \|  \/  |
  ___) |     _    | |_| | | (_) | | |_) | |\/| |
 |____/     (_)    \___/   \___/  |  __/| |  | |
                                   |_|   |_|  |_|

  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0%   ~10h 11m remaining
  8 SDs left  |  2 workers  |  ETA 5:08 PM EST
```

**Example (10:14 PM with 72% progress):**
```
  _  ___              _  _  _
 / |/ _ \      _     / || || |   ____  __  __
 | | | | |    (_)   | || || |_  |  _ \|  \/  |
 | | |_| |     _    | ||__   _| | |_) | |\/| |
 |_|\___/     (_)   |_|   |_|   |  __/| |  | |
                                  |_|   |_|  |_|

  ████████████████████████████░░░░░░░░░░░  72%   ~1h 24m remaining
  5 SDs left  |  3 workers  |  ETA 10:14 PM EST
```

### ASCII Time Construction Rules

**Digit reference** — use these exact 5-line patterns:
```
0:  ___      1:  _     2:  ____    3:  _____   4:  _  _
   / _ \       / |       |___ \      |___ /      | || |
  | | | |      | |         __) |      |_ \       | || |_
  | |_| |      | |        / __/      ___) |      |__   _|
   \___/       |_|       |_____|     |____/         |_|

5:  ____    6:   __     7:  _____   8:  ___     9:  ___
   | ___|      / /_       |___  |     ( _ )       / _ \
   |___ \     | '_ \         / /      / _ \      | (_) |
    ___) |    | (_) |       / /      | (_) |      \__, |
   |____/     \___/        /_/       \___/          /_/
```

**Colon separator** (5 lines, padded to match digit height):
```
line 1:  (empty)
line 2:    _
line 3:   (_)
line 4:    _
line 5:   (_)
```

**Assembly rules:**
- **Hour**: 1-2 digits, no leading zero. `9` not `09`.
- **Minutes**: Always 2 digits with leading zero. `04` not `4`.
- **AM/PM**: Render `____  __  __` block on same lines as digits, right-aligned with generous spacing.
- **Spacing**: 6+ spaces between digit groups (hour, colon, minutes, AM/PM) to prevent visual crowding.
- **Single code block**: All 5 lines of digits + blank line + progress bar + stats line in ONE fenced code block.
- **Plaintext fallback**: Always include `ETA H:MM AM/PM EST` on the stats line so the time is readable even if ASCII art wraps.

### Smart Estimation Process

Do NOT use the naive `remaining SDs / velocity` formula. The dashboard's aggregate velocity reflects past conditions and is misleading for forward-looking estimates.

**Primary method: Per-SD phase-aware estimation with elapsed time tracking.** Velocity is only a sanity check.

#### Step 1: Query live SD state (every dashboard cycle)

Query the database for each remaining SD's current position:
```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('strategic_directives_v2')
    .select('sd_key, title, current_phase, progress_percentage, status, sd_type, parent_sd_id')
    .not('status', 'in', '(\"completed\",\"cancelled\")')
    .order('created_at', { ascending: true });
  data.forEach(d => console.log(JSON.stringify(d)));
})();
"
```

This gives you the **exact phase and progress** for each SD. Use this — not the dashboard's truncated labels.

#### Step 2: Query historical baselines (once per coordinator session)

On the first dashboard cycle, run `node scripts/fleet-eta-stats.cjs` to get per-type-bucket and per-phase medians. **Cache the results** — no need to re-query every 5 minutes.

**Reference values** (fallback if query unavailable):

| Type Bucket | n | Active Median | p25 | p75 | Use For |
|-------------|---|---------------|-----|-----|---------|
| child/infrastructure | 41 | 41m | 20m | 50m | Orchestrator children (most common) |
| child/feature | 6 | 80m | 72m | 82m | Feature-type children |
| child/database | 5 | 60m | 53m | 76m | Database migration children |
| child/documentation | 4 | 7m | 5m | 66m | Documentation children (fast) |
| child/uat | 2 | 85m | 62m | 85m | UAT children |
| standalone/infrastructure | 2 | 54m | 3m | 54m | Standalone infra/learn-fix SDs |
| standalone/feature | 1 | 137m | — | — | Standalone feature SDs (thin data!) |
| standalone/orchestrator | 9 | 7m | 5m | 13m | Orchestrator parent SDs |

**Per-phase reference values** (median active time in phase):
| Phase | child/infrastructure | child/feature | standalone/orchestrator |
|-------|---------------------|--------------|------------------------|
| LEAD | 2m | 25m | 0m |
| PLAN | 10m | 79m | 8m |
| EXEC | 28m | 67m | 2m |

#### Step 3: Estimate each remaining SD individually

For each SD, compute remaining time using its **current phase position**:

**Phase-based remaining time calculation:**
1. Look up the SD's type bucket → get per-phase medians (LEAD, PLAN, EXEC)
2. Based on `current_phase`, sum only the **remaining phases**:
   - SD in LEAD → remaining = (LEAD remaining) + PLAN median + EXEC median
   - SD in PLAN → remaining = (PLAN remaining) + EXEC median
   - SD in EXEC → remaining = EXEC remaining only
3. Within the current phase, use `progress_percentage` to estimate how much of that phase is left:
   - `phase_remaining = phase_median × (1 - progress/100)`
4. **Subtract elapsed time on the current attempt.** Track when each worker claimed its SD (from sweep/dashboard data). If a worker has been on an SD for 15 minutes and the estimate says 20 minutes remaining, the displayed remaining is ~5 minutes, not 20.

**Example:** Child C is `child/infrastructure`, currently in LEAD at 30%.
- LEAD remaining: 2m × 0.70 = ~1.4m (but if worker has been in LEAD for 12m already, LEAD is clearly slower than median — use max(median_remaining, 2m) as floor)
- PLAN: 10m
- EXEC: 28m
- **Total remaining: ~40m** (adjusted for this SD running slower than median)

**Slower-than-median adjustment:** If the worker has already spent **more time in a phase than the phase median**, the SD is running slower than typical. In this case:
- Do NOT use (median - elapsed) which would go negative
- Instead, set current phase remaining to a **floor of 2 minutes** (it could finish any moment)
- Add a `(slower than typical)` flag to the stats line

#### Step 4: Identify auto-completing SDs (zero additional time)

**Orchestrator parents auto-complete when all children finish.** When all of an orchestrator's children are completed (or the last one is in-progress), the parent's remaining time = last child's remaining time + ~2 minutes for auto-completion overhead. Do NOT add the parent's full median on top.

Specifically:
- If parent is blocked on children → parent remaining = last child remaining + 2m
- If parent has no remaining children in-progress → parent remaining = 2m (auto-complete)
- **Never double-count** by adding parent time + child time independently

#### Step 5: Map dependency chains

Check for dependency constraints:
- **BLOCKED SDs**: Cannot start until blocker completes. Start time = blocker's finish time.
- **Sequential children**: Form a chain — sum their times.
- **Parent-child auto-complete**: Parent time = last child time + 2m (not additive).
- **Independent SDs**: Schedule freely in parallel.

Build a dependency graph and identify the **critical path** (longest chain).

#### Step 6: Calculate parallel schedule

Using the dependency graph:
1. Identify all **immediately runnable** SDs.
2. Assign to workers (N = derived worker count), longest-first.
3. When an SD finishes, add newly unblocked SDs to the pool.
4. Total time = max(sum of parallel rounds, critical path duration).

#### Step 7: Elapsed time tracking (CRITICAL — prevents static ETAs)

**The ETA MUST decrease between cycles.** To ensure this:

1. **Record a `baseline_timestamp`** on the first cycle when an ETA is computed for a given set of remaining SDs.
2. On each subsequent cycle, compute: `displayed_remaining = max(0, original_estimate - (now - baseline_timestamp))`
3. **Reset the baseline** when:
   - An SD completes (recompute from scratch)
   - A worker's phase changes (recompute for that SD)
   - Worker count changes by ≥2 (fleet restructured)
4. If the worker is still in the same phase with the same progress after multiple cycles, the SD is **stalling**. Flag it:
   ```
   ⚠ SD-XXX-001: in LEAD at 30% for 15m+ (median LEAD = 2m) — may be struggling
   ```

**Anti-pattern: never show the same "~33m remaining" across 3+ consecutive cycles.** If the number isn't changing, something is wrong with the calculation.

#### Step 8: Compute finish time and display

`Estimated finish = current time + total remaining from Steps 3-6`

**Confidence display:**
- n ≥ 5 for the SD's type bucket → show estimate without qualifier
- n = 2-4 → append `(±30%)`
- n = 1 → append `(±50%, thin data)`
- n = 0 → fall back to reference table, append `(no historical match)`
- If SD is running slower than median → append `(slower than typical)`

**Velocity sanity check** (secondary, not primary):
- Compute per-worker velocity: `recent completions / (workers × hours)`
- If data estimate and velocity estimate differ by >50%, flag it but trust the data estimate

**Stats line examples:**
```
  2 SDs left  |  1 worker  |  phase-based  |  LEAD 30% → ~38m left
  3 SDs left  |  2 workers  |  phase-based  |  1 in EXEC, 2 in LEAD  |  ETA 10:15 AM
  1 SD left   |  1 worker   |  phase-based  |  EXEC 60% → ~11m left (slower than typical)
```

### Dynamic values to render
- **Big ASCII time**: The estimated finish time in figlet-style block letters
- **Progress bar**: Proportional fill based on completed / total SDs
- **Percentage**: completed / total as percent
- **Time left**: human-readable duration that **decreases every cycle** (e.g., `~38m`, `~33m`, `~28m`)
- **Stats line**: SDs remaining, worker count, current phase position, estimation method

**Only display when**: the forecast section has pending SDs > 0. Do NOT display alongside the Queue Cleared Celebration banner.

---

## Intent Detection Keywords

When the user mentions any of these phrases, suggest `/coordinator`:
- "fleet status", "fleet dashboard", "fleet health"
- "show workers", "active sessions", "who is working"
- "stale sessions", "sweep", "cleanup sessions"
- "claim conflicts", "resolve conflicts", "duplicate claims"
- "burn rate", "velocity", "ETA", "when will we be done", "forecast"
- "QA checks", "quality checks", "fleet QA"
- "coordinate sessions", "coordination messages"
- "how's the fleet", "fleet progress", "overall progress"
- "worktree conflict", "same branch", "branch collision"
- "struggling worker", "stuck worker", "gate failures"
- "uncommitted changes", "WIP", "unsaved work"

---

## Command Ecosystem

| After using | Suggest |
|-------------|---------|
| `/coordinator sweep` | `/coordinator qa` to verify cleanup |
| `/coordinator qa` with issues | `/coordinator sweep` to auto-fix |
| `/coordinator forecast` | `/coordinator workers` to see who's active |
| `/coordinator available` | Share available SDs with idle workers |
| Orchestrator complete | `/coordinator forecast` for full queue ETA |

---

## Same-SD Parallel Worker Assignment (FR-4)

Added 2026-05-09 by SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001 to address parallel-write contention between 2+ worker sessions holding the same SD claim concurrently.

### When to use

Trigger this workflow when ANY of the following are observed:
- `npm run session:check-concurrency` surfaces 2+ sessions on the same SD/branch with `category: idle_uncommitted` or `category: stale_uncommitted` (FR-1 rescoped detection: peers with uncommitted writes regardless of heartbeat freshness)
- A peer surfaces with `[DRIFT]` flag next to its `sd_key` (FR-7 detection: peer's sd_key tag does not match the active SD claim for the current branch)
- A worker session attempts Write/Edit and receives `ENF-FILE-CLAIM` error from the PreToolUse hook (ENFORCEMENT 14 in `scripts/hooks/pre-tool-enforce.cjs`), indicating a peer holds a fresh per-file claim

### File-claim acquisition flow

When ENFORCEMENT 14 fires for a Write/Edit:
1. The hook consults `file_claim_locks` for the target path
2. If no holder exists OR the holder's heartbeat is stale (>10min), the hook AUTO-CLAIMS the path for the current session and proceeds
3. If a peer holds a fresh claim, the hook REFUSES with `ENF-FILE-CLAIM` and reports the holder's session ID + heartbeat age

The local in-process LRU cache (size 64, TTL 30s) holds claim lookups to keep the hook's p95 latency under 50ms. Cache invalidates automatically on commit (via `.husky/post-commit`) and on stale-session sweep.

### Conflict resolution (when ENF-FILE-CLAIM fires)

The blocked worker has three options:
1. **Wait for the peer to commit** — file_claim_locks rows auto-release on `git commit` via `.husky/post-commit` (DELETEs rows for files in HEAD commit scoped to the holder's session)
2. **Ask the coordinator to reassign** — invoke `/coordinator workers` to see who holds what; the coordinator can suggest a different file from the SD's scope that is still unclaimed
3. **Force-takeover** — if the peer is presumed dead but their heartbeat is fresh, the operator may invoke `node scripts/sd-start.js <SD> --force-reclaim` which clears the SD claim AND co-clears all file_claim_locks held by the peer

### Stale-handover

If a worker session crashes mid-write, its file claims auto-release after 10 minutes of stale heartbeat via `scripts/stale-session-sweep.cjs`. The threshold is configurable via `FILE_CLAIM_STALE_THRESHOLD_SECONDS` env var (default 600). The 4 sibling release sites that co-clear file_claim_locks alongside `strategic_directives_v2.claiming_session_id` clears are:
1. `scripts/stale-session-sweep.cjs` — main sweep loop
2. `lib/claim-validity-gate.js` — orphaned-claim auto-release path
3. `lib/drain-orchestrator.mjs` — `_cleanupSlot` (per-slot release)
4. `lib/drain-orchestrator.mjs` — `shutdown` loop (all-slots release on drain)

### Emergency disable

Set `FILE_CLAIM_ENFORCED=off` in `.env` and restart the session to disable ENFORCEMENT 14 entirely. The coordinator should be notified — disabling the file-claim layer reverts to the pre-2026-05-09 lucky-convergence behavior where peer sessions can silently overwrite each other's work-in-progress.
