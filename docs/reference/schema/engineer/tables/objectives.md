# objectives Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T02:59:02.369Z
**Rows**: 3
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| vision_id | `uuid` | YES | - | - |
| code | `text` | **NO** | - | Unique code like O1-AUTONOMY |
| title | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| owner | `text` | YES | - | - |
| cadence | `text` | YES | `'quarterly'::text` | How often this objective is reviewed |
| period | `text` | YES | - | - |
| sequence | `integer(32)` | YES | `1` | - |
| is_active | `boolean` | YES | `true` | - |
| created_by | `text` | YES | `'system'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `objectives_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `objectives_vision_id_fkey`: vision_id → strategic_vision(id)

### Unique Constraints
- `objectives_code_key`: UNIQUE (code)

### Check Constraints
- `objectives_cadence_check`: CHECK ((cadence = ANY (ARRAY['quarterly'::text, 'annual'::text, 'ongoing'::text])))

## Indexes

- `idx_objectives_is_active`
  ```sql
  CREATE INDEX idx_objectives_is_active ON public.objectives USING btree (is_active)
  ```
- `idx_objectives_vision_id`
  ```sql
  CREATE INDEX idx_objectives_vision_id ON public.objectives USING btree (vision_id)
  ```
- `objectives_code_key`
  ```sql
  CREATE UNIQUE INDEX objectives_code_key ON public.objectives USING btree (code)
  ```
- `objectives_pkey`
  ```sql
  CREATE UNIQUE INDEX objectives_pkey ON public.objectives USING btree (id)
  ```

## RLS Policies

### 1. Chairman full access on objectives (ALL)

- **Roles**: {authenticated}
- **Using**: `((auth.jwt() ->> 'email'::text) = 'rick@emeraldholdingsgroup.com'::text)`
- **With Check**: `((auth.jwt() ->> 'email'::text) = 'rick@emeraldholdingsgroup.com'::text)`

### 2. Service role bypass on objectives (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
