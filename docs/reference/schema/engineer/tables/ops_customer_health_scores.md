# ops_customer_health_scores Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-29T17:51:58.980Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| customer_id | `text` | **NO** | - | Customer identifier (venture-scoped, not globally unique) |
| dimension_scores | `jsonb` | **NO** | `'{}'::jsonb` | JSONB with keys: login_frequency, feature_adoption, sentiment, payment (each 0-100) |
| overall_score | `numeric(5,2)` | **NO** | - | Weighted composite score 0-100 |
| at_risk | `boolean` | YES | `false` | Whether customer is flagged as at-risk based on threshold or rapid decline |
| trigger_type | `text` | YES | - | What triggered at-risk flag: threshold_breach, rapid_decline, low_<dimension> |
| recommended_action | `text` | YES | - | Suggested action: urgent_outreach, engagement_campaign, onboarding_refresh, support_followup, billing_review |
| metadata | `jsonb` | YES | - | - |
| computed_at | `timestamp with time zone` | **NO** | `now()` | When this score was computed (for time-series ordering) |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `text` | YES | `'ops-health-service'::text` | - |

## Constraints

### Primary Key
- `ops_customer_health_scores_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `ops_customer_health_scores_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `ops_customer_health_scores_overall_score_check`: CHECK (((overall_score >= (0)::numeric) AND (overall_score <= (100)::numeric)))

## Indexes

- `idx_ops_health_venture_atrisk`
  ```sql
  CREATE INDEX idx_ops_health_venture_atrisk ON public.ops_customer_health_scores USING btree (venture_id, overall_score) WHERE (at_risk = true)
  ```
- `idx_ops_health_venture_customer`
  ```sql
  CREATE INDEX idx_ops_health_venture_customer ON public.ops_customer_health_scores USING btree (venture_id, customer_id, computed_at DESC)
  ```
- `idx_ops_health_venture_time`
  ```sql
  CREATE INDEX idx_ops_health_venture_time ON public.ops_customer_health_scores USING btree (venture_id, computed_at DESC)
  ```
- `ops_customer_health_scores_pkey`
  ```sql
  CREATE UNIQUE INDEX ops_customer_health_scores_pkey ON public.ops_customer_health_scores USING btree (id)
  ```

## RLS Policies

### 1. ops_customer_health_scores_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. ops_customer_health_scores_venture_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 3. ops_customer_health_scores_venture_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 4. ops_customer_health_scores_venture_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

---

[← Back to Schema Overview](../database-schema-overview.md)
