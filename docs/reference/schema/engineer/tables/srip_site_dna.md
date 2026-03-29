# srip_site_dna Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-29T16:01:09.238Z
**Rows**: 4
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| reference_url | `text` | **NO** | - | - |
| screenshot_path | `text` | YES | - | Optional path to a manual screenshot fallback when automated capture is unavailable. |
| dna_json | `jsonb` | **NO** | `'{}'::jsonb` | JSONB containing design tokens, layout structure, component inventory, typography, color palette, and spacing extracted from the reference URL. |
| extraction_steps | `jsonb` | YES | `'[]'::jsonb` | JSONB array tracking which extraction steps have completed (e.g., screenshot, DOM analysis, style extraction). |
| quality_score | `numeric(5,2)` | YES | - | Quality score (0-100) indicating confidence in the extraction completeness and accuracy. |
| status | `character varying(20)` | YES | `'draft'::character varying` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `character varying(100)` | YES | - | - |

## Constraints

### Primary Key
- `srip_site_dna_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `srip_site_dna_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `srip_site_dna_status_check`: CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))

## Indexes

- `idx_srip_site_dna_dna_json`
  ```sql
  CREATE INDEX idx_srip_site_dna_dna_json ON public.srip_site_dna USING gin (dna_json)
  ```
- `idx_srip_site_dna_status`
  ```sql
  CREATE INDEX idx_srip_site_dna_status ON public.srip_site_dna USING btree (status)
  ```
- `idx_srip_site_dna_venture_id`
  ```sql
  CREATE INDEX idx_srip_site_dna_venture_id ON public.srip_site_dna USING btree (venture_id)
  ```
- `srip_site_dna_pkey`
  ```sql
  CREATE UNIQUE INDEX srip_site_dna_pkey ON public.srip_site_dna USING btree (id)
  ```

## RLS Policies

### 1. srip_site_dna_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. srip_site_dna_venture_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 3. srip_site_dna_venture_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 4. srip_site_dna_venture_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

## Triggers

### update_srip_site_dna_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
