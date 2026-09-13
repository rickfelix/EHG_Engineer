# venture_usage_events Table

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

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| event_type | `text` | **NO** | - | - |
| event_name | `text` | **NO** | - | - |
| properties | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | - | - |
| ingested_at | `timestamp with time zone` | **NO** | `clock_timestamp()` | - |

## Constraints

### Primary Key
- `venture_usage_events_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_usage_events_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `venture_usage_events_created_at_bound_check`: CHECK (((created_at >= (ingested_at - '30 days'::interval)) AND (created_at <= (ingested_at + '00:05:00'::interval))))
- `venture_usage_events_event_name_length_check`: CHECK (((length(event_name) >= 1) AND (length(event_name) <= 100)))
- `venture_usage_events_event_type_check`: CHECK ((event_type = ANY (ARRAY['page_view'::text, 'custom_event'::text])))
- `venture_usage_events_pairing_check`: CHECK ((((event_name = 'page_view'::text) AND (event_type = 'page_view'::text)) OR ((event_name <> 'page_view'::text) AND (event_type = 'custom_event'::text))))
- `venture_usage_events_properties_no_pii_keys_check`: CHECK ((NOT (properties ?| ARRAY['user_id'::text, 'email'::text, 'phone'::text, 'ssn'::text, 'password'::text, 'ip_address'::text])))
- `venture_usage_events_properties_shape_check`: CHECK ((jsonb_typeof(properties) = 'object'::text))
- `venture_usage_events_properties_size_check`: CHECK ((octet_length((properties)::text) <= 8000))

## Indexes

- `idx_venture_usage_events_ingested`
  ```sql
  CREATE INDEX idx_venture_usage_events_ingested ON public.venture_usage_events USING btree (ingested_at DESC)
  ```
- `idx_venture_usage_events_venture_created`
  ```sql
  CREATE INDEX idx_venture_usage_events_venture_created ON public.venture_usage_events USING btree (venture_id, created_at DESC)
  ```
- `idx_venture_usage_events_venture_ingested`
  ```sql
  CREATE INDEX idx_venture_usage_events_venture_ingested ON public.venture_usage_events USING btree (venture_id, ingested_at DESC)
  ```
- `venture_usage_events_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_usage_events_pkey ON public.venture_usage_events USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
