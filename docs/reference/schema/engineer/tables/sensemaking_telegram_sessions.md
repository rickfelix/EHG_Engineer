# sensemaking_telegram_sessions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-28T03:49:53.877Z
**Rows**: 8
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| analysis_id | `uuid` | **NO** | - | - |
| short_id | `text` | **NO** | - | - |
| chat_id | `text` | **NO** | - | - |
| message_id | `text` | YES | - | - |
| state | `text` | **NO** | `'awaiting_results'::text` | - |
| current_persona_index | `integer(32)` | YES | `0` | - |
| persona_dispositions | `jsonb` | YES | `'[]'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| expires_at | `timestamp with time zone` | **NO** | `(now() + '24:00:00'::interval)` | - |

## Constraints

### Primary Key
- `sensemaking_telegram_sessions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sensemaking_telegram_sessions_analysis_id_fkey`: analysis_id → sensemaking_analyses(id)

### Unique Constraints
- `sensemaking_telegram_sessions_short_id_key`: UNIQUE (short_id)

### Check Constraints
- `sensemaking_telegram_sessions_state_check`: CHECK ((state = ANY (ARRAY['awaiting_results'::text, 'presenting'::text, 'reviewing'::text, 'completed'::text, 'expired'::text, 'error'::text])))

## Indexes

- `idx_sm_telegram_sessions_analysis`
  ```sql
  CREATE INDEX idx_sm_telegram_sessions_analysis ON public.sensemaking_telegram_sessions USING btree (analysis_id)
  ```
- `idx_sm_telegram_sessions_expires`
  ```sql
  CREATE INDEX idx_sm_telegram_sessions_expires ON public.sensemaking_telegram_sessions USING btree (expires_at) WHERE (state <> ALL (ARRAY['completed'::text, 'expired'::text]))
  ```
- `idx_sm_telegram_sessions_short_id`
  ```sql
  CREATE INDEX idx_sm_telegram_sessions_short_id ON public.sensemaking_telegram_sessions USING btree (short_id)
  ```
- `sensemaking_telegram_sessions_pkey`
  ```sql
  CREATE UNIQUE INDEX sensemaking_telegram_sessions_pkey ON public.sensemaking_telegram_sessions USING btree (id)
  ```
- `sensemaking_telegram_sessions_short_id_key`
  ```sql
  CREATE UNIQUE INDEX sensemaking_telegram_sessions_short_id_key ON public.sensemaking_telegram_sessions USING btree (short_id)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
