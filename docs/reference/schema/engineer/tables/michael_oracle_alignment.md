# michael_oracle_alignment Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-13T06:31:02.341Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| et_date | `date` | **NO** | - | - |
| dimension_scores | `jsonb` | **NO** | `'{}'::jsonb` | - |
| notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `michael_oracle_alignment_pkey`: PRIMARY KEY (id)

### Check Constraints
- `michael_oracle_alignment_dimension_scores_check`: CHECK ((jsonb_typeof(dimension_scores) = 'object'::text))

## Indexes

- `michael_oracle_alignment_et_date_uniq`
  ```sql
  CREATE UNIQUE INDEX michael_oracle_alignment_et_date_uniq ON public.michael_oracle_alignment USING btree (et_date)
  ```
- `michael_oracle_alignment_pkey`
  ```sql
  CREATE UNIQUE INDEX michael_oracle_alignment_pkey ON public.michael_oracle_alignment USING btree (id)
  ```

## RLS Policies

### 1. michael_oracle_alignment_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### michael_oracle_alignment_set_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION michael_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
