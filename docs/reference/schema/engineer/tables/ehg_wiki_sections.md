# ehg_wiki_sections Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 3
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `bigint(64)` | **NO** | `nextval('ehg_wiki_sections_id_seq'::regclass)` | - |
| domain | `text` | **NO** | - | - |
| slug | `text` | **NO** | - | - |
| title | `text` | **NO** | - | - |
| content | `text` | **NO** | - | - |
| version | `integer(32)` | **NO** | `1` | - |
| citation_id | `text` | YES | - | - |
| chairman_ratified | `boolean` | **NO** | `false` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `ehg_wiki_sections_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `ehg_wiki_sections_domain_slug_key`: UNIQUE (domain, slug)

### Check Constraints
- `ehg_wiki_sections_domain_check`: CHECK ((domain = ANY (ARRAY['identity'::text, 'ventures'::text, 'factory'::text, 'personas'::text, 'governance'::text])))

## Indexes

- `ehg_wiki_sections_domain_slug_key`
  ```sql
  CREATE UNIQUE INDEX ehg_wiki_sections_domain_slug_key ON public.ehg_wiki_sections USING btree (domain, slug)
  ```
- `ehg_wiki_sections_pkey`
  ```sql
  CREATE UNIQUE INDEX ehg_wiki_sections_pkey ON public.ehg_wiki_sections USING btree (id)
  ```
- `idx_ehg_wiki_sections_domain`
  ```sql
  CREATE INDEX idx_ehg_wiki_sections_domain ON public.ehg_wiki_sections USING btree (domain)
  ```

## RLS Policies

### 1. ehg_wiki_sections_authenticated_read (SELECT)

- **Roles**: {public}
- **Using**: `(auth.role() = ANY (ARRAY['authenticated'::text, 'anon'::text]))`

### 2. ehg_wiki_sections_service_role_all (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
