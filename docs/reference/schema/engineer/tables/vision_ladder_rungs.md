# vision_ladder_rungs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 3
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| rung_key | `text` | **NO** | - | - |
| vision_key | `text` | **NO** | - | - |
| title | `text` | **NO** | - | - |
| sequence | `integer(32)` | **NO** | - | - |
| is_active | `boolean` | **NO** | `false` | - |
| achieved_at | `timestamp with time zone` | YES | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `vision_ladder_rungs_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `vision_ladder_rungs_rung_key_key`: UNIQUE (rung_key)

## Indexes

- `uq_vision_ladder_one_active`
  ```sql
  CREATE UNIQUE INDEX uq_vision_ladder_one_active ON public.vision_ladder_rungs USING btree (is_active) WHERE is_active
  ```
- `vision_ladder_rungs_pkey`
  ```sql
  CREATE UNIQUE INDEX vision_ladder_rungs_pkey ON public.vision_ladder_rungs USING btree (id)
  ```
- `vision_ladder_rungs_rung_key_key`
  ```sql
  CREATE UNIQUE INDEX vision_ladder_rungs_rung_key_key ON public.vision_ladder_rungs USING btree (rung_key)
  ```

## RLS Policies

### 1. vision_ladder_rungs_read (SELECT)

- **Roles**: {public}
- **Using**: `((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text))`

### 2. vision_ladder_rungs_service_write (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
