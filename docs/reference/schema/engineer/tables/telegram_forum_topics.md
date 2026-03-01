# telegram_forum_topics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-01T17:59:03.922Z
**Rows**: 8
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| thread_id | `integer(32)` | **NO** | - | - |
| topic_name | `text` | **NO** | - | - |
| persona | `text` | **NO** | - | - |
| system_prompt_key | `text` | **NO** | - | - |
| allowed_tools | `jsonb` | **NO** | `'[]'::jsonb` | - |
| is_read_only | `boolean` | **NO** | `true` | - |
| description | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `telegram_forum_topics_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `telegram_forum_topics_thread_id_key`: UNIQUE (thread_id)

### Check Constraints
- `telegram_forum_topics_persona_check`: CHECK ((persona = ANY (ARRAY['chairman'::text, 'builder'::text, 'shared'::text])))

## Indexes

- `telegram_forum_topics_pkey`
  ```sql
  CREATE UNIQUE INDEX telegram_forum_topics_pkey ON public.telegram_forum_topics USING btree (id)
  ```
- `telegram_forum_topics_thread_id_key`
  ```sql
  CREATE UNIQUE INDEX telegram_forum_topics_thread_id_key ON public.telegram_forum_topics USING btree (thread_id)
  ```

## RLS Policies

### 1. Service role full access (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
