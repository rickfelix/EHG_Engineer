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
