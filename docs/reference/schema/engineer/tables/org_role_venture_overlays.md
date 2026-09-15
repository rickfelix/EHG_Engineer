# org_role_venture_overlays Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-15T16:18:27.599Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| role_key | `text` | **NO** | - | - |
| venture_id | `uuid` | **NO** | - | - |
| version | `integer(32)` | **NO** | - | - |
| status | `text` | **NO** | `'draft'::text` | - |
| structure | `jsonb` | YES | - | - |
| function | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | **NO** | - | - |

## Constraints

### Primary Key
- `org_role_venture_overlays_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `org_role_venture_overlays_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `org_role_venture_overlays_role_key_venture_id_version_key`: UNIQUE (role_key, venture_id, version)

### Check Constraints
- `org_role_venture_overlays_created_by_nonempty`: CHECK ((btrim(created_by) <> ''::text))
- `org_role_venture_overlays_function_check`: CHECK (((function IS NULL) OR (jsonb_typeof(function) = 'object'::text)))
- `org_role_venture_overlays_has_content`: CHECK (((structure IS NOT NULL) OR (function IS NOT NULL)))
- `org_role_venture_overlays_role_key_nonempty`: CHECK ((btrim(role_key) <> ''::text))
- `org_role_venture_overlays_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'superseded'::text, 'draft'::text])))
- `org_role_venture_overlays_structure_check`: CHECK (((structure IS NULL) OR (jsonb_typeof(structure) = 'object'::text)))
- `org_role_venture_overlays_version_check`: CHECK ((version >= 1))

## Indexes

- `org_role_venture_overlays_pkey`
  ```sql
  CREATE UNIQUE INDEX org_role_venture_overlays_pkey ON public.org_role_venture_overlays USING btree (id)
  ```
- `org_role_venture_overlays_role_key_venture_id_version_key`
  ```sql
  CREATE UNIQUE INDEX org_role_venture_overlays_role_key_venture_id_version_key ON public.org_role_venture_overlays USING btree (role_key, venture_id, version)
  ```
- `org_role_venture_overlays_venture_idx`
  ```sql
  CREATE INDEX org_role_venture_overlays_venture_idx ON public.org_role_venture_overlays USING btree (venture_id, role_key)
  ```

## RLS Policies

### 1. org_role_venture_overlays_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_org_role_venture_overlays_log

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION log_org_role_change()`

### trg_org_role_venture_overlays_log

- **Timing**: AFTER DELETE
- **Action**: `EXECUTE FUNCTION log_org_role_change()`

### trg_org_role_venture_overlays_log

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION log_org_role_change()`

---

[← Back to Schema Overview](../database-schema-overview.md)
