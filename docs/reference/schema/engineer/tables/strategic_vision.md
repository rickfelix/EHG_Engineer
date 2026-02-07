# strategic_vision Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T02:59:02.369Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| code | `text` | **NO** | - | Unique identifier like EHG-2028 |
| title | `text` | **NO** | - | - |
| statement | `text` | **NO** | - | Full vision statement text |
| time_horizon_start | `date` | YES | - | - |
| time_horizon_end | `date` | YES | - | - |
| is_active | `boolean` | YES | `true` | - |
| created_by | `text` | YES | `'system'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `strategic_vision_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `strategic_vision_code_key`: UNIQUE (code)

## Indexes

- `strategic_vision_code_key`
  ```sql
  CREATE UNIQUE INDEX strategic_vision_code_key ON public.strategic_vision USING btree (code)
  ```
- `strategic_vision_pkey`
  ```sql
  CREATE UNIQUE INDEX strategic_vision_pkey ON public.strategic_vision USING btree (id)
  ```

## RLS Policies

### 1. Chairman full access on strategic_vision (ALL)

- **Roles**: {authenticated}
- **Using**: `((auth.jwt() ->> 'email'::text) = 'rick@emeraldholdingsgroup.com'::text)`
- **With Check**: `((auth.jwt() ->> 'email'::text) = 'rick@emeraldholdingsgroup.com'::text)`

### 2. Service role bypass on strategic_vision (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
