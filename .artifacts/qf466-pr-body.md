## QF-20260911-466 — unpark had no audited path for an SD parked one handoff short of shipped

Sourced from coordinator finding 23bb8978 (measured on `SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E`): a chairman-approved decision that should have unblocked a resume had no way to actually land it.

### The gap
An SD parked with `status=pending_approval`, `current_phase=LEAD_FINAL` or `PLAN_VERIFICATION` (the normal live state for an SD one handoff short of shipped — `SD-LEO-FIX-GOVERNANCE-AUDIT-LOG-001` and `SD-LEO-FIX-WIRE-SEVEN-RETROSPECTIVE-001` sit here today) had no resume path:
- `unpark --reason` alone refused — `pending_approval` isn't in the unconditional `WORKABLE` list.
- `unpark --reason --restore pending_approval` was **also** refused — the same `WORKABLE` check gates the explicit `--restore` value too.
- The dispatch guard and `claim_sd` independently refuse `status=deferred` as terminal, so the only exits were forcing `--restore active` (a status/phase mismatch the coordinator correctly refused) or a forbidden hand-stamp.

### The fix
Scoped exactly as the ticket specified — **never widen `WORKABLE` itself**. The `8d7007a2` SECURITY review's boundary (`--restore` must itself be workable, closing an unvalidated escalation-to-`completed` path) stays intact for every other phase.

Added `isWorkableForUnpark(status, currentPhase)`: true for the unconditional `WORKABLE` set, OR `pending_approval` specifically at `LEAD_FINAL`/`PLAN_VERIFICATION`. Both the auto-resolve check and the explicit `--restore` validation in `computeUnparkPlan` now call it. `unpark()`'s `SELECT` now also fetches `current_phase` so the check has it to work with.

### Tests
11 new cases in `tests/unit/sd-park.computeUnparkPlan.test.js`:
- Auto-resolves at `LEAD_FINAL` and at `PLAN_VERIFICATION`.
- **Regression guards**: still refuses (both the auto-resolve and the explicit-`--restore` path) at every other phase, and when `current_phase` is missing entirely.
- **Security regression guards**: `--restore completed` is still rejected even at `LEAD_FINAL` (the `8d7007a2` boundary is untouched); the C2 backfill-inferred boundary is untouched.
- Direct `isWorkableForUnpark` coverage.

61/61 passing across the full `sd-park` unit suite (50 pre-existing + 11 new). The DB-tier integration suite is correctly gated in this environment (no designated non-production target), unchanged by this fix.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Mv5M4xjdfTVnASfSRD4yKb
