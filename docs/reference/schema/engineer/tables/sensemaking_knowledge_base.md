# sensemaking_knowledge_base Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-10T11:39:11.244Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| category | `text` | **NO** | - | - |
| title | `text` | **NO** | - | - |
| content_summary | `text` | **NO** | - | - |
| content_full | `text` | YES | - | - |
| relevance_tags | `ARRAY` | **NO** | `'{}'::text[]` | - |
| token_estimate | `integer(32)` | **NO** | `0` | - |
| version | `integer(32)` | **NO** | `1` | - |
| is_active | `boolean` | **NO** | `true` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `sensemaking_knowledge_base_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `sensemaking_knowledge_base_title_version_key`: UNIQUE (title, version)

### Check Constraints
- `sensemaking_knowledge_base_category_check`: CHECK ((category = ANY (ARRAY['vision'::text, 'execution'::text, 'operations'::text])))

## Indexes

- `idx_sensemaking_kb_active`
  ```sql
  CREATE INDEX idx_sensemaking_kb_active ON public.sensemaking_knowledge_base USING btree (is_active) WHERE (is_active = true)
  ```
- `idx_sensemaking_kb_relevance_tags`
  ```sql
  CREATE INDEX idx_sensemaking_kb_relevance_tags ON public.sensemaking_knowledge_base USING gin (relevance_tags)
  ```
- `sensemaking_knowledge_base_pkey`
  ```sql
  CREATE UNIQUE INDEX sensemaking_knowledge_base_pkey ON public.sensemaking_knowledge_base USING btree (id)
  ```
- `sensemaking_knowledge_base_title_version_key`
  ```sql
  CREATE UNIQUE INDEX sensemaking_knowledge_base_title_version_key ON public.sensemaking_knowledge_base USING btree (title, version)
  ```

## RLS Policies

### 1. authenticated_select_sensemaking_knowledge_base (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_sensemaking_knowledge_base (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
