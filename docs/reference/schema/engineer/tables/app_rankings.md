---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-03-01
tags: [reference, auto-generated]
---
# app_rankings Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-01T00:41:31.291Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| source | `text` | **NO** | - | Data source: apple_appstore, google_play, or product_hunt |
| app_name | `text` | **NO** | - | - |
| developer | `text` | YES | - | - |
| app_url | `text` | **NO** | - | - |
| website_url | `text` | YES | - | - |
| description | `text` | YES | - | - |
| category | `text` | YES | - | - |
| chart_position | `integer(32)` | YES | - | Position in the chart/ranking list |
| chart_type | `text` | YES | - | Type of chart: top-free, trending, top-grossing, etc. |
| rating | `numeric` | YES | - | - |
| review_count | `integer(32)` | YES | - | - |
| installs_range | `text` | YES | - | Google Play install range: 1M+, 10M+, etc. |
| vote_count | `integer(32)` | YES | - | Product Hunt upvote count |
| scraped_at | `timestamp with time zone` | **NO** | `now()` | Timestamp when the data was scraped from the source |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `app_rankings_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `app_rankings_source_app_url_key`: UNIQUE (source, app_url)

### Check Constraints
- `app_rankings_source_check`: CHECK ((source = ANY (ARRAY['apple_appstore'::text, 'google_play'::text, 'product_hunt'::text])))

## Indexes

- `app_rankings_pkey`
  ```sql
  CREATE UNIQUE INDEX app_rankings_pkey ON public.app_rankings USING btree (id)
  ```
- `app_rankings_source_app_url_key`
  ```sql
  CREATE UNIQUE INDEX app_rankings_source_app_url_key ON public.app_rankings USING btree (source, app_url)
  ```
- `idx_app_rankings_scraped_at`
  ```sql
  CREATE INDEX idx_app_rankings_scraped_at ON public.app_rankings USING btree (scraped_at DESC)
  ```
- `idx_app_rankings_source_category`
  ```sql
  CREATE INDEX idx_app_rankings_source_category ON public.app_rankings USING btree (source, category)
  ```

## Triggers

### trg_app_rankings_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_app_rankings_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
