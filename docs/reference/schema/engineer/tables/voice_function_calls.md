# voice_function_calls Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `uuid_generate_v4()` | - |
| conversation_id | `uuid` | YES | - | - |
| function_name | `text` | **NO** | - | - |
| arguments | `jsonb` | YES | - | - |
| result | `jsonb` | YES | - | - |
| execution_time_ms | `integer(32)` | YES | - | - |
| success | `boolean` | YES | `true` | - |
| error_message | `text` | YES | - | - |
| called_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `voice_function_calls_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `voice_function_calls_conversation_id_fkey`: conversation_id → voice_conversations(id)

## Indexes

- `idx_function_calls_conversation`
  ```sql
  CREATE INDEX idx_function_calls_conversation ON public.voice_function_calls USING btree (conversation_id)
  ```
- `idx_function_calls_name`
  ```sql
  CREATE INDEX idx_function_calls_name ON public.voice_function_calls USING btree (function_name)
  ```
- `voice_function_calls_pkey`
  ```sql
  CREATE UNIQUE INDEX voice_function_calls_pkey ON public.voice_function_calls USING btree (id)
  ```

## RLS Policies

### 1. Users can view own function calls (SELECT)

- **Roles**: {public}
- **Using**: `(EXISTS ( SELECT 1
   FROM voice_conversations
  WHERE ((voice_conversations.id = voice_function_calls.conversation_id) AND (voice_conversations.user_id = auth.uid()))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
