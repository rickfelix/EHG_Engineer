# venture_market_analysis Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-28T13:25:22.623Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| tam_estimate | `numeric` | YES | - | - |
| sam_estimate | `numeric` | YES | - | - |
| som_estimate | `numeric` | YES | - | - |
| market_trends | `jsonb` | YES | `'[]'::jsonb` | - |
| methodology | `text` | YES | - | - |
| confidence_score | `numeric` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `venture_market_analysis_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_market_analysis_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_market_analysis_venture_id_key`: UNIQUE (venture_id)

### Check Constraints
- `venture_market_analysis_confidence_score_check`: CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (100)::numeric)))

## Indexes

- `idx_venture_market_analysis_venture_id`
  ```sql
  CREATE INDEX idx_venture_market_analysis_venture_id ON public.venture_market_analysis USING btree (venture_id)
  ```
- `venture_market_analysis_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_market_analysis_pkey ON public.venture_market_analysis USING btree (id)
  ```
- `venture_market_analysis_venture_id_key`
  ```sql
  CREATE UNIQUE INDEX venture_market_analysis_venture_id_key ON public.venture_market_analysis USING btree (venture_id)
  ```

## RLS Policies

### 1. service_role_all_venture_market_analysis (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
