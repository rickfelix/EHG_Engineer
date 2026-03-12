# eva_chat_conversations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-12T11:52:15.801Z
**Rows**: N/A (RLS restricted)
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| user_id | `uuid` | **NO** | - | - |
| title | `text` | **NO** | `'New Conversation'::text` | - |
| status | `text` | **NO** | `'active'::text` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_chat_conversations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_chat_conversations_user_id_fkey`: user_id → users(id)

### Check Constraints
- `eva_chat_conversations_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))

## Indexes

- `eva_chat_conversations_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_chat_conversations_pkey ON public.eva_chat_conversations USING btree (id)
  ```
- `idx_eva_chat_conversations_user`
  ```sql
  CREATE INDEX idx_eva_chat_conversations_user ON public.eva_chat_conversations USING btree (user_id, created_at DESC)
  ```

## RLS Policies

### 1. Service role full access conversations (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`

### 2. Users can create own conversations (INSERT)

- **Roles**: {public}
- **With Check**: `(auth.uid() = user_id)`

### 3. Users can update own conversations (UPDATE)

- **Roles**: {public}
- **Using**: `(auth.uid() = user_id)`

### 4. Users can view own conversations (SELECT)

- **Roles**: {public}
- **Using**: `(auth.uid() = user_id)`

## Triggers

### eva_chat_conversations_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_eva_chat_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
