# Pre-Claim Cadence Gate

**SD**: `SD-LEO-INFRA-PR-CADENCE-PRECLAIM-GATE-001`
**Module**: `lib/cadence/pre-claim-gate.mjs`
**Enforcement points**: `scripts/sd-start.js` (refusal), `scripts/sd-next.js` (badge)

The cadence gate refuses an SD claim while the SD is in a configured stability window between PRs. It is **opt-in by metadata presence** — SDs without cadence metadata are completely unaffected.

## When the gate fires

The gate fires whenever `computeGateState()` returns `active: true`. Gate-state precedence:

| Priority | Source | Inputs | Gate window |
|---|---|---|---|
| 1 | `next_workable_after` | `governance_metadata.next_workable_after` (ISO timestamp) | until that timestamp |
| 2 | `derived_from_session_log` | `governance_metadata.session_log[last].session_ended_at` (or `pr_merged_at`) + `metadata.pr_cadence_minimum_days` (integer) | last activity + N days |
| 3 | `none` | (neither set) | gate inactive |

## Operator-facing UX

`sd-next.js` renders a `[CADENCE-WAIT N days]` magenta badge alongside the SD line, with the reason underneath:

```
[9999] SD-LEO-INFRA-OPUS-HARNESS-PHASE-3-INLINE-SCRIPTS-001 - ... [CADENCE-WAIT 3 days]... READY
        └─ PR cadence: 3 day(s) remaining until 2026-04-28T17:22:25Z
```

`sd-start.js` refuses the claim with the exact override-flag triplet printed verbatim:

```
🚫 PR cadence gate: SD-LEO-INFRA-OPUS-HARNESS-PHASE-3-INLINE-SCRIPTS-001 is in stability window
  source:     next_workable_after
  gate_until: 2026-04-28 (3 day(s) remaining)
  reason:     PR cadence: 3 day(s) remaining until 2026-04-28T17:22:25Z

To bypass with audit trail, supply ALL of:
  --override-cadence-gate "<reason>"
  --pattern-id <PAT-XXX>     (existing issue_patterns row)
  --followup-sd-key <SD-XXX> (alternative; existing strategic_directives_v2 row)
```

Exit code is non-zero on refusal; no claim is acquired.

## Override semantics

The override is **governance-anchored** — it mirrors the `--bypass-validation` shape rule in `scripts/modules/handoff/bypass-rubric.js`. Reason text alone is **not sufficient**. You must supply ONE of:

- `--pattern-id PAT-XXX` — references an existing row in `issue_patterns` (file the pattern first via `/learn`).
- `--followup-sd-key SD-XXX` — references an existing row in `strategic_directives_v2` (create the followup SD first via `node scripts/leo-create-sd.js`).

Together with `--override-cadence-gate "<reason>"` (≥20 chars) the gate emits a row to `audit_log` with `event_type='CADENCE_GATE_OVERRIDE'` and **fail-closed** semantics — if the audit INSERT fails, the claim is also refused (the audit trail is non-negotiable).

Refusals (no override) emit `event_type='CADENCE_GATE_REFUSED'` for telemetry.

## When override is appropriate

The cadence gate exists to enforce a stability-window observation period for multi-PR SDs. Legitimate override scenarios include:

- A pre-existing pattern (filed via `/learn`) explicitly authorizes accelerated cadence (`--pattern-id PAT-XXX`).
- A follow-up SD has been filed to address the cadence concern (`--followup-sd-key SD-XXX`).
- An emergency hotfix where the override reason cites the incident.

Override usage above ~2/month for a single SD class indicates the cadence policy itself needs revisiting — see governance audit query at the end of this doc.

## Setting cadence metadata on an SD

```sql
-- Explicit ISO timestamp form
UPDATE strategic_directives_v2
SET governance_metadata = jsonb_set(
  COALESCE(governance_metadata, '{}'::jsonb),
  '{next_workable_after}',
  '"2026-04-28T17:22:25Z"'::jsonb
)
WHERE sd_key = 'SD-LEO-INFRA-OPUS-HARNESS-PHASE-3-INLINE-SCRIPTS-001';

-- Derived form (recommended for multi-PR SDs)
UPDATE strategic_directives_v2
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{pr_cadence_minimum_days}',
  '3'::jsonb
)
WHERE sd_key = '<SD-KEY>';
```

The `session_log` array is appended to `governance_metadata.session_log` by upstream tooling (e.g., `scripts/one-off/sd-3-cadence-and-new-sd.mjs` is the canonical seeding pattern).

## Programmatic API

```js
import { computeGateState, formatRefusalMessage } from './lib/cadence/pre-claim-gate.mjs';

const gateState = computeGateState({
  governance_metadata: sd.governance_metadata,
  metadata: sd.metadata,
});
// gateState = { active, gate_until, days_remaining, reason, source }

if (gateState.active) {
  console.log(formatRefusalMessage({ sdKey: sd.sd_key, gateState }));
}
```

The function is pure: tolerates undefined `governance_metadata`, undefined `metadata`, missing/empty `session_log`, malformed ISO strings, and non-positive `pr_cadence_minimum_days`. In any of those cases it returns `{ active: false, source: 'none' }`.

## Governance audit queries

```sql
-- All cadence events (refusals + overrides) for a specific SD
SELECT created_at, event_type, severity, metadata
FROM audit_log
WHERE entity_type = 'strategic_directive'
  AND entity_id = '<SD-UUID>'
  AND event_type LIKE 'CADENCE_GATE_%'
ORDER BY created_at DESC;

-- Override frequency per SD (last 30 days)
SELECT entity_id, metadata->>'sd_key' AS sd_key, COUNT(*) AS override_count
FROM audit_log
WHERE event_type = 'CADENCE_GATE_OVERRIDE'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY entity_id, metadata->>'sd_key'
ORDER BY override_count DESC;

-- Refusals on SDs WITHOUT cadence metadata (should be empty — false positive detector)
SELECT a.created_at, a.entity_id, a.metadata->>'sd_key' AS sd_key
FROM audit_log a
JOIN strategic_directives_v2 sd ON sd.id = a.entity_id
WHERE a.event_type = 'CADENCE_GATE_REFUSED'
  AND sd.governance_metadata->>'next_workable_after' IS NULL
  AND (sd.metadata->>'pr_cadence_minimum_days') IS NULL;
```

## Reference

- Source: `lib/cadence/pre-claim-gate.mjs`
- Tests: `scripts/__tests__/cadence-gate.test.js` (16 cases)
- Canonical override shape pattern: `scripts/modules/handoff/bypass-rubric.js::validateBypassShape`
- Live cadence-gated SD (smoke fixture): `SD-LEO-INFRA-OPUS-HARNESS-PHASE-3-INLINE-SCRIPTS-001`
