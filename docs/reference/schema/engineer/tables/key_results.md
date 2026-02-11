# key_results Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-11T16:34:40.900Z
**Rows**: 10
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| objective_id | `uuid` | YES | - | - |
| code | `text` | **NO** | - | - |
| title | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| metric_type | `text` | YES | - | - |
| baseline_value | `numeric` | YES | - | Starting value when KR was created |
| current_value | `numeric` | YES | - | Current measured value |
| target_value | `numeric` | **NO** | - | - |
| unit | `text` | YES | - | - |
| direction | `text` | YES | `'increase'::text` | Whether we want this metric to go up, down, or stay stable |
| confidence | `numeric` | YES | - | Subjective confidence (0-1) of hitting target |
| status | `text` | YES | `'pending'::text` | - |
| sequence | `integer(32)` | YES | `1` | - |
| is_active | `boolean` | YES | `true` | - |
| last_updated_by | `text` | YES | - | - |
| created_by | `text` | YES | `'system'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `key_results_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `key_results_objective_id_fkey`: objective_id → objectives(id)

### Unique Constraints
- `key_results_code_key`: UNIQUE (code)

### Check Constraints
- `key_results_confidence_check`: CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))
- `key_results_direction_check`: CHECK ((direction = ANY (ARRAY['increase'::text, 'decrease'::text, 'maintain'::text])))
- `key_results_metric_type_check`: CHECK ((metric_type = ANY (ARRAY['percentage'::text, 'number'::text, 'currency'::text, 'duration'::text, 'boolean'::text, 'stage'::text])))
- `key_results_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'on_track'::text, 'at_risk'::text, 'off_track'::text, 'achieved'::text, 'missed'::text])))

## Indexes

- `idx_key_results_is_active`
  ```sql
  CREATE INDEX idx_key_results_is_active ON public.key_results USING btree (is_active)
  ```
- `idx_key_results_objective_id`
  ```sql
  CREATE INDEX idx_key_results_objective_id ON public.key_results USING btree (objective_id)
  ```
- `idx_key_results_status`
  ```sql
  CREATE INDEX idx_key_results_status ON public.key_results USING btree (status)
  ```
- `key_results_code_key`
  ```sql
  CREATE UNIQUE INDEX key_results_code_key ON public.key_results USING btree (code)
  ```
- `key_results_pkey`
  ```sql
  CREATE UNIQUE INDEX key_results_pkey ON public.key_results USING btree (id)
  ```

## RLS Policies

### 1. Chairman full access on key_results (ALL)

- **Roles**: {authenticated}
- **Using**: `((auth.jwt() ->> 'email'::text) = 'rick@emeraldholdingsgroup.com'::text)`
- **With Check**: `((auth.jwt() ->> 'email'::text) = 'rick@emeraldholdingsgroup.com'::text)`

### 2. Service role bypass on key_results (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trigger_update_kr_status

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_kr_status()`

---

[← Back to Schema Overview](../database-schema-overview.md)
