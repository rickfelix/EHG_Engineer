# michael_calendar_day Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-13T06:31:02.341Z
**Rows**: 15
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| et_date | `date` | **NO** | - | - |
| event_id | `text` | **NO** | - | - |
| calendar_id | `text` | **NO** | - | - |
| title | `text` | YES | - | - |
| starts_at | `timestamp with time zone` | YES | - | - |
| ends_at | `timestamp with time zone` | YES | - | - |
| all_day | `boolean` | **NO** | `false` | - |
| response_status | `text` | YES | - | - |
| coded_marker | `text` | YES | - | - |
| optional | `boolean` | **NO** | `false` | - |
| overlap_group | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `michael_calendar_day_pkey`: PRIMARY KEY (id)

## Indexes

- `michael_calendar_day_date_event_uniq`
  ```sql
  CREATE UNIQUE INDEX michael_calendar_day_date_event_uniq ON public.michael_calendar_day USING btree (et_date, event_id)
  ```
- `michael_calendar_day_pkey`
  ```sql
  CREATE UNIQUE INDEX michael_calendar_day_pkey ON public.michael_calendar_day USING btree (id)
  ```

## RLS Policies

### 1. michael_calendar_day_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### michael_calendar_day_set_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION michael_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
