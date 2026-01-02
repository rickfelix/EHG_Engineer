# voice_usage_metrics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-02T03:47:14.868Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `uuid_generate_v4()` | - |
| conversation_id | `uuid` | YES | - | - |
| timestamp | `timestamp with time zone` | YES | `now()` | - |
| input_tokens | `integer(32)` | YES | - | - |
| output_tokens | `integer(32)` | YES | - | - |
| audio_duration_ms | `integer(32)` | YES | - | - |
| function_calls | `integer(32)` | YES | - | - |
| latency_ms | `integer(32)` | YES | - | - |
| event_type | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `voice_usage_metrics_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `voice_usage_metrics_conversation_id_fkey`: conversation_id → voice_conversations(id)

## Indexes

- `idx_metrics_conversation_id`
  ```sql
  CREATE INDEX idx_metrics_conversation_id ON public.voice_usage_metrics USING btree (conversation_id)
  ```
- `idx_metrics_timestamp`
  ```sql
  CREATE INDEX idx_metrics_timestamp ON public.voice_usage_metrics USING btree ("timestamp" DESC)
  ```
- `voice_usage_metrics_pkey`
  ```sql
  CREATE UNIQUE INDEX voice_usage_metrics_pkey ON public.voice_usage_metrics USING btree (id)
  ```

## RLS Policies

### 1. Allow authenticated users to insert voice_usage_metrics (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 2. Allow service_role to manage voice_usage_metrics (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 3. Users can view own metrics (SELECT)

- **Roles**: {public}
- **Using**: `(EXISTS ( SELECT 1
   FROM voice_conversations
  WHERE ((voice_conversations.id = voice_usage_metrics.conversation_id) AND (voice_conversations.user_id = auth.uid()))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
