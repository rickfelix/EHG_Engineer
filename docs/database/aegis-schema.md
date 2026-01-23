# AEGIS Database Schema Reference

## Metadata
- **Category**: Database
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: DOCMON Sub-Agent
- **Last Updated**: 2026-01-24
- **Tags**: aegis, database, schema, postgres, supabase
- **SD**: SD-AEGIS-GOVERNANCE-001
- **Related Docs**:
  - [AEGIS Architecture Overview](../01_architecture/aegis-system-overview.md)
  - [AEGIS API Documentation](../02_api/aegis-endpoints.md)
  - [AEGIS CLI Guide](../reference/aegis-cli-guide.md)

## Overview

The AEGIS database schema consists of 3 core tables, 3 views, RLS policies, indexes, and helper functions. All schema objects follow append-only versioning principles to maintain audit integrity.

**Database**: PostgreSQL 14+ (Supabase)

**Schema Location**: `database/migrations/20260124_aegis_governance_foundation.sql`

**Key Principles**:
- **Append-Only**: No DELETE operations allowed on core tables
- **Versioning**: `superseded_by` field for rule/constitution updates
- **Audit Trail**: Every change logged with actor and timestamp
- **RLS Enforcement**: Row-Level Security protects data integrity

## Table of Contents

- [Tables](#tables)
  - [aegis_constitutions](#aegis_constitutions)
  - [aegis_rules](#aegis_rules)
  - [aegis_violations](#aegis_violations)
- [Views](#views)
  - [v_aegis_open_violations](#v_aegis_open_violations)
  - [v_aegis_rule_stats](#v_aegis_rule_stats)
  - [v_aegis_constitution_summary](#v_aegis_constitution_summary)
- [Functions](#functions)
  - [aegis_increment_rule_stats](#aegis_increment_rule_stats)
  - [update_aegis_rules_updated_at](#update_aegis_rules_updated_at)
- [Indexes](#indexes)
- [RLS Policies](#rls-policies)
- [Migration History](#migration-history)

---

## Tables

### aegis_constitutions

**Purpose**: Registry of governance frameworks (constitutions).

**Description**: Stores metadata for each governance constitution. A constitution is a collection of related rules governing a specific domain (e.g., self-improvement, agent behavior, system state).

#### Schema

```sql
CREATE TABLE aegis_constitutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  domain VARCHAR(50) NOT NULL,
  enforcement_mode VARCHAR(20) NOT NULL DEFAULT 'enforced',
  parent_constitution_id UUID REFERENCES aegis_constitutions(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  superseded_by UUID REFERENCES aegis_constitutions(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'SYSTEM'
);
```

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | No | `gen_random_uuid()` | Primary key |
| `code` | VARCHAR(50) | No | - | Unique identifier (e.g., 'PROTOCOL', 'FOUR_OATHS') |
| `name` | VARCHAR(100) | No | - | Human-readable name |
| `description` | TEXT | Yes | NULL | Detailed description |
| `version` | VARCHAR(20) | No | '1.0.0' | Semantic version |
| `domain` | VARCHAR(50) | No | - | Governance domain (see [Domains](#domains)) |
| `enforcement_mode` | VARCHAR(20) | No | 'enforced' | Enforcement mode (see [Enforcement Modes](#enforcement-modes)) |
| `parent_constitution_id` | UUID | Yes | NULL | Parent constitution for inheritance |
| `is_active` | BOOLEAN | No | true | Active status |
| `superseded_by` | UUID | Yes | NULL | ID of constitution that replaced this one |
| `metadata` | JSONB | Yes | '{}' | Additional metadata |
| `created_at` | TIMESTAMPTZ | Yes | NOW() | Creation timestamp |
| `created_by` | VARCHAR(100) | Yes | 'SYSTEM' | Creator identifier |

#### Constraints

- **Primary Key**: `id`
- **Unique**: `code`
- **Check**: `domain IN ('self_improvement', 'agent_behavior', 'system_state', 'execution', 'compliance')`
- **Check**: `enforcement_mode IN ('enforced', 'audit_only', 'disabled')`
- **Foreign Key**: `parent_constitution_id` → `aegis_constitutions(id)`
- **Foreign Key**: `superseded_by` → `aegis_constitutions(id)`

#### Domains

| Domain | Description | Example Constitutions |
|--------|-------------|-----------------------|
| `self_improvement` | Protocol self-modification rules | PROTOCOL |
| `agent_behavior` | Agent operational constraints | FOUR_OATHS |
| `system_state` | System state management | HARD_HALT, MANIFESTO_MODE, DOCTRINE |
| `execution` | Execution guardrails | CREW_GOVERNANCE |
| `compliance` | External compliance requirements | COMPLIANCE |

#### Enforcement Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `enforced` | Rules actively block violations | Production enforcement |
| `audit_only` | Rules log violations but don't block | Observation/testing phase |
| `disabled` | Constitution ignored | Deprecated or experimental |

#### Example Rows

```sql
-- PROTOCOL Constitution
INSERT INTO aegis_constitutions (code, name, description, domain, enforcement_mode)
VALUES (
  'PROTOCOL',
  'Protocol Constitution',
  'The 9 immutable rules governing LEO self-improvement',
  'self_improvement',
  'enforced'
);

-- DOCTRINE Constitution
INSERT INTO aegis_constitutions (code, name, description, domain, enforcement_mode)
VALUES (
  'DOCTRINE',
  'Doctrine of Constraint',
  'Law 1: EVA agents can never kill or remove ventures without Chairman approval',
  'system_state',
  'enforced'
);
```

#### Queries

**Get all active constitutions**:

```sql
SELECT * FROM aegis_constitutions
WHERE is_active = true
ORDER BY code;
```

**Get constitution by code**:

```sql
SELECT * FROM aegis_constitutions
WHERE code = 'PROTOCOL';
```

**Get constitutions by domain**:

```sql
SELECT * FROM aegis_constitutions
WHERE domain = 'system_state'
  AND is_active = true;
```

---

### aegis_rules

**Purpose**: Unified storage for all governance rules across all constitutions.

**Description**: Each row represents a single governance rule with its validation logic, severity, enforcement action, and tracking metadata.

#### Schema

```sql
CREATE TABLE aegis_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  constitution_id UUID NOT NULL REFERENCES aegis_constitutions(id),
  rule_code VARCHAR(50) NOT NULL,
  rule_name VARCHAR(200) NOT NULL,
  rule_text TEXT NOT NULL,
  category VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  enforcement_action VARCHAR(30) NOT NULL DEFAULT 'BLOCK',
  validation_type VARCHAR(50) NOT NULL DEFAULT 'custom',
  validation_config JSONB NOT NULL DEFAULT '{}',
  depends_on_rules UUID[] DEFAULT '{}',
  conflicts_with_rules UUID[] DEFAULT '{}',
  source_retro_id UUID,
  rationale TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  superseded_by UUID REFERENCES aegis_rules(id),
  times_triggered INTEGER DEFAULT 0,
  times_blocked INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: rule_code must be unique per constitution
CREATE UNIQUE INDEX idx_aegis_rules_constitution_code
  ON aegis_rules(constitution_id, rule_code)
  WHERE is_active = true;
```

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | No | `gen_random_uuid()` | Primary key |
| `constitution_id` | UUID | No | - | Parent constitution FK |
| `rule_code` | VARCHAR(50) | No | - | Rule identifier (e.g., 'CONST-001', 'DOC-001') |
| `rule_name` | VARCHAR(200) | No | - | Human-readable name |
| `rule_text` | TEXT | No | - | Detailed rule description |
| `category` | VARCHAR(50) | No | - | Category (see [Categories](#categories)) |
| `severity` | VARCHAR(20) | No | 'MEDIUM' | Severity level (see [Severity Levels](#severity-levels)) |
| `enforcement_action` | VARCHAR(30) | No | 'BLOCK' | Action on violation (see [Enforcement Actions](#enforcement-actions)) |
| `validation_type` | VARCHAR(50) | No | 'custom' | Validator type (see [Validation Types](#validation-types)) |
| `validation_config` | JSONB | No | '{}' | Validator configuration |
| `depends_on_rules` | UUID[] | Yes | '{}' | Rules that must pass first |
| `conflicts_with_rules` | UUID[] | Yes | '{}' | Mutually exclusive rules |
| `source_retro_id` | UUID | Yes | NULL | Retrospective that spawned rule (Chesterton's Fence) |
| `rationale` | TEXT | Yes | NULL | Why this rule exists |
| `version` | INTEGER | No | 1 | Rule version number |
| `is_active` | BOOLEAN | No | true | Active status |
| `superseded_by` | UUID | Yes | NULL | ID of rule that replaced this one |
| `times_triggered` | INTEGER | Yes | 0 | Counter for effectiveness tracking |
| `times_blocked` | INTEGER | Yes | 0 | Counter for times rule blocked operation |
| `last_triggered_at` | TIMESTAMPTZ | Yes | NULL | Last trigger timestamp |
| `metadata` | JSONB | Yes | '{}' | Additional metadata |
| `created_at` | TIMESTAMPTZ | Yes | NOW() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Yes | NOW() | Last update timestamp |

#### Constraints

- **Primary Key**: `id`
- **Foreign Key**: `constitution_id` → `aegis_constitutions(id)`
- **Foreign Key**: `superseded_by` → `aegis_rules(id)`
- **Check**: `category IN ('safety', 'governance', 'audit', 'authority', 'integrity', 'transparency')`
- **Check**: `severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'ADVISORY')`
- **Check**: `enforcement_action IN ('BLOCK', 'BLOCK_OVERRIDABLE', 'WARN_AND_LOG', 'AUDIT_ONLY', 'TRIGGER_SD')`
- **Check**: `validation_type IN ('field_check', 'threshold', 'role_forbidden', 'count_limit', 'custom')`
- **Unique**: `(constitution_id, rule_code)` WHERE `is_active = true`

#### Categories

| Category | Description | Example Rules |
|----------|-------------|---------------|
| `safety` | System safety and halt mechanisms | CONST-002, CONST-004, CONST-007, HALT-001 |
| `governance` | Process and approval rules | CONST-001, CONST-005, DOC-001 |
| `audit` | Audit trail requirements | CONST-003, COMP-003 |
| `authority` | Role-based access control | OATH-2, DOC-001, HALT-003 |
| `integrity` | Escalation and honesty | OATH-3, CREW-005 |
| `transparency` | Logging and disclosure | OATH-1, OATH-4 |

#### Severity Levels

| Level | Meaning | Response |
|-------|---------|----------|
| `CRITICAL` | System safety at risk | Immediate block, alert operators |
| `HIGH` | Important governance | Block, require review |
| `MEDIUM` | Advisory governance | Warn, recommend review |
| `LOW` | Best practice | Log, optional review |
| `ADVISORY` | Information only | Silent logging |

#### Enforcement Actions

| Action | Behavior | Overridable | Use Case |
|--------|----------|-------------|----------|
| `BLOCK` | Throw error, operation fails | No | Critical safety rules |
| `BLOCK_OVERRIDABLE` | Throw error, but can override with justification | Yes | Important but not absolute |
| `WARN_AND_LOG` | Log warning, operation proceeds | N/A | Advisory rules |
| `AUDIT_ONLY` | Silent logging | N/A | Observability |
| `TRIGGER_SD` | Create SD for remediation | Yes (SD created) | Long-term issues |

#### Validation Types

| Type | Purpose | Config Example |
|------|---------|----------------|
| `field_check` | Required/forbidden fields | `{"required_fields": ["venture_id"]}` |
| `threshold` | Numeric thresholds | `{"field": "budget", "operator": "gt", "value": 0}` |
| `role_forbidden` | Role-based access control | `{"forbidden_roles": ["EXEC"]}` |
| `count_limit` | Rate limits | `{"max_count": 3, "period_hours": 24}` |
| `custom` | Complex custom logic | `{"check": "governed_tier_approval"}` |

#### Example Rows

```sql
-- CONST-001: Human Approval Required
INSERT INTO aegis_rules (
  constitution_id,
  rule_code,
  rule_name,
  rule_text,
  category,
  severity,
  enforcement_action,
  validation_type,
  validation_config,
  rationale
)
SELECT
  c.id,
  'CONST-001',
  'Human Approval Required',
  'All GOVERNED tier changes require human approval. AI scores inform but never decide.',
  'governance',
  'CRITICAL',
  'BLOCK',
  'custom',
  '{"check": "governed_tier_approval"}'::jsonb,
  'Ensures human oversight of significant protocol changes'
FROM aegis_constitutions c
WHERE c.code = 'PROTOCOL';

-- DOC-001: EXEC Cannot Create SDs
INSERT INTO aegis_rules (
  constitution_id,
  rule_code,
  rule_name,
  rule_text,
  category,
  severity,
  enforcement_action,
  validation_type,
  validation_config
)
SELECT
  c.id,
  'DOC-001',
  'EXEC Cannot Create Strategic Directives',
  'EXEC agents are DATABASE-FORBIDDEN from creating Strategic Directives. They execute; they do not think.',
  'governance',
  'CRITICAL',
  'BLOCK',
  'role_forbidden',
  '{"forbidden_roles": ["EXEC"], "target_tables": ["strategic_directives_v2"], "operations": ["INSERT"]}'::jsonb
FROM aegis_constitutions c
WHERE c.code = 'DOCTRINE';
```

#### Queries

**Get all active rules**:

```sql
SELECT
  r.rule_code,
  r.rule_name,
  r.severity,
  c.code AS constitution_code
FROM aegis_rules r
JOIN aegis_constitutions c ON r.constitution_id = c.id
WHERE r.is_active = true
ORDER BY r.severity, r.rule_code;
```

**Get rules by constitution**:

```sql
SELECT * FROM aegis_rules
WHERE constitution_id = (
  SELECT id FROM aegis_constitutions WHERE code = 'PROTOCOL'
)
AND is_active = true;
```

**Get CRITICAL rules**:

```sql
SELECT
  r.rule_code,
  r.rule_name,
  c.code AS constitution
FROM aegis_rules r
JOIN aegis_constitutions c ON r.constitution_id = c.id
WHERE r.severity = 'CRITICAL'
  AND r.is_active = true;
```

**Get rules with dependencies**:

```sql
WITH RECURSIVE rule_deps AS (
  -- Base case: rules with dependencies
  SELECT
    r.id,
    r.rule_code,
    r.depends_on_rules,
    1 AS depth
  FROM aegis_rules r
  WHERE array_length(r.depends_on_rules, 1) > 0

  UNION ALL

  -- Recursive case: follow dependencies
  SELECT
    r.id,
    r.rule_code,
    r.depends_on_rules,
    rd.depth + 1
  FROM aegis_rules r
  JOIN rule_deps rd ON r.id = ANY(rd.depends_on_rules)
  WHERE rd.depth < 10  -- Prevent infinite loops
)
SELECT * FROM rule_deps;
```

---

### aegis_violations

**Purpose**: Unified audit log for all governance violations.

**Description**: Every violation of any rule is recorded here with full context. Violations can be acknowledged, overridden (with justification), or linked to remediation SDs.

#### Schema

```sql
CREATE TABLE aegis_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES aegis_rules(id),
  constitution_id UUID NOT NULL REFERENCES aegis_constitutions(id),
  violation_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  actor_role VARCHAR(50),
  actor_id VARCHAR(100),
  operation_type VARCHAR(50),
  target_table VARCHAR(100),
  sd_id UUID,
  sd_key VARCHAR(100),
  prd_id UUID,
  venture_id UUID,
  payload JSONB DEFAULT '{}',
  stack_trace TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  override_justification TEXT,
  overridden_by VARCHAR(100),
  overridden_at TIMESTAMPTZ,
  remediation_sd_id UUID,
  remediation_sd_key VARCHAR(100),
  acknowledged_by VARCHAR(100),
  acknowledged_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | No | `gen_random_uuid()` | Primary key |
| `rule_id` | UUID | No | - | Rule that was violated FK |
| `constitution_id` | UUID | No | - | Constitution FK |
| `violation_type` | VARCHAR(50) | No | - | Type of violation (matches validation_type) |
| `severity` | VARCHAR(20) | No | - | Severity (inherited from rule) |
| `message` | TEXT | No | - | Human-readable violation message |
| `actor_role` | VARCHAR(50) | Yes | NULL | Role of actor (e.g., 'EXEC', 'LEAD') |
| `actor_id` | VARCHAR(100) | Yes | NULL | Actor identifier |
| `operation_type` | VARCHAR(50) | Yes | NULL | Type of operation attempted |
| `target_table` | VARCHAR(100) | Yes | NULL | Database table being affected |
| `sd_id` | UUID | Yes | NULL | Related SD ID |
| `sd_key` | VARCHAR(100) | Yes | NULL | Related SD key |
| `prd_id` | UUID | Yes | NULL | Related PRD ID |
| `venture_id` | UUID | Yes | NULL | Related venture ID |
| `payload` | JSONB | Yes | '{}' | Full context snapshot |
| `stack_trace` | TEXT | Yes | NULL | Error stack trace (if applicable) |
| `status` | VARCHAR(30) | No | 'open' | Current status (see [Violation Status](#violation-status)) |
| `override_justification` | TEXT | Yes | NULL | Required justification for overrides |
| `overridden_by` | VARCHAR(100) | Yes | NULL | Who overrode the violation |
| `overridden_at` | TIMESTAMPTZ | Yes | NULL | When override occurred |
| `remediation_sd_id` | UUID | Yes | NULL | SD created to fix violation |
| `remediation_sd_key` | VARCHAR(100) | Yes | NULL | SD key for remediation |
| `acknowledged_by` | VARCHAR(100) | Yes | NULL | Who acknowledged violation |
| `acknowledged_at` | TIMESTAMPTZ | Yes | NULL | When acknowledged |
| `metadata` | JSONB | Yes | '{}' | Additional metadata |
| `created_at` | TIMESTAMPTZ | Yes | NOW() | Creation timestamp |

#### Constraints

- **Primary Key**: `id`
- **Foreign Key**: `rule_id` → `aegis_rules(id)`
- **Foreign Key**: `constitution_id` → `aegis_constitutions(id)`
- **Check**: `severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'ADVISORY')`
- **Check**: `status IN ('open', 'acknowledged', 'overridden', 'remediated', 'false_positive')`

#### Violation Status

| Status | Meaning | Next Steps |
|--------|---------|------------|
| `open` | New violation requiring attention | Review and triage |
| `acknowledged` | Human has reviewed | Plan remediation or override |
| `overridden` | Allowed to proceed with justification | Monitor for patterns |
| `remediated` | Fixed via SD completion | Closed |
| `false_positive` | Violation was incorrect | Tune rule |

#### Example Rows

```sql
-- EXEC attempted to create SD (violation)
INSERT INTO aegis_violations (
  rule_id,
  constitution_id,
  violation_type,
  severity,
  message,
  actor_role,
  actor_id,
  operation_type,
  target_table,
  sd_key,
  payload,
  status
)
SELECT
  r.id,
  c.id,
  'role_forbidden',
  'CRITICAL',
  'EXEC agents are DATABASE-FORBIDDEN from creating Strategic Directives',
  'EXEC',
  'claude-sonnet-4',
  'INSERT',
  'strategic_directives_v2',
  'SD-XXX-001',
  '{"actor_role": "EXEC", "target_table": "strategic_directives_v2"}'::jsonb,
  'open'
FROM aegis_rules r
JOIN aegis_constitutions c ON r.constitution_id = c.id
WHERE r.rule_code = 'DOC-001';
```

#### Queries

**Get all open violations**:

```sql
SELECT
  v.id,
  v.severity,
  v.message,
  v.sd_key,
  r.rule_code,
  c.code AS constitution_code,
  v.created_at
FROM aegis_violations v
JOIN aegis_rules r ON v.rule_id = r.id
JOIN aegis_constitutions c ON v.constitution_id = c.id
WHERE v.status = 'open'
ORDER BY
  CASE v.severity
    WHEN 'CRITICAL' THEN 1
    WHEN 'HIGH' THEN 2
    WHEN 'MEDIUM' THEN 3
    WHEN 'LOW' THEN 4
  END,
  v.created_at DESC;
```

**Get violations by SD**:

```sql
SELECT * FROM aegis_violations
WHERE sd_key = 'SD-AEGIS-GOVERNANCE-001'
ORDER BY created_at DESC;
```

**Get violations needing remediation**:

```sql
SELECT
  v.id,
  v.severity,
  v.message,
  r.rule_code
FROM aegis_violations v
JOIN aegis_rules r ON v.rule_id = r.id
WHERE v.status = 'open'
  AND v.severity IN ('CRITICAL', 'HIGH')
  AND v.remediation_sd_id IS NULL;
```

---

## Views

### v_aegis_open_violations

**Purpose**: Quick access to all open violations ordered by severity.

**Schema**:

```sql
CREATE OR REPLACE VIEW v_aegis_open_violations AS
SELECT
  v.id,
  v.severity,
  v.message,
  v.status,
  v.created_at,
  v.sd_key,
  v.actor_role,
  v.actor_id,
  r.rule_code,
  r.rule_name,
  c.code AS constitution_code,
  c.name AS constitution_name
FROM aegis_violations v
JOIN aegis_rules r ON v.rule_id = r.id
JOIN aegis_constitutions c ON v.constitution_id = c.id
WHERE v.status = 'open'
ORDER BY
  CASE v.severity
    WHEN 'CRITICAL' THEN 1
    WHEN 'HIGH' THEN 2
    WHEN 'MEDIUM' THEN 3
    WHEN 'LOW' THEN 4
    WHEN 'ADVISORY' THEN 5
  END,
  v.created_at DESC;
```

**Usage**:

```sql
-- Get all open violations
SELECT * FROM v_aegis_open_violations;

-- Get CRITICAL open violations
SELECT * FROM v_aegis_open_violations
WHERE severity = 'CRITICAL';
```

---

### v_aegis_rule_stats

**Purpose**: Rule effectiveness statistics for tuning and analysis.

**Schema**:

```sql
CREATE OR REPLACE VIEW v_aegis_rule_stats AS
SELECT
  r.id,
  r.rule_code,
  r.rule_name,
  r.severity,
  c.code AS constitution_code,
  r.times_triggered,
  r.times_blocked,
  r.last_triggered_at,
  CASE
    WHEN r.times_triggered > 0 THEN
      ROUND((r.times_blocked::DECIMAL / r.times_triggered) * 100, 2)
    ELSE 0
  END AS block_rate_percent,
  COUNT(v.id) FILTER (WHERE v.status = 'open') AS open_violations,
  COUNT(v.id) FILTER (WHERE v.status = 'remediated') AS remediated_violations
FROM aegis_rules r
JOIN aegis_constitutions c ON r.constitution_id = c.id
LEFT JOIN aegis_violations v ON v.rule_id = r.id
WHERE r.is_active = true
GROUP BY r.id, r.rule_code, r.rule_name, r.severity, c.code, r.times_triggered, r.times_blocked, r.last_triggered_at
ORDER BY r.times_triggered DESC;
```

**Usage**:

```sql
-- Get most triggered rules
SELECT * FROM v_aegis_rule_stats
ORDER BY times_triggered DESC
LIMIT 10;

-- Get rules with highest block rate
SELECT * FROM v_aegis_rule_stats
WHERE times_triggered > 10
ORDER BY block_rate_percent DESC
LIMIT 10;

-- Get rules with open violations
SELECT * FROM v_aegis_rule_stats
WHERE open_violations > 0
ORDER BY severity, open_violations DESC;
```

---

### v_aegis_constitution_summary

**Purpose**: Constitution-level overview with rule and violation counts.

**Schema**:

```sql
CREATE OR REPLACE VIEW v_aegis_constitution_summary AS
SELECT
  c.id,
  c.code,
  c.name,
  c.domain,
  c.enforcement_mode,
  c.is_active,
  COUNT(r.id) FILTER (WHERE r.is_active = true) AS active_rules,
  COUNT(r.id) FILTER (WHERE r.severity = 'CRITICAL') AS critical_rules,
  COUNT(v.id) FILTER (WHERE v.status = 'open') AS open_violations
FROM aegis_constitutions c
LEFT JOIN aegis_rules r ON r.constitution_id = c.id
LEFT JOIN aegis_violations v ON v.constitution_id = c.id
WHERE c.is_active = true
GROUP BY c.id, c.code, c.name, c.domain, c.enforcement_mode, c.is_active
ORDER BY c.code;
```

**Usage**:

```sql
-- Get constitution summary
SELECT * FROM v_aegis_constitution_summary;

-- Get constitutions with open violations
SELECT * FROM v_aegis_constitution_summary
WHERE open_violations > 0
ORDER BY open_violations DESC;

-- Get constitution rule counts
SELECT
  code,
  name,
  active_rules,
  critical_rules
FROM v_aegis_constitution_summary;
```

---

## Functions

### aegis_increment_rule_stats

**Purpose**: Increments rule trigger/block counters for effectiveness tracking.

**Schema**:

```sql
CREATE OR REPLACE FUNCTION aegis_increment_rule_stats(
  p_rule_id UUID,
  p_was_blocked BOOLEAN DEFAULT false
)
RETURNS VOID AS $$
BEGIN
  UPDATE aegis_rules
  SET
    times_triggered = times_triggered + 1,
    times_blocked = times_blocked + CASE WHEN p_was_blocked THEN 1 ELSE 0 END,
    last_triggered_at = NOW()
  WHERE id = p_rule_id;
END;
$$ LANGUAGE plpgsql;
```

**Usage**:

```sql
-- Increment trigger count (rule was checked, passed)
SELECT aegis_increment_rule_stats('rule-uuid', false);

-- Increment trigger and block count (rule was violated)
SELECT aegis_increment_rule_stats('rule-uuid', true);
```

**Called By**: `AegisEnforcer._incrementRuleStats()`

---

### update_aegis_rules_updated_at

**Purpose**: Automatically updates `updated_at` timestamp on rule updates.

**Schema**:

```sql
CREATE OR REPLACE FUNCTION update_aegis_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
CREATE TRIGGER trigger_aegis_rules_updated_at
  BEFORE UPDATE ON aegis_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_aegis_rules_updated_at();
```

**Usage**: Automatic (triggered on `UPDATE`)

---

## Indexes

### aegis_constitutions Indexes

```sql
CREATE INDEX idx_aegis_constitutions_code ON aegis_constitutions(code);
CREATE INDEX idx_aegis_constitutions_domain ON aegis_constitutions(domain);
CREATE INDEX idx_aegis_constitutions_active ON aegis_constitutions(is_active);
```

### aegis_rules Indexes

```sql
-- Primary lookup indexes
CREATE INDEX idx_aegis_rules_constitution_id ON aegis_rules(constitution_id);
CREATE INDEX idx_aegis_rules_category ON aegis_rules(category);
CREATE INDEX idx_aegis_rules_severity ON aegis_rules(severity);
CREATE INDEX idx_aegis_rules_active ON aegis_rules(is_active);
CREATE INDEX idx_aegis_rules_validation_type ON aegis_rules(validation_type);

-- Unique constraint index
CREATE UNIQUE INDEX idx_aegis_rules_constitution_code
  ON aegis_rules(constitution_id, rule_code)
  WHERE is_active = true;
```

### aegis_violations Indexes

```sql
-- Primary lookup indexes
CREATE INDEX idx_aegis_violations_rule_id ON aegis_violations(rule_id);
CREATE INDEX idx_aegis_violations_constitution_id ON aegis_violations(constitution_id);
CREATE INDEX idx_aegis_violations_status ON aegis_violations(status);
CREATE INDEX idx_aegis_violations_severity ON aegis_violations(severity);

-- Context linkage indexes
CREATE INDEX idx_aegis_violations_sd_id ON aegis_violations(sd_id);
CREATE INDEX idx_aegis_violations_sd_key ON aegis_violations(sd_key);

-- Temporal and actor indexes
CREATE INDEX idx_aegis_violations_created_at ON aegis_violations(created_at DESC);
CREATE INDEX idx_aegis_violations_actor ON aegis_violations(actor_role, actor_id);
```

---

## RLS Policies

**Purpose**: Row-Level Security ensures data integrity and prevents unauthorized modifications.

### aegis_constitutions RLS

```sql
-- Enable RLS
ALTER TABLE aegis_constitutions ENABLE ROW LEVEL SECURITY;

-- No delete - constitutions are versioned, not deleted
CREATE POLICY no_delete_aegis_constitutions ON aegis_constitutions
  FOR DELETE
  USING (false);

-- Allow SELECT for everyone
CREATE POLICY select_aegis_constitutions ON aegis_constitutions
  FOR SELECT
  USING (true);

-- Allow INSERT
CREATE POLICY insert_aegis_constitutions ON aegis_constitutions
  FOR INSERT
  WITH CHECK (true);

-- Limited update - only specific fields
CREATE POLICY limited_update_aegis_constitutions ON aegis_constitutions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
```

### aegis_rules RLS

```sql
-- Enable RLS
ALTER TABLE aegis_rules ENABLE ROW LEVEL SECURITY;

-- No delete - rules are versioned, not deleted
CREATE POLICY no_delete_aegis_rules ON aegis_rules
  FOR DELETE
  USING (false);

-- Allow SELECT for everyone
CREATE POLICY select_aegis_rules ON aegis_rules
  FOR SELECT
  USING (true);

-- Allow INSERT
CREATE POLICY insert_aegis_rules ON aegis_rules
  FOR INSERT
  WITH CHECK (true);

-- Limited update
CREATE POLICY limited_update_aegis_rules ON aegis_rules
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
```

### aegis_violations RLS

```sql
-- Enable RLS
ALTER TABLE aegis_violations ENABLE ROW LEVEL SECURITY;

-- No delete - violations are permanent audit records
CREATE POLICY no_delete_aegis_violations ON aegis_violations
  FOR DELETE
  USING (false);

-- Allow SELECT for everyone
CREATE POLICY select_aegis_violations ON aegis_violations
  FOR SELECT
  USING (true);

-- Allow INSERT
CREATE POLICY insert_aegis_violations ON aegis_violations
  FOR INSERT
  WITH CHECK (true);

-- Limited update - only status, override, acknowledgement fields
CREATE POLICY limited_update_aegis_violations ON aegis_violations
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
```

**Note**: Application logic enforces field-level restrictions. RLS prevents DELETE operations while allowing reads and controlled writes.

---

## Migration History

| Migration | Date | Description |
|-----------|------|-------------|
| `20260124_aegis_governance_foundation.sql` | 2026-01-24 | Foundation: Core 3 tables, 7 constitutions, Protocol (9) + Four Oaths (9) + Doctrine (1) rules |
| `20260124_aegis_phase4_rules.sql` | 2026-01-24 | Phase 4: Hard Halt (4), Manifesto Mode (4), Doctrine (4) rules |
| `20260124_aegis_phase5_rules.sql` | 2026-01-24 | Phase 5: Crew Governance (5), Compliance (6) rules |

**Total**: 3 migrations, 45+ rules, 7 constitutions

**Rollback**: Each migration includes rollback instructions in comments.

**Verification Queries** (included in migrations):

```sql
-- Count constitutions
SELECT COUNT(*) FROM aegis_constitutions;  -- Expected: 7

-- Count rules by constitution
SELECT constitution_code, COUNT(*)
FROM v_aegis_rule_stats
GROUP BY constitution_code;

-- Verify RLS prevents delete
DELETE FROM aegis_rules WHERE rule_code = 'CONST-001';  -- Should fail
```

---

## Related Documentation

- **[AEGIS Architecture Overview](../01_architecture/aegis-system-overview.md)** - System design and components
- **[AEGIS API Documentation](../02_api/aegis-endpoints.md)** - REST API endpoints
- **[AEGIS CLI Guide](../reference/aegis-cli-guide.md)** - CLI tool usage
- **[AEGIS Integration Guide](../guides/aegis-integration-guide.md)** - Integration patterns

## Version History

- **v1.0.0** (2026-01-24) - Initial schema documentation for SD-AEGIS-GOVERNANCE-001
  - Complete table definitions
  - All views and functions documented
  - Index and RLS policy reference
  - Query examples for common operations
