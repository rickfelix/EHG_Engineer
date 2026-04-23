# claude_code_releases Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-23T10:15:08.485Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| version | `text` | **NO** | - | - |
| detected_at | `timestamp with time zone` | YES | `now()` | - |
| release_date | `timestamp with time zone` | YES | - | - |
| changelog_url | `text` | YES | - | - |
| status | `text` | YES | `'new'::text` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `claude_code_releases_pkey`: PRIMARY KEY (id)

### Check Constraints
- `claude_code_releases_status_check`: CHECK ((status = ANY (ARRAY['new'::text, 'acknowledged'::text, 'applied'::text])))

## Indexes

- `claude_code_releases_pkey`
  ```sql
  CREATE UNIQUE INDEX claude_code_releases_pkey ON public.claude_code_releases USING btree (id)
  ```
- `idx_claude_code_releases_version`
  ```sql
  CREATE UNIQUE INDEX idx_claude_code_releases_version ON public.claude_code_releases USING btree (version)
  ```

## RLS Policies

### 1. service_role_all_claude_code_releases (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
