# sms_relay_staging Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 593
**RLS**: Enabled (0 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| provider_message_id | `text` | **NO** | - | - |
| from_phone | `text` | **NO** | - | - |
| to_phone | `text` | YES | - | - |
| body_raw | `text` | YES | - | - |
| signature_valid | `boolean` | **NO** | `true` | Always TRUE by construction — the relay never calls fn_relay_insert_sms_candidate for a failed HMAC verification. Defense-in-depth assertion, not a filter. |
| received_at | `timestamp with time zone` | **NO** | `now()` | - |
| drained_at | `timestamp with time zone` | YES | - | Stamped by the trusted consumer once handleInboundSmsReply has processed this row — NULL means still pending drain |
| parked_at | `timestamp with time zone` | YES | - | SD-LEO-INFRA-CHAIRMAN-INBOUND-VISIBILITY-001: set when a verified-chairman-number row resolves no_match/rate_limited, so content is never terminal-drained unnoticed. NULL means never parked. Orthogonal to drained_at (the exactly-once processing claim) — never repurpose drained_at for this. |
| resolved_at | `timestamp with time zone` | YES | - | SD-LEO-INFRA-CHAIRMAN-INBOUND-VISIBILITY-001: set once a parked row has been explicitly dispositioned (scripts/resolve-parked-chairman-sms.cjs). NULL + parked_at IS NOT NULL means still awaiting a reply/disposition and re-fires QUIET_TICK_SMS_PARKED every tick. |

## Constraints

### Primary Key
- `sms_relay_staging_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `sms_relay_staging_provider_message_id_key`: UNIQUE (provider_message_id)

## Indexes

- `idx_sms_relay_staging_undrained`
  ```sql
  CREATE INDEX idx_sms_relay_staging_undrained ON public.sms_relay_staging USING btree (received_at) WHERE (drained_at IS NULL)
  ```
- `sms_relay_staging_pkey`
  ```sql
  CREATE UNIQUE INDEX sms_relay_staging_pkey ON public.sms_relay_staging USING btree (id)
  ```
- `sms_relay_staging_provider_message_id_key`
  ```sql
  CREATE UNIQUE INDEX sms_relay_staging_provider_message_id_key ON public.sms_relay_staging USING btree (provider_message_id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
