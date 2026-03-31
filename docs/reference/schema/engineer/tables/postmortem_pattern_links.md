# postmortem_pattern_links Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-31T23:47:27.741Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| postmortem_id | `uuid` | **NO** | - | - |
| pattern_id | `character varying(20)` | **NO** | - | - |
| confidence_score | `integer(32)` | YES | `50` | - |
| match_type | `character varying(20)` | YES | `'manual'::character varying` | - |
| mapper_notes | `text` | YES | - | - |
| matched_whys | `ARRAY` | YES | - | - |
| created_by | `text` | YES | `'SYSTEM'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `postmortem_pattern_links_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `postmortem_pattern_links_postmortem_id_fkey`: postmortem_id → venture_postmortems(id)

### Unique Constraints
- `postmortem_pattern_links_postmortem_id_pattern_id_key`: UNIQUE (postmortem_id, pattern_id)

### Check Constraints
- `postmortem_pattern_links_confidence_score_check`: CHECK (((confidence_score >= 0) AND (confidence_score <= 100)))
- `postmortem_pattern_links_match_type_check`: CHECK (((match_type)::text = ANY ((ARRAY['manual'::character varying, 'auto_suggested'::character varying, 'confirmed'::character varying])::text[])))

## Indexes

- `idx_postmortem_links_pattern`
  ```sql
  CREATE INDEX idx_postmortem_links_pattern ON public.postmortem_pattern_links USING btree (pattern_id)
  ```
- `idx_postmortem_links_postmortem`
  ```sql
  CREATE INDEX idx_postmortem_links_postmortem ON public.postmortem_pattern_links USING btree (postmortem_id)
  ```
- `postmortem_pattern_links_pkey`
  ```sql
  CREATE UNIQUE INDEX postmortem_pattern_links_pkey ON public.postmortem_pattern_links USING btree (id)
  ```
- `postmortem_pattern_links_postmortem_id_pattern_id_key`
  ```sql
  CREATE UNIQUE INDEX postmortem_pattern_links_postmortem_id_pattern_id_key ON public.postmortem_pattern_links USING btree (postmortem_id, pattern_id)
  ```

## RLS Policies

### 1. Authenticated users can create pattern links (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 2. Authenticated users can view pattern links (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. Service role can manage all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
