---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Validation Gate Registry

**SD**: SD-LEO-INFRA-VALIDATION-GATE-REGISTRY-001

## Overview

The validation gate registry (`validation_gate_registry` table) provides database-first control over which validation gates apply to each SD type. Instead of hardcoding gate exemptions in JavaScript files, policies are defined as database rows.

## Zero-Code SD Type Configuration

To configure gate policies for a new SD type (e.g., `spike`), insert registry rows:

```sql
-- Disable PRD requirement for spike SDs
INSERT INTO validation_gate_registry (gate_key, sd_type, applicability, reason)
VALUES ('GATE_PRD_EXISTS', 'spike', 'DISABLED', 'Spike SDs skip PRD - time-boxed exploration');

-- Disable design/database validation
INSERT INTO validation_gate_registry (gate_key, sd_type, applicability, reason)
VALUES ('GATE1_DESIGN_DATABASE', 'spike', 'DISABLED', 'Spike SDs skip design/db validation');

-- Disable architecture verification
INSERT INTO validation_gate_registry (gate_key, sd_type, applicability, reason)
VALUES ('GATE_ARCHITECTURE_VERIFICATION', 'spike', 'DISABLED', 'Spike SDs skip arch verification');

-- Disable exploration audit
INSERT INTO validation_gate_registry (gate_key, sd_type, applicability, reason)
VALUES ('GATE_EXPLORATION_AUDIT', 'spike', 'DISABLED', 'Spike SDs skip exploration audit');
```

No code changes needed. BaseExecutor will query the registry and skip disabled gates.

## Policy Precedence

When multiple policies match, the most specific wins:

1. `gate_key + sd_type + validation_profile` (most specific)
2. `gate_key + sd_type` (type-level policy)
3. `gate_key + validation_profile` (profile-level policy)
4. No match → gate is included (fail-open)

## Applicability Values

| Value | Behavior |
|-------|----------|
| `REQUIRED` | Gate must execute (default if no policy exists) |
| `OPTIONAL` | Gate executes but failure is non-blocking |
| `DISABLED` | Gate is excluded from the gate set entirely |

## Feature Flag

- `FF_GATE_POLICY_REGISTRY` - Set to `false` to disable registry (all gates use hardcoded behavior)
- Default: enabled (`true`)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FF_GATE_POLICY_REGISTRY` | `true` | Enable/disable registry |
| `GATE_POLICY_DB_TIMEOUT_MS` | `200` | DB query timeout |
| `GATE_POLICY_CACHE_TTL_SECONDS` | `60` | Policy cache TTL |

## Querying Current Policies

```sql
-- View all policies
SELECT gate_key, sd_type, validation_profile, applicability, reason
FROM validation_gate_registry
ORDER BY gate_key, sd_type;

-- View policies for a specific SD type
SELECT gate_key, applicability, reason
FROM validation_gate_registry
WHERE sd_type = 'uat'
ORDER BY gate_key;

-- Count disabled gates per SD type
SELECT sd_type, COUNT(*) as disabled_gates
FROM validation_gate_registry
WHERE applicability = 'DISABLED'
GROUP BY sd_type
ORDER BY disabled_gates DESC;
```

## Known Gate Keys

| Gate Key | Purpose |
|----------|---------|
| `GATE_PRD_EXISTS` | Verifies PRD exists |
| `GATE1_DESIGN_DATABASE` | Design/Database sub-agent validation |
| `GATE_ARCHITECTURE_VERIFICATION` | Architecture verification |
| `GATE_EXPLORATION_AUDIT` | Exploration audit |
| `GATE6_BRANCH_ENFORCEMENT` | Git branch enforcement |
| `GATE_SD_START_PROTOCOL` | Protocol file read enforcement |
| `GATE_PROTOCOL_FILE_READ` | Phase-specific protocol file read |
| `PREREQUISITE_HANDOFF_CHECK` | Prerequisite handoff chain |
| `BMAD_PLAN_TO_EXEC` | BMAD validation |
| `GATE_CONTRACT_COMPLIANCE` | Parent contract compliance |
| `GATE_INFRASTRUCTURE_CONSUMER_CHECK` | Infrastructure consumer check |
| `GATE_INTEGRATION_SECTION_VALIDATION` | PRD integration section |
| `GATE_DELIVERABLES_PLANNING` | Deliverables planning check |

## Monitoring

The gate policy resolver emits structured log events:

```
[GatePolicyResolver] DISABLED: GATE_PRD_EXISTS (sd_type: UAT SDs exempt from PRD...)
[GatePolicyResolver] 3 gate(s) disabled by policy for sd_type='uat'
[GatePolicyResolver] DB unavailable - using default gate set (fallback #1)
```

Metrics available via `getGatePolicyMetrics()`:
- `dbFallbackTotal` - Count of DB unavailable fallbacks
- `disabledGateTotal` - Count of gates disabled by policy
- `resolutionCount` - Total policy resolutions performed
