# eva_youtube_scans Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-06T14:26:44.289Z
**Rows**: 1
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| scan_date | `date` | **NO** | - | Date of the scan run (one scan per day) |
| channel_count | `integer(32)` | YES | - | - |
| video_count | `integer(32)` | YES | - | - |
| videos_above_threshold | `integer(32)` | YES | - | Number of videos that scored above the relevance threshold |
| status | `text` | **NO** | `'pending'::text` | - |
| dry_run | `boolean` | **NO** | `true` | When true, scan runs in preview mode without delivering to Todoist |
| scan_duration_ms | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_youtube_scans_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `unique_scan_per_day`: UNIQUE (scan_date)

### Check Constraints
- `eva_youtube_scans_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'scoring'::text, 'scored'::text, 'approved'::text, 'delivered'::text, 'failed'::text])))

## Indexes

- `eva_youtube_scans_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_youtube_scans_pkey ON public.eva_youtube_scans USING btree (id)
  ```
- `idx_eva_youtube_scans_date`
  ```sql
  CREATE INDEX idx_eva_youtube_scans_date ON public.eva_youtube_scans USING btree (scan_date DESC)
  ```
- `idx_eva_youtube_scans_status`
  ```sql
  CREATE INDEX idx_eva_youtube_scans_status ON public.eva_youtube_scans USING btree (status)
  ```
- `unique_scan_per_day`
  ```sql
  CREATE UNIQUE INDEX unique_scan_per_day ON public.eva_youtube_scans USING btree (scan_date)
  ```

## RLS Policies

### 1. eva_youtube_scans_insert (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. eva_youtube_scans_select (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 3. eva_youtube_scans_update (UPDATE)

- **Roles**: {public}
- **Using**: `true`

## Triggers

### trg_eva_youtube_scans_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_eva_youtube_scans_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
