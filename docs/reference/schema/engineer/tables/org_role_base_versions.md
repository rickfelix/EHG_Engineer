# org_role_base_versions Table

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

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| role_key | `text` | **NO** | - | - |
| version | `integer(32)` | **NO** | - | - |
| status | `text` | **NO** | `'draft'::text` | - |
| structure | `jsonb` | **NO** | - | - |
| function | `jsonb` | **NO** | - | - |
| norms | `jsonb` | **NO** | - | Chairman-owned. Obligations, permissions, prohibitions, budget, self_change_scope. NEVER writable via a venture-scoped path -- see org_role_venture_overlays, which has no norms column at all. |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | **NO** | - | - |
| superseded_by | `uuid` | YES | - | - |
| superseded_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `org_role_base_versions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `org_role_base_versions_superseded_by_fkey`: superseded_by → org_role_base_versions(id)

### Unique Constraints
- `org_role_base_versions_role_key_version_key`: UNIQUE (role_key, version)

### Check Constraints
- `org_role_base_versions_created_by_nonempty`: CHECK ((btrim(created_by) <> ''::text))
- `org_role_base_versions_function_check`: CHECK ((jsonb_typeof(function) = 'object'::text))
- `org_role_base_versions_norms_check`: CHECK ((jsonb_typeof(norms) = 'object'::text))
- `org_role_base_versions_role_key_nonempty`: CHECK ((btrim(role_key) <> ''::text))
- `org_role_base_versions_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'superseded'::text, 'draft'::text, 'deprecated'::text])))
- `org_role_base_versions_structure_check`: CHECK ((jsonb_typeof(structure) = 'object'::text))
- `org_role_base_versions_supersede_consistent`: CHECK ((((superseded_by IS NULL) AND (superseded_at IS NULL)) OR ((superseded_by IS NOT NULL) AND (superseded_at IS NOT NULL))))
- `org_role_base_versions_version_check`: CHECK ((version >= 1))

## Indexes

- `org_role_base_versions_one_active_idx`
  ```sql
  CREATE UNIQUE INDEX org_role_base_versions_one_active_idx ON public.org_role_base_versions USING btree (role_key) WHERE (status = 'active'::text)
  ```
- `org_role_base_versions_pkey`
  ```sql
  CREATE UNIQUE INDEX org_role_base_versions_pkey ON public.org_role_base_versions USING btree (id)
  ```
- `org_role_base_versions_role_key_idx`
  ```sql
  CREATE INDEX org_role_base_versions_role_key_idx ON public.org_role_base_versions USING btree (role_key)
  ```
- `org_role_base_versions_role_key_version_key`
  ```sql
  CREATE UNIQUE INDEX org_role_base_versions_role_key_version_key ON public.org_role_base_versions USING btree (role_key, version)
  ```

## RLS Policies

### 1. org_role_base_versions_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_org_role_base_versions_log

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION log_org_role_change()`

### trg_org_role_base_versions_log

- **Timing**: AFTER DELETE
- **Action**: `EXECUTE FUNCTION log_org_role_change()`

### trg_org_role_base_versions_log

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION log_org_role_change()`

---

[← Back to Schema Overview](../database-schema-overview.md)
