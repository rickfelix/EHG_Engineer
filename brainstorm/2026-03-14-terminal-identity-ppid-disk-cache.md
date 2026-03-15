# Brainstorm: Terminal Identity Instability — ppid-Based Disk Cache

## Metadata
- **Date**: 2026-03-14
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Board of Directors (4/4 seats: CSO, CTO, CRO, COO)
- **Related Ventures**: None (infrastructure/protocol improvement)
- **Prior Brainstorms**:
  - `2026-03-14-terminal-id-collision-fleet-session-identity.md` — identified Method 3 as collision source
  - `2026-03-14-terminal-identity-ancestry-scan-resolution.md` — shipped ancestry-scan fix (PR #2142)
- **Chairman Review**: 3 items reviewed, 3 accepted, 0 flagged, 0 research-needed

---

## Problem Statement
PR #2142 added `_scanMarkersByAncestry()` to `getTerminalId()`, resolving terminal identity collisions. However, the ancestry scan is **intermittent under load** because each Bash tool call spawns a new Node.js process, and the PowerShell call that collects ancestor PIDs can timeout (5s limit) when the system is busy with 2+ concurrent sessions.

When the ancestry scan fails on a given tool call, the worker falls back to `win-pid-{process.pid}` — a unique but **unstable** identifier that changes every tool call. This creates ghost session rows in `claude_sessions`, pollutes the fleet dashboard with phantom workers, and wastes sweep cycles cleaning up sessions that should never have been created.

The identity is correct when it resolves (UUID format), but it's not **stable** — the same worker alternates between UUID and `win-pid-*` across consecutive tool calls depending on whether PowerShell completes in time.

## Discovery Summary

### Observed Symptoms (Live Fleet Session, 2026-03-14)
1. **Dashboard shows 6-8 ghost idle sessions** from a single worker — each with a different `win-pid-*` terminal ID
2. **Same worker alternates** between `e3692bdf-a4bc-4571-b0ae-1302193dd277` (UUID, correct) and `win-pid-32104` (fallback, transient) across consecutive tool calls
3. **`is_alive=false`** on sessions because the PID in the session row (e.g., 32104) was a transient Node process that already exited
4. **Blank terminal IDs** in dashboard — UUID-format terminal IDs don't match the `win-*` pattern the dashboard script expects
5. **Sweep deletes 3-4 coordination messages per cycle** targeting dead/gone sessions that were actually the same worker under a different identity

### Root Cause Chain
1. Claude Code spawns a new bash shell per Bash tool invocation
2. Each bash shell spawns a new Node.js process to run the tool script
3. `getTerminalId()` is called in this fresh Node process — no cache from prior calls
4. `findClaudeCodePid()` attempts PowerShell tree walk (1-3s) — succeeds sometimes, fails under load
5. `_scanMarkersByAncestry()` attempts PowerShell ancestor collection (1-3s) — same issue
6. When both fail → `win-pid-{process.pid}` (unique but unstable, different every call)
7. Session manager creates a NEW session row (different terminal_id) instead of updating the existing one
8. Previous session row becomes orphaned → ghost

### Why PowerShell is Unreliable Under Load
- PowerShell startup on Windows takes 1-3 seconds (CLR initialization)
- Each `getTerminalId()` call may trigger 1-3 PowerShell invocations (tree walk + process scan + ancestor collection)
- With 4+ Claude Code sessions, each making tool calls every 10-30 seconds, PowerShell calls contend for CPU
- The 5-second timeout is generous for single-session but insufficient under fleet load
- `wmic` (lighter weight alternative) is not available on Windows 11 (deprecated)

### Evidence From This Session
```
# Worker heartbeats showing identity alternation:
win-pid-32104 | sd=STAGE-VENTURE-PROVING | status=active | alive=false | hb=3m
win-pid-24640 | sd=none | status=idle | alive=false | hb=3m

# Same workers 5 minutes later (PowerShell succeeded):
win-cc-25096-26148 | sd=STAGE-VENTURE-PROVING | status=active | alive=true | hb=1s
e3692bdf-a4bc-4571-b0ae-1302193dd277 | sd=none | status=idle | alive=false | hb=1s

# Diagnostic from worker terminals confirmed UUID_OK:
Worker 1: TERMINAL_ID=5190776c-6598-4798-8348-6f85645a7fac  FORMAT=UUID_OK
Worker 2: TERMINAL_ID=e3692bdf-a4bc-4571-b0ae-1302193dd277  FORMAT=UUID_OK
```

### Fleet Impact (Coordinator Observations)
- Dashboard degraded from "HEALTHY" to "DEGRADED" due to ghost session count
- Predictions section showed capacity anomalies: "8 idle sessions" when only 2 workers existed
- Sweep spent cycles releasing sessions that were the same worker under different IDs
- Coordination messages sent to dead session IDs (previous identity of a still-active worker)

## Analysis

### Arguments For (ppid-Based Disk Cache)
1. **Eliminates PowerShell from the hot path** — filesystem read (<1ms) replaces PowerShell invocation (1-3s) on all calls after the first successful resolution
2. **`process.ppid` is the correct invariant** — it points to the bash shell spawned by Claude Code for this conversation; all tool calls within the same session share the same ppid
3. **Minimal scope** — ~25 LOC in `getTerminalId()`, ~5 LOC cleanup in `capture-session-id.cjs`
4. **Self-healing** — if the cache file is deleted or corrupted, the next call falls through to the ancestry scan (existing behavior)
5. **Eliminates ghost sessions at the source** — stable identity means session manager updates the SAME row instead of creating new ones

### Arguments Against
1. **PID recycling** — Windows can reuse PIDs after a process exits. A stale cache file from a dead session could be read by a new session whose ppid happens to match. Mitigated by including a timestamp in the cache and cleaning stale files on SessionStart.
2. **Adds filesystem state** — another set of files in `.claude/session-identity/` to manage. The directory already has marker files, so incremental complexity is low.
3. **Masks the upstream bug** — the real fix is Claude Code providing `CLAUDE_ENV_FILE` on Windows (bug #5489). Each workaround reduces pressure to fix upstream.

### Friction/Value/Risk Analysis

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Friction Reduction | 9/10 | Eliminates ghost sessions, dashboard noise, sweep waste, coordination message misdelivery |
| Value Addition | 8/10 | Direct: stable identity. Compound: enables accurate fleet metrics, reliable ETA calculations |
| Risk Profile | 2/10 | Filesystem cache with existing fallback chain. PID recycling mitigated by timestamp guard |
| **Decision** | | **(9+8) > 2x2 = 17 > 4 → Implement** |

## Board of Directors Deliberation

### Round 1: Board Positions

| Seat | Standing Question | Position Summary |
|------|------------------|-----------------|
| CSO | Does this move EHG forward or sideways? | **Forward.** Ghost sessions undermine fleet coordination reliability — the foundational capability for multi-worker architecture. Stable identity is prerequisite to accurate claim tracking, sweeping, and dashboard trust. |
| CTO | What do we already have? What's the real build cost? | **~25 LOC. Sound design.** `process.ppid` is the correct invariant — points to Claude Code's bash shell, stable across all tool calls in a conversation. Filesystem cache turns 1-3s probabilistic call into <1ms deterministic read. Recommends timestamp guard against PID recycling. |
| CRO | What's the blast radius if this fails? | **Positive blast radius.** Ghost sessions cause visible dashboard pollution that erodes operator confidence. 6-8 phantom workers confuse the user into diagnosing non-problems. Fix removes recurring support burden. |
| COO | Can we actually deliver this given current load? | **Yes. 25 LOC, hot-deployable.** Cleanup hook runs once per SessionStart (not per tool call). Confirm `.claude/session-identity/` is gitignored. |

### Judiciary Verdict
- **Board Consensus**: Approved unanimously. The ppid-keyed disk cache converts an unreliable 1-3 second PowerShell call into a deterministic sub-millisecond filesystem read, eliminating the root cause of ghost session proliferation.
- **Key Tension**: None — straightforward scope, minimal risk.
- **Guards**: (1) Include creation timestamp in cache file to protect against PID recycling. (2) Ensure cache directory is gitignored.
- **Escalation**: No.

## Proposed Implementation

### Cache File Format
```
.claude/session-identity/cache-{ppid}.txt
```
Contents: `{sessionId}|{timestamp}`

Example: `5190776c-6598-4798-8348-6f85645a7fac|1710464809226`

### Changes to `lib/terminal-identity.js`

**New Priority 0 (before all existing priorities):**
```javascript
// Priority 0: ppid-keyed disk cache (sub-millisecond, stable across tool calls)
try {
  const cachePath = resolve(__dirname, '../.claude/session-identity', `cache-${process.ppid}.txt`);
  const cached = readFileSync(cachePath, 'utf8').trim();
  const [sessionId, ts] = cached.split('|');
  // Reject if older than 24 hours (PID recycling guard)
  if (sessionId && ts && (Date.now() - Number(ts)) < 86400000) {
    return sessionId;
  }
} catch { /* cache miss — fall through to existing chain */ }
```

**Write cache after successful resolution (any priority that returns a UUID):**
```javascript
// After returning a session UUID, write cache for future tool calls
try {
  const cachePath = resolve(__dirname, '../.claude/session-identity', `cache-${process.ppid}.txt`);
  writeFileSync(cachePath, `${sessionId}|${Date.now()}`);
} catch { /* non-fatal */ }
```

### Changes to `scripts/hooks/capture-session-id.cjs`

**Add cleanup of stale cache files on SessionStart:**
```javascript
// Clean up cache files for dead ppids (same logic as marker cleanup)
const cacheFiles = fs.readdirSync(markerDir)
  .filter(f => f.startsWith('cache-') && f.endsWith('.txt'));
for (const file of cacheFiles) {
  const pidMatch = file.match(/^cache-(\d+)\.txt$/);
  if (pidMatch) {
    try { process.kill(Number(pidMatch[1]), 0); } catch {
      // PID dead — remove stale cache
      try { fs.unlinkSync(path.join(markerDir, file)); } catch {}
    }
  }
}
```

## Out of Scope
- Fixing upstream Claude Code `CLAUDE_ENV_FILE` bug (#5489) — not in our control
- Redesigning the full 4-layer identity fallback chain — this cache makes it tolerable
- Dashboard script changes to display UUID-format terminal IDs — separate cosmetic fix
- Changing PowerShell timeouts or switching to alternative process inspection methods

## Suggested Next Steps
1. Implement ppid-based disk cache in `lib/terminal-identity.js` (~25 LOC)
2. Add stale cache cleanup to `capture-session-id.cjs` SessionStart hook (~5 LOC)
3. Verify `.claude/session-identity/` is in `.gitignore`
4. Test with 2 worker sessions — confirm stable terminal IDs across 10+ consecutive tool calls
5. Monitor fleet dashboard for ghost session elimination
