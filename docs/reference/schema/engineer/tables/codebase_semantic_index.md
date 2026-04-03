# codebase_semantic_index Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-03T21:47:39.383Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| file_path | `text` | **NO** | - | - |
| entity_type | `text` | **NO** | - | - |
| entity_name | `text` | **NO** | - | - |
| code_snippet | `text` | **NO** | - | - |
| semantic_description | `text` | **NO** | - | - |
| embedding | `USER-DEFINED` | **NO** | - | - |
| line_start | `integer(32)` | YES | - | - |
| line_end | `integer(32)` | YES | - | - |
| language | `text` | **NO** | - | - |
| application | `text` | **NO** | - | - |
| indexed_at | `timestamp with time zone` | **NO** | `now()` | - |
| last_updated | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `codebase_semantic_index_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `codebase_semantic_index_file_path_entity_name_entity_type_key`: UNIQUE (file_path, entity_name, entity_type)

### Check Constraints
- `codebase_semantic_index_application_check`: CHECK ((application = ANY (ARRAY['ehg'::text, 'ehg_engineer'::text])))
- `codebase_semantic_index_entity_type_check`: CHECK ((entity_type = ANY (ARRAY['function'::text, 'class'::text, 'component'::text, 'interface'::text, 'type'::text, 'utility'::text, 'module'::text])))
- `codebase_semantic_index_language_check`: CHECK ((language = ANY (ARRAY['typescript'::text, 'javascript'::text, 'tsx'::text, 'jsx'::text, 'sql'::text, 'json'::text])))

## Indexes

- `codebase_semantic_index_file_path_entity_name_entity_type_key`
  ```sql
  CREATE UNIQUE INDEX codebase_semantic_index_file_path_entity_name_entity_type_key ON public.codebase_semantic_index USING btree (file_path, entity_name, entity_type)
  ```
- `codebase_semantic_index_pkey`
  ```sql
  CREATE UNIQUE INDEX codebase_semantic_index_pkey ON public.codebase_semantic_index USING btree (id)
  ```
- `idx_codebase_semantic_app_type`
  ```sql
  CREATE INDEX idx_codebase_semantic_app_type ON public.codebase_semantic_index USING btree (application, entity_type)
  ```
- `idx_codebase_semantic_application`
  ```sql
  CREATE INDEX idx_codebase_semantic_application ON public.codebase_semantic_index USING btree (application)
  ```
- `idx_codebase_semantic_embedding`
  ```sql
  CREATE INDEX idx_codebase_semantic_embedding ON public.codebase_semantic_index USING ivfflat (embedding vector_cosine_ops) WITH (lists='100')
  ```
- `idx_codebase_semantic_entity_type`
  ```sql
  CREATE INDEX idx_codebase_semantic_entity_type ON public.codebase_semantic_index USING btree (entity_type)
  ```
- `idx_codebase_semantic_file_path`
  ```sql
  CREATE INDEX idx_codebase_semantic_file_path ON public.codebase_semantic_index USING btree (file_path)
  ```
- `idx_codebase_semantic_language`
  ```sql
  CREATE INDEX idx_codebase_semantic_language ON public.codebase_semantic_index USING btree (language)
  ```

## RLS Policies

### 1. Allow authenticated read access to semantic index (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Allow service role full access to semantic index (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_update_semantic_index_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_semantic_index_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
