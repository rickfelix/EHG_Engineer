# substage_transition_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T01:18:31.427Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| from_substage | `character varying(10)` | **NO** | - | - |
| to_substage | `character varying(10)` | **NO** | - | - |
| transition_timestamp | `timestamp with time zone` | **NO** | `now()` | - |
| trigger_source | `character varying(50)` | **NO** | - | - |
| completion_criteria_snapshot | `jsonb` | **NO** | `'{}'::jsonb` | - |
| gate_score | `numeric(5,2)` | YES | - | - |
| validation_passed | `boolean` | YES | `true` | - |
| validation_errors | `jsonb` | YES | `'[]'::jsonb` | - |
| override_by | `uuid` | YES | - | - |
| override_reason | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `substage_transition_log_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `substage_transition_log_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `substage_transition_log_trigger_source_check`: CHECK (((trigger_source)::text = ANY ((ARRAY['eva_automatic'::character varying, 'chairman_override'::character varying, 'gate_validation_pass'::character varying, 'manual_admin'::character varying, 'rollback'::character varying])::text[])))

## Indexes

- `idx_substage_transition_log_from_to`
  ```sql
  CREATE INDEX idx_substage_transition_log_from_to ON public.substage_transition_log USING btree (from_substage, to_substage)
  ```
- `idx_substage_transition_log_source`
  ```sql
  CREATE INDEX idx_substage_transition_log_source ON public.substage_transition_log USING btree (trigger_source)
  ```
- `idx_substage_transition_log_timestamp`
  ```sql
  CREATE INDEX idx_substage_transition_log_timestamp ON public.substage_transition_log USING btree (transition_timestamp DESC)
  ```
- `idx_substage_transition_log_venture`
  ```sql
  CREATE INDEX idx_substage_transition_log_venture ON public.substage_transition_log USING btree (venture_id)
  ```
- `substage_transition_log_pkey`
  ```sql
  CREATE UNIQUE INDEX substage_transition_log_pkey ON public.substage_transition_log USING btree (id)
  ```

## RLS Policies

### 1. Company access substage_transition_log (ALL)

- **Roles**: {public}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
