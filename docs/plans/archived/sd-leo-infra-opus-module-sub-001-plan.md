<!-- Archived from: docs/plans/opus47-module-c-subagent-evidence-gate-plan.md -->
<!-- SD Key: SD-LEO-INFRA-OPUS-MODULE-SUB-001 -->
<!-- Archived at: 2026-04-24T20:15:13.891Z -->

# SD — Opus 4.7 Module C: Sub-Agent Evidence Gate (DB-enforced)

## Type
infrastructure

## Priority
high

## Problem

Opus 4.7 defaults to fewer sub-agent spawns than 4.6. Prompt-level guidance ("use sub-agents", "consider invoking the validation-agent") is opt-out under 4.7's literal-instruction profile. In a 48-hour window (2026-04-22 → 2026-04-24), 5 sub-agent-skip incidents (Category B) were observed: handoffs were submitted without a fresh `sub_agent_execution_results` row, gates scored on SD metadata alone, and silent false-passes occurred.

`SD-LEO-FIX-PLAN-OPUS-HARNESS-001` (shipped 2026-04-24) addressed the *wording* — Module A2 rewrote the session-prologue rule from "Use sub-agents" to "Sub-agent evidence required at every handoff". But the gate itself still doesn't enforce the rule: it doesn't query `sub_agent_execution_results` for a freshness check. Until the enforcement lands in `handoff.js`, the Module A2 rule remains a soft prompt, not a hard stop.

## Scope Context

Three interlocking pieces:

1. **`scripts/handoff.js` precheck** — add a new gate `SUBAGENT_EVIDENCE_MISSING` that queries `sub_agent_execution_results` for rows matching (sd_id = current SD) AND (created_at >= current phase started_at) AND (sub_agent_code IN requiredSet[handoffType]).
2. **CLAUDE.md rule** — upgrade the Module A2 wording with the enforcement behavior (handoff returns `SUBAGENT_EVIDENCE_MISSING` if no row). This is a DB section update, not a router code change.
3. **Required sub-agent map** — codify the minimal evidence set per handoff type, initially matching the existing Plan agents list.

## Functional Requirements

### FR-1 — Required Sub-Agent Map
In `scripts/modules/handoff/gates/`, add a new gate file:

```javascript
const REQUIRED_SUBAGENTS = {
  'LEAD-TO-PLAN':  ['validation-agent', 'Explore'],
  'PLAN-TO-EXEC':  ['testing-agent'],
  'EXEC-TO-PLAN':  ['testing-agent', 'security-agent'],
  'PLAN-TO-LEAD':  ['retro-agent'],
  'LEAD-FINAL-APPROVAL': []
};
```

The map should live in a module-level constant, loadable by other gates and by `/claim` / `/leo settings` for visibility.

### FR-2 — Gate Query
For each `handoffType`, query:
```sql
SELECT sub_agent_code, MAX(created_at) AS last_run
FROM sub_agent_execution_results
WHERE sd_id = :sdUuid
  AND created_at >= :currentPhaseStartedAt
GROUP BY sub_agent_code;
```
Compare the returned set against `REQUIRED_SUBAGENTS[handoffType]`. Return `{passed: false, reason: 'SUBAGENT_EVIDENCE_MISSING', missing: [...]}` if any required agent has no fresh row.

### FR-3 — Phase Start Timestamp
Resolve `currentPhaseStartedAt` from:
- `sd_phase_handoffs.accepted_at` of the most recent accepted handoff INTO the current phase
- Fallback to `strategic_directives_v2.created_at` for LEAD

Cache in `ctx._phaseStartedAt` for downstream gates to reuse.

### FR-4 — CLAUDE.md Rule Update
Update `leo_protocol_sections` row id=209 (session_prologue, Module A2 text from SD-LEO-FIX-PLAN-OPUS-HARNESS-001) to add the enforcement clause: `Handoff returns SUBAGENT_EVIDENCE_MISSING if the required set is not present.`

### FR-5 — Regression Test
`tests/handoff-gates/subagent-evidence-gate.test.js`:
- Empty `sub_agent_execution_results` → FAIL with correct missing list
- Partial match (1 of 2 required) → FAIL listing only the missing one
- All required fresh rows → PASS
- Stale row (before phase start) → FAIL (treated as missing)

## Technical Approach

1. Write gate module `scripts/modules/handoff/gates/subagent-evidence-gate.js` following the pattern in `protocol-file-read-gate.js`.
2. Register in each handoff executor (`scripts/modules/handoff/executors/<phase>/gates.js` or equivalent).
3. Update `leo_protocol_sections` row 209 via migration.
4. Regen CLAUDE.md; drift-cleanup unrelated files per memory.
5. Tests + smoke.

## Scope

**in_files:**
- `scripts/modules/handoff/gates/subagent-evidence-gate.js` (new)
- `scripts/modules/handoff/executors/lead-to-plan/gates.js` (registration)
- `scripts/modules/handoff/executors/plan-to-exec/gates.js` (registration)
- `scripts/modules/handoff/executors/exec-to-plan/gates.js` (registration)
- `scripts/modules/handoff/executors/plan-to-lead/gates.js` (registration)
- `database/migrations/YYYYMMDD_opus47_module_c_subagent_evidence_gate.mjs` (new)
- `tests/handoff-gates/subagent-evidence-gate.test.js` (new)

**out_files:**
- Any file outside the above.

## Acceptance Criteria

1. `SUBAGENT_EVIDENCE_MISSING` fails closed: a handoff with no `sub_agent_execution_results` rows must fail the gate, not silently pass.
2. All 4 handoff types have entries in `REQUIRED_SUBAGENTS`.
3. CLAUDE.md session_prologue Module A2 text includes the enforcement clause.
4. Regression test covers happy path + all 3 failure modes.
5. No false positives on handoffs that were run correctly (verified by replaying recent shipped SDs against the new gate).

## Non-Goals

- Adding NEW required sub-agents beyond the current Plan-approved set.
- Changing how sub-agents are invoked (that's `pre-tool-enforce.cjs` territory).
- Retroactively failing already-accepted handoffs.

## References

- Source analysis: `.claude/session-module-refactor-opus47.md` Module C
- Parent SD: SD-LEO-FIX-PLAN-OPUS-HARNESS-001 (shipped 2026-04-24)
- Memory: `feedback_lead_skip_subagent_invocations.md`
- Memory: `feedback_rca_agent_mandatory_on_any_issue.md`

## Size Estimate

200–300 LOC across gate module + registrations + migration + test. Tier 3 — full SD workflow.
