# eva_friday_meetings Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-23T10:15:08.485Z
**Rows**: 0
**RLS**: Enabled (0 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| meeting_date | `date` | **NO** | - | - |
| status | `text` | **NO** | - | - |
| started_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| mood_inference | `jsonb` | YES | - | - |
| agenda | `jsonb` | YES | - | - |
| current_section_index | `integer(32)` | YES | `0` | - |
| meeting_state | `jsonb` | YES | - | - |
| feedback | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_friday_meetings_pkey`: PRIMARY KEY (id)

### Check Constraints
- `eva_friday_meetings_status_check`: CHECK ((status = ANY (ARRAY['waiting'::text, 'active'::text, 'paused'::text, 'completed'::text, 'abandoned'::text])))

## Indexes

- `eva_friday_meetings_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_friday_meetings_pkey ON public.eva_friday_meetings USING btree (id)
  ```
- `idx_eva_friday_meetings_date`
  ```sql
  CREATE INDEX idx_eva_friday_meetings_date ON public.eva_friday_meetings USING btree (meeting_date)
  ```
- `idx_eva_friday_meetings_status`
  ```sql
  CREATE INDEX idx_eva_friday_meetings_status ON public.eva_friday_meetings USING btree (status)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
