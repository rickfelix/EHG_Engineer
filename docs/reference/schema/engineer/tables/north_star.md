# north_star Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 1
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| definition | `text` | **NO** | - | - |
| metric | `text` | **NO** | - | - |
| target | `jsonb` | **NO** | - | - |
| sustain | `text` | YES | - | - |
| measurement_source | `text` | YES | - | - |
| cadence | `text` | YES | - | - |
| status | `text` | **NO** | `'proposed'::text` | - |
| provenance | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `north_star_pkey`: PRIMARY KEY (id)

### Check Constraints
- `north_star_status_check`: CHECK ((status = ANY (ARRAY['proposed'::text, 'chairman_ratified'::text, 'amended'::text])))

## Indexes

- `north_star_pkey`
  ```sql
  CREATE UNIQUE INDEX north_star_pkey ON public.north_star USING btree (id)
  ```
- `uq_north_star_one_ratified`
  ```sql
  CREATE UNIQUE INDEX uq_north_star_one_ratified ON public.north_star USING btree (status) WHERE (status = 'chairman_ratified'::text)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
