# chairman_notifications Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T22:06:06.603Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| chairman_user_id | `text` | **NO** | - | - |
| recipient_email | `text` | **NO** | - | - |
| notification_type | `text` | **NO** | - | Type of notification: immediate (critical decisions), daily_digest, weekly_summary |
| decision_id | `uuid` | YES | - | - |
| status | `text` | **NO** | `'queued'::text` | Delivery lifecycle: queued -> sent/failed/rate_limited/deferred |
| provider_message_id | `text` | YES | - | - |
| error_code | `text` | YES | - | - |
| error_message | `text` | YES | - | - |
| digest_key | `text` | YES | - | Deterministic key (date:timezone) preventing duplicate daily digests |
| summary_key | `text` | YES | - | Deterministic key (week:timezone) preventing duplicate weekly summaries |
| subject | `text` | YES | - | - |
| email_metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| sent_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `chairman_notifications_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `chairman_notifications_decision_id_fkey`: decision_id → chairman_decisions(id)

### Check Constraints
- `chairman_notifications_notification_type_check`: CHECK ((notification_type = ANY (ARRAY['immediate'::text, 'daily_digest'::text, 'weekly_summary'::text])))
- `chairman_notifications_status_check`: CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'failed'::text, 'rate_limited'::text, 'deferred'::text])))

## Indexes

- `chairman_notifications_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_notifications_pkey ON public.chairman_notifications USING btree (id)
  ```
- `idx_chairman_notifications_decision`
  ```sql
  CREATE INDEX idx_chairman_notifications_decision ON public.chairman_notifications USING btree (decision_id) WHERE (decision_id IS NOT NULL)
  ```
- `idx_chairman_notifications_digest_key`
  ```sql
  CREATE UNIQUE INDEX idx_chairman_notifications_digest_key ON public.chairman_notifications USING btree (digest_key) WHERE ((digest_key IS NOT NULL) AND (status = ANY (ARRAY['queued'::text, 'sent'::text])))
  ```
- `idx_chairman_notifications_history`
  ```sql
  CREATE INDEX idx_chairman_notifications_history ON public.chairman_notifications USING btree (chairman_user_id, notification_type, created_at DESC)
  ```
- `idx_chairman_notifications_queue`
  ```sql
  CREATE INDEX idx_chairman_notifications_queue ON public.chairman_notifications USING btree (status, created_at) WHERE (status = 'queued'::text)
  ```
- `idx_chairman_notifications_rate_limit`
  ```sql
  CREATE INDEX idx_chairman_notifications_rate_limit ON public.chairman_notifications USING btree (recipient_email, notification_type, status, created_at) WHERE ((notification_type = 'immediate'::text) AND (status = 'sent'::text))
  ```
- `idx_chairman_notifications_summary_key`
  ```sql
  CREATE UNIQUE INDEX idx_chairman_notifications_summary_key ON public.chairman_notifications USING btree (summary_key) WHERE ((summary_key IS NOT NULL) AND (status = ANY (ARRAY['queued'::text, 'sent'::text])))
  ```

## RLS Policies

### 1. chairman_notifications_read_own (SELECT)

- **Roles**: {authenticated}
- **Using**: `(chairman_user_id = (auth.uid())::text)`

### 2. chairman_notifications_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_chairman_notifications_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_chairman_notifications_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
