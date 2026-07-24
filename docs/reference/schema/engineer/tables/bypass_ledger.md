# bypass_ledger Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 38
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| handoff_id | `uuid` | YES | - | - |
| bypass_type | `text` | **NO** | - | - |
| bypass_reason | `text` | **NO** | - | - |
| sd_key | `text` | YES | - | - |
| sd_id | `uuid` | YES | - | - |
| phase | `text` | YES | - | - |
| bypass_actor | `text` | YES | - | - |
| bypass_quota_remaining | `integer(32)` | YES | - | - |
| correlation_id | `uuid` | **NO** | `gen_random_uuid()` | - |
| audit_log_id | `uuid` | YES | - | - |
| audit_log_written_at | `timestamp with time zone` | YES | - | - |
| smoke_test_passed_at | `timestamp with time zone` | YES | - | - |
| runtime_observed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `bypass_ledger_pkey`: PRIMARY KEY (id)

### Check Constraints
- `bypass_ledger_bypass_reason_length_check`: CHECK ((length(bypass_reason) >= 20))

## Indexes

- `bypass_ledger_pkey`
  ```sql
  CREATE UNIQUE INDEX bypass_ledger_pkey ON public.bypass_ledger USING btree (id)
  ```
- `idx_bypass_ledger_audit_log`
  ```sql
  CREATE INDEX idx_bypass_ledger_audit_log ON public.bypass_ledger USING btree (audit_log_id)
  ```
- `idx_bypass_ledger_correlation`
  ```sql
  CREATE INDEX idx_bypass_ledger_correlation ON public.bypass_ledger USING btree (correlation_id)
  ```
- `idx_bypass_ledger_created`
  ```sql
  CREATE INDEX idx_bypass_ledger_created ON public.bypass_ledger USING btree (created_at DESC)
  ```
- `idx_bypass_ledger_phase`
  ```sql
  CREATE INDEX idx_bypass_ledger_phase ON public.bypass_ledger USING btree (phase)
  ```
- `idx_bypass_ledger_sd_key`
  ```sql
  CREATE INDEX idx_bypass_ledger_sd_key ON public.bypass_ledger USING btree (sd_key)
  ```

## RLS Policies

### 1. bypass_ledger_read_all (SELECT)

- **Roles**: {public}
- **Using**: `true`

## Triggers

### bypass_ledger_vocab_advisory

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION bypass_ledger_advisory_vocab_trigger()`

---

[← Back to Schema Overview](../database-schema-overview.md)
