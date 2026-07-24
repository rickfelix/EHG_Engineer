# apa_standing_assessments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 11
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| url | `text` | **NO** | - | - |
| cycle_started_at | `timestamp with time zone` | **NO** | - | - |
| assessment_result | `jsonb` | **NO** | `'{}'::jsonb` | - |
| primitives_passed | `integer(32)` | **NO** | `0` | - |
| primitives_total | `integer(32)` | **NO** | `0` | - |
| verdict | `text` | **NO** | - | - |
| consecutive_fail_count | `integer(32)` | **NO** | `0` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `apa_standing_assessments_pkey`: PRIMARY KEY (id)

### Check Constraints
- `apa_standing_assessments_verdict_check`: CHECK ((verdict = ANY (ARRAY['pass'::text, 'fail'::text, 'error'::text])))

## Indexes

- `apa_standing_assessments_pkey`
  ```sql
  CREATE UNIQUE INDEX apa_standing_assessments_pkey ON public.apa_standing_assessments USING btree (id)
  ```
- `idx_apa_standing_assessments_venture_created`
  ```sql
  CREATE INDEX idx_apa_standing_assessments_venture_created ON public.apa_standing_assessments USING btree (venture_id, created_at DESC)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
