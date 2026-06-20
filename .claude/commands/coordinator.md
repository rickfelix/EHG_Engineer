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

> **CANONICAL — generated, do not hand-edit here.** The coordinator role + SRE charter — the six standing duties, conveyor-belt loading, the quiet-tick protocol, the maximize-utilization directive, the belt-low→ask-Adam default, and the deploy-verification practice — is the single source of truth in the governed `leo_protocol_sections` row `section_type=coordinator_role_contract`, published to **CLAUDE_COORDINATOR.md** (+ `CLAUDE_COORDINATOR_DIGEST.md`) by `node scripts/generate-claude-md-from-db.js`. **Load CLAUDE_COORDINATOR.md for the charter; to change it, edit the DB section and regenerate — do not re-add the charter prose here** (de-duplicated by SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-001).

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

**Step P (REQUIRED PRIMING READ — do this FIRST, before Step 0):**

Exactly like the LEO phase-file requirement (LEAD must read `CLAUDE_LEAD.md`, PLAN must read `CLAUDE_PLAN.md`), the coordinator MUST be primed on its role file before doing anything else:

1. **Read `.claude/commands/coordinator.md` IN FULL** with the Read tool (chunk with `offset`/`limit` if it exceeds the per-call cap). If this skill's full content was just injected by the `/coordinator` invocation itself, that injection counts as the read for THIS turn — but on any resumed/compacted session, or when a cron tick re-enters coordinator work and the skill body is no longer in context, re-read the file before acting.
2. **Read the durable role doc** `docs/protocol/fleet-coordinator-and-worker-behavior.md` (memory-independent source of truth for coordinator/worker behavior).
3. **Attest** in your first output after reading: one line, `Primed: coordinator.md + role doc read ✓ (sections: <N>, standing duties: 4, pause-discipline + belt rules loaded)`. The attestation MUST appear in the Step "Confirm setup" banner (see below). Do NOT proceed to Step 0 without it — an unprimed coordinator is the root cause of skipped duties (missed belt-low→Adam, re-armed retired loops, pointer-stop footguns).

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

**Step 4: Coordinator onboarding check (surface role + verify the canonical loop set)**
```bash
node scripts/coordinator-startup-check.mjs
```
This (a) surfaces the durable coordinator role context and prints a roles/responsibilities summary (MANAGER-not-IC, keep-workers-busy=KPI, recurring 3-source audit, teardown discipline), and (b) emits the canonical set of standard cron loops (the authoritative `STANDARD_LOOPS` array in `scripts/coordinator-startup-check.mjs` — do NOT hand-count them here), each with a ready CronCreate spec. It is fail-open (warns, exits 0). `CronList`/`CronCreate` are HARNESS tools (not Node-callable), so the helper EMITS the spec — YOU compare it against `CronList` and arm only the loops not already present. To get an explicit armed|MISSING verdict, re-run with the prompts already in CronList: `node scripts/coordinator-startup-check.mjs --armed "<prompt1>,<prompt2>,…"`.

**Step 5: Set up automated cron loops using CronCreate**

**Arm exactly the set `scripts/coordinator-startup-check.mjs` emits as `STANDARD_LOOPS` — do NOT maintain a parallel list here.** `STANDARD_LOOPS` (in `scripts/coordinator-startup-check.mjs`) is the single source of truth for which loops exist, their cron schedules, and their prompts; Step 4 already ran the helper, which prints each loop with a ready CronCreate spec. For every loop the helper emits, run `CronCreate` with its `cron` + `prompt` and `recurring: true`. Idempotent — skip any whose prompt is already in `CronList`. To get an explicit `armed|MISSING` verdict, re-run the helper with the prompts already in `CronList`: `node scripts/coordinator-startup-check.mjs --armed "<prompt1>,<prompt2>,…"`.

> **Do NOT arm the retired Executive email summary** (`coordinator-email-summary.mjs`) — chairman email cutover 2026-06-10, advisory b7b73b86 / QF-20260609-024. The ONE chairman-facing email is the **Adam exec-summary**, scheduled durably via GitHub Actions (`.github/workflows/adam-exec-email-cron.yml`, live when repo var `ADAM_EMAIL_LIVE=true`). It is intentionally absent from `STANDARD_LOOPS`; escalate questions via the inbox/advisory lanes instead.

The identity refresh loop detects new workers that joined since the last assignment and gives them a color/callsign. Existing assignments are preserved (the script reads current metadata and only assigns to workers without an identity).

**Step 6: Verify coordinator registration (officially the coordinator) — GATE before hand-off**

Before telling the operator to bring up the rest of the fleet, confirm THIS session is the registered active coordinator. The startup order is strict — **coordinator first, then workers, then Adam** — and this gate is what makes the coordinator officially first: do NOT hand off to workers/Adam until it passes.
```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { getActiveCoordinatorId } = require('./lib/coordinator/resolve.cjs');
(async () => {
  const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const id = await getActiveCoordinatorId(sb);
  const me = process.env.CLAUDE_SESSION_ID;
  const { data } = await sb.from('claude_sessions').select('metadata').eq('session_id', me).maybeSingle();
  const isCoord = data && data.metadata ? data.metadata.is_coordinator === true : false;
  console.log('active_coordinator_id =', id);
  console.log('this_session_id      =', me);
  console.log('MATCH                =', id === me);
  console.log('db is_coordinator    =', isCoord);
  console.log((id === me && isCoord) ? 'COORDINATOR REGISTERED — safe to bring up workers next' : 'NOT REGISTERED — re-run Step 0 (broadcast identity) before handing off');
})();
"
```
If `MATCH=false` or `is_coordinator` is not `true`, re-run **Step 0** (broadcast identity) and re-check. Do NOT proceed to the operator hand-off until both are true.

**Step 7: Confirm setup + hand the startup sequence to the operator**

Display:
```
Primed: coordinator.md + role doc read ✓ (sections: <N>, standing duties: 4, pause-discipline + belt rules loaded)
Coordinator initialized and REGISTERED as the active coordinator (role context surfaced; all standard loops armed).
  All standard loops armed: every loop in STANDARD_LOOPS (scripts/coordinator-startup-check.mjs — the single source of truth) is now in CronList. Re-run `node scripts/coordinator-startup-check.mjs --armed "<prompts-in-CronList>"` for an explicit armed|MISSING verdict per loop. (The retired Executive email summary is intentionally NOT armed — the chairman email is the Adam exec-summary GHA cron, adam-exec-email-cron.yml.)
  All loops auto-expire after 7 days (CronCreate's recurring-job limit) or when this session exits — re-arm weekly to keep the fleet supervised.

  ✓ STEP 1 of 3 COMPLETE — the coordinator is up and officially registered. The fleet is supervised.

  NEXT — bring the fleet up IN THIS ORDER (do NOT skip ahead; the coordinator must be registered first, which it now is):
    2) START THE WORKERS — open each worker CC window and paste the worker directive printed below.
       The coordinator cannot start a worker's execution itself; only `/loop` or a human paste in the worker window can.
    3) START ADAM — once the workers are rolling, bring up Adam (the sourcing/advisory lane) via `/adam`.

  Do step 2, then step 3 — in that order. Tell me when the workers are up and I'll confirm they registered before you start Adam.
  Use /coordinator help to see all subcommands.
```

Then EMIT THE WORKER DIRECTIVE (operator request 2026-06-12 — every `/coordinator start` must hand the operator the paste-able worker prompt, not just point at it): Read `docs/protocol/fleet-worker-loop-directive.md` (the canonical, version-controlled copy) and print the full directive from its "The directive" code fence verbatim in a single fenced code block, prefaced with one line: "Worker startup prompt — paste into each worker CC window:". Always read the file rather than reproducing from memory, so edits to the canonical directive propagate automatically.

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
  The cron loops are session-scoped (auto-expire after 7 days — CronCreate's recurring-job limit — or session exit; re-arm weekly).

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

## Adam advisory lane (read + reply)

Adam advisories are `session_coordination` `INFO` rows (`payload.kind=adam_advisory`), **retired
ONLY by `payload.actioned_at`** (`read_at` = delivered, not actioned). The coordinator-startup
ritual prints this summary; the canonical doc is `docs/protocol/coordinator-adam-comms.md`.

Selector: `payload->>kind='adam_advisory' AND payload->>actioned_at IS NULL AND target_session IN (<coordinatorId>,'broadcast-coordinator')`.

| Verb | Command |
|------|---------|
| Peek (read-only, stamps nothing) | `node scripts/read-adam-advisories.cjs` |
| Ack [+ reply] (retires it) | `node scripts/coordinator-ack-adam.cjs --advisory <id> [--reply "<body>"]` |
| Reply by advisory | `node scripts/coordinator-reply.cjs --advisory <id> "<body>"` |
| Inbox render (stamps read_at only) | `node scripts/fleet-dashboard.cjs inbox` |

A peek/render NEVER retires an advisory — only `coordinator-ack-adam.cjs --advisory` does. The
`--reply`/reply legs need `COORDINATOR_TWOWAY_V2=on`.

### NO hand-rolled inserts (SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001)

**NEVER write `session_coordination` rows via ad-hoc `node -e` inserts.** Live 7-day evidence:
158/166 `coordinator_reply` rows lacked `payload.reply_to` (hand-rolled), so awaiting senders
never matched them — plus invented kinds (`coordinator_to_adam`) leaked into the lane. Always
route through the canonical writers:

| Intent | Canonical path |
|--------|----------------|
| Reply to a worker request | `node scripts/coordinator-reply.cjs --to <session> --correlation <id> "<body>"` (echoes the correlation under BOTH `reply_to` + `correlation_id`) |
| Reply to an Adam advisory | `node scripts/coordinator-reply.cjs --advisory <id> "<body>"` or `coordinator-ack-adam.cjs --advisory <id> --reply "<body>"` |
| Any other directive row | `lib/coordinator/dispatch.cjs insertCoordinationRow` with a kind from `PAYLOAD_KINDS`/`DIRECTIVE_KINDS` (`lib/fleet/worker-status.cjs`) — never an invented `payload.kind` |

Receipt contract (all directive kinds): `read_at` = DELIVERED, `acknowledged_at` /
`payload.actioned_at` = ACTIONED. Check `node scripts/fleet-dashboard.cjs inbox` —
'UNDELIVERED OUTBOUND' lists your rows sitting unread at live targets; 'DEAD-LETTERED (24h)'
lists rows the sweep dead-lettered (re-send to the successor session if still relevant).

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

## Coordinator self-review rubric + grade→action→verify loop

Canonical scoring for the work-triggered tri-party review (`coordinator-self-review.mjs`, every `COORD_REVIEW_EVERY` completed SDs + a ~10-turn live supplement). The parallel Adam rubric+loop lives in the Adam Role Contract (`leo_protocol_sections` id=601 → CLAUDE_ADAM.md). SD-LEO-INFRA-CANONICALIZE-TRI-PARTY-001.

**Self-assessment rubric (shared tri-party shape).** The coordinator scores its own performance per dimension, each carrying: *good* (what excellent looks like), *failure* (the anti-pattern), *observable signal* (how you'd see it), *data source* (where the evidence lives), a *1–5 anchor*, and *hard red-flags* (any one red-flag = automatic below-threshold regardless of the 1–5). **Coordinator dimensions**: (1) worker utilization / keep-workers-busy KPI (idle workers + claimable work = failure); (2) proactive sourcing — keep a surplus belt, don't react only to visible idle; (3) conflict-free dispatch (same-write-surface check, no orchestrator-parent dispatch, claim lands on a LIVE worker); (4) identity + claim-state hygiene (coordinator pointer registered + heartbeat fresh); (5) anticipate-not-just-self-correct (Adam's catches trend toward zero). **Threshold**: a dimension scoring ≤2 — or hitting a red-flag — is **below-threshold**. Each score row uses the **common score schema**: per-dimension scores PLUS `committed_actions` (array) and `prior_action_outcomes` (array), persisted as `feedback`/`session_coordination` rows (cat=`coordinator_review`).

**Grade → action → verify loop (NON-OPTIONAL — a score is only worth the action it forces).** After EVERY self-score the coordinator MUST: **(a) cluster** every below-threshold dimension + red-flag to ROOT CAUSES; **(b) COMMIT** each gap to a concrete action of the right *type* — a *behavior* gap → a `coordinator.md` note (or a memory lesson); a *tooling/process* gap → a DRAFT SD via the **existing** retro → `issue_patterns` → `/learn` → SD pipeline (do NOT reinvent the pipeline); a *protocol/role* gap → a governed SD; **(c) RECORD** the `committed_actions` on the score row; **(d)** at the NEXT score, **VERIFY** the prior actions landed AND the dimension moved, recording `prior_action_outcomes`; **(e) ESCALATE** to the operator when a dimension stays below-threshold for **N consecutive cycles** (default N=3) despite committed actions. **No below-threshold dimension may close with zero committed action** — a self-score with no `committed_actions` for its below-threshold dimensions is an **INVALID score** (the dormant-review / vanity-measurement failure mode this loop exists to prevent).

## Metadata

- **Category**: Protocol
- **Status**: Approved
- **Version**: 1.0.0
- **Last Updated**: 2026-06-08
- **Tags**: fleet, coordinator, cron, self-review, standard-loops
- **Author**: SD-LEO-INFRA-ARM-CANONICALIZE-WORK-001

See also: role-session-handoff.md (singleton handoff protocol — never 0/never 2 holders, register-before-retire, DB-canonical pointer, auto split-brain resolve)
