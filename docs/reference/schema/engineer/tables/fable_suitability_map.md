# fable_suitability_map Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 1
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| region_key | `text` | **NO** | - | Deterministic region identity: canonical repo id + declared coarse structural boundary, normalized (lowercase/forward-slash). CHECK-enforced so child B cannot emit a drifting/path-derived key — stability is required for the section-11 advice-outcome ledger JOIN. |
| repo | `text` | **NO** | - | - |
| score_version | `integer(32)` | **NO** | - | - |
| duty_cluster | `text` | **NO** | - | - |
| axis_impact | `integer(32)` | YES | - | - |
| axis_opportunity | `integer(32)` | YES | - | - |
| axis_reasoning_depth | `integer(32)` | YES | - | - |
| composite_score | `integer(32)` | YES | - | - |
| evidence | `jsonb` | **NO** | - | Documented shape (validated pre-insert): { evidence_schema_version, axes:{impact/opportunity/reasoning_depth:{score,inputs,rationale}}, recurrence:{weight,count,source_ids}, scored_by, computed_at }. issue_patterns referenced by ID; no embedded file/log dumps. evidence_schema_version is distinct from the row score_version. |
| recurrence_weight | `numeric` | YES | - | - |
| trigger_reason | `text` | YES | - | - |
| status | `text` | **NO** | `'scored'::text` | - |
| last_scored_at | `timestamp with time zone` | **NO** | `now()` | - |
| refloated_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `fable_suitability_map_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `fable_suitability_map_versioned`: UNIQUE (region_key, repo, score_version)

### Check Constraints
- `fable_region_key_shape`: CHECK (((region_key ~ '^[a-z0-9][a-z0-9._/-]{0,199}$'::text) AND (region_key !~ '(\\|:| |//|^/|/$)'::text)))
- `fable_suitability_map_axis_impact_check`: CHECK (((axis_impact >= 1) AND (axis_impact <= 5)))
- `fable_suitability_map_axis_opportunity_check`: CHECK (((axis_opportunity >= 1) AND (axis_opportunity <= 5)))
- `fable_suitability_map_axis_reasoning_depth_check`: CHECK (((axis_reasoning_depth >= 1) AND (axis_reasoning_depth <= 5)))
- `fable_suitability_map_duty_cluster_check`: CHECK ((duty_cluster = ANY (ARRAY['architecture-refactor'::text, 'dedup'::text, 'flaky-RCA'::text, 'harness-depth'::text])))

## Indexes

- `fable_suitability_map_pkey`
  ```sql
  CREATE UNIQUE INDEX fable_suitability_map_pkey ON public.fable_suitability_map USING btree (id)
  ```
- `fable_suitability_map_versioned`
  ```sql
  CREATE UNIQUE INDEX fable_suitability_map_versioned ON public.fable_suitability_map USING btree (region_key, repo, score_version)
  ```
- `idx_fable_suitability_cluster`
  ```sql
  CREATE INDEX idx_fable_suitability_cluster ON public.fable_suitability_map USING btree (duty_cluster, composite_score DESC)
  ```
- `idx_fable_suitability_region`
  ```sql
  CREATE INDEX idx_fable_suitability_region ON public.fable_suitability_map USING btree (region_key, repo, score_version DESC)
  ```

## RLS Policies

### 1. fable_suitability_chairman_select (SELECT)

- **Roles**: {public}
- **Using**: `fn_is_chairman()`

---

[← Back to Schema Overview](../database-schema-overview.md)
