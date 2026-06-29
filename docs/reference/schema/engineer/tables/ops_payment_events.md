# ops_payment_events Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-06-29T03:05:24.044Z
**Rows**: 1
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| stripe_event_id | `text` | **NO** | - | - |
| stripe_charge_id | `text` | YES | - | - |
| payment_intent_id | `text` | YES | - | - |
| event_type | `text` | **NO** | - | - |
| amount_cents | `bigint(64)` | YES | - | - |
| currency | `text` | YES | - | - |
| status | `text` | YES | - | - |
| livemode | `boolean` | **NO** | `false` | - |
| event_ts | `timestamp with time zone` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| raw_payload | `jsonb` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `ops_payment_events_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `ops_payment_events_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `ops_payment_events_stripe_event_id_key`: UNIQUE (stripe_event_id)

## Indexes

- `idx_ops_payment_events_charge`
  ```sql
  CREATE INDEX idx_ops_payment_events_charge ON public.ops_payment_events USING btree (stripe_charge_id) WHERE (stripe_charge_id IS NOT NULL)
  ```
- `idx_ops_payment_events_event_ts`
  ```sql
  CREATE INDEX idx_ops_payment_events_event_ts ON public.ops_payment_events USING btree (event_ts DESC)
  ```
- `idx_ops_payment_events_pi`
  ```sql
  CREATE INDEX idx_ops_payment_events_pi ON public.ops_payment_events USING btree (payment_intent_id) WHERE (payment_intent_id IS NOT NULL)
  ```
- `idx_ops_payment_events_venture`
  ```sql
  CREATE INDEX idx_ops_payment_events_venture ON public.ops_payment_events USING btree (venture_id) WHERE (venture_id IS NOT NULL)
  ```
- `ops_payment_events_pkey`
  ```sql
  CREATE UNIQUE INDEX ops_payment_events_pkey ON public.ops_payment_events USING btree (id)
  ```
- `ops_payment_events_stripe_event_id_key`
  ```sql
  CREATE UNIQUE INDEX ops_payment_events_stripe_event_id_key ON public.ops_payment_events USING btree (stripe_event_id)
  ```

## RLS Policies

### 1. ops_payment_events_service (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
