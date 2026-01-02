# voice_function_calls Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-02T03:16:38.682Z
**Rows**: 0
**RLS**: Enabled (5 policies)

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

### 1. Allow authenticated users to delete voice_function_calls (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Allow authenticated users to insert voice_function_calls (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. Allow authenticated users to update voice_function_calls (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 4. Allow service_role to manage voice_function_calls (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 5. Users can view own function calls (SELECT)

- **Roles**: {public}
- **Using**: `(EXISTS ( SELECT 1
   FROM voice_conversations
  WHERE ((voice_conversations.id = voice_function_calls.conversation_id) AND (voice_conversations.user_id = auth.uid()))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
