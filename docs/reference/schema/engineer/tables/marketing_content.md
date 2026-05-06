# marketing_content Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-06T16:59:27.272Z
**Rows**: 7
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

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
| display_order | `integer(32)` | **NO** | `0` | - |
| content_key | `text` | YES | - | - |

## Constraints

### Primary Key
- `marketing_content_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `marketing_content_venture_id_fkey`: venture_id → ventures(id)

## Indexes

- `idx_marketing_content_landing_pp`
  ```sql
  CREATE INDEX idx_marketing_content_landing_pp ON public.marketing_content USING btree (display_order, content_type) WHERE (((metadata ->> 'route_slug'::text) = '/v/privacy-patrol'::text) AND (content_type = ANY (ARRAY['landing_hero'::text, 'landing_section'::text, 'landing_cta'::text, 'persona_callout'::text, 'footer_trust'::text])))
  ```
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
- `marketing_content_venture_key_uniq`
  ```sql
  CREATE UNIQUE INDEX marketing_content_venture_key_uniq ON public.marketing_content USING btree (venture_id, content_key) WHERE (content_key IS NOT NULL)
  ```

## RLS Policies

### 1. anon_read_landing_marketing_content (SELECT)

- **Roles**: {anon}
- **Using**: `((content_type = ANY (ARRAY['landing_hero'::text, 'landing_section'::text, 'landing_cta'::text, 'persona_callout'::text, 'footer_trust'::text])) AND (metadata ? 'route_slug'::text))`

### 2. service_role_all_marketing_content (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 3. venture_read_marketing_content (SELECT)

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
