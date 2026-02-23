# Brainstorm: Session PID Liveness Validation — Preventing Dead Claim Inheritance

## Metadata
- **Date**: 2026-02-22
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: None (internal protocol infrastructure)

---

## Problem Statement

`findExistingSession()` in `lib/session-manager.mjs` (lines 137-174) reuses cached sessions by matching local `~/.claude-sessions/*.json` files on `terminal_id` without validating PID liveness. When a Claude Code conversation dies and a new one starts on the same terminal, the new session silently inherits the dead session's identity — including its SD claim. This bypasses all 5 downstream defense layers (advisory lock → unique index → RPC → verify read-back → cross-path view check) because the new session *becomes* the old one before any DB-side logic runs.

This is the 16th identified failure mode in a 6-week, 15-fix saga (Feb 13 – Feb 22, 2026) addressing session/claim inheritance bugs.

## Discovery Summary

### RCA Finding
The RCA investigation identified `findExistingSession()` as the remaining unpatched entry point for dead claim inheritance. The function reads local session files, finds one matching the current `terminal_id`, and returns it without checking whether the PID stored in that file belongs to a living process.

### Investigation Findings (3 parallel research agents)

**Session Manager Architecture:**
- `findExistingSession()` matches by `terminal_id`, returns most recently modified file
- `isProcessRunning(pid)` exists (line 209-216) but only used during cleanup, not during session matching
- `getOrCreateSession()` has a secondary adoption path via `create_or_replace_session` RPC returning `conflict` — this bypasses `findExistingSession()` entirely

**Prior Fix Timeline (16 commits):**

| # | Date | Fix | Failure Mode Addressed |
|---|------|-----|----------------------|
| 1 | Feb 13 | terminal_id matching | tty+pid uniqueness (65 sessions/day) |
| 2 | Feb 13 | PID liveness in conflict handler | Cross-session conflicts when concurrent |
| 3 | Feb 14 | Stale threshold 5min→15min | Premature stale marking during long ops |
| 4 | Feb 15 | PID-keyed session markers | SSE port shared across conversations |
| 5 | Feb 15 | Hook process tree walk | Intermediate cmd.exe not Claude Code |
| 6 | Feb 15 | Parent-child claim awareness | claim_sd() released parent orchestrator |
| 7 | Feb 18 | sd_claims → claude_sessions consolidation | Dual source of truth |
| 8 | Feb 18 | Claim guard hard blocker | 7 collision vectors closed |
| 9 | Feb 20 | Local signal detection | Compacted sessions lose claim |
| 10 | Feb 20 | Redundant claim verification | TOCTOU race in 3-session workflows |
| 11 | Feb 20 | /claim command + stale threshold | Manual inspection/release tooling |
| 12 | Feb 21 | Deterministic session resolution | Heartbeat-based lookup returns wrong session |
| 13 | Feb 21 | resolveOwnSession() before create | Duplicate DB rows after compaction |
| 14 | Feb 22 | PID liveness before stale release | claimGuard steals busy-but-slow sessions |
| 15 | — | **THIS BRAINSTORM** | Local file matching without PID validation |

**Claim System Architecture (current state):**
- Single table: `claude_sessions` (sd_claims dropped Feb 18)
- Partial unique index enforces single active claim per SD
- 5-layer defense: advisory lock → unique index → RPC → verify read-back → cross-path VIEW
- All defenses operate AFTER session identity is resolved from local files

## Analysis

### Arguments For
- **Closes the last pre-DB gap**: All 15 prior fixes hardened the DB path. Local file matching is the only unvalidated entry point.
- **Eliminates 15-minute stale wait**: Crash-then-resume becomes zero-friction if dead sessions detected at resolution time.
- **"Validate at resolution" principle**: Proven by terminal_id consolidation — fixing upstream prevents downstream cascade.
- **Composable primitive**: A `validateSessionFile()` predicate unifies the liveness contract across 3 call sites.

### Arguments Against
- **Naive implementation checks the WRONG PID**: `data.pid` stores `process.ppid` (bash subprocess parent), NOT the Claude Code conversation PID. Checking it would regress to 65-sessions/day.
- **Windows PID reuse**: PIDs recycle in ~32K range. Dead CC process PID reused by unrelated process → false positive → undetectable verified-live inheritance (worse than current behavior).
- **DB conflict adoption path unpatched**: `create_or_replace_session()` returning `conflict` bypasses `findExistingSession()` entirely — a second entry point remains.
- **Failure frequency unknown**: Actual rate of dead-session inheritance hasn't been measured. May be diminishing returns given 15 prior fixes.
- **Most-executed path**: `findExistingSession()` runs at every session startup. Regression cascades everywhere.

## Friction/Value/Risk Analysis

| Dimension | Score | Details |
|-----------|-------|---------|
| Friction Reduction | 6/10 | High impact when triggered (show-stopper requiring DB surgery), but low breadth (crash scenarios only) |
| Value Addition | 7/10 | Eliminates manual intervention, enables instant crash recovery, establishes design principle |
| Risk Profile | 7/10 | Wrong-PID regression, 16th fix in fragile area, no test coverage for target function |
| **Decision** | **HOLD** | (6+7)=13 < (7×2)=14 → Risk outweighs value. Characterize failure frequency first. |

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. `data.pid` is `process.ppid` (bash parent), not Claude Code PID — checking it produces false negatives for live sessions
  2. `cleanupStaleSessions()` already does PID liveness on local files — fix duplicates logic on a different trigger
  3. DB conflict adoption path (`create_or_replace_session` returning `conflict`) bypasses `findExistingSession()` entirely
- **Assumptions at Risk**:
  1. "PID dead = session dead" is false on Windows with PID reuse — creates permanently locked claims
  2. "Fix is additive and safe" — the release-via-RPC side effect creates a race with `create_or_replace_session`
  3. "This closes the loop" — terminal_id instability (the real upstream cause) is not addressed by PID checks
- **Worst Case**: PID reuse converts detectable silent inheritance into undetectable verified-live false positive. Downstream defenses suppressed with higher confidence. Silent corruption instead of visible adoption.

### Visionary
- **Opportunities**:
  1. Transforms defense model from reactive (DB catches it) to deterministic (dead file never enters pipeline)
  2. Enables instant session recovery without 15-minute stale wait — crash recovery becomes first-class
  3. Creates composable `validateSessionFile()` primitive that unifies liveness contract across 3 call sites
- **Synergies**: Reinforces "centralize and apply early" pattern from terminal_id consolidation. Complements `cleanupStaleSessions()` (background sweep becomes last-resort, not primary defense). Sandwiches with claimGuard's DB-side PID check (local file → DB record → no gap).
- **Upside Scenario**: 15-fix saga reframed as layered defense-in-depth architecture. Local case operates without DB involvement for identity. "Validate at resolution" becomes design principle preventing analogous sagas in other subsystems.

### Pragmatist
- **Feasibility**: 3/10 (harder than it appears due to wrong-PID structural issue)
- **Resource Requirements**: 3-5 days for correct implementation. 1 developer with intimate terminal-identity.js knowledge. New test infrastructure needed (filesystem mocks, `isProcessRunning` mocks, format-specific branch tests).
- **Constraints**:
  1. `data.pid` is the wrong PID — must parse CC PID from `terminal_id` format or marker filename
  2. Windows PID reuse makes liveness probabilistic — cannot replace time-based thresholds
  3. Most-executed path in session lifecycle — regression cascades everywhere
- **Recommended Path**: Characterize actual failure rate from DB telemetry BEFORE writing code. Query stale sessions with active claims. Identify which `terminal_id` format produces the inheritance. Target that specific path (likely Priority 2 marker files).

### Synthesis
- **Consensus Points**: Wrong PID in `data.pid` (Challenger + Pragmatist). PID reuse creates false positives (Challenger + Pragmatist). Fix point should be marker file / terminal_id resolution, not `findExistingSession()` directly (Pragmatist + Visionary).
- **Tension Points**: Visionary sees high strategic value; Pragmatist sees 3/10 feasibility. Challenger says fix may regress; Visionary says it severs the failure path.
- **Composite Risk**: Medium-High. Naive fix would regress. Correct fix requires deeper investigation of which identity resolution path produces stale inheritance.

## Open Questions
1. **What is the actual failure frequency?** How often do dead sessions with active claims appear in `claude_sessions`? Query: sessions with `sd_id IS NOT NULL` and stale heartbeat (>30 min).
2. **Which `terminal_id` format produces the inheritance?** UUID (Priority 1), marker file (Priority 2), or `win-cc-{port}-{pid}` (Priority 3)?
3. **Should the marker file cleanup happen in the SessionStart hook?** The `capture-session-id.cjs` hook already writes marker files — should it also clean stale ones from dead PIDs?
4. **Is the DB conflict adoption path (`create_or_replace_session` returning `conflict`) a separate fix?** It bypasses `findExistingSession()` entirely.
5. **Can `terminal_id` generation be made inherently non-colliding?** If new conversations always get unique terminal_ids (e.g., UUID-per-conversation, not port-based), the local file matching problem disappears entirely.

## Triangulation Results (Ground Truth)

### Critical Findings
1. **CLAUDE_SESSION_ID is NOT SET** in the current Bash environment — bug #5489 confirmed. Priority 1 is dead on Windows.
2. **Marker file path (Priority 2) works correctly** — current session uses UUID from `pid-5520.json`.
3. **Found real session file with port-only terminal_id** `win-cc-39623` — confirming the fallback path fires in practice.
4. **None of the three original approaches target the actual failure path.**

### The Actual Failure Path
Inheritance ONLY occurs when `findClaudeCodePid()` fails for two consecutive conversations on the same VS Code window, causing both to get the same port-only `terminal_id` (e.g., `win-cc-39623`).

### Correct Fix: Approach D + E
- **Approach D**: Reject port-only terminal_ids in `findExistingSession()` (~5 LOC) — severs the only confirmed inheritance path
- **Approach E**: Add marker-file-based PID resolution to `findClaudeCodePid()` (~15 LOC) — reduces how often port-only fallback fires
- **Revised Risk Score**: 2/10 (down from 7/10). Decision: **(6+8)=14 > (2×2)=4 → IMPLEMENT**

## Suggested Next Steps
1. **Create SD for Approach D+E** — targeted fix for port-only terminal_id rejection + findClaudeCodePid() reliability
2. **Monitor**: After fix, verify no new session files appear with port-only terminal_id format
3. **Long-term**: Track Claude Code issue #5489 (CLAUDE_ENV_FILE on Windows) for upstream fix

Sources:
- [Claude Code issue #5489 - Environment Variable Substitution](https://github.com/anthropics/claude-code/issues/5489)
- [Windows PID Reuse - The Old New Thing](https://devblogs.microsoft.com/oldnewthing/20110107-00/?p=11803)
