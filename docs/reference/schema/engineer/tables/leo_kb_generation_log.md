# leo_kb_generation_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-24T09:02:36.059Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('leo_kb_generation_log_id_seq'::regclass)` | - |
| file_path | `character varying(500)` | **NO** | - | - |
| file_name | `character varying(200)` | **NO** | - | - |
| generated_at | `timestamp with time zone` | YES | `now()` | - |
| source_tables | `jsonb` | **NO** | - | - |
| content_hash | `character varying(64)` | YES | - | - |
| char_count | `integer(32)` | YES | - | - |
| generator_script | `character varying(200)` | YES | - | - |
| protocol_version | `character varying(50)` | YES | - | - |

## Constraints

### Primary Key
- `leo_kb_generation_log_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `leo_kb_generation_log_file_path_key`: UNIQUE (file_path)

## Indexes

- `idx_leo_kb_generation_log_date`
  ```sql
  CREATE INDEX idx_leo_kb_generation_log_date ON public.leo_kb_generation_log USING btree (generated_at DESC)
  ```
- `leo_kb_generation_log_file_path_key`
  ```sql
  CREATE UNIQUE INDEX leo_kb_generation_log_file_path_key ON public.leo_kb_generation_log USING btree (file_path)
  ```
- `leo_kb_generation_log_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_kb_generation_log_pkey ON public.leo_kb_generation_log USING btree (id)
  ```

## RLS Policies

### 1. service_role_insert_leo_kb_generation_log (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 2. service_role_select_leo_kb_generation_log (SELECT)

- **Roles**: {service_role}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
