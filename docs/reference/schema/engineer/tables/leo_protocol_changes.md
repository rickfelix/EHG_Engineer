# leo_protocol_changes Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-27T21:47:21.866Z
**Rows**: 6
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('leo_protocol_changes_id_seq'::regclass)` | - |
| protocol_id | `character varying(50)` | **NO** | - | - |
| change_type | `character varying(50)` | **NO** | - | - |
| description | `text` | YES | - | - |
| changed_fields | `jsonb` | YES | `'{}'::jsonb` | - |
| changed_by | `character varying(100)` | YES | - | - |
| change_reason | `text` | YES | - | - |
| timestamp | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `leo_protocol_changes_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_protocol_changes_protocol_id_fkey`: protocol_id → leo_protocols(id)

## Indexes

- `idx_leo_protocol_changes_protocol`
  ```sql
  CREATE INDEX idx_leo_protocol_changes_protocol ON public.leo_protocol_changes USING btree (protocol_id)
  ```
- `idx_leo_protocol_changes_timestamp`
  ```sql
  CREATE INDEX idx_leo_protocol_changes_timestamp ON public.leo_protocol_changes USING btree ("timestamp" DESC)
  ```
- `leo_protocol_changes_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_protocol_changes_pkey ON public.leo_protocol_changes USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_protocol_changes (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_protocol_changes (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
