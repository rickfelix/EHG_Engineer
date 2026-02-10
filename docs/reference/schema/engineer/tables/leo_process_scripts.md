# leo_process_scripts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-10T06:32:46.037Z
**Rows**: 8
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('leo_process_scripts_id_seq'::regclass)` | - |
| script_name | `character varying(200)` | **NO** | - | - |
| script_path | `character varying(500)` | **NO** | - | - |
| description | `text` | **NO** | - | - |
| usage_pattern | `text` | **NO** | - | - |
| argument_format | `character varying(50)` | YES | - | - |
| arguments | `jsonb` | **NO** | `'[]'::jsonb` | - |
| examples | `jsonb` | **NO** | `'[]'::jsonb` | - |
| common_errors | `jsonb` | YES | `'[]'::jsonb` | - |
| category | `character varying(50)` | YES | - | - |
| active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `leo_process_scripts_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `leo_process_scripts_script_name_key`: UNIQUE (script_name)

### Check Constraints
- `leo_process_scripts_argument_format_check`: CHECK (((argument_format)::text = ANY ((ARRAY['positional'::character varying, 'flags'::character varying, 'mixed'::character varying, 'none'::character varying])::text[])))
- `leo_process_scripts_category_check`: CHECK (((category)::text = ANY ((ARRAY['handoff'::character varying, 'prd'::character varying, 'generation'::character varying, 'validation'::character varying, 'utility'::character varying, 'migration'::character varying])::text[])))

## Indexes

- `idx_leo_process_scripts_active`
  ```sql
  CREATE INDEX idx_leo_process_scripts_active ON public.leo_process_scripts USING btree (active) WHERE (active = true)
  ```
- `idx_leo_process_scripts_category`
  ```sql
  CREATE INDEX idx_leo_process_scripts_category ON public.leo_process_scripts USING btree (category)
  ```
- `leo_process_scripts_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_process_scripts_pkey ON public.leo_process_scripts USING btree (id)
  ```
- `leo_process_scripts_script_name_key`
  ```sql
  CREATE UNIQUE INDEX leo_process_scripts_script_name_key ON public.leo_process_scripts USING btree (script_name)
  ```

## RLS Policies

### 1. Anon users can read process_scripts (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. Authenticated users can read process scripts (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. Service role has full access to process scripts (ALL)

- **Roles**: {service_role}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
