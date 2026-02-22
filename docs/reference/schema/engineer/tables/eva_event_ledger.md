# eva_event_ledger Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T02:46:03.894Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| event_id | `uuid` | **NO** | - | - |
| event_type | `text` | **NO** | - | - |
| handler_name | `text` | **NO** | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| attempts | `integer(32)` | YES | `0` | - |
| first_seen_at | `timestamp with time zone` | YES | `now()` | - |
| last_attempt_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| error_message | `text` | YES | - | - |
| error_stack | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_event_ledger_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_event_ledger_event_id_fkey`: event_id → eva_events(id)

### Check Constraints
- `eva_event_ledger_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'success'::text, 'failed'::text, 'dead'::text, 'replayed'::text])))

## Indexes

- `eva_event_ledger_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_event_ledger_pkey ON public.eva_event_ledger USING btree (id)
  ```
- `idx_eva_event_ledger_event_id`
  ```sql
  CREATE INDEX idx_eva_event_ledger_event_id ON public.eva_event_ledger USING btree (event_id)
  ```
- `idx_eva_event_ledger_event_type`
  ```sql
  CREATE INDEX idx_eva_event_ledger_event_type ON public.eva_event_ledger USING btree (event_type)
  ```
- `idx_eva_event_ledger_status`
  ```sql
  CREATE INDEX idx_eva_event_ledger_status ON public.eva_event_ledger USING btree (status)
  ```

## RLS Policies

### 1. eva_event_ledger_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. eva_event_ledger_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
