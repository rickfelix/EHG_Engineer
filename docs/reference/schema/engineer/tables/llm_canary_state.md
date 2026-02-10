# llm_canary_state Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-10T12:28:46.954Z
**Rows**: 1
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| stage | `integer(32)` | **NO** | `0` | - |
| status | `text` | **NO** | `'paused'::text` | - |
| target_model | `text` | **NO** | `'qwen3-coder:30b'::text` | - |
| fallback_model | `text` | **NO** | `'claude-haiku-3-5-20241022'::text` | - |
| error_rate_threshold | `numeric(5,4)` | **NO** | `0.05` | - |
| latency_multiplier_threshold | `numeric(3,1)` | **NO** | `2.0` | - |
| baseline_latency_p95_ms | `integer(32)` | YES | - | - |
| baseline_error_rate | `numeric(5,4)` | YES | - | - |
| current_latency_p95_ms | `integer(32)` | YES | - | - |
| current_error_rate | `numeric(5,4)` | YES | - | - |
| consecutive_failures | `integer(32)` | **NO** | `0` | - |
| failures_before_rollback | `integer(32)` | **NO** | `3` | - |
| stage_changed_at | `timestamp with time zone` | YES | `now()` | - |
| last_quality_check_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| changed_by | `text` | YES | `'system'::text` | - |

## Constraints

### Primary Key
- `llm_canary_state_pkey`: PRIMARY KEY (id)

### Check Constraints
- `llm_canary_state_stage_check`: CHECK ((stage = ANY (ARRAY[0, 5, 25, 50, 100])))
- `llm_canary_state_status_check`: CHECK ((status = ANY (ARRAY['rolling'::text, 'paused'::text, 'rolled_back'::text, 'complete'::text])))

## Indexes

- `idx_llm_canary_state_singleton`
  ```sql
  CREATE UNIQUE INDEX idx_llm_canary_state_singleton ON public.llm_canary_state USING btree ((true))
  ```
- `llm_canary_state_pkey`
  ```sql
  CREATE UNIQUE INDEX llm_canary_state_pkey ON public.llm_canary_state USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
