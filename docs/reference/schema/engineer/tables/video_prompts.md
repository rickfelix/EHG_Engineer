# video_prompts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-06T17:42:38.372Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `uuid_generate_v4()` | - |
| venture_id | `uuid` | **NO** | - | - |
| template_type | `character varying(50)` | **NO** | - | Template used: product_demo, testimonial, feature_highlight, brand_story |
| tone | `character varying(50)` | **NO** | - | Prompt tone: professional, casual, inspiring, technical |
| duration | `character varying(10)` | **NO** | - | Target video duration: 30s, 60s, 90s |
| style | `character varying(50)` | **NO** | - | Visual style: cinematic, realistic, animated |
| sora_prompt | `text` | YES | - | - |
| runway_prompt | `text` | YES | - | - |
| kling_prompt | `text` | YES | - | - |
| used | `boolean` | YES | `false` | Whether prompt was used on a platform |
| platform_used | `character varying(50)` | YES | - | Platform where prompt was used: sora, runway, kling |
| performance_notes | `text` | YES | - | - |
| user_rating | `integer(32)` | YES | - | User quality rating: 1-5 stars |
| created_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `video_prompts_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `video_prompts_created_by_fkey`: created_by → users(id)
- `video_prompts_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `video_prompts_duration_check`: CHECK (((duration)::text = ANY ((ARRAY['30s'::character varying, '60s'::character varying, '90s'::character varying])::text[])))
- `video_prompts_platform_used_check`: CHECK (((platform_used)::text = ANY ((ARRAY['sora'::character varying, 'runway'::character varying, 'kling'::character varying, NULL::character varying])::text[])))
- `video_prompts_style_check`: CHECK (((style)::text = ANY ((ARRAY['cinematic'::character varying, 'realistic'::character varying, 'animated'::character varying])::text[])))
- `video_prompts_template_type_check`: CHECK (((template_type)::text = ANY ((ARRAY['product_demo'::character varying, 'testimonial'::character varying, 'feature_highlight'::character varying, 'brand_story'::character varying])::text[])))
- `video_prompts_tone_check`: CHECK (((tone)::text = ANY ((ARRAY['professional'::character varying, 'casual'::character varying, 'inspiring'::character varying, 'technical'::character varying])::text[])))
- `video_prompts_user_rating_check`: CHECK (((user_rating >= 1) AND (user_rating <= 5)))

## Indexes

- `idx_video_prompts_created`
  ```sql
  CREATE INDEX idx_video_prompts_created ON public.video_prompts USING btree (created_at DESC)
  ```
- `idx_video_prompts_creator`
  ```sql
  CREATE INDEX idx_video_prompts_creator ON public.video_prompts USING btree (created_by)
  ```
- `idx_video_prompts_template`
  ```sql
  CREATE INDEX idx_video_prompts_template ON public.video_prompts USING btree (template_type)
  ```
- `idx_video_prompts_used`
  ```sql
  CREATE INDEX idx_video_prompts_used ON public.video_prompts USING btree (used)
  ```
- `idx_video_prompts_venture`
  ```sql
  CREATE INDEX idx_video_prompts_venture ON public.video_prompts USING btree (venture_id)
  ```
- `video_prompts_pkey`
  ```sql
  CREATE UNIQUE INDEX video_prompts_pkey ON public.video_prompts USING btree (id)
  ```

## RLS Policies

### 1. Users can create prompts for their ventures (INSERT)

- **Roles**: {public}
- **With Check**: `((venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid()))))) AND (created_by = auth.uid()))`

### 2. Users can delete their own prompts (DELETE)

- **Roles**: {public}
- **Using**: `((venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid()))))) AND (created_by = auth.uid()))`

### 3. Users can update their own prompts (UPDATE)

- **Roles**: {public}
- **Using**: `((venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid()))))) AND (created_by = auth.uid()))`

### 4. Users can view prompts for their ventures (SELECT)

- **Roles**: {public}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

## Triggers

### update_video_prompts_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
