<!-- reasoning_effort: low -->

# Restart Command

Restart all LEO Stack servers.

## Instructions

Run the LEO stack restart script using the cross-platform runner:

```bash
node scripts/cross-platform-run.js leo-stack restart
```

This uses the appropriate script for the current platform:
- **Windows**: Uses `leo-stack.ps1` (PowerShell)
- **Linux/macOS/WSL**: Uses `leo-stack.sh` (Bash)

This restarts both managed servers:
- EHG_Engineer (port 3000)
- EHG App (port 8080)

> Historical note: an "Agent Platform" service formerly managed by leo-stack was retired on 2026-04-25 (commit `f8e252ee28`, CrewAI elimination). leo-stack scripts no longer manage it; references to it in older docs are dead.

After running, confirm the status shows both servers running.

## Post-Restart Routing (Deterministic)

After restart, route automatically based on the current SD's `sd_type` (read from `strategic_directives_v2`). Do **not** present `AskUserQuestion` menus at this boundary — the routing is deterministic per CLAUDE.md AUTO-PROCEED canonical pause-points.

| `sd_type` | Next action |
|-----------|-------------|
| `feature`, `bugfix`, `security`, `refactor`, `enhancement`, `performance`, `ux_debt` | Invoke `/uat` (UAT required before ship — user-observable surface) |
| `infrastructure`, `database`, `documentation`, `docs`, `uat` | Invoke `/ship` (no UAT required — `uat` campaigns ARE the test scenarios) |
| `orchestrator`, `discovery_spike`, `implementation`, no SD claimed, or `sd_type` unknown | Log "Restart complete; awaiting operator direction" and return |

> The 15 valid `sd_type` values are defined in `database/migrations/20260206_register_uat_sd_type.sql`. If a new type is introduced, update this table and the corresponding test invariant.

The operator can verbally override at any time (e.g., "skip /uat", "done for now"). The deterministic rule replaces three prior `AskUserQuestion` menus that violated AUTO-PROCEED — see SD-LEO-INFRA-RESTART-SKILL-LEO-001.

## Command Ecosystem Integration

This command is part of the **Command Ecosystem**. For full workflow context, see:
- **[Command Ecosystem Reference](../../docs/reference/command-ecosystem.md)** — Complete inter-command flow diagram and relationships

### When to Use /restart

| Scenario | Suggest /restart | Why |
|----------|------------------|-----|
| Before `/uat` for feature SDs | Yes | Clean environment for UAT testing |
| Before `/ship` with UI changes | Yes | Verify renders in clean environment |
| After LEAD-FINAL-APPROVAL | Yes (if UI) | Fresh state for visual verification |
| Long session (>2 hours) | Yes | Prevents stale server state |
| After major implementation | Yes | Ensure changes are reflected |
| Quick-fix or small changes | Optional | Usually not needed |
| Backend-only SDs (no UI) | Skip | Restart is pure ceremony with no UI to refresh |

### Typical Flow After /restart

```
/restart → /uat → /ship → /document → /learn   (UAT-required sd_types)
/restart → /ship → /document → /learn          (UAT-exempt sd_types)
```
