# michael_closures Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-13T06:31:02.341Z
**Rows**: 10
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| closure_key | `text` | **NO** | - | - |
| topic | `text` | **NO** | - | - |
| keywords | `ARRAY` | **NO** | `'{}'::text[]` | - |
| closure_text | `text` | **NO** | - | - |
| expires_at | `timestamp with time zone` | YES | - | - |
| scope | `text` | YES | - | - |
| provenance | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `michael_closures_pkey`: PRIMARY KEY (id)

### Check Constraints
- `michael_closures_provenance_check`: CHECK ((jsonb_typeof(provenance) = 'object'::text))

## Indexes

- `michael_closures_closure_key_uniq`
  ```sql
  CREATE UNIQUE INDEX michael_closures_closure_key_uniq ON public.michael_closures USING btree (closure_key)
  ```
- `michael_closures_pkey`
  ```sql
  CREATE UNIQUE INDEX michael_closures_pkey ON public.michael_closures USING btree (id)
  ```

## RLS Policies

### 1. michael_closures_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### michael_closures_set_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION michael_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
