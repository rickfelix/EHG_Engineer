# llm_canary_metrics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-11T13:23:36.495Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| request_id | `text` | **NO** | - | - |
| tier | `text` | **NO** | - | - |
| routed_to | `text` | **NO** | - | - |
| model_used | `text` | **NO** | - | - |
| latency_ms | `integer(32)` | **NO** | - | - |
| success | `boolean` | **NO** | - | - |
| error_type | `text` | YES | - | - |
| canary_stage | `integer(32)` | **NO** | - | - |
| bucket_id | `integer(32)` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `llm_canary_metrics_pkey`: PRIMARY KEY (id)

### Check Constraints
- `llm_canary_metrics_routed_to_check`: CHECK ((routed_to = ANY (ARRAY['local'::text, 'cloud'::text, 'fallback'::text])))

## Indexes

- `idx_llm_canary_metrics_recent`
  ```sql
  CREATE INDEX idx_llm_canary_metrics_recent ON public.llm_canary_metrics USING btree (created_at DESC)
  ```
- `idx_llm_canary_metrics_tier`
  ```sql
  CREATE INDEX idx_llm_canary_metrics_tier ON public.llm_canary_metrics USING btree (tier, created_at DESC)
  ```
- `llm_canary_metrics_pkey`
  ```sql
  CREATE UNIQUE INDEX llm_canary_metrics_pkey ON public.llm_canary_metrics USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
