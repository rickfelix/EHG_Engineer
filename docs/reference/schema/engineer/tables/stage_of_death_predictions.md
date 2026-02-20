# stage_of_death_predictions Table

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

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| archetype_key | `text` | **NO** | - | - |
| profile_id | `uuid` | **NO** | - | - |
| predicted_death_stage | `integer(32)` | **NO** | - | - |
| predicted_probability | `numeric(5,4)` | **NO** | - | - |
| death_factors | `jsonb` | YES | - | - |
| confidence_score | `numeric(4,3)` | YES | - | - |
| mortality_curve | `jsonb` | YES | - | - |
| actual_death_stage | `integer(32)` | YES | - | - |
| prediction_accuracy | `numeric(5,2)` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `stage_of_death_predictions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `stage_of_death_predictions_profile_id_fkey`: profile_id → evaluation_profiles(id)

### Unique Constraints
- `stage_of_death_predictions_venture_id_profile_id_key`: UNIQUE (venture_id, profile_id)

### Check Constraints
- `stage_of_death_predictions_actual_death_stage_check`: CHECK (((actual_death_stage IS NULL) OR ((actual_death_stage >= 1) AND (actual_death_stage <= 25))))
- `stage_of_death_predictions_confidence_score_check`: CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric)))
- `stage_of_death_predictions_predicted_death_stage_check`: CHECK (((predicted_death_stage >= 1) AND (predicted_death_stage <= 25)))
- `stage_of_death_predictions_predicted_probability_check`: CHECK (((predicted_probability >= (0)::numeric) AND (predicted_probability <= (1)::numeric)))

## Indexes

- `idx_sod_predictions_archetype`
  ```sql
  CREATE INDEX idx_sod_predictions_archetype ON public.stage_of_death_predictions USING btree (archetype_key)
  ```
- `idx_sod_predictions_profile`
  ```sql
  CREATE INDEX idx_sod_predictions_profile ON public.stage_of_death_predictions USING btree (profile_id)
  ```
- `idx_sod_predictions_stage`
  ```sql
  CREATE INDEX idx_sod_predictions_stage ON public.stage_of_death_predictions USING btree (predicted_death_stage)
  ```
- `idx_sod_predictions_venture`
  ```sql
  CREATE INDEX idx_sod_predictions_venture ON public.stage_of_death_predictions USING btree (venture_id)
  ```
- `stage_of_death_predictions_pkey`
  ```sql
  CREATE UNIQUE INDEX stage_of_death_predictions_pkey ON public.stage_of_death_predictions USING btree (id)
  ```
- `stage_of_death_predictions_venture_id_profile_id_key`
  ```sql
  CREATE UNIQUE INDEX stage_of_death_predictions_venture_id_profile_id_key ON public.stage_of_death_predictions USING btree (venture_id, profile_id)
  ```

## RLS Policies

### 1. service_role_full_access_sod_predictions (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_update_sod_predictions_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_sod_predictions_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
