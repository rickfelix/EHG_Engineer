# sd_overlap_analysis Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T18:15:08.433Z
**Rows**: 641
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd1_id | `text` | **NO** | - | - |
| sd2_id | `text` | **NO** | - | - |
| analysis_timestamp | `timestamp without time zone` | YES | `now()` | - |
| overlap_score | `numeric(5,2)` | YES | - | - |
| stage_overlap_count | `integer(32)` | YES | `0` | - |
| keyword_similarity | `numeric(5,2)` | YES | `0` | - |
| functional_overlap | `numeric(5,2)` | YES | `0` | - |
| resource_conflicts | `integer(32)` | YES | `0` | - |
| overlapping_stages | `ARRAY` | YES | - | - |
| overlapping_items | `jsonb` | YES | `'[]'::jsonb` | - |
| shared_keywords | `ARRAY` | YES | - | - |
| conflicting_resources | `jsonb` | YES | `'{}'::jsonb` | - |
| recommendation | `text` | YES | - | - |
| recommended_sequence | `ARRAY` | YES | - | - |
| resolution_notes | `text` | YES | - | - |
| analyzed_by | `text` | YES | `'VALIDATION'::text` | - |
| human_reviewed | `boolean` | YES | `false` | - |
| review_notes | `text` | YES | - | - |

## Constraints

### Primary Key
- `sd_overlap_analysis_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `unique_sd_pair`: UNIQUE (sd1_id, sd2_id)

### Check Constraints
- `different_sds`: CHECK ((sd1_id <> sd2_id))
- `sd_overlap_analysis_overlap_score_check`: CHECK (((overlap_score >= (0)::numeric) AND (overlap_score <= (100)::numeric)))
- `sd_overlap_analysis_recommendation_check`: CHECK ((recommendation = ANY (ARRAY['NO_ACTION'::text, 'CONSOLIDATE'::text, 'SEQUENCE'::text, 'SHARE_COMPONENTS'::text, 'ESCALATE'::text, 'BLOCK'::text])))

## Indexes

- `idx_overlap_score`
  ```sql
  CREATE INDEX idx_overlap_score ON public.sd_overlap_analysis USING btree (overlap_score DESC)
  ```
- `idx_overlap_sd1`
  ```sql
  CREATE INDEX idx_overlap_sd1 ON public.sd_overlap_analysis USING btree (sd1_id)
  ```
- `idx_overlap_sd2`
  ```sql
  CREATE INDEX idx_overlap_sd2 ON public.sd_overlap_analysis USING btree (sd2_id)
  ```
- `idx_overlap_timestamp`
  ```sql
  CREATE INDEX idx_overlap_timestamp ON public.sd_overlap_analysis USING btree (analysis_timestamp DESC)
  ```
- `sd_overlap_analysis_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_overlap_analysis_pkey ON public.sd_overlap_analysis USING btree (id)
  ```
- `unique_sd_pair`
  ```sql
  CREATE UNIQUE INDEX unique_sd_pair ON public.sd_overlap_analysis USING btree (sd1_id, sd2_id)
  ```

## RLS Policies

### 1. authenticated_read_sd_overlap_analysis (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_sd_overlap_analysis (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
