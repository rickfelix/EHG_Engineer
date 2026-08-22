# venture_consent_events Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| recipient_email | `text` | **NO** | - | - |
| event_type | `text` | **NO** | - | - |
| provenance | `text` | **NO** | - | - |
| source_ref | `text` | YES | - | - |
| occurred_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_consent_events_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_consent_events_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `venture_consent_events_email_normalized`: CHECK (((recipient_email = lower(btrim(recipient_email))) AND (recipient_email <> ''::text)))
- `venture_consent_events_event_type_check`: CHECK ((event_type = ANY (ARRAY['opt_in'::text, 'opt_out'::text])))
- `venture_consent_events_provenance_nonempty`: CHECK ((btrim(provenance) <> ''::text))

## Indexes

- `venture_consent_events_lookup_idx`
  ```sql
  CREATE INDEX venture_consent_events_lookup_idx ON public.venture_consent_events USING btree (venture_id, recipient_email, occurred_at DESC)
  ```
- `venture_consent_events_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_consent_events_pkey ON public.venture_consent_events USING btree (id)
  ```

## RLS Policies

### 1. venture_consent_events_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### venture_consent_events_no_delete_trg

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION venture_consent_events_no_delete()`

### venture_consent_events_no_update

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION venture_consent_events_freeze()`

---

[← Back to Schema Overview](../database-schema-overview.md)
