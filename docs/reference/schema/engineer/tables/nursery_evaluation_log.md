# nursery_evaluation_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-19T23:26:50.288Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| nursery_id | `uuid` | **NO** | - | - |
| trigger_type | `text` | **NO** | - | - |
| trigger_details | `jsonb` | YES | - | - |
| previous_score | `numeric(5,2)` | YES | - | - |
| new_score | `numeric(5,2)` | YES | - | - |
| previous_maturity | `text` | YES | - | - |
| new_maturity | `text` | YES | - | - |
| evaluation_notes | `text` | YES | - | - |
| evaluated_by | `text` | YES | `'stage0_engine'::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `nursery_evaluation_log_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `nursery_evaluation_log_nursery_id_fkey`: nursery_id → venture_nursery(id)

### Check Constraints
- `nursery_evaluation_log_trigger_type_check`: CHECK ((trigger_type = ANY (ARRAY['capability_added'::text, 'market_shift'::text, 'portfolio_gap'::text, 'related_outcome'::text, 'periodic_review'::text, 'manual'::text])))

## Indexes

- `idx_nursery_eval_log_nursery`
  ```sql
  CREATE INDEX idx_nursery_eval_log_nursery ON public.nursery_evaluation_log USING btree (nursery_id)
  ```
- `idx_nursery_eval_log_trigger`
  ```sql
  CREATE INDEX idx_nursery_eval_log_trigger ON public.nursery_evaluation_log USING btree (trigger_type)
  ```
- `nursery_evaluation_log_pkey`
  ```sql
  CREATE UNIQUE INDEX nursery_evaluation_log_pkey ON public.nursery_evaluation_log USING btree (id)
  ```

## RLS Policies

### 1. nursery_evaluation_log_service_all (ALL)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
