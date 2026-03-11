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
- `help` → Show usage help

ARGUMENTS: $ARGUMENTS

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
- `all`, no args → full dashboard
- `help` → show help

### Step 2: Execute

#### For dashboard sections (workers, orchestrator, available, coordination, health, qa, forecast, all):

```bash
node scripts/fleet-dashboard.cjs <section>
```

Where `<section>` is the full section name (e.g., `workers`, `orchestrator`, `forecast`).

Display the output directly to the user.

**IMPORTANT — Assessment Rules:**
The dashboard's heartbeat-based status can be misleading. Sessions doing active work (long git operations, compilations, gate checks, PR creation) may not heartbeat frequently and can appear "stale" or "dead" while actually working.

**Determining active worker count (do NOT rely on user telling you):**
- Count all sessions that heartbeated within the last **15 minutes** as "likely active" — this includes sessions the dashboard labels "stale" (which uses a shorter 5-min threshold).
- **Ghost filter**: A session must have **ever claimed an SD** (currently or previously) to count as a real worker. Sessions that appear idle with no history of SD claims are likely ghosts (e.g., coordinator sessions, stale terminals, automated processes). Indicators of ghost sessions:
  - Listed as "idle" with no SD claim across multiple consecutive dashboard cycles
  - Never appeared in sweep output as an active worker
  - Terminal ID doesn't match any known worker from sweep history
- Sessions labeled "idle" with a heartbeat within 15 minutes **AND a history of SD claims** are alive but between tasks — count them as available capacity.
- Only consider a session truly dead if: heartbeat is 15+ minutes old AND it appeared in a previous sweep as stale AND has since been released.
- The coordinator session itself (this session) is NOT a worker — exclude it from worker counts. It typically appears as an idle session with no SD claim.
- **Derived worker count** = sessions with heartbeat < 15 min that have claimed an SD (currently or historically), minus the coordinator session. Use this for ETA calculations.

**Status language:**
- **NEVER declare "Fleet DOWN"** based solely on aged heartbeats.
- **"Stale" does NOT mean "dead"** — a session that heartbeated 5-10 minutes ago is likely mid-operation, not crashed.
- **Use conservative language**: Say "heartbeats aging" or "sessions may be mid-operation" instead of "fleet is DOWN" or "zero active workers".
- **Only flag real concern** when a session hasn't heartbeated in 15+ minutes AND was previously active.

#### For `start`:

Initialize coordinator mode. This runs an initial sweep and dashboard, then sets up automated cron loops so the coordinator runs hands-free.

**Step 1: Run initial sweep to clean up fleet state**
```bash
node scripts/stale-session-sweep.cjs
```
Display the output and summarize actions taken.

**Step 2: Run full dashboard to show current fleet status**
```bash
node scripts/fleet-dashboard.cjs all
```
Display the output.

**Step 3: Set up automated cron loops using CronCreate**

Create two recurring cron jobs:
1. **Sweep every 5 minutes**: `cron: "*/5 * * * *"`, `prompt: "node scripts/stale-session-sweep.cjs"`, `recurring: true`
2. **Dashboard every 5 minutes (offset by 2 min)**: `cron: "2,7,12,17,22,27,32,37,42,47,52,57 * * * *"`, `prompt: "node scripts/fleet-dashboard.cjs all"`, `recurring: true`

**Step 4: Confirm setup**

Display:
```
Coordinator initialized.
  Sweep loop: every 5 minutes (auto-releases dead claims, resolves conflicts, QA fixes)
  Dashboard loop: every 5 minutes (offset 2min from sweep)
  Both loops auto-expire after 3 days or when this session exits.

  Fleet is now running on autopilot. You will see sweep and dashboard output automatically.
  Use /coordinator help to see all subcommands.
```

**IMPORTANT**: When running scripts from a non-main branch or worktree, prefix with `git show origin/main:scripts/<file> | node -` to ensure you're running the latest merged version. Only use `node scripts/<file>` directly when on main.

#### For `sweep` or `s`:

```bash
node scripts/stale-session-sweep.cjs
```

Display the output and summarize any actions taken (releases, conflict resolutions, QA fixes).

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
1. Cancel both cron loops using `CronDelete` (sweep and dashboard jobs)
2. Confirm to the user:
   ```
   Coordinator shut down. Sweep and dashboard loops cancelled — no more work to monitor.
   ```

---

## ETA Display

When the dashboard shows SDs still remaining in the queue (not yet complete), display this ETA block AFTER the dashboard output.

```
       _  ___    _ _  _     ____  __  __
      / |/ _ \  / | || |   |  _ \|  \/  |
      | | | | |/ /| || |_  | |_) | |\/| |
      | | |_| / / |__   _| |  __/| |  | |
      |_|\___/_/     |_|   |_|   |_|  |_|

  █████████████████████████░░░░░░░░░░░░░  72%  ~1h 24m
  5 SDs left  |  3 workers  |  7.4/hr
```

### ASCII Time Formatting Rules

Render the estimated completion time using figlet-style block digits. Format: `H:MM AM/PM` or `HH:MM AM/PM`.

**Digit reference** — use these exact patterns for each digit:
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

**Colon separator** — place between hour and minutes:
```
   _
  (_)
   _
  (_)
```

**Rules:**
- **Hour**: Use 1-2 digits (no leading zero). `9` not `09`. `10` is two digits.
- **Minutes**: Always 2 digits with leading zero. `04` not `4`.
- **AM/PM**: Render as standard text after the digit block, same style as the example.
- Spacing: One space between each digit, colon is narrow (2 chars wide).

### Smart Estimation Process

Do NOT use the naive `remaining SDs / velocity` formula. The dashboard's aggregate velocity (e.g., 7.4 SDs/hr) reflects past conditions (different SD types, different worker counts) and is misleading for forward-looking estimates.

**Primary method: Phase-based estimation.** Velocity is only used as a sanity check.

**Step 1: Determine worker count**
Use the derived worker count from the Assessment Rules (ghost filter + 15-min heartbeat window). Exclude the coordinator session.

**Step 2: Classify remaining SDs by type and phase**
Not all SDs are equal. Categorize each remaining SD and apply type-specific estimates:

| SD Type | Phase | Estimate | Rationale |
|---------|-------|----------|-----------|
| **Orchestrator child** (in progress) | EXEC with % | `remaining% × 25 min` | Children are pre-planned, focused scope |
| **Orchestrator child** (not started) | Full LEAD→EXEC | ~30 min | Smaller scope, parent already planned |
| **Standalone SD (DRAFT)** | Full LEAD→PLAN→EXEC | ~50-70 min | Needs vision, PRD, implementation |
| **Standalone SD (READY)** | PLAN→EXEC | ~35-45 min | LEAD done, needs PRD + implementation |
| **Standalone SD (PLANNING)** | Continue PLAN→EXEC | ~30-40 min | Partially planned |
| **Standalone SD (EXEC with %)** | Remaining EXEC | `remaining% × 30 min` | Standalone EXEC is longer than child EXEC |

**Important**: The dashboard's "recent velocity" was likely measured during orchestrator child execution. Children are faster (~20 min) than standalone DRAFTs (~60 min). Do NOT apply child velocity to standalone SD estimates.

**Step 3: Map dependency chains**
Check the dashboard for dependency constraints:
- **BLOCKED SDs**: Cannot start until blocker completes. Start time = blocker's finish time.
- **Sequential children**: If children must run in order, they form a chain — sum their times.
- **Parent-child deps**: Siblings that depend on each other cannot be parallelized.
- **Cross-orchestrator deps**: Standalone SDs depending on an orchestrator must wait.

Build a dependency graph:
- **Independent SDs**: Schedule freely in parallel rounds.
- **Chain SDs**: Sum times for total chain duration.
- **Blocked SDs**: Add blocker's remaining time before their own duration.

**Step 4: Calculate parallel schedule with constraints**
Using the dependency graph:
1. Identify all **immediately runnable** SDs (no unmet dependencies).
2. Assign to workers (N = worker count), longest-first. Round time = longest SD in the round.
3. When an SD finishes, check if it **unblocks** dependent SDs. Add newly runnable SDs to the pool.
4. Continue until all SDs scheduled.
5. **Critical path** = longest chain of sequential dependencies. ETA can never be shorter than critical path.
6. Total time = max(sum of parallel rounds, critical path duration).

**Step 5: Sanity check against per-worker velocity**
Only as a sanity check — NOT as the primary estimate:
- Compute **per-worker velocity**: `total recent completions / (active workers × hours)`. This normalizes for worker count.
- If the phase-based estimate and per-worker velocity estimate differ by **more than 50%**, flag it:
  ```
  ⚠ Velocity sanity check: phase estimate (~2h 30m) vs velocity estimate (~1h 10m) —
     velocity may reflect faster child SDs, trusting phase estimate
  ```
- If they're within 50%, the phase estimate is credible — use it as-is.
- **Never average** phase and velocity estimates. Phase is primary. Velocity is a smell test.

**Step 6: Apply rolling average (last 3 cycles)**

Maintain a mental log of the last 3 dashboard cycles' values:
- **Worker count** from each cycle (derived per Step 1)
- **ETA duration** from each cycle (computed per Steps 2-5)

Apply a rolling average to smooth out noise from session churn:
- **Averaged workers** = mean of last 3 worker counts, rounded to nearest integer
- **Averaged ETA duration** = mean of last 3 ETA durations in minutes

Use the averaged values for the displayed estimate. This prevents:
- A single cycle with ghost inflation from spiking the worker count
- A single stale sweep from crashing the ETA to unrealistic levels
- Jitter between cycles from making the display feel unreliable

**Bootstrap**: For the first 1-2 cycles (before 3 data points exist), use whatever data is available. Label the estimate with `(1 sample)` or `(2 samples)` until 3 cycles have accumulated.

**Reset the rolling window** when:
- An SD completes (the remaining work fundamentally changed)
- A new orchestrator starts (different SD mix)
- Worker count changes by more than 2 in a single cycle (fleet restructured)

**Step 7: Compute finish time**
`Estimated finish = current time + averaged ETA duration`

If blocked SDs exist with no clear unblock time, note in stats:
```
  5 SDs left  |  3 workers  |  ~50m/SD  |  1 blocked (awaiting SD-X)
```

### Dynamic values to render
- **Big ASCII time**: The estimated finish time (hour, minutes, AM/PM) in figlet-style block letters
- **Progress bar**: Proportional fill based on completed / total SDs
- **Percentage**: completed / total as percent
- **Time left**: human-readable duration (e.g., `~2h 10m`, `~35m`)
- **Stats line**: SDs remaining, averaged worker count, estimation method (e.g., `phase-based, 3-cycle avg`)

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

---

## Command Ecosystem

| After using | Suggest |
|-------------|---------|
| `/coordinator sweep` | `/coordinator qa` to verify cleanup |
| `/coordinator qa` with issues | `/coordinator sweep` to auto-fix |
| `/coordinator forecast` | `/coordinator workers` to see who's active |
| `/coordinator available` | Share available SDs with idle workers |
| Orchestrator complete | `/coordinator forecast` for full queue ETA |
