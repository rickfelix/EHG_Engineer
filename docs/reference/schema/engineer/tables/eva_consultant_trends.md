# eva_consultant_trends Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-16T09:53:49.951Z
**Rows**: N/A (RLS restricted)
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| trend_date | `date` | **NO** | - | Date the trend was detected |
| trend_type | `text` | **NO** | - | Type of trend: convergence, acceleration, gap, emerging, or decline |
| title | `text` | **NO** | - | Short title describing the trend |
| description | `text` | YES | - | Detailed description of the trend and its implications |
| confidence_score | `numeric(3,2)` | YES | - | Confidence score 0.00-1.00 based on corroborating evidence |
| corroborating_items | `jsonb` | YES | `'[]'::jsonb` | Array of {source, id, title} objects that support this trend |
| source_freshness | `jsonb` | YES | `'{}'::jsonb` | Map of source name to freshness status at detection time |
| application_domain | `text` | YES | - | Target application domain (application_domain value) |
| detected_by | `text` | YES | `'trend-detector.mjs'::text` | Script or agent that detected this trend |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| feedback_weight | `numeric(3,2)` | YES | `1.0` | Weight multiplier for trend confidence based on chairman feedback history (0.00-9.99) |

## Constraints

### Primary Key
- `eva_consultant_trends_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `uq_eva_consultant_trends_date_title`: UNIQUE (trend_date, title)

### Check Constraints
- `eva_consultant_trends_confidence_score_check`: CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric)))
- `eva_consultant_trends_trend_type_check`: CHECK ((trend_type = ANY (ARRAY['convergence'::text, 'acceleration'::text, 'gap'::text, 'emerging'::text, 'decline'::text])))

## Indexes

- `eva_consultant_trends_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_consultant_trends_pkey ON public.eva_consultant_trends USING btree (id)
  ```
- `idx_eva_consultant_trends_app`
  ```sql
  CREATE INDEX idx_eva_consultant_trends_app ON public.eva_consultant_trends USING btree (application_domain)
  ```
- `idx_eva_consultant_trends_date`
  ```sql
  CREATE INDEX idx_eva_consultant_trends_date ON public.eva_consultant_trends USING btree (trend_date DESC)
  ```
- `uq_eva_consultant_trends_date_title`
  ```sql
  CREATE UNIQUE INDEX uq_eva_consultant_trends_date_title ON public.eva_consultant_trends USING btree (trend_date, title)
  ```

## RLS Policies

### 1. anon_select_eva_consultant_trends (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. service_role_all_eva_consultant_trends (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
