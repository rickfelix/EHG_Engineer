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

When these columns show `-` (not yet populated), fall back to heartbeat-age-only assessment.

**Status language:**
- **"Stale" now more likely means genuinely inactive** — the PostToolUse hook ensures active sessions heartbeat every 30s.
- A session that heartbeated 5+ minutes ago with no enriched signals is likely between tasks or exiting.
- **Use direct language**: "worker idle" or "worker likely exited" instead of hedging with "may be mid-operation."
- **Only hedge** when enriched signals show active work (WIP=yes, Phase=EXEC, recent Fails increment).

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
  - WORKTREE_CONFLICT: two workers on same branch flagged (QF on main excluded)
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
1. Cancel both cron loops using `CronDelete` (sweep and dashboard jobs)
2. Confirm to the user:
   ```
   Coordinator shut down. Sweep and dashboard loops cancelled — no more work to monitor.
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

Do NOT use the naive `remaining SDs / velocity` formula. The dashboard's aggregate velocity (e.g., 7.4 SDs/hr) reflects past conditions (different SD types, different worker counts) and is misleading for forward-looking estimates.

**Primary method: Data-driven estimation from historical handoff durations.** Velocity is only used as a sanity check.

**Step 1: Determine worker count**
Use the derived worker count from the Assessment Rules (ghost filter + 5-min heartbeat window). Exclude the coordinator session.

**Phase-aware ETA (when enriched signals available):**
If the dashboard shows Phase columns for workers, use per-phase medians instead of flat SD medians:
- Worker in LEAD → subtract 0% (full SD estimate)
- Worker in PLAN → subtract LEAD median from estimate
- Worker in EXEC → use only EXEC median as remaining time
This produces significantly more accurate ETAs than treating all workers as "0% progress."

**Step 2: Query historical completion data (once per coordinator session)**

On the **first dashboard cycle** (or after `/coordinator start`), run `node scripts/fleet-eta-stats.cjs` to get data-driven baselines. This script queries `sd_phase_handoffs` grouped by SD, cross-referenced with `strategic_directives_v2` metadata, and returns median/p25/p75 durations by type bucket.

If the script is unavailable, query manually:
```bash
node -e "require('dotenv').config(); /* ... query sd_phase_handoffs + strategic_directives_v2 ... */"
```

The key query: group handoffs by `sd_id`, compute first→last handoff timestamp as total duration, then join with `strategic_directives_v2` to get `sd_type` and `parent_sd_id` (child vs standalone).

**Cache the results** for subsequent cycles — no need to re-query every 5 minutes.

**Step 3: Classify remaining SDs using data-driven baselines**

Use the queried historical data to estimate each remaining SD. The table below shows **data-backed reference values** (as of early 2026, n=30 SDs with handoff data). These are fallbacks if the query is unavailable — always prefer live query results.

| Type Bucket | n | Median | p25 | p75 | Use For |
|-------------|---|--------|-----|-----|---------|
| child/infrastructure | 41 | 47m | 27m | 69m | Orchestrator children (most common) |
| child/feature | 6 | 181m | 84m | 400m | Feature-type children |
| child/database | 5 | 115m | 100m | 607m | Database migration children |
| child/documentation | 4 | 7m | 5m | 67m | Documentation children (fast) |
| child/uat | 2 | 85m | 62m | 85m | UAT children |
| standalone/infrastructure | 2 | 103m | 3m | 103m | Standalone infra/learn-fix SDs |
| standalone/feature | 1 | 218m | — | — | Standalone feature SDs (thin data!) |
| standalone/orchestrator | 9 | 80m | 5m | 367m | Orchestrator parent SDs |

**Per-phase reference values** (median total time in phase, from `fleet-eta-stats.cjs`):
| Phase | child/infrastructure (n=41) | child/feature (n=6) | standalone/feature (n=1) | standalone/infra (n=2) |
|-------|---------------------------|--------------------|-----------------------|---------------------|
| LEAD | 2m | 25m | 98m | 16m |
| PLAN | 10m | 79m | 51m | 64m |
| EXEC | 28m | 67m | 71m | 24m |

Note: SDs go through **multiple handoff attempts** per phase (retries, gate failures). A typical SD has 8-15 total handoff events. The per-phase values above are per-attempt, not total time in phase.

**To estimate remaining time for a specific SD:**
1. Look up its `sd_type` + child/standalone bucket → get median total duration
2. Check its `current_phase` and `progress_percentage`
3. Estimate remaining = `median × (1 - progress/100)`, adjusted for phase position:
   - If past LEAD → subtract ~10-15% from total estimate
   - If in PLAN (partially complete) → subtract LEAD time + completed PLAN portion
   - If in EXEC → use only remaining EXEC estimate

**Important data caveats:**
- `complexity_level` is uniformly "moderate" across all SDs — it does NOT differentiate difficulty
- `story_count` (must_have + h + m + l counts) is zero for nearly all SDs — not a useful signal
- `intensity_level` is mostly null — not populated
- `created_at` vs `completion_date` on the SD table is **unreliable** (bulk imports cause negative durations) — always use handoff timestamps instead
- Small sample sizes per bucket mean wide confidence intervals — flag uncertainty when n < 5
- Durations include idle gaps between work sessions, so they overestimate active work time

**Step 4: Map dependency chains**
Check the dashboard for dependency constraints:
- **BLOCKED SDs**: Cannot start until blocker completes. Start time = blocker's finish time.
- **Sequential children**: If children must run in order, they form a chain — sum their times.
- **Parent-child deps**: Siblings that depend on each other cannot be parallelized.
- **Cross-orchestrator deps**: Standalone SDs depending on an orchestrator must wait.

Build a dependency graph:
- **Independent SDs**: Schedule freely in parallel rounds.
- **Chain SDs**: Sum times for total chain duration.
- **Blocked SDs**: Add blocker's remaining time before their own duration.

**Step 5: Calculate parallel schedule with constraints**
Using the dependency graph:
1. Identify all **immediately runnable** SDs (no unmet dependencies).
2. Assign to workers (N = worker count), longest-first. Round time = longest SD in the round.
3. When an SD finishes, check if it **unblocks** dependent SDs. Add newly runnable SDs to the pool.
4. Continue until all SDs scheduled.
5. **Critical path** = longest chain of sequential dependencies. ETA can never be shorter than critical path.
6. Total time = max(sum of parallel rounds, critical path duration).

**Step 6: Sanity check against per-worker velocity**
Only as a sanity check — NOT as the primary estimate:
- Compute **per-worker velocity**: `total recent completions / (active workers × hours)`. This normalizes for worker count.
- If the data-driven estimate and per-worker velocity estimate differ by **more than 50%**, flag it:
  ```
  ⚠ Velocity sanity check: data estimate (~2h 30m) vs velocity estimate (~1h 10m) —
     velocity may reflect faster child SDs, trusting data estimate
  ```
- If they're within 50%, the data estimate is credible — use it as-is.
- **Never average** data and velocity estimates. Data is primary. Velocity is a smell test.

**Step 7: Apply rolling average (last 3 cycles)**

Maintain a mental log of the last 3 dashboard cycles' values:
- **Worker count** from each cycle (derived per Step 1)
- **ETA duration** from each cycle (computed per Steps 3-6)

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

**Step 8: Compute finish time**
`Estimated finish = current time + averaged ETA duration`

Display confidence based on data quality:
- n ≥ 5 for the SD's type bucket → show estimate without qualifier
- n = 2-4 → append `(±30%)`
- n = 1 → append `(±50%, thin data)`
- n = 0 (no historical match) → fall back to reference table above, append `(no historical match)`

If blocked SDs exist with no clear unblock time, note in stats:
```
  5 SDs left  |  3 workers  |  data-driven (n=19 infra)  |  1 blocked (awaiting SD-X)
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
