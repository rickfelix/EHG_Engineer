# leo_protocol_sections_history Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-06T17:42:38.372Z
**Rows**: 135
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `bigint(64)` | **NO** | `nextval('leo_protocol_sections_history_id_seq'::regclass)` | - |
| section_id | `integer(32)` | YES | - | - |
| operation | `text` | **NO** | - | - |
| occurred_at | `timestamp with time zone` | **NO** | `now()` | - |
| channel | `text` | **NO** | - | - |
| provenance_status | `text` | **NO** | - | - |
| provenance | `jsonb` | YES | - | - |
| section_type | `text` | YES | - | - |
| title | `text` | YES | - | - |
| old_value | `jsonb` | YES | - | - |
| new_value | `jsonb` | YES | - | - |
| metadata_key_delta | `jsonb` | YES | - | - |

## Constraints

### Primary Key
- `leo_protocol_sections_history_pkey`: PRIMARY KEY (id)

### Check Constraints
- `lpsh_channel_valid`: CHECK ((channel = ANY (ARRAY['service_role'::text, 'postgres'::text, 'unknown_channel'::text])))
- `lpsh_operation_valid`: CHECK ((operation = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
- `lpsh_provenance_status_consistent`: CHECK ((((provenance_status = 'missing'::text) AND (provenance IS NULL)) OR ((provenance_status = 'present'::text) AND (provenance IS NOT NULL))))
- `lpsh_provenance_status_valid`: CHECK ((provenance_status = ANY (ARRAY['present'::text, 'missing'::text])))

## Indexes

- `leo_protocol_sections_history_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_protocol_sections_history_pkey ON public.leo_protocol_sections_history USING btree (id)
  ```
- `leo_protocol_sections_history_provenance_status_idx`
  ```sql
  CREATE INDEX leo_protocol_sections_history_provenance_status_idx ON public.leo_protocol_sections_history USING btree (provenance_status, occurred_at) WHERE (provenance_status = 'missing'::text)
  ```
- `leo_protocol_sections_history_section_id_idx`
  ```sql
  CREATE INDEX leo_protocol_sections_history_section_id_idx ON public.leo_protocol_sections_history USING btree (section_id, occurred_at)
  ```

## RLS Policies

### 1. leo_protocol_sections_history_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### leo_protocol_sections_history_no_delete_trg

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION leo_protocol_sections_history_no_delete()`

### leo_protocol_sections_history_no_update_trg

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION leo_protocol_sections_history_no_update()`

---

[← Back to Schema Overview](../database-schema-overview.md)
