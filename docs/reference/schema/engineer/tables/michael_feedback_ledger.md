# michael_feedback_ledger Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-13T06:31:02.341Z
**Rows**: 4
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| et_date | `date` | **NO** | - | - |
| landed | `text` | YES | - | - |
| friction | `text` | YES | - | - |
| dispositions | `jsonb` | **NO** | `'[]'::jsonb` | - |
| outcome_vs_jobs | `text` | YES | - | - |
| acted | `boolean` | **NO** | `false` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `michael_feedback_ledger_pkey`: PRIMARY KEY (id)

### Check Constraints
- `michael_feedback_ledger_dispositions_check`: CHECK ((jsonb_typeof(dispositions) = 'array'::text))

## Indexes

- `michael_feedback_ledger_et_date_uniq`
  ```sql
  CREATE UNIQUE INDEX michael_feedback_ledger_et_date_uniq ON public.michael_feedback_ledger USING btree (et_date)
  ```
- `michael_feedback_ledger_pkey`
  ```sql
  CREATE UNIQUE INDEX michael_feedback_ledger_pkey ON public.michael_feedback_ledger USING btree (id)
  ```

## RLS Policies

### 1. michael_feedback_ledger_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### michael_feedback_ledger_set_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION michael_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
