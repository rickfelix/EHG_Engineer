# stage13_substage_states Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-20T19:58:57.591Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| current_substage | `character varying(10)` | **NO** | `'13.1'::character varying` | - |
| substage_entered_at | `timestamp with time zone` | **NO** | `now()` | - |
| exit_strategy_defined | `boolean` | YES | `false` | - |
| value_drivers_count | `integer(32)` | YES | `0` | - |
| driver_scores | `jsonb` | YES | `'[]'::jsonb` | - |
| average_driver_score | `numeric(5,2)` | YES | `0` | - |
| investor_prep_complete | `boolean` | YES | `false` | - |
| last_gate_check_at | `timestamp with time zone` | YES | - | - |
| gate_validation_results | `jsonb` | YES | `'{}'::jsonb` | - |
| chairman_override_active | `boolean` | YES | `false` | - |
| override_reason | `text` | YES | - | - |
| override_by | `uuid` | YES | - | - |
| override_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `stage13_substage_states_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `stage13_substage_states_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `stage13_substage_states_venture_id_key`: UNIQUE (venture_id)

### Check Constraints
- `stage13_substage_states_current_substage_check`: CHECK (((current_substage)::text = ANY ((ARRAY['13.1'::character varying, '13.2'::character varying, '13.3'::character varying, '13.3_complete'::character varying])::text[])))
- `valid_override_reason`: CHECK (((NOT chairman_override_active) OR (chairman_override_active AND (char_length(override_reason) >= 50))))

## Indexes

- `idx_stage13_substage_states_override`
  ```sql
  CREATE INDEX idx_stage13_substage_states_override ON public.stage13_substage_states USING btree (chairman_override_active) WHERE (chairman_override_active = true)
  ```
- `idx_stage13_substage_states_substage`
  ```sql
  CREATE INDEX idx_stage13_substage_states_substage ON public.stage13_substage_states USING btree (current_substage)
  ```
- `idx_stage13_substage_states_venture`
  ```sql
  CREATE INDEX idx_stage13_substage_states_venture ON public.stage13_substage_states USING btree (venture_id)
  ```
- `stage13_substage_states_pkey`
  ```sql
  CREATE UNIQUE INDEX stage13_substage_states_pkey ON public.stage13_substage_states USING btree (id)
  ```
- `stage13_substage_states_venture_id_key`
  ```sql
  CREATE UNIQUE INDEX stage13_substage_states_venture_id_key ON public.stage13_substage_states USING btree (venture_id)
  ```

## RLS Policies

### 1. Company access stage13_substage_states (ALL)

- **Roles**: {public}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

## Triggers

### update_stage13_substage_states_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
