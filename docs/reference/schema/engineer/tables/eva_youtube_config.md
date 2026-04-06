# eva_youtube_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-06T10:21:00.608Z
**Rows**: 59
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| channel_id | `text` | **NO** | - | - |
| channel_name | `text` | **NO** | - | - |
| rss_url | `text` | YES | - | - |
| active | `boolean` | **NO** | `true` | - |
| score_threshold | `integer(32)` | **NO** | `70` | Minimum relevance score for a video to be recommended (default 70) |
| max_recommendations | `integer(32)` | **NO** | `15` | Maximum videos to recommend per scan for this channel (default 15) |
| interest_profile | `jsonb` | YES | - | JSONB object with venture interest keywords for relevance scoring |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_youtube_config_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `unique_channel_config`: UNIQUE (channel_id)

## Indexes

- `eva_youtube_config_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_youtube_config_pkey ON public.eva_youtube_config USING btree (id)
  ```
- `idx_eva_youtube_config_active`
  ```sql
  CREATE INDEX idx_eva_youtube_config_active ON public.eva_youtube_config USING btree (active) WHERE (active = true)
  ```
- `unique_channel_config`
  ```sql
  CREATE UNIQUE INDEX unique_channel_config ON public.eva_youtube_config USING btree (channel_id)
  ```

## RLS Policies

### 1. eva_youtube_config_delete (DELETE)

- **Roles**: {public}
- **Using**: `true`

### 2. eva_youtube_config_insert (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 3. eva_youtube_config_select (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 4. eva_youtube_config_update (UPDATE)

- **Roles**: {public}
- **Using**: `true`

## Triggers

### trg_eva_youtube_config_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_eva_youtube_config_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
