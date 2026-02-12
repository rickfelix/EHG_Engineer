# eva_youtube_intake Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-12T04:11:56.320Z
**Rows**: 101
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (23 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| youtube_video_id | `text` | **NO** | - | - |
| youtube_playlist_item_id | `text` | YES | - | - |
| title | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| channel_name | `text` | YES | - | - |
| duration_seconds | `integer(32)` | YES | - | - |
| thumbnail_url | `text` | YES | - | - |
| tags | `ARRAY` | YES | `'{}'::text[]` | - |
| published_at | `timestamp with time zone` | YES | - | - |
| ai_summary | `text` | YES | - | - |
| ai_key_insights | `jsonb` | YES | `'[]'::jsonb` | - |
| venture_tag | `text` | YES | - | - |
| business_function | `text` | YES | - | - |
| confidence_score | `numeric(3,2)` | YES | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| feedback_id | `uuid` | YES | - | - |
| evaluation_outcome | `jsonb` | YES | - | - |
| processed_at | `timestamp with time zone` | YES | - | - |
| destination_playlist_id | `text` | YES | - | - |
| raw_data | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_youtube_intake_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `eva_youtube_intake_youtube_video_id_key`: UNIQUE (youtube_video_id)

### Check Constraints
- `eva_youtube_intake_confidence_score_check`: CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric)))
- `eva_youtube_intake_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'evaluating'::text, 'approved'::text, 'rejected'::text, 'needs_revision'::text, 'processed'::text, 'error'::text])))

## Indexes

- `eva_youtube_intake_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_youtube_intake_pkey ON public.eva_youtube_intake USING btree (id)
  ```
- `eva_youtube_intake_youtube_video_id_key`
  ```sql
  CREATE UNIQUE INDEX eva_youtube_intake_youtube_video_id_key ON public.eva_youtube_intake USING btree (youtube_video_id)
  ```
- `idx_eva_youtube_intake_channel`
  ```sql
  CREATE INDEX idx_eva_youtube_intake_channel ON public.eva_youtube_intake USING btree (channel_name)
  ```
- `idx_eva_youtube_intake_pending`
  ```sql
  CREATE INDEX idx_eva_youtube_intake_pending ON public.eva_youtube_intake USING btree (status) WHERE (status = 'pending'::text)
  ```
- `idx_eva_youtube_intake_status`
  ```sql
  CREATE INDEX idx_eva_youtube_intake_status ON public.eva_youtube_intake USING btree (status)
  ```
- `idx_eva_youtube_intake_venture`
  ```sql
  CREATE INDEX idx_eva_youtube_intake_venture ON public.eva_youtube_intake USING btree (venture_tag)
  ```

## RLS Policies

### 1. manage_eva_youtube_intake (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. select_eva_youtube_intake (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trg_eva_youtube_intake_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_eva_intake_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
