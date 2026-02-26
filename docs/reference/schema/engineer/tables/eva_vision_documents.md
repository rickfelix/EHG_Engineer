# eva_vision_documents Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-26T02:22:21.495Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| vision_key | `character varying(100)` | **NO** | - | Unique human-readable key, e.g. VISION-EHG-L1-001, VISION-SOLARA-L2-001 |
| level | `character varying(2)` | **NO** | - | - |
| venture_id | `uuid` | YES | - | - |
| content | `text` | **NO** | - | - |
| extracted_dimensions | `jsonb` | YES | - | LLM-extracted scoring dimensions with weights. Format: [{"name":"...", "weight":0.15, "description":"..."}] |
| version | `integer(32)` | **NO** | `1` | - |
| status | `character varying(20)` | **NO** | `'draft'::character varying` | - |
| chairman_approved | `boolean` | **NO** | `false` | - |
| chairman_approved_at | `timestamp with time zone` | YES | - | - |
| parent_vision_id | `uuid` | YES | - | - |
| source_file_path | `text` | YES | - | - |
| source_brainstorm_id | `uuid` | YES | - | Intentional soft reference (no FK constraint) to brainstorm_sessions.id. Brainstorm sessions may be deleted independently. |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | YES | - | - |
| addendums | `jsonb` | YES | `'[]'::jsonb` | - |

## Constraints

### Primary Key
- `eva_vision_documents_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_vision_documents_parent_vision_id_fkey`: parent_vision_id → eva_vision_documents(id)
- `eva_vision_documents_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `eva_vision_documents_vision_key_key`: UNIQUE (vision_key)

### Check Constraints
- `eva_vision_documents_level_check`: CHECK (((level)::text = ANY ((ARRAY['L1'::character varying, 'L2'::character varying])::text[])))
- `eva_vision_documents_status_check`: CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'superseded'::character varying, 'archived'::character varying])::text[])))

## Indexes

- `eva_vision_documents_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_vision_documents_pkey ON public.eva_vision_documents USING btree (id)
  ```
- `eva_vision_documents_vision_key_key`
  ```sql
  CREATE UNIQUE INDEX eva_vision_documents_vision_key_key ON public.eva_vision_documents USING btree (vision_key)
  ```
- `idx_eva_vision_docs_level`
  ```sql
  CREATE INDEX idx_eva_vision_docs_level ON public.eva_vision_documents USING btree (level)
  ```
- `idx_eva_vision_docs_parent`
  ```sql
  CREATE INDEX idx_eva_vision_docs_parent ON public.eva_vision_documents USING btree (parent_vision_id) WHERE (parent_vision_id IS NOT NULL)
  ```
- `idx_eva_vision_docs_status`
  ```sql
  CREATE INDEX idx_eva_vision_docs_status ON public.eva_vision_documents USING btree (status)
  ```
- `idx_eva_vision_docs_venture`
  ```sql
  CREATE INDEX idx_eva_vision_docs_venture ON public.eva_vision_documents USING btree (venture_id) WHERE (venture_id IS NOT NULL)
  ```

## RLS Policies

### 1. eva_vision_docs_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. eva_vision_docs_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_eva_vision_documents_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
