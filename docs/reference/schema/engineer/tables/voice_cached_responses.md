# voice_cached_responses Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `uuid_generate_v4()` | - |
| query_hash | `text` | **NO** | - | - |
| query_text | `text` | YES | - | - |
| response_text | `text` | YES | - | - |
| response_audio_base64 | `text` | YES | - | - |
| embedding | `USER-DEFINED` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| expires_at | `timestamp with time zone` | YES | `(now() + '7 days'::interval)` | - |
| hit_count | `integer(32)` | YES | `0` | - |
| last_accessed | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `voice_cached_responses_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `voice_cached_responses_query_hash_key`: UNIQUE (query_hash)

## Indexes

- `idx_cached_responses_expires`
  ```sql
  CREATE INDEX idx_cached_responses_expires ON public.voice_cached_responses USING btree (expires_at)
  ```
- `idx_cached_responses_hash`
  ```sql
  CREATE INDEX idx_cached_responses_hash ON public.voice_cached_responses USING btree (query_hash)
  ```
- `voice_cached_responses_pkey`
  ```sql
  CREATE UNIQUE INDEX voice_cached_responses_pkey ON public.voice_cached_responses USING btree (id)
  ```
- `voice_cached_responses_query_hash_key`
  ```sql
  CREATE UNIQUE INDEX voice_cached_responses_query_hash_key ON public.voice_cached_responses USING btree (query_hash)
  ```

## RLS Policies

### 1. Public read cached responses (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. Service role writes cached responses (INSERT)

- **Roles**: {public}
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
