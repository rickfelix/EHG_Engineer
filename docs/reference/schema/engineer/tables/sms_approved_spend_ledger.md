# sms_approved_spend_ledger Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (5 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| decision_id | `uuid` | **NO** | - | - |
| amount_usd | `numeric` | **NO** | - | - |
| approved_at | `timestamp with time zone` | **NO** | `now()` | - |
| day | `date` | **NO** | `CURRENT_DATE` | - |

## Constraints

### Primary Key
- `sms_approved_spend_ledger_pkey`: PRIMARY KEY (id)

### Check Constraints
- `sms_approved_spend_ledger_amount_usd_check`: CHECK ((amount_usd >= (0)::numeric))

## Indexes

- `idx_sms_approved_spend_ledger_day`
  ```sql
  CREATE INDEX idx_sms_approved_spend_ledger_day ON public.sms_approved_spend_ledger USING btree (day)
  ```
- `sms_approved_spend_ledger_pkey`
  ```sql
  CREATE UNIQUE INDEX sms_approved_spend_ledger_pkey ON public.sms_approved_spend_ledger USING btree (id)
  ```

## RLS Policies

### 1. sms_approved_spend_ledger_chairman_select (SELECT)

- **Roles**: {public}
- **Using**: `fn_is_chairman()`

### 2. sms_approved_spend_ledger_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
