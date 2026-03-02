# telegram_conversations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-02T00:03:49.900Z
**Rows**: 4
**RLS**: Enabled (0 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| chat_id | `text` | **NO** | - | Telegram chat ID - unique per active conversation |
| messages | `jsonb` | **NO** | `'[]'::jsonb` | Array of {role, content, timestamp} message objects |
| token_count | `integer(32)` | **NO** | `0` | Estimated token count for conversation budget management |
| expires_at | `timestamp with time zone` | **NO** | `(now() + '01:00:00'::interval)` | Auto-expire timestamp - conversation resets after 1 hour of inactivity |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `telegram_conversations_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_telegram_conversations_chat_id`
  ```sql
  CREATE UNIQUE INDEX idx_telegram_conversations_chat_id ON public.telegram_conversations USING btree (chat_id)
  ```
- `telegram_conversations_pkey`
  ```sql
  CREATE UNIQUE INDEX telegram_conversations_pkey ON public.telegram_conversations USING btree (id)
  ```

## Triggers

### trigger_telegram_conversations_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_telegram_conversations_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
