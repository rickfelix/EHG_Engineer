# vision_readiness_blocked Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-06-02T17:33:34.523Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| vision_key | `text` | **NO** | - | - |
| venture_id | `uuid` | YES | - | - |
| blocked_at | `timestamp with time zone` | **NO** | `now()` | - |
| reason | `text` | **NO** | - | - |
| evidence | `jsonb` | **NO** | `'{}'::jsonb` | - |
| mode | `text` | **NO** | `'WARNING'::text` | - |
| attempted_by | `text` | YES | - | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| resolved_by | `text` | YES | - | - |
| resolution_note | `text` | YES | - | - |

## Constraints

### Primary Key
- `vision_readiness_blocked_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `vision_readiness_blocked_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `vision_readiness_blocked_mode_check`: CHECK ((mode = ANY (ARRAY['WARNING'::text, 'BLOCKING'::text])))
- `vision_readiness_blocked_reason_check`: CHECK ((reason = ANY (ARRAY['vision_not_found'::text, 'vision_query_error'::text, 'extracted_dimensions_null'::text, 'content_too_short'::text, 'status_inactive'::text, 'level_below_minimum'::text, 'venture_id_missing'::text])))

## Indexes

- `idx_vision_readiness_blocked_blocked_at_desc`
  ```sql
  CREATE INDEX idx_vision_readiness_blocked_blocked_at_desc ON public.vision_readiness_blocked USING btree (blocked_at DESC)
  ```
- `idx_vision_readiness_blocked_unresolved`
  ```sql
  CREATE INDEX idx_vision_readiness_blocked_unresolved ON public.vision_readiness_blocked USING btree (vision_key) WHERE (resolved_at IS NULL)
  ```
- `idx_vision_readiness_blocked_vision_key`
  ```sql
  CREATE INDEX idx_vision_readiness_blocked_vision_key ON public.vision_readiness_blocked USING btree (vision_key)
  ```
- `vision_readiness_blocked_pkey`
  ```sql
  CREATE UNIQUE INDEX vision_readiness_blocked_pkey ON public.vision_readiness_blocked USING btree (id)
  ```

## RLS Policies

### 1. service_role_full_access (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
