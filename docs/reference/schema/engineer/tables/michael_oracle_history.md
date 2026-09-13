# michael_oracle_history Table

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

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| et_date | `date` | **NO** | - | - |
| seq | `integer(32)` | **NO** | `1` | - |
| content | `text` | YES | - | - |
| tags | `ARRAY` | **NO** | `'{}'::text[]` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `michael_oracle_history_pkey`: PRIMARY KEY (id)

## Indexes

- `michael_oracle_history_date_seq_uniq`
  ```sql
  CREATE UNIQUE INDEX michael_oracle_history_date_seq_uniq ON public.michael_oracle_history USING btree (et_date, seq)
  ```
- `michael_oracle_history_pkey`
  ```sql
  CREATE UNIQUE INDEX michael_oracle_history_pkey ON public.michael_oracle_history USING btree (id)
  ```

## RLS Policies

### 1. michael_oracle_history_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### michael_oracle_history_set_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION michael_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
