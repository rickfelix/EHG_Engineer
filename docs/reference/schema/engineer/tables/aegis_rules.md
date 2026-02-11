# aegis_rules Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-11T15:28:08.227Z
**Rows**: 45
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (24 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| constitution_id | `uuid` | **NO** | - | - |
| rule_code | `character varying(50)` | **NO** | - | Rule identifier unique within constitution (e.g., CONST-001, OATH-1) |
| rule_name | `character varying(200)` | **NO** | - | - |
| rule_text | `text` | **NO** | - | - |
| category | `character varying(50)` | **NO** | - | Rule category for grouping and filtering |
| severity | `character varying(20)` | **NO** | `'MEDIUM'::character varying` | Violation severity level |
| enforcement_action | `character varying(30)` | **NO** | `'BLOCK'::character varying` | Action to take on violation |
| validation_type | `character varying(50)` | **NO** | `'custom'::character varying` | Type of validator to use |
| validation_config | `jsonb` | **NO** | `'{}'::jsonb` | Configuration for the validator (fields, thresholds, etc.) |
| depends_on_rules | `ARRAY` | YES | `'{}'::uuid[]` | Rules that must pass before this rule is checked |
| conflicts_with_rules | `ARRAY` | YES | `'{}'::uuid[]` | Rules that cannot be enabled alongside this rule |
| source_retro_id | `uuid` | YES | - | Retrospective that spawned this rule (Chesterton's Fence) |
| rationale | `text` | YES | - | - |
| version | `integer(32)` | **NO** | `1` | - |
| is_active | `boolean` | **NO** | `true` | - |
| superseded_by | `uuid` | YES | - | ID of rule that replaced this one (append-only versioning) |
| times_triggered | `integer(32)` | YES | `0` | Counter for rule effectiveness tracking |
| times_blocked | `integer(32)` | YES | `0` | Counter for times this rule blocked an operation |
| last_triggered_at | `timestamp with time zone` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| source_document | `text` | YES | - | Source document or SD that defined this rule (e.g., EVA Manifesto Part IV, SD-MANIFESTO-004) |

## Constraints

### Primary Key
- `aegis_rules_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `aegis_rules_constitution_id_fkey`: constitution_id → aegis_constitutions(id)
- `aegis_rules_superseded_by_fkey`: superseded_by → aegis_rules(id)

### Check Constraints
- `aegis_rules_category_check`: CHECK (((category)::text = ANY ((ARRAY['safety'::character varying, 'governance'::character varying, 'audit'::character varying, 'authority'::character varying, 'integrity'::character varying, 'transparency'::character varying])::text[])))
- `aegis_rules_enforcement_action_check`: CHECK (((enforcement_action)::text = ANY ((ARRAY['BLOCK'::character varying, 'BLOCK_OVERRIDABLE'::character varying, 'WARN_AND_LOG'::character varying, 'AUDIT_ONLY'::character varying, 'TRIGGER_SD'::character varying])::text[])))
- `aegis_rules_severity_check`: CHECK (((severity)::text = ANY ((ARRAY['CRITICAL'::character varying, 'HIGH'::character varying, 'MEDIUM'::character varying, 'LOW'::character varying, 'ADVISORY'::character varying])::text[])))
- `aegis_rules_validation_type_check`: CHECK (((validation_type)::text = ANY ((ARRAY['field_check'::character varying, 'threshold'::character varying, 'role_forbidden'::character varying, 'count_limit'::character varying, 'custom'::character varying])::text[])))

## Indexes

- `aegis_rules_pkey`
  ```sql
  CREATE UNIQUE INDEX aegis_rules_pkey ON public.aegis_rules USING btree (id)
  ```
- `idx_aegis_rules_active`
  ```sql
  CREATE INDEX idx_aegis_rules_active ON public.aegis_rules USING btree (is_active)
  ```
- `idx_aegis_rules_category`
  ```sql
  CREATE INDEX idx_aegis_rules_category ON public.aegis_rules USING btree (category)
  ```
- `idx_aegis_rules_constitution_code`
  ```sql
  CREATE UNIQUE INDEX idx_aegis_rules_constitution_code ON public.aegis_rules USING btree (constitution_id, rule_code) WHERE (is_active = true)
  ```
- `idx_aegis_rules_constitution_id`
  ```sql
  CREATE INDEX idx_aegis_rules_constitution_id ON public.aegis_rules USING btree (constitution_id)
  ```
- `idx_aegis_rules_severity`
  ```sql
  CREATE INDEX idx_aegis_rules_severity ON public.aegis_rules USING btree (severity)
  ```
- `idx_aegis_rules_validation_type`
  ```sql
  CREATE INDEX idx_aegis_rules_validation_type ON public.aegis_rules USING btree (validation_type)
  ```

## RLS Policies

### 1. insert_aegis_rules (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. limited_update_aegis_rules (UPDATE)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

### 3. no_delete_aegis_rules (DELETE)

- **Roles**: {public}
- **Using**: `false`

### 4. select_aegis_rules (SELECT)

- **Roles**: {public}
- **Using**: `true`

## Triggers

### trigger_aegis_rules_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_aegis_rules_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
