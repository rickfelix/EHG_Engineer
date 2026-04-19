# eva_youtube_scores Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-19T00:48:02.791Z
**Rows**: 310
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| scan_id | `uuid` | **NO** | - | - |
| video_id | `text` | **NO** | - | YouTube video ID (the 11-character identifier) |
| video_url | `text` | **NO** | - | - |
| title | `text` | **NO** | - | - |
| channel_name | `text` | YES | - | - |
| channel_id | `text` | YES | - | - |
| published_at | `timestamp with time zone` | YES | - | - |
| relevance_score | `integer(32)` | YES | - | EVA relevance score 0-100, higher = more relevant to venture portfolio |
| venture_tags | `jsonb` | **NO** | `'[]'::jsonb` | JSONB array of venture names/tags this video is relevant to |
| reasoning | `text` | YES | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| approved_at | `timestamp with time zone` | YES | - | - |
| todoist_task_id | `text` | YES | - | Todoist task ID when video recommendation has been delivered |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_youtube_scores_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_youtube_scores_scan_id_fkey`: scan_id → eva_youtube_scans(id)

### Unique Constraints
- `unique_video_per_scan`: UNIQUE (scan_id, video_id)

### Check Constraints
- `eva_youtube_scores_relevance_score_check`: CHECK (((relevance_score >= 0) AND (relevance_score <= 100)))
- `eva_youtube_scores_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'scored'::text, 'approved'::text, 'rejected'::text, 'delivered'::text])))

## Indexes

- `eva_youtube_scores_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_youtube_scores_pkey ON public.eva_youtube_scores USING btree (id)
  ```
- `idx_eva_youtube_scores_relevance`
  ```sql
  CREATE INDEX idx_eva_youtube_scores_relevance ON public.eva_youtube_scores USING btree (relevance_score DESC)
  ```
- `idx_eva_youtube_scores_scan`
  ```sql
  CREATE INDEX idx_eva_youtube_scores_scan ON public.eva_youtube_scores USING btree (scan_id)
  ```
- `idx_eva_youtube_scores_status`
  ```sql
  CREATE INDEX idx_eva_youtube_scores_status ON public.eva_youtube_scores USING btree (status)
  ```
- `idx_eva_youtube_scores_video`
  ```sql
  CREATE INDEX idx_eva_youtube_scores_video ON public.eva_youtube_scores USING btree (video_id)
  ```
- `unique_video_per_scan`
  ```sql
  CREATE UNIQUE INDEX unique_video_per_scan ON public.eva_youtube_scores USING btree (scan_id, video_id)
  ```

## RLS Policies

### 1. eva_youtube_scores_insert (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. eva_youtube_scores_select (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 3. eva_youtube_scores_update (UPDATE)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
