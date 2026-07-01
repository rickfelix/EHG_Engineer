# solomon_advice_outcome_ledger Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-01T23:03:52.914Z
**Rows**: 5
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| advisory_id | `uuid` | YES | - | - |
| correlation_id | `text` | **NO** | - | - |
| sd_key | `text` | YES | - | - |
| proposal_summary | `text` | **NO** | - | - |
| proposal_kind | `text` | **NO** | `'advisory'::text` | - |
| decision | `text` | **NO** | `'pending'::text` | - |
| decision_by | `text` | YES | - | - |
| decision_at | `timestamp with time zone` | YES | - | - |
| outcome | `text` | **NO** | `'unknown'::text` | - |
| outcome_sd_key | `text` | YES | - | - |
| outcome_ref | `text` | YES | - | - |
| cost_tokens | `bigint(64)` | YES | - | - |
| cost_wall_ms | `bigint(64)` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `solomon_advice_outcome_ledger_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `solomon_advice_outcome_ledger_correlation_id_key`: UNIQUE (correlation_id)

### Check Constraints
- `solomon_advice_outcome_ledger_decision_check`: CHECK ((decision = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'partial'::text])))
- `solomon_advice_outcome_ledger_outcome_check`: CHECK ((outcome = ANY (ARRAY['unknown'::text, 'shipped_clean'::text, 'reverted'::text, 'caused_rework'::text])))
- `solomon_advice_outcome_ledger_proposal_kind_check`: CHECK ((proposal_kind = ANY (ARRAY['advisory'::text, 'finding'::text, 'consult_answer'::text])))

## Indexes

- `idx_solomon_ledger_created`
  ```sql
  CREATE INDEX idx_solomon_ledger_created ON public.solomon_advice_outcome_ledger USING btree (created_at DESC)
  ```
- `idx_solomon_ledger_decision`
  ```sql
  CREATE INDEX idx_solomon_ledger_decision ON public.solomon_advice_outcome_ledger USING btree (decision)
  ```
- `idx_solomon_ledger_outcome_sd_key`
  ```sql
  CREATE INDEX idx_solomon_ledger_outcome_sd_key ON public.solomon_advice_outcome_ledger USING btree (outcome_sd_key) WHERE (outcome_sd_key IS NOT NULL)
  ```
- `solomon_advice_outcome_ledger_correlation_id_key`
  ```sql
  CREATE UNIQUE INDEX solomon_advice_outcome_ledger_correlation_id_key ON public.solomon_advice_outcome_ledger USING btree (correlation_id)
  ```
- `solomon_advice_outcome_ledger_pkey`
  ```sql
  CREATE UNIQUE INDEX solomon_advice_outcome_ledger_pkey ON public.solomon_advice_outcome_ledger USING btree (id)
  ```

## RLS Policies

### 1. solomon_advice_outcome_ledger_read (SELECT)

- **Roles**: {public}
- **Using**: `((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text))`

### 2. solomon_advice_outcome_ledger_service_write (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

## Triggers

### trg_solomon_ledger_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trg_solomon_advice_outcome_ledger_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
