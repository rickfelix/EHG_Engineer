# sd_execution_baselines Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-12T04:11:56.320Z
**Rows**: 7
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| baseline_name | `text` | **NO** | - | - |
| baseline_type | `text` | YES | `'standard'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `text` | YES | `'system'::text` | - |
| approved_by | `text` | YES | - | - |
| approved_at | `timestamp with time zone` | YES | - | - |
| is_active | `boolean` | YES | `false` | - |
| superseded_by | `uuid` | YES | - | - |
| notes | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| generation_rationale | `text` | YES | - | - |
| generated_by | `text` | YES | - | - |
| algorithm_version | `text` | YES | - | - |
| generation_metadata | `jsonb` | YES | - | - |

## Constraints

### Primary Key
- `sd_execution_baselines_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_execution_baselines_superseded_by_fkey`: superseded_by → sd_execution_baselines(id)

## Indexes

- `idx_sd_baselines_single_active`
  ```sql
  CREATE UNIQUE INDEX idx_sd_baselines_single_active ON public.sd_execution_baselines USING btree (is_active) WHERE (is_active = true)
  ```
- `sd_execution_baselines_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_execution_baselines_pkey ON public.sd_execution_baselines USING btree (id)
  ```

## RLS Policies

### 1. Allow all for anon (ALL)

- **Roles**: {anon}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
