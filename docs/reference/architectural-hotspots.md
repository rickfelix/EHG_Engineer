# Architectural Hotspots — churn × complexity

> Source: `SD-LEO-INFRA-ARCHITECTURAL-HOTSPOTS-CHURN-001` · rev `0d99fcf770be` · window 90d · generated 2026-07-06T00:09:26.225Z
> DB-first truth: `metadata.hotspot_pack` on the source SD. Re-running `node scripts/one-off/score-architectural-hotspots.mjs` re-scores at CURRENT HEAD/date (the 90d window is wall-clock-relative) — it does not reproduce this pinned table.
> Window bias: a 90-day window over-weights files hammered in recent sprints; churn and complexity components are shown separately so the reader can discount.

| # | Composite | Churn | Complexity | LOC | File |
|---|---|---|---|---|---|
| 1 | 0.9985 | 94 | 645 | 4754 | `lib/eva/stage-execution-worker.js` |
| 2 | 0.617 | 58 | 646 | 3500 | `scripts/leo-create-sd.js` |
| 3 | 0.5706 | 61 | 568 | 2928 | `scripts/stale-session-sweep.cjs` |
| 4 | 0.5065 | 66 | 466 | 1891 | `scripts/worker-checkin.cjs` |
| 5 | 0.3389 | 49 | 420 | 2125 | `scripts/sd-start.js` |
| 6 | 0.2779 | 45 | 375 | 2124 | `scripts/fleet-dashboard.cjs` |
| 7 | 0.2128 | 36 | 359 | 1544 | `scripts/hooks/pre-tool-enforce.cjs` |
| 8 | 0.2085 | 26 | 487 | 2155 | `lib/worktree-manager.js` |
| 9 | 0.1406 | 28 | 305 | 1095 | `scripts/modules/complete-quick-fix/git-operations.js` |
| 10 | 0.1395 | 19 | 446 | 1497 | `lib/eva/bridge/replit-repo-seeder.js` |
| 11 | 0.1263 | 36 | 213 | 949 | `scripts/modules/complete-quick-fix/orchestrator.js` |
| 12 | 0.1115 | 24 | 282 | 1715 | `lib/eva/lifecycle-sd-bridge.js` |
| 13 | 0.1036 | 29 | 217 | 1420 | `lib/eva/eva-orchestrator.js` |
| 14 | 0.0862 | 28 | 187 | 875 | `scripts/adam-advisory.cjs` |
| 15 | 0.0841 | 22 | 232 | 1472 | `scripts/modules/handoff/executors/BaseExecutor.js` |
| 16 | 0.0809 | 16 | 307 | 1415 | `scripts/worktree-reaper.mjs` |
| 17 | 0.0779 | 24 | 197 | 733 | `scripts/hooks/coordination-inbox.cjs` |
| 18 | 0.0731 | 15 | 296 | 973 | `lib/eva/bridge/replit-format-strategies.js` |
| 19 | 0.0692 | 24 | 175 | 1305 | `scripts/modules/handoff/executors/lead-final-approval/gates.js` |
| 20 | 0.061 | 23 | 161 | 1171 | `scripts/modules/handoff/executors/lead-final-approval/index.js` |

## Framed designs

- `lib/eva/stage-execution-worker.js` → SD-ARCH-HOTSPOT-STAGE-WORKER-001 — split the monolithic stage-execution loop into a stage-handler registry + a thin worker shell
- `scripts/leo-create-sd.js` → SD-ARCH-HOTSPOT-LEO-CREATE-001 — extract the nine createFrom* lanes into a source-adapter registry over one shared createSD core
- `scripts/stale-session-sweep.cjs` → SD-ARCH-HOTSPOT-SWEEP-001 — decompose the 2,900-line sweep main() into an ordered pass-registry with per-pass isolation
- `scripts/worker-checkin.cjs` → SD-ARCH-HOTSPOT-CHECKIN-001 — turn the resolveCheckin claim-ladder into an explicit pipeline of guard/acquire steps
- `scripts/sd-start.js` → SD-ARCH-HOTSPOT-SD-START-001 — extract the claim/gate/worktree phases of sd-start into composable modules shared with checkin
