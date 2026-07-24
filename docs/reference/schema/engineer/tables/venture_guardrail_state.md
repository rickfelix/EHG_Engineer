# venture_guardrail_state Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 8
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| guardrail | `text` | **NO** | - | - |
| decision | `text` | **NO** | - | - |
| reason | `text` | YES | - | - |
| killswitch_open | `boolean` | **NO** | `false` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_guardrail_state_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `venture_guardrail_state_venture_id_guardrail_key`: UNIQUE (venture_id, guardrail)

### Check Constraints
- `venture_guardrail_state_decision_check`: CHECK ((decision = ANY (ARRAY['allow'::text, 'block'::text])))

## Indexes

- `idx_venture_guardrail_state_venture`
  ```sql
  CREATE INDEX idx_venture_guardrail_state_venture ON public.venture_guardrail_state USING btree (venture_id)
  ```
- `venture_guardrail_state_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_guardrail_state_pkey ON public.venture_guardrail_state USING btree (id)
  ```
- `venture_guardrail_state_venture_id_guardrail_key`
  ```sql
  CREATE UNIQUE INDEX venture_guardrail_state_venture_id_guardrail_key ON public.venture_guardrail_state USING btree (venture_id, guardrail)
  ```

## RLS Policies

### 1. venture_guardrail_state_read (SELECT)

- **Roles**: {public}
- **Using**: `((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text))`

### 2. venture_guardrail_state_service_write (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
