# value_authenticity_criteria_selections Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_key | `text` | **NO** | - | - |
| fr_id | `text` | **NO** | - | - |
| criterion_id | `text` | **NO** | - | - |
| parameters | `jsonb` | **NO** | `'{}'::jsonb` | - |
| domain_claims | `jsonb` | **NO** | `'[]'::jsonb` | - |
| computed_weakest_link_grade | `text` | **NO** | - | - |
| canonical_grade | `text` | **NO** | - | - |
| effective_grade | `text` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `value_authenticity_criteria_selections_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `value_authenticity_criteria_selections_criterion_id_fkey`: criterion_id → value_authenticity_criteria_library(criterion_id)

### Check Constraints
- `value_authenticity_criteria_s_computed_weakest_link_grade_check`: CHECK ((computed_weakest_link_grade = ANY (ARRAY['E0'::text, 'E1'::text, 'E2'::text, 'E3'::text])))
- `value_authenticity_criteria_selections_canonical_grade_check`: CHECK ((canonical_grade = ANY (ARRAY['E0'::text, 'E1'::text, 'E2'::text, 'E3'::text])))
- `value_authenticity_criteria_selections_effective_grade_check`: CHECK ((effective_grade = ANY (ARRAY['E0'::text, 'E1'::text, 'E2'::text, 'E3'::text])))

## Indexes

- `idx_value_authenticity_criteria_selections_criterion`
  ```sql
  CREATE INDEX idx_value_authenticity_criteria_selections_criterion ON public.value_authenticity_criteria_selections USING btree (criterion_id)
  ```
- `idx_value_authenticity_criteria_selections_sd_fr`
  ```sql
  CREATE INDEX idx_value_authenticity_criteria_selections_sd_fr ON public.value_authenticity_criteria_selections USING btree (sd_key, fr_id)
  ```
- `value_authenticity_criteria_selections_pkey`
  ```sql
  CREATE UNIQUE INDEX value_authenticity_criteria_selections_pkey ON public.value_authenticity_criteria_selections USING btree (id)
  ```

## RLS Policies

### 1. authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
