# llm_cloud_health Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 1
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `text` | **NO** | `'singleton'::text` | - |
| status | `text` | **NO** | `'paused'::text` | - |
| current_error_rate | `numeric(5,4)` | YES | - | - |
| error_rate_threshold | `numeric(5,4)` | **NO** | `0.05` | - |
| current_latency_p95_ms | `integer(32)` | YES | - | - |
| baseline_latency_p95_ms | `integer(32)` | YES | - | - |
| latency_multiplier_threshold | `numeric(4,2)` | **NO** | `2.0` | - |
| consecutive_failures | `integer(32)` | **NO** | `0` | - |
| failures_before_rollback | `integer(32)` | **NO** | `3` | - |
| last_quality_check_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `llm_cloud_health_pkey`: PRIMARY KEY (id)

### Check Constraints
- `llm_cloud_health_id_check`: CHECK ((id = 'singleton'::text))
- `llm_cloud_health_status_check`: CHECK ((status = ANY (ARRAY['rolling'::text, 'paused'::text])))

## Indexes

- `llm_cloud_health_pkey`
  ```sql
  CREATE UNIQUE INDEX llm_cloud_health_pkey ON public.llm_cloud_health USING btree (id)
  ```

## RLS Policies

### 1. service_role_full_access (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
