# sms_inbound_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 44
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| from_phone | `text` | **NO** | - | - |
| to_phone | `text` | YES | - | - |
| body_raw | `text` | YES | - | - |
| provider_message_id | `text` | YES | - | - |
| signature_valid | `boolean` | **NO** | - | - |
| matched_decision_id | `uuid` | YES | - | - |
| outcome | `text` | **NO** | - | answered|expired|no_match|invalid_signature|rate_limited|ambiguous (2+ eligible pending candidates, FR-3)|suspended (persistent auto-suspend active, FR-3) |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `sms_inbound_log_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sms_inbound_log_matched_decision_id_fkey`: matched_decision_id → chairman_decisions(id)

### Check Constraints
- `sms_inbound_log_outcome_check`: CHECK ((outcome = ANY (ARRAY['answered'::text, 'expired'::text, 'no_match'::text, 'invalid_signature'::text, 'rate_limited'::text, 'ambiguous'::text, 'suspended'::text])))

## Indexes

- `idx_sms_inbound_log_decision`
  ```sql
  CREATE INDEX idx_sms_inbound_log_decision ON public.sms_inbound_log USING btree (matched_decision_id) WHERE (matched_decision_id IS NOT NULL)
  ```
- `idx_sms_inbound_log_from_phone_rate`
  ```sql
  CREATE INDEX idx_sms_inbound_log_from_phone_rate ON public.sms_inbound_log USING btree (from_phone, created_at)
  ```
- `sms_inbound_log_pkey`
  ```sql
  CREATE UNIQUE INDEX sms_inbound_log_pkey ON public.sms_inbound_log USING btree (id)
  ```

## RLS Policies

### 1. sms_inbound_log_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
