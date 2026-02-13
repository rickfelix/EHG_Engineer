# soul_extractions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T15:49:11.388Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| simulation_session_id | `uuid` | YES | - | - |
| extraction_stage | `integer(32)` | **NO** | - | Stage number where extraction occurred (typically 16 or 17) |
| soul_content | `jsonb` | **NO** | - | JSONB containing validated requirements, data model, user flows, component inventory |
| extracted_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `soul_extractions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `soul_extractions_simulation_session_id_fkey`: simulation_session_id → simulation_sessions(id)

## Indexes

- `idx_soul_extractions_extraction_stage`
  ```sql
  CREATE INDEX idx_soul_extractions_extraction_stage ON public.soul_extractions USING btree (extraction_stage)
  ```
- `idx_soul_extractions_simulation_session_id`
  ```sql
  CREATE INDEX idx_soul_extractions_simulation_session_id ON public.soul_extractions USING btree (simulation_session_id)
  ```
- `idx_soul_extractions_venture_id`
  ```sql
  CREATE INDEX idx_soul_extractions_venture_id ON public.soul_extractions USING btree (venture_id)
  ```
- `soul_extractions_pkey`
  ```sql
  CREATE UNIQUE INDEX soul_extractions_pkey ON public.soul_extractions USING btree (id)
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
