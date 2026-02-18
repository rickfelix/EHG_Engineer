# marketing_content_variants Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-18T19:52:25.488Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| content_id | `uuid` | **NO** | - | - |
| variant_key | `text` | **NO** | - | - |
| headline | `text` | YES | - | - |
| body | `text` | YES | - | - |
| cta | `text` | YES | - | - |
| asset_image_key | `text` | YES | - | - |
| asset_video_key | `text` | YES | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `marketing_content_variants_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `marketing_content_variants_content_id_fkey`: content_id → marketing_content(id)

## Indexes

- `idx_content_variants_content`
  ```sql
  CREATE INDEX idx_content_variants_content ON public.marketing_content_variants USING btree (content_id)
  ```
- `marketing_content_variants_pkey`
  ```sql
  CREATE UNIQUE INDEX marketing_content_variants_pkey ON public.marketing_content_variants USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_marketing_content_variants (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. venture_read_marketing_content_variants (SELECT)

- **Roles**: {authenticated}
- **Using**: `(content_id IN ( SELECT marketing_content.id
   FROM marketing_content
  WHERE (marketing_content.venture_id IN ( SELECT ventures.id
           FROM ventures
          WHERE ((auth.uid())::text = (ventures.created_by)::text)))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
