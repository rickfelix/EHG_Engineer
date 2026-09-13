# sms_status_staging Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-13T06:31:02.341Z
**Rows**: 0
**RLS**: Enabled (0 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| provider_message_id | `text` | **NO** | - | - |
| message_status | `text` | **NO** | - | - |
| signature_valid | `boolean` | **NO** | `true` | Always TRUE by construction — the relay never calls fn_relay_insert_sms_status for a failed HMAC verification. Defense-in-depth assertion, not a filter. |
| received_at | `timestamp with time zone` | **NO** | `now()` | - |
| drained_at | `timestamp with time zone` | YES | - | Stamped (claim-first) by drainSmsStatusStaging once processed — NULL means still pending drain. A missing delivery_status_source column on sms_outbound_obligations leaves this NULL too (schema-not-ready, retried next tick), never silently discarded. |

## Constraints

### Primary Key
- `sms_status_staging_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `sms_status_staging_sid_status_key`: UNIQUE (provider_message_id, message_status)

### Check Constraints
- `sms_status_staging_message_status_valid`: CHECK ((message_status = ANY (ARRAY['queued'::text, 'sending'::text, 'sent'::text, 'delivered'::text, 'undelivered'::text, 'failed'::text])))

## Indexes

- `idx_sms_status_staging_undrained`
  ```sql
  CREATE INDEX idx_sms_status_staging_undrained ON public.sms_status_staging USING btree (received_at) WHERE (drained_at IS NULL)
  ```
- `sms_status_staging_pkey`
  ```sql
  CREATE UNIQUE INDEX sms_status_staging_pkey ON public.sms_status_staging USING btree (id)
  ```
- `sms_status_staging_sid_status_key`
  ```sql
  CREATE UNIQUE INDEX sms_status_staging_sid_status_key ON public.sms_status_staging USING btree (provider_message_id, message_status)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
