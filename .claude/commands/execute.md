<!-- reasoning_effort: medium -->

# /execute - Multi-Session Execution Team Command

Spawn a parallel execution team: a supervisor process plus N independent `claude --print` workers that continuously claim and work Strategic Directives via `/leo next`. Workers handle one SD each through the full LEAD→PLAN→EXEC→SHIP→LEARN lifecycle, then exit cleanly. The supervisor respawns workers, monitors PIDs, enforces a circuit breaker, and exits gracefully on `/execute stop`.

**Source**: `VISION-EXECUTE-COMMAND-L2-001` + `ARCH-EXECUTE-COMMAND-001`

## Arguments

Parse `$ARGUMENTS` to determine the subcommand:
- No args or `start` → Spawn a 3-worker team across all tracks (default)
- `start [--workers N] [--track A|B|C]` → Spawn with options
- `stop [--team <id>] [--callsign <NATO>] [--all] [--grace-period <sec>] [--force]` → Graceful shutdown
- `status` → Alias for `/coordinator team` — show active team banner
- `list` → Show last 10 teams from `execute_teams` table
- `help` → Show this usage block

ARGUMENTS: $ARGUMENTS

---

## Instructions for Claude

### Step 1: Parse Arguments

Map the argument to one of the subcommand handlers below. Use **named flags only** (no positional args after the subcommand). Reject ambiguous input by printing the help block to stderr.

**NEVER call AskUserQuestion in this slash command.** Workers spawned by `/execute` run headlessly with `--dangerously-skip-permissions` and would hang indefinitely if any prompt appears in the call chain.

| Subcommand | Action |
|-----------|--------|
| (no args) or `start` | Pre-spawn check + dispatch to `scripts/execute-team.mjs` |
| `stop` | Dispatch to `scripts/execute-stop.mjs` |
| `status` | Dispatch to `scripts/fleet-dashboard.cjs team` |
| `list` | Query `execute_teams` for last 10 rows ordered by `started_at DESC` |
| `help` | Print the usage block above |

### Step 2: Pre-Spawn Coordinator Bootstrap Check (start only)

Before invoking `scripts/execute-team.mjs`, check whether the `/coordinator` cron loops are running:

```javascript
const { checkCoordinatorRunning, buildWarningMessage } = require('./lib/execute/coordinator-bootstrap.cjs');
const result = checkCoordinatorRunning();
if (!result.running) {
  console.warn(buildWarningMessage(result));
  // Proceed anyway — chairman opt-in policy. Do NOT auto-start cron.
}
```

The check is **best-effort warning, not blocking**. If the coordinator is not running, the chairman will not see automated stale session sweeps or coordinator dashboard updates while the team is active. The chairman is expected to run `/coordinator start` in a separate session if they want full observability.

### Step 3: Execute Subcommand

#### `start`

```bash
node scripts/execute-team.mjs --workers <N> [--track <A|B|C>]
```

Default `<N>` is 3. Optional `--track` filters which SD types workers will claim. The supervisor process is detached and survives the chairman's CC session exit.

After spawn, print the post-spawn output block:

```
╔══ /execute ═══════════════════════════════════════╗
║ Team spawned: execute_teams #<team_id>            ║
║ Workers: <N> (<callsigns>)                        ║
║ Detached PID: <supervisor_pid> (background)       ║
║ Logs: logs/execute/team-<uuid>/                   ║
║                                                    ║
║ Monitor:  /execute status                          ║
║ Stop:     /execute stop                            ║
║ Tail:     tail -f logs/execute/team-<uuid>/*.log   ║
╚════════════════════════════════════════════════════╝
```

#### `stop`

```bash
node scripts/execute-stop.mjs [--team <uuid>] [--callsign <NATO>] [--all] [--grace-period <sec>] [--force]
```

Defaults to `--all` if no specific filter given. Honors a 60-second grace period (configurable via `--grace-period`). The WIP guard inspects each worker's worktree for uncommitted changes and emits `SAVE_WARNING` coordination messages instead of `SIGKILL` if work is in progress. Use `--force` to skip the WIP guard (dangerous).

#### `status`

Alias for `/coordinator team`. Renders the Mockup A banner showing each active worker's callsign, current SD, phase, progress bar, and heartbeat.

```bash
node scripts/fleet-dashboard.cjs team
```

#### `list`

Query `execute_teams` for the most recent 10 teams:

```sql
SELECT team_id, status, worker_count, sds_completed, sds_failed,
       started_at, stopped_at, stop_reason
  FROM execute_teams
  ORDER BY started_at DESC
  LIMIT 10;
```

Format as a table for chairman readability.

---

## Pre-flight Failure Reference

`/execute start` runs three pre-flight health checks before spawning any worker. If any check fails, the supervisor exits with an actionable error message and writes `execute_teams.status = stopped` with `stop_reason = preflight_failed`. The three canonical messages:

| Failure | Message | Hint |
|---------|---------|------|
| `node_modules` | `node_modules issue detected` | Run `npm install` from repo root |
| `database` | `Database unreachable: <error>` | Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env` |
| `claim_gate_rpc` | `Claim gate RPC unresponsive: <error>` | `fn_check_sd_claim` missing — apply claim-hardening migration (PR #2850) |

If you see any of these, fix the underlying issue before re-running `/execute start`.

---

## Manual Acceptance

Per `VISION-EXECUTE-COMMAND-L2-001` § Success Criteria, the full `/execute` system has two manual acceptance pilots that must be run by the chairman post-merge. These pilots cannot be automated within an SD because they invoke real `claude --print` processes against the live queue and consume real API tokens.

### Pilot 1 — 1-worker / 3-SD soak test

```bash
/execute start --workers 1
```

**Expected outcome**: 1-worker team completes 3 safe test SDs with merged PRs, zero manual intervention, zero `pending_approval` auto-approvals, circuit breaker inactive. Supervisor respawns the worker after each SD completion.

**Time**: ~30-60 minutes depending on SD complexity.

### Pilot 2 — 3-worker / 10-SD pilot

```bash
/execute start --workers 3
```

**Expected outcome**: 3-worker team completes ≥8 of 10 SDs with merged PRs, ≤2 circuit-breaker halts, no orphaned claims, monitored continuously via `/execute status` (or `/coordinator team`). Chairman validates that callsigns and colors are stable across worker respawns.

**Time**: ~60-120 minutes.

### Pilot Failure Protocol

If either pilot fails post-merge, **do not block this SD on the failure**. Instead:

1. Capture the failure mode (logs, execute_teams row, stop_reason)
2. File a follow-up SD: `SD-LEO-FIX-EXECUTE-PILOT-FAILURE-<NNN>`
3. Document the specific failure (e.g., "circuit breaker tripped after 4 spawns due to RCA loop on SD-XXX") in the new SD's description
4. The follow-up SD goes through its own LEAD→PLAN→EXEC cycle

This SD is considered complete when:
- All 4 phase children (A/B/C/D) are merged
- All unit + integration tests pass
- The slash command exists and routes correctly
- The pilot acceptance criteria are documented (above)

The pilots themselves are chairman-driven validation, not blocking gates.

---

## Subcommand Reference

| Command | Description |
|---------|-------------|
| `/execute` | Spawn 3-worker team, all tracks, detached |
| `/execute start --workers 5 --track A` | Spawn 5 workers limited to track A |
| `/execute stop` | Graceful shutdown of all active teams (60s grace) |
| `/execute stop --team <uuid>` | Stop a specific team by UUID |
| `/execute stop --callsign Alpha` | Stop only the Alpha worker (advisory; supervisor still receives signal) |
| `/execute stop --force` | Skip WIP guard (dangerous) |
| `/execute status` | Show /coordinator team banner |
| `/execute list` | Show last 10 teams |
| `/execute help` | Show this usage |

## Related Commands

| Command | Use |
|---------|-----|
| `/coordinator start` | Start cron loops (recommended before `/execute`) |
| `/coordinator team` | Direct equivalent of `/execute status` |
| `/coordinator all` | Full fleet dashboard (includes team banner when active) |
| `/sd-start <SD-ID>` | Manual single-SD claim (if you want to drive one SD by hand) |

## Architecture

`/execute` integrates four LEO infrastructure pieces shipped across Phase 1-3:

- **Phase 1 (Child A)** — `scripts/execute-team.mjs` supervisor + `lib/execute/{execute-preflight,execute-team-factory,execute-circuit-breaker}.mjs` + `execute_teams` table
- **Phase 2 (Child B)** — `lib/execute/team-banner.cjs` + `scripts/fleet-dashboard.cjs team` section + `/coordinator team` integration
- **Phase 3 (Child C)** — `scripts/execute-stop.mjs` + `lib/execute/wip-guard.cjs` + `Supervisor.halt` grace period + `STOP_REQUESTED`/`SAVE_WARNING` coordination messages
- **Phase 4 (Child D, this file)** — slash command wrapper + `lib/execute/coordinator-bootstrap.cjs`

No new runtime dependencies. All four phases reuse existing LEO infrastructure (claim gate, virtual sessions, fleet identity, sweep, drain-orchestrator spawn pattern).
