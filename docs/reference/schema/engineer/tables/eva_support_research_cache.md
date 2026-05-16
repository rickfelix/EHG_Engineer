# eva_support_research_cache Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-16T13:15:49.353Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| query_hash | `character(64)` | **NO** | - | - |
| query_text | `text` | **NO** | - | May contain PII (e.g. user names in research queries). Protected by service_role-only RLS + TTL eviction via ttl_until. NOT encrypted at column level — relies on Supabase storage-layer encryption-at-rest. |
| response_text | `text` | **NO** | - | - |
| references | `jsonb` | **NO** | `'[]'::jsonb` | JSONB array of citation refs. Quote as "references" in raw SQL to avoid FK-reference keyword ambiguity. |
| ttl_until | `timestamp with time zone` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| accessed_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_support_research_cache_pkey`: PRIMARY KEY (query_hash)

## Indexes

- `eva_support_research_cache_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_support_research_cache_pkey ON public.eva_support_research_cache USING btree (query_hash)
  ```
- `idx_eva_support_research_cache_ttl`
  ```sql
  CREATE INDEX idx_eva_support_research_cache_ttl ON public.eva_support_research_cache USING btree (ttl_until)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
