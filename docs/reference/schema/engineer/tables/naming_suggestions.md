# naming_suggestions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T12:18:33.844Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (21 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| brand_genome_id | `uuid` | YES | - | - |
| generation_session_id | `uuid` | **NO** | - | - |
| generation_style | `text` | YES | - | - |
| name | `text` | **NO** | - | - |
| phonetic_guide | `text` | YES | - | - |
| rationale | `text` | YES | - | - |
| brand_fit_score | `integer(32)` | YES | - | - |
| length_score | `integer(32)` | YES | - | - |
| pronounceability_score | `integer(32)` | YES | - | - |
| uniqueness_score | `integer(32)` | YES | - | - |
| domain_com_status | `text` | YES | - | - |
| domain_io_status | `text` | YES | - | - |
| domain_ai_status | `text` | YES | - | - |
| domain_checked_at | `timestamp with time zone` | YES | - | - |
| llm_model | `text` | YES | - | - |
| llm_provider | `text` | YES | - | - |
| generation_cost | `numeric(10,6)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `naming_suggestions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `naming_suggestions_brand_genome_id_fkey`: brand_genome_id → brand_genome_submissions(id)
- `naming_suggestions_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `naming_suggestions_brand_fit_score_check`: CHECK (((brand_fit_score >= 0) AND (brand_fit_score <= 100)))
- `naming_suggestions_domain_ai_status_check`: CHECK ((domain_ai_status = ANY (ARRAY['available'::text, 'taken'::text, 'error'::text, 'unknown'::text])))
- `naming_suggestions_domain_com_status_check`: CHECK ((domain_com_status = ANY (ARRAY['available'::text, 'taken'::text, 'error'::text, 'unknown'::text])))
- `naming_suggestions_domain_io_status_check`: CHECK ((domain_io_status = ANY (ARRAY['available'::text, 'taken'::text, 'error'::text, 'unknown'::text])))
- `naming_suggestions_generation_style_check`: CHECK ((generation_style = ANY (ARRAY['descriptive'::text, 'coined'::text, 'abstract'::text, 'combined'::text, 'metaphorical'::text])))
- `naming_suggestions_length_score_check`: CHECK (((length_score >= 0) AND (length_score <= 100)))
- `naming_suggestions_pronounceability_score_check`: CHECK (((pronounceability_score >= 0) AND (pronounceability_score <= 100)))
- `naming_suggestions_uniqueness_score_check`: CHECK (((uniqueness_score >= 0) AND (uniqueness_score <= 100)))

## Indexes

- `idx_naming_suggestions_score`
  ```sql
  CREATE INDEX idx_naming_suggestions_score ON public.naming_suggestions USING btree (brand_fit_score DESC)
  ```
- `idx_naming_suggestions_session`
  ```sql
  CREATE INDEX idx_naming_suggestions_session ON public.naming_suggestions USING btree (generation_session_id)
  ```
- `idx_naming_suggestions_venture`
  ```sql
  CREATE INDEX idx_naming_suggestions_venture ON public.naming_suggestions USING btree (venture_id)
  ```
- `naming_suggestions_pkey`
  ```sql
  CREATE UNIQUE INDEX naming_suggestions_pkey ON public.naming_suggestions USING btree (id)
  ```

## RLS Policies

### 1. Allow all for authenticated (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 2. Allow select for anon (SELECT)

- **Roles**: {anon}
- **Using**: `true`

## Triggers

### naming_suggestions_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_naming_suggestions_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
