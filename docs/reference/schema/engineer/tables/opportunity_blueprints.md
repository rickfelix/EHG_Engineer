# opportunity_blueprints Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T16:35:26.549Z
**Rows**: 8
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (38 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| title | `character varying(255)` | **NO** | - | - |
| summary | `text` | YES | - | - |
| problem | `text` | YES | - | - |
| solution | `text` | YES | - | - |
| target_market | `text` | YES | - | - |
| industry | `character varying(100)` | YES | - | - |
| business_model | `text` | YES | - | - |
| category | `character varying(100)` | YES | - | - |
| tags | `ARRAY` | YES | `'{}'::text[]` | - |
| difficulty_level | `character varying(50)` | YES | `'intermediate'::character varying` | - |
| estimated_timeline | `character varying(50)` | YES | - | - |
| success_metrics | `jsonb` | YES | `'{}'::jsonb` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| is_active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| market_segment_id | `uuid` | YES | - | - |
| problem_statement | `text` | YES | - | - |
| solution_concept | `text` | YES | - | - |
| differentiation | `text` | YES | - | - |
| competitive_gaps | `jsonb` | YES | - | - |
| customer_evidence | `jsonb` | YES | - | - |
| opportunity_score | `integer(32)` | YES | - | - |
| chairman_status | `text` | YES | - | - |
| chairman_feedback | `text` | YES | - | - |
| approved_at | `text` | YES | - | - |
| venture_id | `text` | YES | - | - |
| created_by | `text` | YES | - | - |
| enhanced_data | `text` | YES | - | - |
| enhanced_at | `text` | YES | - | - |
| source_type | `text` | YES | `'manual'::text` | - |
| opportunity_box | `text` | YES | - | - |
| time_to_capture_days | `integer(32)` | YES | - | - |
| gap_analysis | `jsonb` | YES | `'{}'::jsonb` | Six-dimension gap analysis: { features, pricing, segments, experience, integrations, quality } |
| ai_metadata | `jsonb` | YES | `'{}'::jsonb` | AI generation metadata: { model, confidence, scan_id, generated_at, four_buckets } |
| confidence_score | `integer(32)` | YES | - | AI confidence score (0-100). >=85 auto-approved, 70-84 pending review, <70 rejected |
| scan_id | `uuid` | YES | - | - |

## Constraints

### Primary Key
- `opportunity_blueprints_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `fk_blueprints_scan_id`: scan_id → opportunity_scans(id)

### Check Constraints
- `chk_blueprints_confidence_score`: CHECK (((confidence_score IS NULL) OR ((confidence_score >= 0) AND (confidence_score <= 100))))
- `chk_blueprints_opportunity_box`: CHECK ((opportunity_box = ANY (ARRAY['green'::text, 'yellow'::text, 'red'::text])))
- `chk_blueprints_source_type`: CHECK ((source_type = ANY (ARRAY['manual'::text, 'ai_generated'::text, 'hybrid'::text])))

## Indexes

- `idx_blueprints_confidence_score`
  ```sql
  CREATE INDEX idx_blueprints_confidence_score ON public.opportunity_blueprints USING btree (confidence_score)
  ```
- `idx_blueprints_opportunity_box`
  ```sql
  CREATE INDEX idx_blueprints_opportunity_box ON public.opportunity_blueprints USING btree (opportunity_box)
  ```
- `idx_blueprints_scan_id`
  ```sql
  CREATE INDEX idx_blueprints_scan_id ON public.opportunity_blueprints USING btree (scan_id)
  ```
- `idx_blueprints_source_type`
  ```sql
  CREATE INDEX idx_blueprints_source_type ON public.opportunity_blueprints USING btree (source_type)
  ```
- `idx_opportunity_blueprints_active`
  ```sql
  CREATE INDEX idx_opportunity_blueprints_active ON public.opportunity_blueprints USING btree (is_active)
  ```
- `idx_opportunity_blueprints_category`
  ```sql
  CREATE INDEX idx_opportunity_blueprints_category ON public.opportunity_blueprints USING btree (category)
  ```
- `idx_opportunity_blueprints_industry`
  ```sql
  CREATE INDEX idx_opportunity_blueprints_industry ON public.opportunity_blueprints USING btree (industry)
  ```
- `idx_opportunity_blueprints_title`
  ```sql
  CREATE INDEX idx_opportunity_blueprints_title ON public.opportunity_blueprints USING btree (title)
  ```
- `opportunity_blueprints_pkey`
  ```sql
  CREATE UNIQUE INDEX opportunity_blueprints_pkey ON public.opportunity_blueprints USING btree (id)
  ```

## RLS Policies

### 1. Anyone can view active blueprints (SELECT)

- **Roles**: {public}
- **Using**: `(is_active = true)`

### 2. Service role full access blueprints (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### opportunity_blueprints_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_opportunity_blueprints_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
