# chairman_decisions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-02T01:36:06.852Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| lifecycle_stage | `integer(32)` | **NO** | - | - |
| health_score | `character varying(10)` | YES | - | - |
| recommendation | `character varying(20)` | YES | - | - |
| decision | `character varying(20)` | **NO** | - | - |
| override_reason | `text` | YES | - | - |
| risks_acknowledged | `jsonb` | YES | - | - |
| quick_fixes_applied | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `chairman_decisions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `chairman_decisions_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `chairman_decisions_decision_check`: CHECK (((decision)::text = ANY ((ARRAY['proceed'::character varying, 'pivot'::character varying, 'fix'::character varying, 'kill'::character varying, 'pause'::character varying, 'override'::character varying])::text[])))
- `chairman_decisions_health_score_check`: CHECK (((health_score)::text = ANY ((ARRAY['green'::character varying, 'yellow'::character varying, 'red'::character varying])::text[])))
- `chairman_decisions_recommendation_check`: CHECK (((recommendation)::text = ANY ((ARRAY['proceed'::character varying, 'pivot'::character varying, 'fix'::character varying, 'kill'::character varying, 'pause'::character varying])::text[])))

## Indexes

- `chairman_decisions_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_decisions_pkey ON public.chairman_decisions USING btree (id)
  ```
- `idx_chairman_decisions_created`
  ```sql
  CREATE INDEX idx_chairman_decisions_created ON public.chairman_decisions USING btree (created_at DESC)
  ```
- `idx_chairman_decisions_stage`
  ```sql
  CREATE INDEX idx_chairman_decisions_stage ON public.chairman_decisions USING btree (lifecycle_stage)
  ```
- `idx_chairman_decisions_venture`
  ```sql
  CREATE INDEX idx_chairman_decisions_venture ON public.chairman_decisions USING btree (venture_id)
  ```

## RLS Policies

### 1. chairman_decisions_delete_policy (DELETE)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`

### 2. chairman_decisions_insert_policy (INSERT)

- **Roles**: {authenticated}
- **With Check**: `fn_is_chairman()`

### 3. chairman_decisions_select_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`

### 4. chairman_decisions_update_policy (UPDATE)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`
- **With Check**: `fn_is_chairman()`

## Triggers

### trg_doctrine_constraint_chairman

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION enforce_doctrine_of_constraint()`

### trg_doctrine_constraint_chairman

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION enforce_doctrine_of_constraint()`

---

[← Back to Schema Overview](../database-schema-overview.md)
