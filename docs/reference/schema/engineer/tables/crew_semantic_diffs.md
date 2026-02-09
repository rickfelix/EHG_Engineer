# crew_semantic_diffs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-09T03:03:13.715Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| execution_id | `uuid` | YES | - | - |
| venture_id | `uuid` | **NO** | - | - |
| prd_id | `uuid` | YES | - | - |
| sd_id | `character varying(50)` | YES | - | - |
| crew_output | `jsonb` | **NO** | - | - |
| output_embedding | `USER-DEFINED` | YES | - | - |
| business_accuracy | `double precision(53)` | **NO** | - | - |
| technical_accuracy | `double precision(53)` | **NO** | - | - |
| truth_score | `double precision(53)` | YES | - | - |
| passed_gate | `boolean` | **NO** | - | - |
| gate_threshold | `double precision(53)` | **NO** | `0.7` | - |
| rejection_reason | `text` | YES | - | - |
| validated_by | `character varying(100)` | YES | - | - |
| validated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `crew_semantic_diffs_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `crew_semantic_diffs_execution_id_fkey`: execution_id → crewai_flow_executions(id)
- `crew_semantic_diffs_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `crew_semantic_diffs_business_accuracy_check`: CHECK (((business_accuracy >= (0)::double precision) AND (business_accuracy <= (1)::double precision)))
- `crew_semantic_diffs_technical_accuracy_check`: CHECK (((technical_accuracy >= (0)::double precision) AND (technical_accuracy <= (1)::double precision)))

## Indexes

- `crew_semantic_diffs_pkey`
  ```sql
  CREATE UNIQUE INDEX crew_semantic_diffs_pkey ON public.crew_semantic_diffs USING btree (id)
  ```
- `idx_crew_semantic_diffs_execution`
  ```sql
  CREATE INDEX idx_crew_semantic_diffs_execution ON public.crew_semantic_diffs USING btree (execution_id)
  ```
- `idx_crew_semantic_diffs_truth_score`
  ```sql
  CREATE INDEX idx_crew_semantic_diffs_truth_score ON public.crew_semantic_diffs USING btree (truth_score DESC)
  ```
- `idx_crew_semantic_diffs_venture`
  ```sql
  CREATE INDEX idx_crew_semantic_diffs_venture ON public.crew_semantic_diffs USING btree (venture_id, sd_id)
  ```

## RLS Policies

### 1. chairman_read_semantic_diffs (SELECT)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`

### 2. service_role_all_semantic_diffs (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
