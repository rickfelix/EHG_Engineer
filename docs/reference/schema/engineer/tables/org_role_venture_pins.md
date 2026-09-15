# org_role_venture_pins Table

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

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| role_key | `text` | **NO** | - | - |
| venture_id | `uuid` | **NO** | - | - |
| base_version | `integer(32)` | **NO** | - | - |
| overlay_version | `integer(32)` | YES | - | - |
| pinned_at | `timestamp with time zone` | **NO** | `now()` | - |
| pinned_by | `text` | **NO** | - | - |

## Constraints

### Primary Key
- `org_role_venture_pins_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `org_role_venture_pins_role_key_base_version_fkey`: role_key → org_role_base_versions(role_key)
- `org_role_venture_pins_role_key_venture_id_overlay_version_fkey`: role_key → org_role_venture_overlays(role_key)
- `org_role_venture_pins_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `org_role_venture_pins_role_key_venture_id_key`: UNIQUE (role_key, venture_id)

### Check Constraints
- `org_role_venture_pins_pinned_by_nonempty`: CHECK ((btrim(pinned_by) <> ''::text))
- `org_role_venture_pins_role_key_nonempty`: CHECK ((btrim(role_key) <> ''::text))

## Indexes

- `org_role_venture_pins_pkey`
  ```sql
  CREATE UNIQUE INDEX org_role_venture_pins_pkey ON public.org_role_venture_pins USING btree (id)
  ```
- `org_role_venture_pins_role_key_venture_id_key`
  ```sql
  CREATE UNIQUE INDEX org_role_venture_pins_role_key_venture_id_key ON public.org_role_venture_pins USING btree (role_key, venture_id)
  ```
- `org_role_venture_pins_venture_idx`
  ```sql
  CREATE INDEX org_role_venture_pins_venture_idx ON public.org_role_venture_pins USING btree (venture_id, role_key)
  ```

## RLS Policies

### 1. org_role_venture_pins_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_org_role_venture_pins_log

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION log_org_role_change()`

### trg_org_role_venture_pins_log

- **Timing**: AFTER DELETE
- **Action**: `EXECUTE FUNCTION log_org_role_change()`

### trg_org_role_venture_pins_log

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION log_org_role_change()`

---

[← Back to Schema Overview](../database-schema-overview.md)
