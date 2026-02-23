# telegram_bot_interactions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-23T22:18:41.779Z
**Rows**: 73
**RLS**: Enabled (0 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| chat_id | `text` | **NO** | - | Telegram chat ID |
| message_id | `text` | YES | - | Telegram message ID for tracing |
| direction | `text` | **NO** | - | Message direction: inbound (from user) or outbound (bot reply) |
| message_text | `text` | YES | - | The message content (may be truncated for long messages) |
| message_type | `text` | YES | - | Classification of the message (e.g., text, auth_rejected, command) |
| tools_used | `ARRAY` | YES | - | Array of Claude tool names invoked during processing |
| latency_ms | `integer(32)` | YES | - | End-to-end response time in milliseconds |
| token_usage | `jsonb` | YES | - | Token consumption: integer or {input_tokens, output_tokens} |
| error | `text` | YES | - | Error message if the interaction failed |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| thread_id | `integer(32)` | YES | - | - |
| misrouted | `boolean` | YES | `false` | - |
| detected_intent | `text` | YES | - | - |

## Constraints

### Primary Key
- `telegram_bot_interactions_pkey`: PRIMARY KEY (id)

### Check Constraints
- `telegram_bot_interactions_direction_check`: CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))

## Indexes

- `idx_telegram_bot_interactions_chat_id`
  ```sql
  CREATE INDEX idx_telegram_bot_interactions_chat_id ON public.telegram_bot_interactions USING btree (chat_id)
  ```
- `idx_telegram_bot_interactions_created_at`
  ```sql
  CREATE INDEX idx_telegram_bot_interactions_created_at ON public.telegram_bot_interactions USING btree (created_at)
  ```
- `telegram_bot_interactions_pkey`
  ```sql
  CREATE UNIQUE INDEX telegram_bot_interactions_pkey ON public.telegram_bot_interactions USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
