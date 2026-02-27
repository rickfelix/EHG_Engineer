# modeling_requests Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-27T21:47:21.866Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| subject | `text` | **NO** | - | - |
| request_type | `text` | **NO** | - | - |
| time_horizon_months | `integer(32)` | YES | - | - |
| data_sources | `jsonb` | YES | `'[]'::jsonb` | - |
| input_parameters | `jsonb` | YES | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| projections | `jsonb` | YES | - | - |
| confidence_interval | `jsonb` | YES | - | - |
| actual_outcome | `jsonb` | YES | - | - |
| prediction_accuracy | `numeric(3,2)` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| brief_id | `uuid` | YES | - | - |
| nursery_id | `uuid` | YES | - | - |
| requested_by | `text` | YES | `'stage0_engine'::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `modeling_requests_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `modeling_requests_brief_id_fkey`: brief_id → venture_briefs(id)
- `modeling_requests_nursery_id_fkey`: nursery_id → venture_nursery(id)
- `modeling_requests_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `modeling_requests_request_type_check`: CHECK ((request_type = ANY (ARRAY['time_horizon'::text, 'build_cost'::text, 'market_trend'::text, 'portfolio_synergy'::text, 'kill_gate_prediction'::text, 'nursery_reeval'::text, 'competitive_density'::text])))
- `modeling_requests_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))

## Indexes

- `idx_modeling_requests_status`
  ```sql
  CREATE INDEX idx_modeling_requests_status ON public.modeling_requests USING btree (status) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]))
  ```
- `idx_modeling_requests_type`
  ```sql
  CREATE INDEX idx_modeling_requests_type ON public.modeling_requests USING btree (request_type)
  ```
- `idx_modeling_requests_venture`
  ```sql
  CREATE INDEX idx_modeling_requests_venture ON public.modeling_requests USING btree (venture_id)
  ```
- `modeling_requests_pkey`
  ```sql
  CREATE UNIQUE INDEX modeling_requests_pkey ON public.modeling_requests USING btree (id)
  ```

## RLS Policies

### 1. modeling_requests_service_all (ALL)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
