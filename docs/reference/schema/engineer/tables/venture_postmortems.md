# venture_postmortems Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-11T20:02:47.590Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (27 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| venture_name | `text` | YES | - | - |
| venture_start_date | `timestamp with time zone` | YES | - | - |
| failure_date | `timestamp with time zone` | YES | - | - |
| why_1 | `text` | YES | - | - |
| why_1_evidence | `jsonb` | YES | `'[]'::jsonb` | - |
| why_2 | `text` | YES | - | - |
| why_2_evidence | `jsonb` | YES | `'[]'::jsonb` | - |
| why_3 | `text` | YES | - | - |
| why_3_evidence | `jsonb` | YES | `'[]'::jsonb` | - |
| why_4 | `text` | YES | - | - |
| why_4_evidence | `jsonb` | YES | `'[]'::jsonb` | - |
| why_5 | `text` | YES | - | - |
| why_5_evidence | `jsonb` | YES | `'[]'::jsonb` | - |
| root_cause_summary | `text` | YES | - | - |
| contributing_factors | `jsonb` | YES | `'[]'::jsonb` | - |
| linked_sd_ids | `ARRAY` | YES | - | - |
| linked_pattern_ids | `ARRAY` | YES | - | - |
| status | `character varying(20)` | YES | `'draft'::character varying` | - |
| assigned_to | `text` | YES | - | - |
| reviewed_by | `text` | YES | - | - |
| review_date | `timestamp with time zone` | YES | - | - |
| created_by | `text` | YES | `'SYSTEM'::text` | - |
| updated_by | `text` | YES | `'SYSTEM'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `venture_postmortems_pkey`: PRIMARY KEY (id)

### Check Constraints
- `venture_postmortems_status_check`: CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'in_review'::character varying, 'published'::character varying, 'archived'::character varying])::text[])))

## Indexes

- `idx_postmortems_failure_date`
  ```sql
  CREATE INDEX idx_postmortems_failure_date ON public.venture_postmortems USING btree (failure_date DESC)
  ```
- `idx_postmortems_status`
  ```sql
  CREATE INDEX idx_postmortems_status ON public.venture_postmortems USING btree (status)
  ```
- `idx_postmortems_venture_id`
  ```sql
  CREATE INDEX idx_postmortems_venture_id ON public.venture_postmortems USING btree (venture_id)
  ```
- `venture_postmortems_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_postmortems_pkey ON public.venture_postmortems USING btree (id)
  ```

## RLS Policies

### 1. Authenticated users can create postmortems (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 2. Authenticated users can update draft postmortems (UPDATE)

- **Roles**: {authenticated}
- **Using**: `((status)::text = ANY ((ARRAY['draft'::character varying, 'in_review'::character varying])::text[]))`
- **With Check**: `((status)::text = ANY ((ARRAY['draft'::character varying, 'in_review'::character varying])::text[]))`

### 3. Authenticated users can view postmortems (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. Service role can manage all postmortems (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
