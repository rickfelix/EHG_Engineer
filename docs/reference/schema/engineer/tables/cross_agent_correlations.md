# cross_agent_correlations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T22:23:03.207Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| correlation_name | `text` | **NO** | - | - |
| agent_a | `text` | **NO** | - | - |
| agent_b | `text` | **NO** | - | - |
| agent_a_condition | `text` | YES | - | - |
| agent_b_outcome | `text` | YES | - | - |
| correlation_coefficient | `numeric` | YES | - | - |
| sample_size | `integer(32)` | YES | - | - |
| statistical_confidence | `numeric` | YES | - | - |
| prediction_accuracy | `numeric` | YES | - | - |
| recommendation | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `cross_agent_correlations_pkey`: PRIMARY KEY (id)

### Check Constraints
- `cross_agent_correlations_agent_a_check`: CHECK ((agent_a = ANY (ARRAY['LEAD'::text, 'PLAN'::text, 'EXEC'::text])))
- `cross_agent_correlations_agent_b_check`: CHECK ((agent_b = ANY (ARRAY['LEAD'::text, 'PLAN'::text, 'EXEC'::text])))

## Indexes

- `cross_agent_correlations_pkey`
  ```sql
  CREATE UNIQUE INDEX cross_agent_correlations_pkey ON public.cross_agent_correlations USING btree (id)
  ```

## RLS Policies

### 1. intelligence_correlations_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`

### 2. intelligence_correlations_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
