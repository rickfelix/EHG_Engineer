# venture_briefs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-10T05:38:09.001Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (25 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| name | `text` | **NO** | - | - |
| problem_statement | `text` | **NO** | - | - |
| raw_chairman_intent | `text` | **NO** | - | Immutable original chairman vision - never modified after creation |
| solution | `text` | YES | - | - |
| target_market | `text` | YES | - | - |
| origin_type | `text` | **NO** | - | - |
| competitor_ref | `jsonb` | YES | - | - |
| blueprint_id | `uuid` | YES | - | - |
| discovery_strategy | `text` | YES | - | - |
| archetype | `text` | YES | - | - |
| moat_strategy | `jsonb` | YES | - | - |
| portfolio_synergy_score | `numeric(3,2)` | YES | - | - |
| portfolio_evaluation | `jsonb` | YES | - | - |
| time_horizon_classification | `text` | YES | - | - |
| build_estimate | `jsonb` | YES | - | - |
| cross_references | `jsonb` | YES | - | - |
| chairman_constraint_scores | `jsonb` | YES | - | - |
| problem_reframings | `jsonb` | YES | - | - |
| maturity | `text` | **NO** | `'ready'::text` | seed = raw thought, sprout = partially structured, ready = enters Stage 1 |
| created_by | `text` | YES | `'stage0_engine'::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| profile_id | `uuid` | YES | - | Evaluation profile active when this brief was created (nullable for pre-profile briefs) |

## Constraints

### Primary Key
- `venture_briefs_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_briefs_profile_id_fkey`: profile_id → evaluation_profiles(id)
- `venture_briefs_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `venture_briefs_maturity_check`: CHECK ((maturity = ANY (ARRAY['seed'::text, 'sprout'::text, 'ready'::text])))
- `venture_briefs_origin_type_check`: CHECK ((origin_type = ANY (ARRAY['competitor_teardown'::text, 'competitor_clone'::text, 'blueprint'::text, 'discovery'::text, 'manual'::text])))
- `venture_briefs_portfolio_synergy_score_check`: CHECK (((portfolio_synergy_score >= (0)::numeric) AND (portfolio_synergy_score <= (1)::numeric)))
- `venture_briefs_time_horizon_classification_check`: CHECK ((time_horizon_classification = ANY (ARRAY['build_now'::text, 'park_later'::text, 'window_closing'::text])))

## Indexes

- `idx_venture_briefs_created_at`
  ```sql
  CREATE INDEX idx_venture_briefs_created_at ON public.venture_briefs USING btree (created_at DESC)
  ```
- `idx_venture_briefs_maturity`
  ```sql
  CREATE INDEX idx_venture_briefs_maturity ON public.venture_briefs USING btree (maturity)
  ```
- `idx_venture_briefs_origin_type`
  ```sql
  CREATE INDEX idx_venture_briefs_origin_type ON public.venture_briefs USING btree (origin_type)
  ```
- `idx_venture_briefs_profile_id`
  ```sql
  CREATE INDEX idx_venture_briefs_profile_id ON public.venture_briefs USING btree (profile_id)
  ```
- `idx_venture_briefs_venture_id`
  ```sql
  CREATE INDEX idx_venture_briefs_venture_id ON public.venture_briefs USING btree (venture_id)
  ```
- `venture_briefs_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_briefs_pkey ON public.venture_briefs USING btree (id)
  ```

## RLS Policies

### 1. venture_briefs_service_all (ALL)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
