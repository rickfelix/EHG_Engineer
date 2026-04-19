# venture_tiers Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-19T01:29:53.302Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| tier_level | `text` | **NO** | - | Business maturity level: seed, growth, scale, exit |
| promotion_criteria | `jsonb` | YES | `'{}'::jsonb` | JSONB thresholds used to evaluate this tier promotion |
| telemetry_snapshot | `jsonb` | YES | `'{}'::jsonb` | JSONB snapshot of service_telemetry metrics at evaluation time |
| is_current | `boolean` | **NO** | `true` | Only one record per venture should be is_current=true |
| promoted_from | `text` | YES | - | Previous tier level before promotion |
| promotion_reason | `text` | YES | - | - |
| evaluated_by | `text` | YES | `'system'::text` | Who/what triggered this evaluation (system, manual, edge-function) |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `venture_tiers_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_tiers_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `venture_tiers_tier_level_check`: CHECK ((tier_level = ANY (ARRAY['seed'::text, 'growth'::text, 'scale'::text, 'exit'::text])))

## Indexes

- `idx_venture_tiers_current`
  ```sql
  CREATE INDEX idx_venture_tiers_current ON public.venture_tiers USING btree (venture_id) WHERE (is_current = true)
  ```
- `idx_venture_tiers_promotion_criteria`
  ```sql
  CREATE INDEX idx_venture_tiers_promotion_criteria ON public.venture_tiers USING gin (promotion_criteria)
  ```
- `idx_venture_tiers_tier_level`
  ```sql
  CREATE INDEX idx_venture_tiers_tier_level ON public.venture_tiers USING btree (tier_level)
  ```
- `idx_venture_tiers_venture_id`
  ```sql
  CREATE INDEX idx_venture_tiers_venture_id ON public.venture_tiers USING btree (venture_id)
  ```
- `venture_tiers_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_tiers_pkey ON public.venture_tiers USING btree (id)
  ```

## RLS Policies

### 1. venture_tiers_insert_own (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 2. venture_tiers_select_own (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 3. venture_tiers_update_own (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

## Triggers

### set_updated_at_venture_tiers

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

### trigger_mark_previous_tiers_historical

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION mark_previous_tiers_historical()`

---

[← Back to Schema Overview](../database-schema-overview.md)
