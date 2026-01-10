# leo_codebase_validations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-10T04:01:49.496Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | YES | - | - |
| prd_id | `text` | YES | - | - |
| validation_timestamp | `timestamp without time zone` | YES | `now()` | - |
| codebase_analysis | `jsonb` | **NO** | - | - |
| human_review_required | `boolean` | YES | `false` | - |
| human_review_reasons | `ARRAY` | YES | - | - |
| approval_recommendation | `text` | YES | - | - |
| recommended_actions | `ARRAY` | YES | - | - |
| evidence_collected | `jsonb` | YES | - | - |
| validated_by | `text` | YES | `'LEAD'::text` | - |
| created_at | `timestamp without time zone` | YES | `now()` | - |
| updated_at | `timestamp without time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `leo_codebase_validations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_codebase_validations_prd_id_fkey`: prd_id → product_requirements_v2(id)
- `leo_codebase_validations_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `leo_codebase_validations_approval_recommendation_check`: CHECK ((approval_recommendation = ANY (ARRAY['APPROVED'::text, 'CONDITIONAL'::text, 'BLOCKED'::text])))

## Indexes

- `idx_codebase_validations_prd_id`
  ```sql
  CREATE INDEX idx_codebase_validations_prd_id ON public.leo_codebase_validations USING btree (prd_id)
  ```
- `idx_codebase_validations_sd_id`
  ```sql
  CREATE INDEX idx_codebase_validations_sd_id ON public.leo_codebase_validations USING btree (sd_id)
  ```
- `idx_codebase_validations_timestamp`
  ```sql
  CREATE INDEX idx_codebase_validations_timestamp ON public.leo_codebase_validations USING btree (validation_timestamp)
  ```
- `leo_codebase_validations_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_codebase_validations_pkey ON public.leo_codebase_validations USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_codebase_validations (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_codebase_validations (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
