# forecast_ledger Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-01T20:27:50.592Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| question | `text` | **NO** | - | - |
| question_class | `text` | **NO** | - | - |
| p | `numeric` | **NO** | - | - |
| horizon | `text` | YES | - | - |
| resolution_criteria | `text` | **NO** | - | - |
| model | `text` | YES | - | - |
| status | `text` | **NO** | `'open'::text` | - |
| resolved_outcome | `boolean` | YES | - | - |
| brier_score | `numeric` | YES | - | - |
| registered_by | `text` | YES | - | - |
| registered_at | `timestamp with time zone` | **NO** | `now()` | - |
| resolved_by | `text` | YES | - | - |
| resolved_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `forecast_ledger_pkey`: PRIMARY KEY (id)

### Check Constraints
- `forecast_ledger_p_check`: CHECK (((p >= (0)::numeric) AND (p <= (1)::numeric)))
- `forecast_ledger_status_check`: CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text])))

## Indexes

- `forecast_ledger_pkey`
  ```sql
  CREATE UNIQUE INDEX forecast_ledger_pkey ON public.forecast_ledger USING btree (id)
  ```
- `idx_forecast_ledger_question_class`
  ```sql
  CREATE INDEX idx_forecast_ledger_question_class ON public.forecast_ledger USING btree (question_class)
  ```
- `idx_forecast_ledger_status`
  ```sql
  CREATE INDEX idx_forecast_ledger_status ON public.forecast_ledger USING btree (status)
  ```

## RLS Policies

### 1. forecast_ledger_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### forecast_ledger_seal

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION forecast_ledger_seal_guard()`

---

[← Back to Schema Overview](../database-schema-overview.md)
