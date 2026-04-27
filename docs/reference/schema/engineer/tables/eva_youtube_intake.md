# eva_youtube_intake Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-27T02:34:49.236Z
**Rows**: 137
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (32 total)

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
| target_application | `text` | YES | - | Classification dimension 1: Which application this item targets (ehg_engineer, ehg_app, new_venture) |
| target_aspects | `jsonb` | YES | `'[]'::jsonb` | Classification dimension 2: JSON array of aspect tags, context-sensitive per application |
| chairman_intent | `text` | YES | - | Classification dimension 3: Why the Chairman captured this item (idea, insight, reference, question, value) |
| chairman_notes | `text` | YES | - | Free-text notes the Chairman adds during classification for context preservation |
| classification_confidence | `numeric(3,2)` | YES | - | AI confidence score (0.00-1.00) for the recommended classification |
| classified_at | `timestamp with time zone` | YES | - | Timestamp when classification was completed (serves as checkpoint for session resume) |
| enrichment_status | `character varying(20)` | YES | `'pending'::character varying` | - |
| enrichment_summary | `text` | YES | - | - |
| chairman_reviewed_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `eva_youtube_intake_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `eva_youtube_intake_youtube_video_id_key`: UNIQUE (youtube_video_id)

### Check Constraints
- `chk_youtube_enrichment_status`: CHECK (((enrichment_status)::text = ANY ((ARRAY['pending'::character varying, 'enriched'::character varying, 'failed'::character varying])::text[])))
- `eva_youtube_intake_chairman_intent_check`: CHECK ((chairman_intent = ANY (ARRAY['idea'::text, 'insight'::text, 'reference'::text, 'question'::text, 'value'::text])))
- `eva_youtube_intake_confidence_score_check`: CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric)))
- `eva_youtube_intake_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'evaluating'::text, 'approved'::text, 'rejected'::text, 'needs_revision'::text, 'processed'::text, 'error'::text])))
- `eva_youtube_intake_target_application_check`: CHECK ((target_application = ANY (ARRAY['ehg_engineer'::text, 'ehg_app'::text, 'new_venture'::text])))

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
- `idx_youtube_enrichment_pending`
  ```sql
  CREATE INDEX idx_youtube_enrichment_pending ON public.eva_youtube_intake USING btree (enrichment_status) WHERE ((enrichment_status)::text = 'pending'::text)
  ```
- `idx_youtube_intake_classified`
  ```sql
  CREATE INDEX idx_youtube_intake_classified ON public.eva_youtube_intake USING btree (target_application, classified_at DESC) WHERE (target_application IS NOT NULL)
  ```
- `idx_youtube_intake_unclassified`
  ```sql
  CREATE INDEX idx_youtube_intake_unclassified ON public.eva_youtube_intake USING btree (created_at) WHERE (target_application IS NULL)
  ```
- `idx_youtube_unreviewed`
  ```sql
  CREATE INDEX idx_youtube_unreviewed ON public.eva_youtube_intake USING btree (chairman_reviewed_at) WHERE (chairman_reviewed_at IS NULL)
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
