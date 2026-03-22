# document_section_schemas Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-22T06:02:31.922Z
**Rows**: 18
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| document_type | `text` | **NO** | - | - |
| domain | `text` | YES | - | - |
| section_key | `text` | **NO** | - | - |
| section_name | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| section_order | `integer(32)` | **NO** | - | - |
| is_required | `boolean` | **NO** | `true` | - |
| min_content_length | `integer(32)` | YES | `50` | - |
| json_schema | `jsonb` | YES | - | - |
| is_active | `boolean` | **NO** | `true` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `document_section_schemas_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `document_section_schemas_document_type_domain_section_key_key`: UNIQUE (document_type, domain, section_key)

## Indexes

- `document_section_schemas_document_type_domain_section_key_key`
  ```sql
  CREATE UNIQUE INDEX document_section_schemas_document_type_domain_section_key_key ON public.document_section_schemas USING btree (document_type, domain, section_key)
  ```
- `document_section_schemas_pkey`
  ```sql
  CREATE UNIQUE INDEX document_section_schemas_pkey ON public.document_section_schemas USING btree (id)
  ```
- `idx_dss_type_domain`
  ```sql
  CREATE INDEX idx_dss_type_domain ON public.document_section_schemas USING btree (document_type, domain) WHERE (is_active = true)
  ```

## RLS Policies

### 1. Service role full access (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
