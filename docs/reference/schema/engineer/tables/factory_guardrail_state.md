# factory_guardrail_state Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-12T21:52:33.070Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| venture_id | `uuid` | **NO** | - | - |
| corrections_today | `integer(32)` | **NO** | `0` | - |
| kill_switch_active | `boolean` | **NO** | `false` | - |
| last_correction_at | `timestamp with time zone` | YES | - | - |
| canary_expires_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `factory_guardrail_state_pkey`: PRIMARY KEY (venture_id)

### Foreign Keys
- `factory_guardrail_state_venture_id_fkey`: venture_id → ventures(id)

## Indexes

- `factory_guardrail_state_pkey`
  ```sql
  CREATE UNIQUE INDEX factory_guardrail_state_pkey ON public.factory_guardrail_state USING btree (venture_id)
  ```
- `idx_factory_guardrail_venture`
  ```sql
  CREATE INDEX idx_factory_guardrail_venture ON public.factory_guardrail_state USING btree (venture_id)
  ```

## Triggers

### trg_factory_guardrail_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_factory_guardrail_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
