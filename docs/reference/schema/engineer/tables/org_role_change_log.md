# org_role_change_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-15T16:18:27.599Z
**Rows**: 2
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `bigint(64)` | **NO** | `nextval('org_role_change_log_id_seq'::regclass)` | - |
| role_key | `text` | **NO** | - | - |
| layer | `text` | **NO** | - | - |
| operation | `text` | **NO** | - | - |
| occurred_at | `timestamp with time zone` | **NO** | `now()` | - |
| venture_id | `uuid` | YES | - | - |
| old_value | `jsonb` | YES | - | - |
| new_value | `jsonb` | YES | - | - |
| changed_by | `text` | **NO** | - | - |
| evidence_ref | `jsonb` | YES | - | - |

## Constraints

### Primary Key
- `org_role_change_log_pkey`: PRIMARY KEY (id)

### Check Constraints
- `org_role_change_log_changed_by_nonempty`: CHECK ((btrim(changed_by) <> ''::text))
- `org_role_change_log_delete_has_old`: CHECK (((operation <> 'DELETE'::text) OR ((old_value IS NOT NULL) AND (new_value IS NULL))))
- `org_role_change_log_insert_has_new`: CHECK (((operation <> 'INSERT'::text) OR (new_value IS NOT NULL)))
- `org_role_change_log_layer_check`: CHECK ((layer = ANY (ARRAY['base'::text, 'overlay'::text, 'pin'::text])))
- `org_role_change_log_operation_check`: CHECK ((operation = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
- `org_role_change_log_role_key_nonempty`: CHECK ((btrim(role_key) <> ''::text))
- `org_role_change_log_update_has_both`: CHECK (((operation <> 'UPDATE'::text) OR ((old_value IS NOT NULL) AND (new_value IS NOT NULL))))

## Indexes

- `org_role_change_log_pkey`
  ```sql
  CREATE UNIQUE INDEX org_role_change_log_pkey ON public.org_role_change_log USING btree (id)
  ```
- `org_role_change_log_role_key_idx`
  ```sql
  CREATE INDEX org_role_change_log_role_key_idx ON public.org_role_change_log USING btree (role_key, occurred_at)
  ```

## RLS Policies

### 1. org_role_change_log_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### org_role_change_log_no_delete_trg

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION org_role_change_log_no_delete()`

### org_role_change_log_no_update_trg

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION org_role_change_log_no_update()`

---

[← Back to Schema Overview](../database-schema-overview.md)
