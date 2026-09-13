# michael_gmail_triage_items Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-13T06:31:02.341Z
**Rows**: 215
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| et_date | `date` | **NO** | - | - |
| thread_id | `text` | **NO** | - | - |
| class | `text` | YES | - | - |
| action_intent | `text` | YES | - | - |
| action_taken_at | `timestamp with time zone` | YES | - | - |
| needs_you | `boolean` | **NO** | `false` | - |
| needs_you_reason | `text` | YES | - | - |
| borderline | `boolean` | **NO** | `false` | - |
| rule_key | `text` | YES | - | - |
| verified_by | `text` | YES | - | - |
| summary | `text` | YES | - | - |
| last_message_id | `text` | YES | - | - |
| reopened_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `michael_gmail_triage_items_pkey`: PRIMARY KEY (id)

## Indexes

- `michael_gmail_triage_items_date_thread_uniq`
  ```sql
  CREATE UNIQUE INDEX michael_gmail_triage_items_date_thread_uniq ON public.michael_gmail_triage_items USING btree (et_date, thread_id)
  ```
- `michael_gmail_triage_items_pkey`
  ```sql
  CREATE UNIQUE INDEX michael_gmail_triage_items_pkey ON public.michael_gmail_triage_items USING btree (id)
  ```
- `michael_gmail_triage_items_rule_reopened_idx`
  ```sql
  CREATE INDEX michael_gmail_triage_items_rule_reopened_idx ON public.michael_gmail_triage_items USING btree (rule_key) WHERE (reopened_at IS NOT NULL)
  ```

## RLS Policies

### 1. michael_gmail_triage_items_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### michael_gmail_triage_items_set_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION michael_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
