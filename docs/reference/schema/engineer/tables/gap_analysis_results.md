# gap_analysis_results Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T05:39:23.270Z
**Rows**: 19
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_key | `text` | **NO** | - | Strategic Directive being analyzed (FK to strategic_directives_v2.sd_key) |
| prd_id | `text` | YES | - | Optional FK to product_requirements_v2.id if PRD exists (TEXT type to match product_requirements_v2.id schema) |
| analysis_type | `text` | **NO** | - | Type of analysis: completion (post-EXEC), retroactive (historical audit), manual (human-initiated) |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | **NO** | `'gap-detector'::text` | - |
| total_requirements | `integer(32)` | **NO** | - | Total number of requirements in PRD (functional + non-functional + technical) |
| matched_requirements | `integer(32)` | **NO** | - | Number of requirements verified in implementation |
| coverage_score | `numeric(5,2)` | YES | - | Percentage of requirements matched (0-100). NULL when no PRD exists for the SD. |
| gap_findings | `jsonb` | **NO** | `'[]'::jsonb` | JSONB array of gap findings with requirement_id, gap_type, severity, root_cause, evidence, and corrective_sd_key |
| false_positive_count | `integer(32)` | **NO** | `0` | Number of findings marked as false positives after human review |
| corrective_sds_created | `ARRAY` | YES | `ARRAY[]::text[]` | Array of SD keys created to address gaps found in this analysis |
| analysis_metadata | `jsonb` | **NO** | `'{}'::jsonb` | JSONB metadata: timing, git_range, files_analyzed, analyzer_version, model_used, confidence_threshold |

## Constraints

### Primary Key
- `gap_analysis_results_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `gap_analysis_results_prd_id_fkey`: prd_id → product_requirements_v2(id)
- `gap_analysis_results_sd_key_fkey`: sd_key → strategic_directives_v2(sd_key)

### Check Constraints
- `corrective_sds_non_null`: CHECK ((corrective_sds_created IS NOT NULL))
- `gap_analysis_results_analysis_type_check`: CHECK ((analysis_type = ANY (ARRAY['completion'::text, 'retroactive'::text, 'manual'::text])))
- `gap_analysis_results_coverage_score_check`: CHECK (((coverage_score >= (0)::numeric) AND (coverage_score <= (100)::numeric)))
- `gap_analysis_results_false_positive_count_check`: CHECK ((false_positive_count >= 0))
- `gap_analysis_results_matched_requirements_check`: CHECK ((matched_requirements >= 0))
- `gap_analysis_results_total_requirements_check`: CHECK ((total_requirements >= 0))
- `gap_findings_is_array`: CHECK ((jsonb_typeof(gap_findings) = 'array'::text))
- `matched_lte_total`: CHECK ((matched_requirements <= total_requirements))

## Indexes

- `gap_analysis_results_pkey`
  ```sql
  CREATE UNIQUE INDEX gap_analysis_results_pkey ON public.gap_analysis_results USING btree (id)
  ```
- `idx_gap_analysis_corrective_sds`
  ```sql
  CREATE INDEX idx_gap_analysis_corrective_sds ON public.gap_analysis_results USING gin (corrective_sds_created)
  ```
- `idx_gap_analysis_coverage`
  ```sql
  CREATE INDEX idx_gap_analysis_coverage ON public.gap_analysis_results USING btree (coverage_score) WHERE (coverage_score < (90)::numeric)
  ```
- `idx_gap_analysis_created_at`
  ```sql
  CREATE INDEX idx_gap_analysis_created_at ON public.gap_analysis_results USING btree (created_at DESC)
  ```
- `idx_gap_analysis_findings_gin`
  ```sql
  CREATE INDEX idx_gap_analysis_findings_gin ON public.gap_analysis_results USING gin (gap_findings)
  ```
- `idx_gap_analysis_prd_id`
  ```sql
  CREATE INDEX idx_gap_analysis_prd_id ON public.gap_analysis_results USING btree (prd_id) WHERE (prd_id IS NOT NULL)
  ```
- `idx_gap_analysis_sd_key`
  ```sql
  CREATE INDEX idx_gap_analysis_sd_key ON public.gap_analysis_results USING btree (sd_key)
  ```
- `idx_gap_analysis_type`
  ```sql
  CREATE INDEX idx_gap_analysis_type ON public.gap_analysis_results USING btree (analysis_type)
  ```
- `idx_gap_analysis_type_created`
  ```sql
  CREATE INDEX idx_gap_analysis_type_created ON public.gap_analysis_results USING btree (analysis_type, created_at DESC)
  ```

## RLS Policies

### 1. anon_read_gap_analysis (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. authenticated_read_gap_analysis (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. service_role_all_gap_analysis (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
