# eva_chat_messages Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-08T23:38:51.192Z
**Rows**: 425
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| conversation_id | `uuid` | **NO** | - | - |
| role | `text` | **NO** | - | - |
| content | `text` | **NO** | - | - |
| canvas_content | `jsonb` | YES | - | - |
| canvas_content_type | `text` | YES | - | - |
| token_count | `integer(32)` | YES | - | - |
| model_used | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_chat_messages_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_chat_messages_conversation_id_fkey`: conversation_id → eva_chat_conversations(id)

### Check Constraints
- `eva_chat_messages_role_check`: CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))

## Indexes

- `eva_chat_messages_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_chat_messages_pkey ON public.eva_chat_messages USING btree (id)
  ```
- `idx_eva_chat_messages_conversation`
  ```sql
  CREATE INDEX idx_eva_chat_messages_conversation ON public.eva_chat_messages USING btree (conversation_id, created_at)
  ```

## RLS Policies

### 1. Service role full access messages (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`

### 2. Users can insert messages in own conversations (INSERT)

- **Roles**: {public}
- **With Check**: `(conversation_id IN ( SELECT eva_chat_conversations.id
   FROM eva_chat_conversations
  WHERE (eva_chat_conversations.user_id = auth.uid())))`

### 3. Users can view messages in own conversations (SELECT)

- **Roles**: {public}
- **Using**: `(conversation_id IN ( SELECT eva_chat_conversations.id
   FROM eva_chat_conversations
  WHERE (eva_chat_conversations.user_id = auth.uid())))`

---

[← Back to Schema Overview](../database-schema-overview.md)
