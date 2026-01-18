# leo_protocol_references Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-18T14:23:18.070Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('leo_protocol_references_id_seq'::regclass)` | - |
| protocol_id | `character varying(50)` | **NO** | - | - |
| reference_type | `character varying(50)` | **NO** | - | - |
| reference_id | `character varying(100)` | YES | - | - |
| reference_table | `character varying(100)` | YES | - | - |
| description | `text` | YES | - | - |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `leo_protocol_references_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_protocol_references_protocol_id_fkey`: protocol_id → leo_protocols(id)

## Indexes

- `leo_protocol_references_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_protocol_references_pkey ON public.leo_protocol_references USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_protocol_references (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_protocol_references (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
