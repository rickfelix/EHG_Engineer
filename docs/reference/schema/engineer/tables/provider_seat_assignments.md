# provider_seat_assignments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-11T17:33:07.943Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| session_id | `uuid` | **NO** | - | - |
| seat_code | `text` | **NO** | - | - |
| provider | `text` | **NO** | - | - |
| model_id | `text` | **NO** | - | - |
| round_number | `integer(32)` | **NO** | `1` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `provider_seat_assignments_pkey`: PRIMARY KEY (id)

### Check Constraints
- `provider_seat_assignments_provider_check`: CHECK ((provider = ANY (ARRAY['anthropic'::text, 'google'::text, 'openai'::text])))

## Indexes

- `idx_provider_seat_assignments_created`
  ```sql
  CREATE INDEX idx_provider_seat_assignments_created ON public.provider_seat_assignments USING btree (created_at)
  ```
- `idx_provider_seat_assignments_session`
  ```sql
  CREATE INDEX idx_provider_seat_assignments_session ON public.provider_seat_assignments USING btree (session_id)
  ```
- `provider_seat_assignments_pkey`
  ```sql
  CREATE UNIQUE INDEX provider_seat_assignments_pkey ON public.provider_seat_assignments USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
