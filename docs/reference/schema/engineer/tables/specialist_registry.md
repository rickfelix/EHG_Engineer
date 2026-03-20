# specialist_registry Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-20T09:41:46.332Z
**Rows**: 18
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `text` | **NO** | - | - |
| role | `text` | **NO** | - | Unique specialist role identifier (e.g. venture-stage-5), used as upsert conflict target |
| expertise | `text` | **NO** | - | - |
| context | `text` | YES | - | Stage assessment context (capped at 8000 chars / ~2000 tokens) |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | Flexible metadata: source_venture_id, stage_number, created_by |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `specialist_registry_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `specialist_registry_role_key`: UNIQUE (role)

### Check Constraints
- `specialist_registry_context_check`: CHECK ((char_length(context) <= 8000))

## Indexes

- `idx_specialist_registry_metadata`
  ```sql
  CREATE INDEX idx_specialist_registry_metadata ON public.specialist_registry USING gin (metadata)
  ```
- `idx_specialist_registry_role`
  ```sql
  CREATE INDEX idx_specialist_registry_role ON public.specialist_registry USING btree (role)
  ```
- `specialist_registry_pkey`
  ```sql
  CREATE UNIQUE INDEX specialist_registry_pkey ON public.specialist_registry USING btree (id)
  ```
- `specialist_registry_role_key`
  ```sql
  CREATE UNIQUE INDEX specialist_registry_role_key ON public.specialist_registry USING btree (role)
  ```

## RLS Policies

### 1. service_role_full_access_specialist_registry (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_specialist_registry_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION set_specialist_registry_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
