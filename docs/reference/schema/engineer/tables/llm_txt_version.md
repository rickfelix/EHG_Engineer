# llm_txt_version Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_url | `text` | **NO** | - | - |
| content | `text` | **NO** | - | - |
| content_lint_passed | `boolean` | **NO** | - | - |
| lint_report | `jsonb` | YES | - | - |
| published_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `llm_txt_version_pkey`: PRIMARY KEY (id)

### Check Constraints
- `llm_txt_version_content_nonempty`: CHECK ((btrim(content) <> ''::text))
- `llm_txt_version_publish_requires_lint`: CHECK (((published_at IS NULL) OR (content_lint_passed = true)))
- `llm_txt_version_venture_url_normalized`: CHECK (((venture_url = lower(btrim(venture_url))) AND (venture_url ~ '^https?://'::text) AND (venture_url !~~ '%/'::text)))

## Indexes

- `llm_txt_version_live_idx`
  ```sql
  CREATE INDEX llm_txt_version_live_idx ON public.llm_txt_version USING btree (venture_url, published_at DESC) WHERE (published_at IS NOT NULL)
  ```
- `llm_txt_version_pkey`
  ```sql
  CREATE UNIQUE INDEX llm_txt_version_pkey ON public.llm_txt_version USING btree (id)
  ```

## RLS Policies

### 1. llm_txt_version_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### llm_txt_version_publish_only_trg

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION llm_txt_version_publish_only()`

---

[← Back to Schema Overview](../database-schema-overview.md)
