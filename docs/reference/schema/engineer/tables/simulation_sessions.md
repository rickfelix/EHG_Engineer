# simulation_sessions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-01T14:20:42.746Z
**Rows**: 5
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| seed_text | `text` | **NO** | - | - |
| prd_content | `jsonb` | YES | - | - |
| schema_content | `jsonb` | YES | - | - |
| repo_url | `text` | YES | - | - |
| preview_url | `text` | YES | - | - |
| epistemic_status | `text` | YES | `'simulation'::text` | Tracks simulation state: simulation (active), official (promoted), archived (failed kill gate), incinerated (purged) |
| ttl_days | `integer(32)` | YES | `90` | Time-to-live in days before auto-incineration (default: 90) |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| archived_at | `timestamp with time zone` | YES | - | - |
| incinerated_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `simulation_sessions_pkey`: PRIMARY KEY (id)

### Check Constraints
- `simulation_sessions_epistemic_status_check`: CHECK ((epistemic_status = ANY (ARRAY['simulation'::text, 'official'::text, 'archived'::text, 'incinerated'::text])))

## Indexes

- `idx_simulation_sessions_epistemic_status`
  ```sql
  CREATE INDEX idx_simulation_sessions_epistemic_status ON public.simulation_sessions USING btree (epistemic_status)
  ```
- `idx_simulation_sessions_venture_id`
  ```sql
  CREATE INDEX idx_simulation_sessions_venture_id ON public.simulation_sessions USING btree (venture_id)
  ```
- `simulation_sessions_pkey`
  ```sql
  CREATE UNIQUE INDEX simulation_sessions_pkey ON public.simulation_sessions USING btree (id)
  ```

## RLS Policies

### 1. Allow all for authenticated (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 2. Allow select for anon (SELECT)

- **Roles**: {anon}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
