# sd_baseline_rationale Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T01:15:47.435Z
**Rows**: 10
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| baseline_id | `uuid` | **NO** | - | - |
| sd_id | `character varying(100)` | **NO** | - | - |
| sequence_rank | `integer(32)` | **NO** | - | - |
| track | `character varying(20)` | YES | - | - |
| track_name | `character varying(50)` | YES | - | - |
| rationale | `text` | **NO** | - | - |
| priority_score | `numeric(10,2)` | YES | - | - |
| okr_impact_score | `numeric(10,2)` | YES | - | - |
| dependency_depth | `integer(32)` | YES | `0` | - |
| dependencies_count | `integer(32)` | YES | `0` | - |
| blocked_by | `ARRAY` | YES | - | - |
| generated_by | `text` | YES | `'gpt-5.2'::text` | - |
| algorithm_version | `text` | YES | `'1.0'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_baseline_rationale_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_baseline_rationale_baseline_id_fkey`: baseline_id → sd_execution_baselines(id)

### Unique Constraints
- `sd_baseline_rationale_baseline_id_sd_id_key`: UNIQUE (baseline_id, sd_id)

## Indexes

- `idx_baseline_rationale_baseline`
  ```sql
  CREATE INDEX idx_baseline_rationale_baseline ON public.sd_baseline_rationale USING btree (baseline_id)
  ```
- `idx_baseline_rationale_rank`
  ```sql
  CREATE INDEX idx_baseline_rationale_rank ON public.sd_baseline_rationale USING btree (sequence_rank)
  ```
- `idx_baseline_rationale_sd`
  ```sql
  CREATE INDEX idx_baseline_rationale_sd ON public.sd_baseline_rationale USING btree (sd_id)
  ```
- `sd_baseline_rationale_baseline_id_sd_id_key`
  ```sql
  CREATE UNIQUE INDEX sd_baseline_rationale_baseline_id_sd_id_key ON public.sd_baseline_rationale USING btree (baseline_id, sd_id)
  ```
- `sd_baseline_rationale_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_baseline_rationale_pkey ON public.sd_baseline_rationale USING btree (id)
  ```

## RLS Policies

### 1. Allow select for anon (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. authenticated_select_sd_baseline_rationale (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. service_role_all_sd_baseline_rationale (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
