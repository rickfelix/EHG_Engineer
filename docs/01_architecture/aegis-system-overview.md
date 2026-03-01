---
category: architecture
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [architecture, auto-generated]
---
# AEGIS System Architecture Overview

## Metadata
- **Category**: Architecture
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: DOCMON Sub-Agent
- **Last Updated**: 2026-01-24
- **Tags**: aegis, governance, infrastructure, architecture
- **SD**: SD-AEGIS-GOVERNANCE-001
- **Related Docs**:
  - [AEGIS API Documentation](../02_api/aegis-endpoints.md)
  - [AEGIS Database Schema](../database/aegis-schema.md)
  - [AEGIS CLI Guide](../reference/aegis-cli-guide.md)

## Overview

AEGIS (Autonomous Enforcement and Governance Integration System) is a unified database-first governance framework that consolidates 7 previously disparate governance systems into a single, coherent architecture. It provides real-time rule enforcement, comprehensive audit logging, and backward compatibility with existing systems through an adapter pattern.

**Key Achievement**: Replaces 7 hardcoded governance frameworks with a single database-driven system, eliminating configuration drift and enabling runtime rule updates without code deployment.

## Table of Contents

- [System Architecture](#system-architecture)
- [Core Components](#core-components)
- [Database Schema](#database-schema)
- [Validator Types](#validator-types)
- [Adapter Pattern](#adapter-pattern)
- [Feature Flags](#feature-flags)
- [Enforcement Engine](#enforcement-engine)
- [Performance & Caching](#performance-caching)

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AEGIS Architecture                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────┐          ┌───────────────┐             │
│  │  Legacy Code  │          │   New Code    │             │
│  │  (Existing)   │          │  (AEGIS-aware)│             │
│  └───────┬───────┘          └───────┬───────┘             │
│          │                          │                      │
│          │  Uses Adapters           │  Direct Integration  │
│          │                          │                      │
│  ┌───────▼──────────────────────────▼─────────┐           │
│  │      AEGIS Core Enforcement Engine          │           │
│  │  - AegisEnforcer                            │           │
│  │  - AegisRuleLoader (with cache)             │           │
│  │  - AegisViolationRecorder                   │           │
│  └──────────────────┬──────────────────────────┘           │
│                     │                                       │
│          ┌──────────▼───────────┐                          │
│          │   6 Validator Types   │                          │
│          │ - FieldCheck          │                          │
│          │ - Threshold           │                          │
│          │ - RoleForbidden       │                          │
│          │ - CountLimit          │                          │
│          │ - Custom              │                          │
│          └──────────┬────────────┘                          │
│                     │                                       │
│  ┌──────────────────▼──────────────────────────┐           │
│  │          Database Layer (Supabase)          │           │
│  │  - aegis_constitutions (7 frameworks)       │           │
│  │  - aegis_rules (45+ rules)                  │           │
│  │  - aegis_violations (audit log)             │           │
│  │  - RLS policies (append-only)               │           │
│  └─────────────────────────────────────────────┘           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Database-First**: All governance configuration lives in database tables, not code or config files
2. **Append-Only**: Rules and constitutions are versioned, never deleted (Chesterton's Fence principle)
3. **Separation of Concerns**: Enforcer, Loader, Recorder, and Validators have distinct responsibilities
4. **Backward Compatibility**: Adapters maintain existing API contracts while routing to AEGIS
5. **Performance**: Multi-layer caching (in-memory + 5min TTL) minimizes database queries
6. **Audit Trail**: Every violation is logged with full context for forensic analysis

## Core Components

### 1. AegisEnforcer

**Location**: `lib/governance/aegis/aegisEnforcer.js`

**Responsibilities**:
- Main entry point for governance enforcement
- Orchestrates rule validation across all validators
- Handles enforcement actions (BLOCK, WARN, AUDIT)
- Records violations and increments rule statistics
- Supports override with justification

**Key Methods**:

```javascript
// Validate without throwing (returns result object)
const result = await enforcer.validate('PROTOCOL', context, options);

// Enforce with blocking violations (throws AegisViolationError)
await enforcer.enforce('PROTOCOL', context, options);

// Validate all enabled constitutions
const allResults = await enforcer.validateAll(context, options);

// Check if violations can be overridden
const canOverride = enforcer.canOverride(violations);

// Override with justification
await enforcer.overrideViolations(violationIds, justification, actor);
```

**Options**:
- `recordViolations` (default: true) - Write violations to audit log
- `incrementStats` (default: true) - Update rule effectiveness counters

### 2. AegisRuleLoader

**Location**: `lib/governance/aegis/aegisRuleLoader.js`

**Responsibilities**:
- Loads rules and constitutions from database
- Falls back to local JSON file if database unavailable
- Caches rules with 5-minute TTL
- Resolves rule dependencies (topological sort)
- Filters by constitution, category, severity, validation type

**Key Features**:
- **Dependency Resolution**: Rules with `depends_on_rules` are validated in correct order
- **Conflict Detection**: Rules with `conflicts_with_rules` prevent simultaneous activation
- **Local Fallback**: `aegis-rules-local.json` provides offline/bootstrap capability
- **Constitution Enforcement Modes**: `enforced`, `audit_only`, `disabled`

**Key Methods**:

```javascript
// Load all constitutions
const constitutions = await loader.loadConstitutions();

// Load rules with filters
const rules = await loader.loadRules({
  constitutionCode: 'PROTOCOL',
  severity: 'CRITICAL'
});

// Load rules in dependency order
const orderedRules = await loader.loadRulesWithDependencies('PROTOCOL');

// Check enforcement mode
const isEnforced = await loader.isConstitutionEnforced('PROTOCOL');
```

### 3. AegisViolationRecorder

**Location**: `lib/governance/aegis/aegisViolationRecorder.js`

**Responsibilities**:
- Records violations to `aegis_violations` table
- Manages violation lifecycle (open → acknowledged → remediated)
- Enables override with mandatory justification
- Links violations to SDs for remediation tracking

**Violation States**:
- `open` - New violation requiring attention
- `acknowledged` - Human has reviewed and acknowledged
- `overridden` - Allowed to proceed with justification
- `remediated` - Fixed via SD completion
- `false_positive` - Violation was incorrect

**Key Methods**:

```javascript
// Record a violation
await recorder.recordViolation({
  rule_id: 'uuid',
  constitution_id: 'uuid',
  severity: 'CRITICAL',
  message: 'Description',
  actor_role: 'EXEC',
  payload: { /* context */ }
});

// Override with justification
await recorder.overrideViolation(violationId, justification, actor);

// Mark as remediated
await recorder.remediateViolation(violationId, remediationSdId);
```

## Database Schema

### Core Tables

#### 1. aegis_constitutions

Registry of governance frameworks (7 constitutions).

**Key Fields**:
- `code` (VARCHAR, UNIQUE) - Constitution identifier (e.g., 'PROTOCOL', 'FOUR_OATHS')
- `name` - Human-readable name
- `domain` - Governance domain: `self_improvement`, `agent_behavior`, `system_state`, `execution`, `compliance`
- `enforcement_mode` - `enforced`, `audit_only`, `disabled`
- `parent_constitution_id` - For inheritance hierarchies
- `superseded_by` - Append-only versioning

**7 Constitutions**:
1. **PROTOCOL** - 9 immutable rules for LEO self-improvement
2. **FOUR_OATHS** - EVA agent behavioral constraints (9 rules)
3. **DOCTRINE** - Law 1: EXEC constraint rules (4 rules)
4. **HARD_HALT** - Emergency halt protocol (4 rules)
5. **MANIFESTO_MODE** - System state activation (4 rules)
6. **CREW_GOVERNANCE** - Budget and semantic guardrails (5 rules)
7. **COMPLIANCE** - External compliance policies (6 rules)

#### 2. aegis_rules

Unified storage for all governance rules (45+ rules total).

**Key Fields**:
- `constitution_id` (UUID, FK) - Parent constitution
- `rule_code` (VARCHAR) - Unique within constitution (e.g., 'CONST-001')
- `rule_text` - Rule description
- `category` - `safety`, `governance`, `audit`, `authority`, `integrity`, `transparency`
- `severity` - `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `ADVISORY`
- `enforcement_action` - `BLOCK`, `BLOCK_OVERRIDABLE`, `WARN_AND_LOG`, `AUDIT_ONLY`, `TRIGGER_SD`
- `validation_type` - `field_check`, `threshold`, `role_forbidden`, `count_limit`, `custom`
- `validation_config` (JSONB) - Validator-specific configuration
- `depends_on_rules` (UUID[]) - Rules that must pass first
- `conflicts_with_rules` (UUID[]) - Mutually exclusive rules
- `source_retro_id` (UUID) - Retrospective that spawned this rule (Chesterton's Fence)
- `times_triggered`, `times_blocked` - Effectiveness tracking
- `superseded_by` - Append-only versioning

**Unique Index**: `(constitution_id, rule_code)` WHERE `is_active = true`

#### 3. aegis_violations

Unified audit log for all governance violations.

**Key Fields**:
- `rule_id`, `constitution_id` - Reference to violated rule
- `violation_type` - Type of violation (matches validation_type)
- `severity` - Inherited from rule
- `message` - Human-readable description
- `actor_role`, `actor_id` - Who triggered the violation
- `operation_type`, `target_table` - What operation was attempted
- `sd_id`, `sd_key`, `prd_id`, `venture_id` - Context linkage
- `payload` (JSONB) - Full context snapshot
- `status` - `open`, `acknowledged`, `overridden`, `remediated`, `false_positive`
- `override_justification` - Required for overrides
- `remediation_sd_id` - SD created to fix the violation

**RLS Policies**:
- **No Delete**: Violations are permanent audit records
- **Limited Update**: Only status, override, and acknowledgement fields can change
- **Public Read**: All authenticated users can view violations

### Views

#### v_aegis_open_violations

All open violations ordered by severity.

```sql
SELECT
  v.id, v.severity, v.message, v.status, v.created_at,
  r.rule_code, r.rule_name,
  c.code AS constitution_code
FROM aegis_violations v
JOIN aegis_rules r ON v.rule_id = r.id
JOIN aegis_constitutions c ON v.constitution_id = c.id
WHERE v.status = 'open'
ORDER BY severity, created_at DESC;
```

#### v_aegis_rule_stats

Rule effectiveness statistics for tuning.

```sql
SELECT
  r.rule_code, r.rule_name, r.severity,
  r.times_triggered, r.times_blocked,
  ROUND((r.times_blocked::DECIMAL / r.times_triggered) * 100, 2) AS block_rate_percent,
  COUNT(v.id) FILTER (WHERE v.status = 'open') AS open_violations
FROM aegis_rules r
LEFT JOIN aegis_violations v ON v.rule_id = r.id
WHERE r.is_active = true
GROUP BY r.id;
```

#### v_aegis_constitution_summary

Constitution-level overview.

```sql
SELECT
  c.code, c.name, c.enforcement_mode,
  COUNT(r.id) FILTER (WHERE r.is_active = true) AS active_rules,
  COUNT(r.id) FILTER (WHERE r.severity = 'CRITICAL') AS critical_rules,
  COUNT(v.id) FILTER (WHERE v.status = 'open') AS open_violations
FROM aegis_constitutions c
LEFT JOIN aegis_rules r ON r.constitution_id = c.id
LEFT JOIN aegis_violations v ON v.constitution_id = c.id
GROUP BY c.id;
```

## Validator Types

AEGIS supports 6 validator types, each handling different rule logic.

### 1. FieldCheckValidator

**File**: `lib/governance/aegis/validators/FieldCheckValidator.js`

**Purpose**: Validates presence, absence, or format of fields.

**Configuration Options**:

```json
{
  "required_fields": ["venture_id", "prd_id"],
  "forbidden_value": { "field": "irreversible", "value": true },
  "forbidden_patterns": [".md"],
  "min_length": { "reasoning": 10 },
  "required_for_delete": ["source_retro_id"],
  "valid_buckets": ["facts", "assumptions", "simulations", "unknowns"],
  "mandatory_escalation_categories": ["budget_exceed", "security_concern"]
}
```

**Example Rule**: CREW-001 (Venture ID Required)

```json
{
  "rule_code": "CREW-001",
  "validation_type": "field_check",
  "validation_config": {
    "required_fields": ["venture_id"]
  }
}
```

### 2. ThresholdValidator

**File**: `lib/governance/aegis/validators/ThresholdValidator.js`

**Purpose**: Validates numeric values against thresholds.

**Configuration Options**:

```json
{
  "field": "budget_remaining",
  "operator": "gt",  // lt, lte, gt, gte, eq, neq
  "value": 0,
  "warning_threshold": 0.2,
  "min": 0,
  "max": 1
}
```

**Example Rule**: CREW-003 (Budget Validation)

```json
{
  "rule_code": "CREW-003",
  "validation_type": "threshold",
  "validation_config": {
    "field": "budget_remaining",
    "operator": "gt",
    "value": 0
  }
}
```

### 3. RoleForbiddenValidator

**File**: `lib/governance/aegis/validators/RoleForbiddenValidator.js`

**Purpose**: Validates role-based access control.

**Configuration Options**:

```json
{
  "forbidden_roles": ["EXEC", "L4_CREW"],
  "allowed_roles": ["L0_CHAIRMAN", "L1_EVA"],
  "operation": "kill_venture",
  "recommend_only": ["L1_EVA"]
}
```

**Example Rule**: DOC-001 (EXEC Cannot Create SDs)

```json
{
  "rule_code": "DOC-001",
  "validation_type": "role_forbidden",
  "validation_config": {
    "forbidden_roles": ["EXEC"],
    "target_tables": ["strategic_directives_v2"],
    "operations": ["INSERT"]
  }
}
```

### 4. CountLimitValidator

**File**: `lib/governance/aegis/validators/CountLimitValidator.js`

**Purpose**: Enforces rate limits and quotas.

**Configuration Options**:

```json
{
  "table": "protocol_improvement_queue",
  "filter": { "risk_tier": "AUTO", "status": "APPLIED" },
  "period_hours": 24,
  "max_count": 3
}
```

**Example Rule**: CONST-007 (Max 3 AUTO changes per 24h)

```json
{
  "rule_code": "CONST-007",
  "validation_type": "count_limit",
  "validation_config": {
    "table": "protocol_improvement_queue",
    "filter": { "risk_tier": "AUTO", "status": "APPLIED" },
    "period_hours": 24,
    "max_count": 3
  }
}
```

### 5. CustomValidator

**File**: `lib/governance/aegis/validators/CustomValidator.js`

**Purpose**: Complex custom logic not fitting other validators.

**Supported Checks**:
- `governed_tier_approval` - GOVERNED tier requires human approval
- `self_approval_prevention` - Proposer ≠ Evaluator
- `auto_freeze_flag` - Emergency freeze for AUTO changes
- `hard_halt_status` - System halt enforcement
- `dead_man_switch` - Chairman activity timeout
- `l2_plus_blocked_when_halted` - Block L2+ during halt
- `prd_required_unless_meta` - PRD required for non-meta operations
- `high_confidence_no_unknowns` - Confidence >0.9 must acknowledge unknowns
- `pii_handling` - PII encryption/masking enforcement
- `semantic_validation` - 60/40 truth law validation

**Example Rule**: CONST-001 (Human Approval Required)

```json
{
  "rule_code": "CONST-001",
  "validation_type": "custom",
  "validation_config": {
    "check": "governed_tier_approval"
  }
}
```

## Adapter Pattern

**Purpose**: Enable zero-downtime migration from legacy governance systems to AEGIS.

**Strategy**: Adapters maintain existing API contracts while routing all enforcement to AEGIS under the hood.

### Adapter Architecture

```
┌─────────────────────────────────────────────────┐
│           Legacy Code (Unchanged)               │
│                                                 │
│  import { ConstitutionValidator } from 'old'    │
│  const validator = new ConstitutionValidator()  │
│  const result = await validator.validate(data)  │
│                                                 │
└───────────────────┬─────────────────────────────┘
                    │
                    │ Same API Surface
                    │
┌───────────────────▼─────────────────────────────┐
│        ConstitutionAdapter (New Shim)           │
│                                                 │
│  - Same method signatures                       │
│  - Same return types                            │
│  - Routes to AEGIS internally                   │
│  - Feature flag: useAegis = true                │
│                                                 │
└───────────────────┬─────────────────────────────┘
                    │
                    │ AEGIS Calls
                    │
┌───────────────────▼─────────────────────────────┐
│              AEGIS Core                         │
│  - AegisEnforcer                                │
│  - Unified validation logic                     │
│  - Database-driven rules                        │
└─────────────────────────────────────────────────┘
```

### Available Adapters

**Location**: `lib/governance/aegis/adapters/`

1. **ConstitutionAdapter** - Protocol Constitution (9 rules)
2. **FourOathsAdapter** - Agent behavioral constraints (9 rules)
3. **DoctrineAdapter** - EXEC constraint rules (4 rules)
4. **HardHaltAdapter** - Emergency halt protocol (4 rules)
5. **ManifestoModeAdapter** - Manifesto activation (4 rules)
6. **CrewGovernanceAdapter** - Budget guardrails (5 rules)
7. **ComplianceAdapter** - External compliance (6 rules)

### Adapter Example

**ConstitutionAdapter** maintains backward compatibility with `ConstitutionValidator`:

```javascript
// OLD CODE (still works unchanged)
import { ConstitutionValidator } from '@/lib/governance/protocol-constitution';
const validator = new ConstitutionValidator(supabase);
const result = await validator.validate(improvement, context);

// NEW CODE (same API, AEGIS-backed)
import { ConstitutionAdapter } from '@/lib/governance/aegis/adapters';
const validator = new ConstitutionAdapter(supabase);
const result = await validator.validate(improvement, context);
// Returns same format, but uses AEGIS under the hood
```

**Key Features**:
- ✅ **Zero Breaking Changes**: Same method signatures, same return types
- ✅ **Feature Flag**: `useAegis` toggle for gradual rollout
- ✅ **Fallback Mode**: Can switch back to legacy validation if needed
- ✅ **Enhanced Metadata**: Adds `aegis_enabled: true` to results

### Migration Path

**Phase 1 - Deployment** (COMPLETE):
- Deploy AEGIS alongside legacy systems
- Adapters route to AEGIS with `useAegis = true`
- Legacy code unchanged, calls adapters

**Phase 2 - Observation** (2-4 weeks):
- Monitor adapter performance
- Compare AEGIS vs legacy results
- Tune rules based on violation patterns

**Phase 3 - Direct Integration** (Future):
- New code imports AEGIS directly
- Legacy code continues using adapters
- Gradual replacement of adapter calls

**Phase 4 - Deprecation** (6-12 months):
- Remove legacy governance code
- Adapters become thin wrappers or removed
- 100% AEGIS-native

## Feature Flags

AEGIS uses feature flags for controlled rollout and A/B testing.

### Environment Variables

```bash
# Enable AEGIS globally
USE_AEGIS=true

# Constitution-specific flags
USE_AEGIS_PROTOCOL=true
USE_AEGIS_FOUR_OATHS=true
USE_AEGIS_DOCTRINE=true
USE_AEGIS_HARD_HALT=true
USE_AEGIS_MANIFESTO=true
USE_AEGIS_CREW=true
USE_AEGIS_COMPLIANCE=true
```

### Runtime Toggle

```javascript
// Check if AEGIS is enabled
const useAegis = process.env.USE_AEGIS === 'true';

if (useAegis) {
  // Use AEGIS
  const enforcer = getAegisEnforcer();
  await enforcer.enforce('PROTOCOL', context);
} else {
  // Use legacy
  const validator = new ConstitutionValidator();
  await validator.validate(improvement);
}
```

### Adapter-Level Toggle

```javascript
const adapter = new ConstitutionAdapter(supabase);

// Temporarily disable AEGIS for this adapter
adapter.setAegisMode(false); // Falls back to legacy methods

// Re-enable
adapter.setAegisMode(true);
```

## Enforcement Engine

### Enforcement Actions

AEGIS supports 5 enforcement actions with different behaviors:

| Action | Behavior | Use Case | Overridable |
|--------|----------|----------|-------------|
| `BLOCK` | Throws error, operation fails | Critical safety rules | No |
| `BLOCK_OVERRIDABLE` | Throws error, but can override with justification | Important but not absolute rules | Yes (with justification) |
| `WARN_AND_LOG` | Logs warning, operation proceeds | Advisory rules | N/A |
| `AUDIT_ONLY` | Silent logging | Observability, metrics | N/A |
| `TRIGGER_SD` | Creates SD for remediation | Issues requiring long-term fix | Yes (SD created) |

### Enforcement Flow

```
┌─────────────────────────────────────────────────┐
│  Operation Attempt (e.g., create SD)            │
└───────────────────┬─────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│  enforcer.enforce('DOCTRINE', context)          │
└───────────────────┬─────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│  Load rules for DOCTRINE constitution           │
│  (4 rules: DOC-001 to DOC-004)                  │
└───────────────────┬─────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│  Validate context against each rule             │
│  - Check actor_role = 'EXEC'                    │
│  - Check target_table = 'strategic_directives'  │
│  - Check operation = 'INSERT'                   │
└───────────────────┬─────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
┌──────────────┐        ┌──────────────┐
│  PASS        │        │  FAIL        │
│  (proceed)   │        │  (violates)  │
└──────────────┘        └──────┬───────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  Record violation    │
                    │  to audit log        │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  Check enforcement   │
                    │  action              │
                    └──────┬───────────────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              ▼              ▼
      ┌─────────┐   ┌───────────┐  ┌──────────┐
      │ BLOCK   │   │ WARN_AND  │  │ AUDIT    │
      │ (throw) │   │ LOG (warn)│  │ ONLY     │
      └─────────┘   └───────────┘  └──────────┘
```

### Error Handling

**AegisViolationError** provides structured error information:

```javascript
try {
  await enforcer.enforce('PROTOCOL', context);
} catch (error) {
  if (error instanceof AegisViolationError) {
    console.error('Governance violation:', {
      constitution: error.constitution,
      violations: error.violations,
      isBlocking: error.isBlocking,
      context: error.context
    });

    // Check if overridable
    if (enforcer.canOverride(error.violations)) {
      // Prompt for justification
      const justification = await promptUser();
      await enforcer.overrideViolations(
        error.violations.map(v => v.id),
        justification,
        'human-operator'
      );
      // Retry operation
    }
  } else {
    // Other error
    throw error;
  }
}
```

## Performance & Caching

### Caching Strategy

AEGIS uses multi-layer caching to minimize database queries:

**Layer 1: In-Memory Cache**
- Rules and constitutions cached in `AegisRuleLoader`
- Default TTL: 5 minutes
- Invalidated on: rule updates, manual `clearCache()` call

**Layer 2: Supabase Client Cache**
- Built-in connection pooling
- Response caching for identical queries

**Layer 3: Database Query Optimization**
- Indexes on: `constitution_id`, `category`, `severity`, `validation_type`
- Materialized views for stats: `v_aegis_rule_stats`, `v_aegis_constitution_summary`
- RLS policies optimized for read performance

### Performance Metrics

**Initial Load** (cold start):
- Load all constitutions: ~50ms
- Load all rules (45+): ~100ms
- Total bootstrap: ~150ms

**Cached Access** (warm):
- Constitution lookup: ~1ms (in-memory)
- Rule load: ~5ms (in-memory)
- Validation (per rule): ~2-10ms (depends on validator)

**Full Enforcement** (typical):
- Single constitution (9 rules): ~80ms
- All constitutions (45 rules): ~400ms

**Database Operations**:
- Record violation: ~30ms
- Query open violations: ~50ms
- Update rule stats: ~20ms

### Optimization Tips

1. **Minimize `validateAll()` calls** - Only validate relevant constitutions
2. **Batch validations** - Group operations to validate once
3. **Use `recordViolations: false`** for dry-run validations
4. **Cache AegisEnforcer instance** - Don't recreate per-request
5. **Tune cache TTL** - Increase for stable environments, decrease for testing

## Best Practices

### For Rule Authors

1. **Write clear `rule_text`** - Human-readable description of the rule
2. **Include `rationale`** - Explain WHY the rule exists
3. **Link `source_retro_id`** - Implement Chesterton's Fence
4. **Start with `WARN_AND_LOG`** - Observe before enforcing
5. **Use appropriate severity** - CRITICAL for safety, HIGH for governance
6. **Test with adapters** - Ensure backward compatibility

### For Developers

1. **Use adapters during migration** - Don't break existing code
2. **Handle `AegisViolationError`** - Provide user-friendly error messages
3. **Log context on violations** - Include all relevant data in `payload`
4. **Test with `recordViolations: false`** - Prevent audit log pollution during tests
5. **Monitor rule stats** - Use `v_aegis_rule_stats` to tune rules
6. **Respect overrides** - Always require justification

### For Operators

1. **Monitor open violations** - Use `/api/aegis/violations?status=open`
2. **Review override justifications** - Audit the audit log
3. **Tune enforcement modes** - `enforced` → `audit_only` → `disabled`
4. **Track rule effectiveness** - Low `times_triggered` may indicate unused rules
5. **Remediate via SDs** - Link violations to remediation work

## Related Documentation

- **[AEGIS API Documentation](../02_api/aegis-endpoints.md)** - All 5 API endpoints
- **[AEGIS CLI Guide](../reference/aegis-cli-guide.md)** - CLI tool usage
- **[AEGIS Database Schema](../database/aegis-schema.md)** - Detailed schema reference
- **[AEGIS Integration Guide](../guides/aegis-integration-guide.md)** - Integration patterns
- **SD-AEGIS-GOVERNANCE-001** - Original strategic directive

## Version History

- **v1.0.0** (2026-01-24) - Initial architecture documentation for SD-AEGIS-GOVERNANCE-001
  - Comprehensive system overview
  - All components documented
  - 6 validator types explained
  - Adapter pattern detailed
  - Performance benchmarks included
