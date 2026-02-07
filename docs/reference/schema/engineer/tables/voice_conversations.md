# voice_conversations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T02:59:02.369Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `uuid_generate_v4()` | - |
| user_id | `uuid` | YES | - | - |
| session_id | `text` | **NO** | - | - |
| started_at | `timestamp with time zone` | YES | `now()` | - |
| ended_at | `timestamp with time zone` | YES | - | - |
| duration_seconds | `integer(32)` | YES | - | - |
| total_tokens | `integer(32)` | YES | - | - |
| input_tokens | `integer(32)` | YES | - | - |
| output_tokens | `integer(32)` | YES | - | - |
| cost_cents | `integer(32)` | YES | - | - |
| summary | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `voice_conversations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `voice_conversations_user_id_fkey`: user_id → users(id)

## Indexes

- `idx_conversations_session_id`
  ```sql
  CREATE INDEX idx_conversations_session_id ON public.voice_conversations USING btree (session_id)
  ```
- `idx_conversations_started_at`
  ```sql
  CREATE INDEX idx_conversations_started_at ON public.voice_conversations USING btree (started_at DESC)
  ```
- `idx_conversations_user_id`
  ```sql
  CREATE INDEX idx_conversations_user_id ON public.voice_conversations USING btree (user_id)
  ```
- `voice_conversations_pkey`
  ```sql
  CREATE UNIQUE INDEX voice_conversations_pkey ON public.voice_conversations USING btree (id)
  ```

## RLS Policies

### 1. Allow users to delete own voice_conversations (DELETE)

- **Roles**: {authenticated}
- **Using**: `(auth.uid() = user_id)`

### 2. Users can insert own conversations (INSERT)

- **Roles**: {public}
- **With Check**: `(auth.uid() = user_id)`

### 3. Users can update own conversations (UPDATE)

- **Roles**: {public}
- **Using**: `(auth.uid() = user_id)`

### 4. Users can view own conversations (SELECT)

- **Roles**: {public}
- **Using**: `(auth.uid() = user_id)`

## Triggers

### update_voice_conversations_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_conversation_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
