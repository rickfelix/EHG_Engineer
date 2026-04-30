# brainstorm_sessions.metadata Convention

**Status**: Active | **Source SD**: SD-LEO-INFRA-BRAINSTORM-SOURCE-TRUTH-CHECK-001 | **Validator version**: 1.0.0

`brainstorm_sessions.metadata` is JSONB and free-form at the schema layer. This document defines the conventional keys consumed by `scripts/eva/brainstorm-pre-check.mjs` and `scripts/eva/brainstorm-auto-file.mjs`. Tools tolerate absence; malformed shapes are rejected with explicit error messages (no partial state).

## Keys

### `companion_sds_to_file` (array, optional)

Declared SDs the brainstorm wants auto-filed when an architecture plan upserts. Each entry MUST have all six keys.

```json
"companion_sds_to_file": [
  {
    "title": "S22 Distribution Setup gate banner",
    "sd_type": "infrastructure",
    "priority": "high",
    "scope": "Add suppression banner to Stage22DistributionSetup.tsx surfacing pending router decisions.",
    "rationale": "Brainstorm 3fa31151 panel #1 flagged S22 missing gate UI; needs structural fix.",
    "target_application": "EHG"
  }
]
```

| Key | Type | Allowed values |
| --- | --- | --- |
| `title` | string | non-empty |
| `sd_type` | string | `feature`, `bugfix`, `enhancement`, `infrastructure`, `documentation`, `security`, `database`, `refactor`, `corrective`, `orchestrator` |
| `priority` | string | `critical`, `high`, `medium`, `low` |
| `scope` | string | non-empty |
| `rationale` | string | non-empty |
| `target_application` | string | `EHG`, `EHG_Engineer` |

**Rejection example** (malformed entry — missing `priority`):
```
Malformed companion_sds_to_file: entry [1] missing required keys: priority
  offending: {"title":"X","sd_type":"infrastructure","scope":"...","rationale":"...","target_application":"EHG"}
  expected: title: string; sd_type: string ∈ {feature, bugfix, enhancement, infrastructure, ...}; priority: string ∈ {critical, high, medium, low}; ...
```

Auto-filer exits with code 1 and INSERTs zero rows on rejection.

### `companion_sds_filed` (array, written by auto-filer)

Output of `brainstorm-auto-file.mjs`. One entry per `companion_sds_to_file` request, recording outcome.

```json
"companion_sds_filed": [
  { "requested_title": "S22 Distribution Setup gate banner", "actual_sd_key": "SD-BRAINSTORM-INFRASTRUCTURE-S22-GATE-001", "status": "filed" },
  { "requested_title": "AI-gen guardrails", "actual_sd_key": "SD-BRAINSTORM-INFRASTRUCTURE-AI-GEN-001", "status": "skipped_duplicate" }
]
```

`status` ∈ `filed` | `skipped_duplicate` | `failed` | `dry_run_would_file`.

### `source_truth_claims` (array, optional, read by pre-check)

Concrete factual claims the brainstorm makes that should be verified against repo + DB state. Each claim has a `type` and type-specific fields. Pre-check tolerates absence (returns 0/0 passed).

```json
"source_truth_claims": [
  { "type": "gate_type", "stage_number": 22, "expected_gate": "kill" },
  { "type": "file_path", "path": "src/components/stages/Stage22DistributionSetup.tsx" },
  { "type": "line_content", "path": "src/config/venture-workflow.ts", "line": 276, "expected_excerpt": "gateType: 'kill'" },
  { "type": "table_exists", "table": "brainstorm_sessions" },
  { "type": "column_exists", "table": "brainstorm_sessions", "column": "metadata" }
]
```

Registered claim types: `file_path`, `gate_type`, `line_content`, `table_exists`, `column_exists`. Unknown types produce a warning entry in the drift report (not a hard error) so brainstorms can declare aspirational claims for future validators without breaking.

### `source_truth_check_status` (string, written by pre-check)

Enum: `passed` | `failed` | `skipped` | `bypassed_with_reason`. Set by `brainstorm-pre-check.mjs --write-back`.

### `source_truth_drift_report` (object, written by pre-check)

```json
{
  "checked_at": "2026-04-27T18:00:00Z",
  "validator_version": "1.0.0",
  "claims_total": 5,
  "claims_passed": 3,
  "claims_failed": 2,
  "drift_entries": [
    {
      "claim": { "type": "gate_type", "stage_number": 22, "expected_gate": "kill" },
      "expected": "Stage 22 (Distribution Setup) gateType='kill'",
      "observed": "Stage 22 (Distribution Setup) gateType='none'",
      "source_path": "<path>/ehg/src/config/venture-workflow.ts",
      "line_number": 270,
      "severity": "error",
      "remediation_hint": "Brainstorm claim is wrong. Either (a) update brainstorm to reflect actual gateType='none', or (b) change venture-workflow.ts (with proper SD)...",
      "validator_id": "gate-type-claim-validator"
    }
  ]
}
```

`severity` ∈ `error` | `warning` | `info`. Drift with `severity=error` blocks upsert in archplan-command unless `--bypass-source-truth-check '<reason ≥10 chars>'` is supplied.

## Audit log shape

All writes use the canonical `audit_log` schema (event_type, entity_type='brainstorm_session', entity_id=brainstorm UUID, metadata=payload, severity, created_by). Event types:

| event_type | severity | When |
| --- | --- | --- |
| `BRAINSTORM_PRE_CHECK_RUN` | info | Each pre-check invocation (planned for future telemetry) |
| `BRAINSTORM_AUTO_FILE_SD` | info / error | Per companion SD attempt (filed / skipped_duplicate / failed) |
| `BRAINSTORM_SOURCE_TRUTH_BYPASS` | warning | `--bypass-source-truth-check` accepted with reason |

## Feature flag

`BRAINSTORM_PRE_CHECK_ENABLED=true` enables the archplan-command integration (default OFF for ramp-up). Standalone CLI invocation (`brainstorm-pre-check.mjs --brainstorm-id <uuid>`) ignores the flag.
