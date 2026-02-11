# counterfactual_scores Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-11T15:20:53.824Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| profile_id | `uuid` | **NO** | - | - |
| original_score | `numeric(6,2)` | **NO** | - | - |
| counterfactual_score | `numeric(6,2)` | **NO** | - | - |
| delta | `numeric(6,2)` | **NO** | - | - |
| breakdown | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `counterfactual_scores_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `counterfactual_scores_profile_id_fkey`: profile_id → evaluation_profiles(id)

### Unique Constraints
- `counterfactual_scores_venture_id_profile_id_key`: UNIQUE (venture_id, profile_id)

## Indexes

- `counterfactual_scores_pkey`
  ```sql
  CREATE UNIQUE INDEX counterfactual_scores_pkey ON public.counterfactual_scores USING btree (id)
  ```
- `counterfactual_scores_venture_id_profile_id_key`
  ```sql
  CREATE UNIQUE INDEX counterfactual_scores_venture_id_profile_id_key ON public.counterfactual_scores USING btree (venture_id, profile_id)
  ```
- `idx_counterfactual_scores_delta`
  ```sql
  CREATE INDEX idx_counterfactual_scores_delta ON public.counterfactual_scores USING btree (delta DESC)
  ```
- `idx_counterfactual_scores_profile`
  ```sql
  CREATE INDEX idx_counterfactual_scores_profile ON public.counterfactual_scores USING btree (profile_id)
  ```
- `idx_counterfactual_scores_venture`
  ```sql
  CREATE INDEX idx_counterfactual_scores_venture ON public.counterfactual_scores USING btree (venture_id)
  ```

## RLS Policies

### 1. service_role_full_access_counterfactual_scores (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_update_counterfactual_scores_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_counterfactual_scores_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
