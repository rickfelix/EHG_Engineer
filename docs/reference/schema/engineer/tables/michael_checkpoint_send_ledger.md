# michael_checkpoint_send_ledger Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-15T16:18:27.599Z
**Rows**: 6
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| et_date | `date` | **NO** | - | - |
| window_slot | `text` | **NO** | - | - |
| outcome | `text` | **NO** | - | - |
| refusal_code | `text` | YES | - | - |
| provider_message_id | `text` | YES | - | - |
| body_sha256 | `text` | YES | - | - |
| body_len | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `michael_checkpoint_send_ledger_pkey`: PRIMARY KEY (id)

### Check Constraints
- `michael_checkpoint_send_ledger_outcome_check`: CHECK ((outcome = ANY (ARRAY['sent'::text, 'held'::text, 'refused'::text])))

## Indexes

- `michael_checkpoint_send_ledger_et_date_idx`
  ```sql
  CREATE INDEX michael_checkpoint_send_ledger_et_date_idx ON public.michael_checkpoint_send_ledger USING btree (et_date)
  ```
- `michael_checkpoint_send_ledger_pkey`
  ```sql
  CREATE UNIQUE INDEX michael_checkpoint_send_ledger_pkey ON public.michael_checkpoint_send_ledger USING btree (id)
  ```
- `michael_checkpoint_send_ledger_sent_slot_uniq`
  ```sql
  CREATE UNIQUE INDEX michael_checkpoint_send_ledger_sent_slot_uniq ON public.michael_checkpoint_send_ledger USING btree (et_date, window_slot) WHERE (outcome = 'sent'::text)
  ```

## RLS Policies

### 1. michael_checkpoint_send_ledger_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### michael_checkpoint_send_ledger_set_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION michael_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
