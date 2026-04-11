# ship_review_findings Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-11T03:50:59.641Z
**Rows**: 12
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| pr_number | `integer(32)` | **NO** | - | - |
| review_tier | `text` | **NO** | - | - |
| risk_score | `numeric(4,2)` | YES | - | - |
| finding_count | `integer(32)` | **NO** | `0` | - |
| finding_categories | `jsonb` | YES | `'{}'::jsonb` | - |
| verdict | `text` | **NO** | - | - |
| sd_key | `text` | YES | - | - |
| branch | `text` | YES | - | - |
| multi_agent | `boolean` | YES | `false` | - |
| reviewed_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `ship_review_findings_pkey`: PRIMARY KEY (id)

### Check Constraints
- `ship_review_findings_review_tier_check`: CHECK ((review_tier = ANY (ARRAY['light'::text, 'standard'::text, 'deep'::text])))
- `ship_review_findings_verdict_check`: CHECK ((verdict = ANY (ARRAY['pass'::text, 'block'::text])))

## Indexes

- `idx_ship_review_findings_pr`
  ```sql
  CREATE INDEX idx_ship_review_findings_pr ON public.ship_review_findings USING btree (pr_number)
  ```
- `idx_ship_review_findings_reviewed_at`
  ```sql
  CREATE INDEX idx_ship_review_findings_reviewed_at ON public.ship_review_findings USING btree (reviewed_at)
  ```
- `ship_review_findings_pkey`
  ```sql
  CREATE UNIQUE INDEX ship_review_findings_pkey ON public.ship_review_findings USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
