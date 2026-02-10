# leo_scoring_prioritization_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-10T12:28:46.954Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| scope_type | `text` | **NO** | - | - |
| scope_id | `uuid` | YES | - | - |
| active_rubric_id | `uuid` | **NO** | - | - |
| weights | `jsonb` | **NO** | - | - |
| tie_breakers | `jsonb` | **NO** | `'[]'::jsonb` | - |
| normalization_mode | `text` | **NO** | `'linear_0_100'::text` | - |
| score_rounding | `integer(32)` | **NO** | `2` | - |
| deterministic_seed | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `uuid` | **NO** | - | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_by | `uuid` | **NO** | - | - |

## Constraints

### Primary Key
- `leo_scoring_prioritization_config_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_scoring_prioritization_config_active_rubric_id_fkey`: active_rubric_id → leo_scoring_rubrics(id)

### Check Constraints
- `leo_scoring_prioritization_config_normalization_mode_check`: CHECK ((normalization_mode = ANY (ARRAY['none'::text, 'linear_0_100'::text, 'zscore_clipped'::text])))
- `leo_scoring_prioritization_config_scope_type_check`: CHECK ((scope_type = ANY (ARRAY['application'::text, 'workspace'::text, 'global'::text])))
- `leo_scoring_prioritization_config_score_rounding_check`: CHECK (((score_rounding >= 0) AND (score_rounding <= 6)))

## Indexes

- `idx_leo_scoring_prio_config_global`
  ```sql
  CREATE UNIQUE INDEX idx_leo_scoring_prio_config_global ON public.leo_scoring_prioritization_config USING btree (scope_type) WHERE (scope_type = 'global'::text)
  ```
- `idx_leo_scoring_prio_config_scope`
  ```sql
  CREATE UNIQUE INDEX idx_leo_scoring_prio_config_scope ON public.leo_scoring_prioritization_config USING btree (scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  ```
- `leo_scoring_prioritization_config_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_scoring_prioritization_config_pkey ON public.leo_scoring_prioritization_config USING btree (id)
  ```

## RLS Policies

### 1. Anon can read scoring prioritization config (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. Service role full access to leo_scoring_prioritization_config (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

## Triggers

### trg_leo_scoring_prio_config_validate

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION leo_scoring_prio_config_validate()`

### trg_leo_scoring_prio_config_validate

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION leo_scoring_prio_config_validate()`

---

[← Back to Schema Overview](../database-schema-overview.md)
