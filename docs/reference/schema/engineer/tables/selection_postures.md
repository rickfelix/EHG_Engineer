# selection_postures Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 2
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| phase_key | `text` | **NO** | - | - |
| version | `integer(32)` | **NO** | `1` | - |
| display_name | `text` | YES | - | - |
| criteria | `jsonb` | **NO** | - | - |
| status | `text` | **NO** | - | - |
| ratified_by | `text` | YES | - | - |
| ratified_at | `timestamp with time zone` | YES | - | - |
| ratification_ref | `text` | YES | - | - |
| transition_condition | `text` | YES | - | - |
| expiry_condition | `text` | YES | - | - |
| activated_at | `timestamp with time zone` | YES | - | - |
| expired_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `selection_postures_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `selection_postures_phase_key_version_key`: UNIQUE (phase_key, version)

### Check Constraints
- `selection_postures_active_requires_ratification`: CHECK (((status <> 'active'::text) OR (ratified_at IS NOT NULL)))
- `selection_postures_status_check`: CHECK ((status = ANY (ARRAY['pre_declared'::text, 'ratified'::text, 'active'::text, 'expired'::text])))

## Indexes

- `selection_postures_one_active`
  ```sql
  CREATE UNIQUE INDEX selection_postures_one_active ON public.selection_postures USING btree ((true)) WHERE (status = 'active'::text)
  ```
- `selection_postures_phase_key_version_key`
  ```sql
  CREATE UNIQUE INDEX selection_postures_phase_key_version_key ON public.selection_postures USING btree (phase_key, version)
  ```
- `selection_postures_pkey`
  ```sql
  CREATE UNIQUE INDEX selection_postures_pkey ON public.selection_postures USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
