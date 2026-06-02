# eva_vision_rubric_cache Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-06-02T14:45:30.261Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| cache_key | `text` | **NO** | - | - |
| vision_key | `text` | **NO** | - | - |
| plan_key | `text` | **NO** | - | - |
| vision_content_hash | `text` | YES | - | - |
| plan_content_hash | `text` | YES | - | - |
| rubrics | `jsonb` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| last_hit_at | `timestamp with time zone` | YES | - | - |
| generator_model | `text` | YES | - | - |
| generator_cost_usd | `numeric(8,4)` | YES | - | - |

## Constraints

### Primary Key
- `eva_vision_rubric_cache_pkey`: PRIMARY KEY (cache_key)

## Indexes

- `eva_vision_rubric_cache_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_vision_rubric_cache_pkey ON public.eva_vision_rubric_cache USING btree (cache_key)
  ```
- `idx_eva_vision_rubric_cache_keys`
  ```sql
  CREATE INDEX idx_eva_vision_rubric_cache_keys ON public.eva_vision_rubric_cache USING btree (vision_key, plan_key)
  ```

## RLS Policies

### 1. service_role_full_access (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
