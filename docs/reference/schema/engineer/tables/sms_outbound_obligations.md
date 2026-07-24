# sms_outbound_obligations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 153
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| recipient_phone | `text` | **NO** | - | - |
| kind | `text` | **NO** | - | - |
| decision_id | `uuid` | YES | - | - |
| body | `text` | **NO** | - | - |
| dedupe_key | `text` | YES | - | UNIQUE idempotency key for enqueue (ON CONFLICT DO NOTHING), e.g. morning_review:<date> so the 6AM review enqueues at most once/day. |
| status | `text` | **NO** | `'owed'::text` | - |
| provider_message_id | `text` | YES | - | - |
| attempts | `integer(32)` | **NO** | `0` | - |
| not_before | `timestamp with time zone` | YES | - | Sleep-window gate: a row enqueued inside 10PM-6AM ET carries not_before=next-6AM so the worker does not claim it until the morning batch. |
| claimed_at | `timestamp with time zone` | YES | - | - |
| claimed_by | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| sent_at | `timestamp with time zone` | YES | - | Stamped when the provider ACCEPTS the message (Twilio 201/queued) — this is NOT delivery. delivered_at carries delivery-truth. |
| delivered_at | `timestamp with time zone` | YES | - | Stamped ONLY by a signature-valid MessageStatus=delivered status callback (FR-2). A 201-accept alone never sets this — the F1 fix. |
| last_error | `text` | YES | - | - |
| media_url | `text` | YES | - | Short-TTL signed URL (SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-D) for an MMS attachment (e.g. the daily-review Gantt PNG), sourced from a PRIVATE (public:false) Supabase Storage bucket — never a public URL. NULL for text-only sends. Passed to the Twilio provider as the MediaUrl form param. |

## Constraints

### Primary Key
- `sms_outbound_obligations_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `sms_outbound_obligations_dedupe_key_key`: UNIQUE (dedupe_key)

### Check Constraints
- `sms_outbound_obligations_status_check`: CHECK ((status = ANY (ARRAY['owed'::text, 'sending'::text, 'sent'::text, 'delivered'::text, 'undelivered'::text, 'failed'::text, 'canceled'::text])))

## Indexes

- `idx_sms_outbound_obligations_claimable`
  ```sql
  CREATE INDEX idx_sms_outbound_obligations_claimable ON public.sms_outbound_obligations USING btree (created_at) WHERE (status = 'owed'::text)
  ```
- `idx_sms_outbound_obligations_provider_message_id`
  ```sql
  CREATE INDEX idx_sms_outbound_obligations_provider_message_id ON public.sms_outbound_obligations USING btree (provider_message_id) WHERE (provider_message_id IS NOT NULL)
  ```
- `sms_outbound_obligations_dedupe_key_key`
  ```sql
  CREATE UNIQUE INDEX sms_outbound_obligations_dedupe_key_key ON public.sms_outbound_obligations USING btree (dedupe_key)
  ```
- `sms_outbound_obligations_pkey`
  ```sql
  CREATE UNIQUE INDEX sms_outbound_obligations_pkey ON public.sms_outbound_obligations USING btree (id)
  ```

## RLS Policies

### 1. sms_outbound_obligations_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
