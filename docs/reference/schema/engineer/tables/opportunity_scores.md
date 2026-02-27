# opportunity_scores Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-27T22:03:40.633Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| opportunity_id | `uuid` | **NO** | - | - |
| quality_score | `numeric(3,2)` | YES | - | - |
| urgency_score | `numeric(3,2)` | YES | - | - |
| fit_score | `numeric(3,2)` | YES | - | - |
| engagement_score | `numeric(3,2)` | YES | - | - |
| total_score | `numeric(3,2)` | YES | - | - |
| scoring_method | `character varying(50)` | YES | `'manual'::character varying` | - |
| scored_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |
| scored_by | `character varying(255)` | YES | - | - |

## Constraints

### Primary Key
- `opportunity_scores_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `opportunity_scores_opportunity_id_fkey`: opportunity_id → opportunities(id)

### Unique Constraints
- `opportunity_scores_opportunity_id_key`: UNIQUE (opportunity_id)

### Check Constraints
- `opportunity_scores_engagement_score_check`: CHECK (((engagement_score >= (0)::numeric) AND (engagement_score <= (1)::numeric)))
- `opportunity_scores_fit_score_check`: CHECK (((fit_score >= (0)::numeric) AND (fit_score <= (1)::numeric)))
- `opportunity_scores_quality_score_check`: CHECK (((quality_score >= (0)::numeric) AND (quality_score <= (1)::numeric)))
- `opportunity_scores_urgency_score_check`: CHECK (((urgency_score >= (0)::numeric) AND (urgency_score <= (1)::numeric)))

## Indexes

- `idx_scores_opportunity`
  ```sql
  CREATE INDEX idx_scores_opportunity ON public.opportunity_scores USING btree (opportunity_id)
  ```
- `idx_scores_total`
  ```sql
  CREATE INDEX idx_scores_total ON public.opportunity_scores USING btree (total_score DESC)
  ```
- `opportunity_scores_opportunity_id_key`
  ```sql
  CREATE UNIQUE INDEX opportunity_scores_opportunity_id_key ON public.opportunity_scores USING btree (opportunity_id)
  ```
- `opportunity_scores_pkey`
  ```sql
  CREATE UNIQUE INDEX opportunity_scores_pkey ON public.opportunity_scores USING btree (id)
  ```

## RLS Policies

### 1. authenticated_all_scores (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
