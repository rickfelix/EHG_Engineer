# venture_documents Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-01T17:59:03.922Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| document_type | `character varying(100)` | YES | - | - |
| title | `character varying(255)` | YES | - | - |
| content | `text` | YES | - | - |
| file_url | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `venture_documents_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_documents_venture_id_fkey`: venture_id → ventures(id)

## Indexes

- `idx_venture_documents_venture`
  ```sql
  CREATE INDEX idx_venture_documents_venture ON public.venture_documents USING btree (venture_id)
  ```
- `venture_documents_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_documents_pkey ON public.venture_documents USING btree (id)
  ```

## RLS Policies

### 1. Company access venture_documents (ALL)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
