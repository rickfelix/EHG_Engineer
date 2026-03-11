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
- Sessions labeled "idle" with a heartbeat within 15 minutes are alive but between tasks — count them as available capacity.
- Only consider a session truly dead if: heartbeat is 15+ minutes old AND it appeared in a previous sweep as stale AND has since been released.
- The coordinator session itself (this session) is NOT a worker — exclude it from worker counts.
- **Derived worker count** = sessions with heartbeat < 15 min old (active + idle with recent heartbeat). Use this for ETA calculations.

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
        ___    ____  _  _     ____  __  __
       / _ \  |___ \| || |   |  _ \|  \/  |
      | (_) |   __) | || |_  | |_) | |\/| |
       \__, |  / __/|__   _| |  __/| |  | |
         /_/  |_____|  |_|   |_|   |_|  |_|

  █████████████████████████░░░░░░░░░░░░░  72%  ~1h 24m
  5 SDs left  |  3 workers  |  7.4/hr
```

### Smart Estimation Process

Do NOT use the naive `remaining SDs / velocity` formula. Instead, compute the ETA as follows:

**Step 1: Determine worker count**
Use the derived worker count from the Assessment Rules (sessions with heartbeat < 15 min). Exclude the coordinator session.

**Step 2: Classify remaining SDs by phase**
From the dashboard output, categorize each remaining SD:
- **DRAFT** — needs LEAD + PLAN + EXEC → estimate ~50 min each
- **READY / PLANNING** — needs PLAN + EXEC → estimate ~35 min each
- **EXEC (with %)** — in progress → estimate `remaining% × 25 min` (avg EXEC phase is ~25 min)
- **IN_PROGRESS (no %)** — assume halfway → estimate ~20 min each

**Step 3: Map dependency chains**
Check the dashboard's available/orchestrator sections and the SD statuses for dependency constraints:
- **BLOCKED SDs**: Cannot start until their blocker completes. Their start time = blocker's estimated finish time.
- **Orchestrator children with ordering**: If children must run sequentially (A before B before C), they form a chain — only one runs at a time per chain.
- **Parent-child dependencies**: A child SD that depends on a sibling's output cannot be parallelized with that sibling.
- **Cross-orchestrator dependencies**: If a standalone SD depends on an orchestrator completing, it can't start until that orchestrator is done.

Build a simple dependency graph:
- **Independent SDs**: No dependencies — can be scheduled freely in parallel rounds.
- **Chain SDs**: Must run sequentially — sum their times to get the chain's total duration.
- **Blocked SDs**: Add wait time (blocker's remaining time) before their own estimated duration.

**Step 4: Calculate parallel schedule with constraints**
Using the dependency graph from Step 3:
1. Identify all **immediately runnable** SDs (no unmet dependencies).
2. Assign to workers (N = worker count), longest-first. Round time = longest SD in the round.
3. When an SD finishes, check if it **unblocks** any dependent SDs. Add newly unblocked SDs to the runnable pool.
4. Continue assigning rounds until all SDs are scheduled.
5. **Critical path** = the longest chain of sequential dependencies. The ETA can never be shorter than the critical path, regardless of worker count.
6. Total time = max(sum of parallel rounds, critical path duration).

**Step 5: Apply velocity adjustment**
Compare the phase-based estimate against the dashboard's recent velocity (prefer recent over overall). If they differ by more than 30%, average them — the velocity captures real-world variance the phase estimates miss.

**Step 6: Compute finish time**
`Estimated finish = current time + total estimated duration`

If blocked SDs exist with no clear unblock time (e.g., waiting on external input), note this in the stats line:
```
  5 SDs left  |  3 workers  |  7.4/hr  |  1 blocked (awaiting SD-X)
```

### Dynamic values to render
- **Big ASCII time**: The estimated finish time (hour, minutes, AM/PM) in figlet-style block letters
- **Progress bar**: Proportional fill based on completed / total SDs
- **Percentage**: completed / total as percent
- **Time left**: human-readable duration (e.g., `~1h 20m`, `~35m`)
- **Stats line**: SDs remaining, derived worker count, effective velocity used

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
