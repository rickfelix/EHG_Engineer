# stage13_valuations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T00:37:34.488Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (20 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| valuation_min | `numeric(15,2)` | **NO** | - | - |
| valuation_base | `numeric(15,2)` | **NO** | - | - |
| valuation_max | `numeric(15,2)` | **NO** | - | - |
| confidence_score | `integer(32)` | **NO** | - | - |
| methodology | `character varying(50)` | YES | `'comparable'::character varying` | - |
| comparable_companies | `jsonb` | YES | `'[]'::jsonb` | - |
| key_assumptions | `jsonb` | YES | `'{}'::jsonb` | - |
| risk_factors | `jsonb` | YES | `'[]'::jsonb` | - |
| eva_model_version | `character varying(50)` | YES | `'v1.0.0'::character varying` | - |
| processing_time_ms | `integer(32)` | YES | - | - |
| approval_required | `boolean` | YES | `false` | - |
| approval_request_id | `uuid` | YES | - | - |
| approval_status | `character varying(20)` | YES | `'not_required'::character varying` | - |
| status | `character varying(20)` | YES | `'completed'::character varying` | - |
| error_message | `text` | YES | - | - |
| requested_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `stage13_valuations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `stage13_valuations_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `stage13_valuations_approval_status_check`: CHECK (((approval_status)::text = ANY ((ARRAY['not_required'::character varying, 'pending_approval'::character varying, 'approved'::character varying, 'rejected'::character varying, 'override'::character varying])::text[])))
- `stage13_valuations_confidence_score_check`: CHECK (((confidence_score >= 0) AND (confidence_score <= 100)))
- `stage13_valuations_methodology_check`: CHECK (((methodology)::text = ANY ((ARRAY['comparable'::character varying, 'dcf'::character varying, 'multiple'::character varying, 'transaction'::character varying, 'hybrid'::character varying])::text[])))
- `stage13_valuations_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))
- `valid_valuation_range`: CHECK (((valuation_min <= valuation_base) AND (valuation_base <= valuation_max)))

## Indexes

- `idx_stage13_valuations_approval`
  ```sql
  CREATE INDEX idx_stage13_valuations_approval ON public.stage13_valuations USING btree (approval_status)
  ```
- `idx_stage13_valuations_confidence`
  ```sql
  CREATE INDEX idx_stage13_valuations_confidence ON public.stage13_valuations USING btree (confidence_score)
  ```
- `idx_stage13_valuations_created`
  ```sql
  CREATE INDEX idx_stage13_valuations_created ON public.stage13_valuations USING btree (created_at DESC)
  ```
- `idx_stage13_valuations_status`
  ```sql
  CREATE INDEX idx_stage13_valuations_status ON public.stage13_valuations USING btree (status)
  ```
- `idx_stage13_valuations_venture`
  ```sql
  CREATE INDEX idx_stage13_valuations_venture ON public.stage13_valuations USING btree (venture_id)
  ```
- `stage13_valuations_pkey`
  ```sql
  CREATE UNIQUE INDEX stage13_valuations_pkey ON public.stage13_valuations USING btree (id)
  ```

## RLS Policies

### 1. Company access stage13_valuations (ALL)

- **Roles**: {public}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

## Triggers

### update_stage13_valuations_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
