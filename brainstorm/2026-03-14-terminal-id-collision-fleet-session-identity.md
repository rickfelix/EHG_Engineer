# Brainstorm: Terminal_ID Collision in Fleet Session Identity

## Metadata
- **Date**: 2026-03-14
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Board of Directors (4/4 seats: CSO, CTO, CRO, COO)
- **Related Ventures**: None (infrastructure/protocol improvement)
- **Chairman Review**: 3 items reviewed, 3 accepted, 0 flagged, 0 research-needed

---

## Problem Statement
Two Claude Code sessions running on the same machine resolve to the same `terminal_id` via the marker file fallback in `lib/terminal-identity.js`. When `findClaudeCodePid()` Method 3 (marker file fallback, lines 122-134) fires, it picks the **newest alive PID marker file** — which is the same file for all sessions. Both sessions then share the same `session_id` in the database, allowing both to "own" the same SD claim. Neither session knows the other exists.

This is distinct from the orchestrator auto-routing issue fixed in QF-20260314-250/PR #2135, which added preflight visibility. This bug is deeper: the identity layer itself produces collisions.

## Discovery Summary

### Root Cause Chain
1. `CLAUDE_SESSION_ID` env var (Priority 1) is broken on Windows — `CLAUDE_ENV_FILE` doesn't propagate to Bash tool subprocesses (Claude Code bug #5489)
2. PID marker file lookup (Priority 2) calls `findClaudeCodePid()` which tries 3 methods:
   - Method 1: Process tree walk (fails with orphaned bash shells)
   - Method 2: Process scan for SSE port (non-deterministic with 3+ sessions sharing port 25096)
   - **Method 3: Marker file fallback — picks newest alive PID, which is the SAME for all sessions**
3. Both sessions resolve to same terminal_id → same session record → same SD claim → collision

### Evidence
- All 8 PID marker files in `.claude/session-identity/` share `sse_port: 25096`
- Tree walk fails frequently on Windows (orphaned bash shells from Bash tool)
- Process scan returns first matching PID among 5+ alive processes — non-deterministic
- Live collision observed: both sessions reported `"Reusing session session_7dbbb10e_win25036_33180 via terminal_id"`

### Prior Art
- **QF-20260314-250/PR #2135**: Fixed orchestrator auto-routing (different bug — added preflight visibility, explicit sd:start requirements)
- **Session adoption in session-manager.mjs**: Existing collision guard rejects port-only terminal_ids
- **isSameConversation() in claim-guard.mjs**: Handles ambiguous matches with PID liveness checks
- **Related brainstorm**: "Claim/Auto-Proceed/Chaining Integration" (2026-03-13)

## Analysis

### Arguments For
1. **Fleet isolation integrity** — the claim system is the ONLY mechanism preventing duplicate work across 3 concurrent sessions
2. **Root cause elimination** — Method 3 in `findClaudeCodePid()` is fundamentally flawed: "newest alive PID" ≠ "my ancestor PID"
3. **Negative LOC** — CTO's recommended fix deletes 18 lines and adds 0. Reduces complexity.
4. **Zero downtime** — hot-deployable, no fleet restart needed
5. **Eliminates cascading failures** — CRO identified 3 failure chains (phase corruption, claim theft, orchestrator completion corruption)

### Arguments Against
1. **Third claim-system fix in 3 weeks** — suggests architectural review needed, not just another point fix
2. **Process tree walk is inherently fragile** — even with Method 3 removed, Methods 1 and 2 have their own failure modes
3. **Long-term fix requires upstream Claude Code change** — `CLAUDE_ENV_FILE` bug #5489 needs fixing for Priority 1 identity to work

### Friction/Value/Risk Analysis

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Friction Reduction | 9/10 | 15-30 min lost per collision incident, affects every fleet session cycle |
| Value Addition | 8/10 | Direct: fleet isolation. Compound: simplifies 500+ LOC of defensive code |
| Risk Profile | 2/10 | Removing broken code path, existing test coverage, hot-deployable |
| **Decision** | | **(9+8) > 2×2 = 17 > 4 → Implement** |

## Board of Directors Deliberation

### Round 1: Board Positions

| Seat | Standing Question | Position Summary |
|------|------------------|-----------------|
| CSO | Does this move EHG forward or sideways? | **Forward, unambiguously.** This is structural integrity of the parallel execution model. The 500+ LOC of defensive workaround code across 9 files exists because identity can't make a definitive determination. Fix the foundation. |
| CTO | What do we already have? What's the real build cost? | **Delete Method 3 from findClaudeCodePid(). -18 LOC, 0 added.** The marker file approach has a circular dependency: "need PID to find marker, need marker to find PID." Returning null is safer than returning wrong-but-confident PID. |
| CRO | What's the blast radius if this fails? | **CRITICAL. 3 cascading failure chains identified.** Silent data corruption, fleet velocity degradation, compounding workaround complexity. Zero monitoring exists today. |
| COO | Can we actually deliver this given current load? | **Yes. QF Tier 2 (~35 LOC). Hot-deployable, zero downtime.** Three existing mitigations already active. Only DB-level adoption leaks through. |

### Key Rebuttals
- **CSO vs COO**: CSO wants full SD to also eliminate `'ambiguous'` code path. COO counters that a QF ships today and a systemic brainstorm follows.
- **CTO Option A vs Option B**: CTO recommends Option A (delete Method 3, -18 LOC) over Option B (add ancestry verification, +15 LOC). Both eliminate the collision. A is simpler.

### Judiciary Verdict
- **Board Consensus**: Fix the generation side (terminal-identity.js). Delete Method 3. Ship as QF.
- **Key Tension**: QF now + systemic review later (COO) vs full SD now (CSO). Resolved: QF ships immediately, systemic brainstorm scheduled for claim architecture simplification.
- **Recommendation**: QF Tier 2. Delete Method 3 from findClaudeCodePid(). Add terminal_id collision monitoring.
- **Escalation**: No — unanimous on direction, minor disagreement on scope.

## Suggested Next Steps
1. Create QF to delete Method 3 from `findClaudeCodePid()` in `lib/terminal-identity.js`
2. Add terminal_id collision detector query to claim health monitoring
3. Schedule follow-up brainstorm: "Claim Identity Architecture Simplification" (address the 4-layer fallback chain)
4. Track upstream Claude Code bug #5489 (CLAUDE_ENV_FILE on Windows) for long-term Priority 1 identity fix

## Out of Scope
- Fixing upstream Claude Code `CLAUDE_ENV_FILE` bug (#5489) — not in our control
- Redesigning the entire 4-layer identity fallback chain — separate brainstorm
- Adding new monitoring infrastructure — QF scope limited to the fix
