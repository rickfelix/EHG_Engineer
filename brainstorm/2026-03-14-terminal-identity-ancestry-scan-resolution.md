# Brainstorm: Terminal Identity Ancestry-Scan Resolution

## Metadata
- **Date**: 2026-03-14
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD (shipped — PR #2142)
- **Team Analysis**: Board of Directors (4/4 seats: CSO, CTO, CRO, COO)
- **Related Ventures**: None (infrastructure/protocol improvement)
- **Prior Brainstorm**: `2026-03-14-terminal-id-collision-fleet-session-identity.md` (recommended Method 3 deletion)
- **Chairman Review**: 3 items reviewed, 3 accepted, 0 flagged, 0 research-needed

---

## Problem Statement
PR #2141 deleted Method 3 (marker file fallback) from `findClaudeCodePid()` per the prior brainstorm's recommendation. However, terminal identity collisions persisted because the ROOT fallback at line 232 of `lib/terminal-identity.js` returned `win-cc-${ssePort}` — a value shared across all Claude Code instances on the same machine. Multiple workers overwrote each other's `claude_sessions` row, making the fleet dashboard show only 1 worker when 2+ were active.

This is a **follow-up resolution** to the original brainstorm, addressing the layer the prior fix did not reach.

## Discovery Summary

### Root Cause Chain (Full Depth)
1. `CLAUDE_SESSION_ID` env var (Priority 1) — broken on Windows. `CLAUDE_ENV_FILE` is empty, so the SessionStart hook cannot inject the session ID into the Bash tool environment.
2. PID marker file lookup (Priority 2) — calls `findClaudeCodePid()` which returns null when both tree walk and process scan fail. Without a CC PID, the marker file lookup is skipped entirely.
3. `win-cc-${ssePort}-${ccPid}` (Priority 2b) — also requires `findClaudeCodePid()` to succeed. Skipped.
4. **`win-cc-${ssePort}` (line 232)** — the ROOT fallback. Shared across ALL instances on the same SSE port. This is where the collision occurs.

### Key Insight
The SessionStart hook (`capture-session-id.cjs`) successfully writes unique `pid-*.json` marker files for each session. The markers contain the correct session UUID. The problem was that `getTerminalId()` used `findClaudeCodePid()` as a **gatekeeper** for marker access — if CC PID lookup failed, the markers were never checked, regardless of whether they existed and were correct.

### Evidence
- Diagnostic dump showed process chain: `node(hook) → bash → bash → bash → node(Claude Code) → cmd.exe → powershell.exe → Cursor.exe`
- `findClaudeCodePid()` tree walk succeeds for coordinator session (parent is cmd.exe) but fails for some worker sessions (different process chain structure)
- Marker files in `.claude/session-identity/` contained correct, unique session UUIDs for each Claude Code PID
- Both workers returned `win-cc-25096` as terminal ID, confirmed via DB query showing single active session row being overwritten

### Prior Art
- **PR #2141**: Deleted Method 3 marker file fallback from `findClaudeCodePid()` (necessary but insufficient)
- **Prior brainstorm**: `2026-03-14-terminal-id-collision-fleet-session-identity.md` — identified Method 3 as the collision source, recommended deletion
- **Claude Code bug #5489**: `CLAUDE_ENV_FILE` not propagated to Bash tool subprocesses on Windows

## Analysis

### Arguments For
1. **Bypasses the gatekeeper** — ancestry scan matches markers without requiring `findClaudeCodePid()` to succeed, eliminating the circular dependency
2. **Reuses existing infrastructure** — no new marker files, no new hooks, no schema changes. Just a new lookup path for existing data
3. **Defense-in-depth** — final fallback changed from shared `win-cc-{port}` to unique `win-pid-{pid}`, ensuring collisions are impossible even if all marker-based lookups fail
4. **Minimal blast radius** — only affects the Windows terminal-ID resolution path in `getTerminalId()`

### Arguments Against
1. **Additional PowerShell call** — `_getAncestorPids()` makes a fresh PowerShell invocation, adding ~1-2s latency on first call per session
2. **Masks upstream bug** — the real fix should be Claude Code providing `CLAUDE_ENV_FILE` on Windows (bug #5489). This workaround reduces pressure to fix upstream
3. **Process tree assumptions** — ancestry matching assumes Claude Code PID is always in the ancestor chain. Edge cases (e.g., detached processes) could break this

### Friction/Value/Risk Analysis

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Friction Reduction | 9/10 | Eliminates all known terminal identity collisions on Windows multi-session |
| Value Addition | 8/10 | Direct: fleet isolation works. Compound: removes need for workarounds in claim system |
| Risk Profile | 2/10 | Narrowly scoped, reuses existing markers, defense-in-depth fallback prevents regressions |
| **Decision** | | **(9+8) > 2x2 = 17 > 4 -> Implement (SHIPPED)** |

## Board of Directors Deliberation

### Round 1: Board Positions

| Seat | Standing Question | Position Summary |
|------|------------------|-----------------|
| CSO | Does this move EHG forward or sideways? | **Forward.** Fleet coordination reliability is a prerequisite for multi-session parallelism, which is core to EHG's operational model. Closes the last known identity-collision vector on Windows. |
| CTO | What do we already have? What's the real build cost? | **Reuses existing marker infrastructure.** The ancestry-scan approach walks the PID tree and matches against SessionStart markers already in place. Build cost minimal — gap was purely in the lookup path. PowerShell latency acceptable (runs once per session). |
| CRO | What's the blast radius if this fails? | **Narrow and positive.** Only affects Windows terminal-ID resolution. No schema/API/external changes. Prior behavior was already broken — any session that previously collided now correctly isolates. |
| COO | Can we actually deliver this given current load? | **Already shipped (PR #2142).** Root cause chain was well-documented from prior brainstorm. Fix builds on existing hook markers, requires no migration or configuration changes. |

### Judiciary Verdict
- **Board Consensus**: The fix correctly identified that PR #2141's deletion of Method 3 was necessary but insufficient — the shared root fallback was the true remaining collision source.
- **Key Tension**: None — unanimous post-hoc approval. Minor note from CTO about monitoring PowerShell latency.
- **Recommendation**: Shipped. Monitor for edge cases in detached process scenarios.
- **Escalation**: No.

## The Fix (PR #2142)

### Changes to `lib/terminal-identity.js`

**1. Added `_getAncestorPids()` function**
Collects ALL ancestor PIDs via a single PowerShell call. Unlike `findClaudeCodePid()`, this doesn't try to identify WHICH ancestor is Claude Code — it returns the full set for marker file matching.

**2. Added `_scanMarkersByAncestry(ssePort)` function**
Scans all `pid-*.json` marker files in `.claude/session-identity/` and checks if any marker's PID is in the current process's ancestry chain. Optionally filters by SSE port to avoid cross-window confusion.

**3. Updated `getTerminalId()` resolution order**
- Priority 1: `CLAUDE_SESSION_ID` env var (unchanged — still broken on Windows)
- Priority 2: Marker file by CC PID (unchanged — still requires `findClaudeCodePid()`)
- **Priority 3 (NEW): Ancestry-based marker scan** — bypasses CC PID gatekeeper
- Priority 4: `win-cc-${ssePort}-${ccPid}` (unchanged)
- **Final fallback (CHANGED): `win-pid-${process.pid}`** instead of shared `win-cc-${ssePort}`

### Verification
```
$ node -e "import('./lib/terminal-identity.js').then(m => console.log(m.getTerminalId()))"
fc35b4ec-9331-456c-baef-3397e3ec936a   # Unique session UUID, not shared port
```

## Out of Scope
- Fixing upstream Claude Code `CLAUDE_ENV_FILE` bug (#5489) — not in our control
- Redesigning the 4-layer identity fallback chain — separate future brainstorm
- Adding terminal_id collision monitoring — deferred to fleet health improvements

## Suggested Next Steps
1. Restart worker sessions to pick up the fix from main
2. Verify fleet dashboard shows distinct workers with unique terminal IDs
3. Track upstream Claude Code bug #5489 for eventual Priority 1 identity fix
4. Consider future brainstorm on simplifying the identity resolution chain (4 layers → 2)
