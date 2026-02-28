# marketing_content Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-28T03:30:25.261Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| content_type | `text` | **NO** | - | - |
| channel_family | `text` | **NO** | `'social'::text` | - |
| concept_tags | `ARRAY` | YES | `'{}'::text[]` | - |
| lifecycle_state | `text` | **NO** | `'IDEATE'::text` | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `marketing_content_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `marketing_content_venture_id_fkey`: venture_id → ventures(id)

## Indexes

- `idx_marketing_content_lifecycle`
  ```sql
  CREATE INDEX idx_marketing_content_lifecycle ON public.marketing_content USING btree (lifecycle_state)
  ```
- `idx_marketing_content_type`
  ```sql
  CREATE INDEX idx_marketing_content_type ON public.marketing_content USING btree (content_type)
  ```
- `idx_marketing_content_venture`
  ```sql
  CREATE INDEX idx_marketing_content_venture ON public.marketing_content USING btree (venture_id)
  ```
- `marketing_content_pkey`
  ```sql
  CREATE UNIQUE INDEX marketing_content_pkey ON public.marketing_content USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_marketing_content (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. venture_read_marketing_content (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE ((auth.uid())::text = (ventures.created_by)::text)))`

## Triggers

### trg_marketing_content_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_marketing_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
