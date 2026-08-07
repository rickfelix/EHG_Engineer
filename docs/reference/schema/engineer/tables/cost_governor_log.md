# cost_governor_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-01T20:27:50.592Z
**Rows**: 2,378
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| decision_type | `text` | **NO** | - | - |
| action | `text` | **NO** | - | - |
| target_key | `text` | YES | - | - |
| mode | `text` | **NO** | `'observe'::text` | - |
| measured | `jsonb` | **NO** | `'{}'::jsonb` | - |
| reason | `text` | **NO** | `''::text` | - |
| thresholds | `jsonb` | **NO** | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `cost_governor_log_pkey`: PRIMARY KEY (id)

### Check Constraints
- `cost_governor_log_decision_type_check`: CHECK ((decision_type = ANY (ARRAY['regen'::text, 'tier'::text, 'anomaly'::text, 'tune'::text])))
- `cost_governor_log_mode_check`: CHECK ((mode = ANY (ARRAY['observe'::text, 'enforce'::text])))

## Indexes

- `cost_governor_log_pkey`
  ```sql
  CREATE UNIQUE INDEX cost_governor_log_pkey ON public.cost_governor_log USING btree (id)
  ```
- `idx_cost_governor_log_created_at`
  ```sql
  CREATE INDEX idx_cost_governor_log_created_at ON public.cost_governor_log USING btree (created_at DESC)
  ```
- `idx_cost_governor_log_type_target`
  ```sql
  CREATE INDEX idx_cost_governor_log_type_target ON public.cost_governor_log USING btree (decision_type, target_key)
  ```

## RLS Policies

### 1. cost_governor_log_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
