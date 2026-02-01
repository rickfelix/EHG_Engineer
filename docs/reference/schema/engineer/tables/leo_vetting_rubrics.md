# leo_vetting_rubrics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T16:44:51.224Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| version | `integer(32)` | **NO** | - | - |
| name | `text` | **NO** | - | - |
| description | `text` | **NO** | - | - |
| rules | `jsonb` | **NO** | - | - |
| status | `USER-DEFINED` | **NO** | `'draft'::leo_rubric_status` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| published_at | `timestamp with time zone` | YES | - | - |
| deprecated_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `leo_vetting_rubrics_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `uq_leo_vetting_rubrics_version`: UNIQUE (version)

### Check Constraints
- `chk_published_has_date`: CHECK ((((status = 'published'::leo_rubric_status) AND (published_at IS NOT NULL)) OR (status <> 'published'::leo_rubric_status)))
- `chk_rubric_rules_schema`: CHECK (((jsonb_typeof(rules) = 'object'::text) AND (rules ? 'rubric_version'::text) AND (rules ? 'rules'::text) AND (rules ? 'pass_threshold'::text) AND (rules ? 'hard_fail_conditions'::text) AND (jsonb_typeof((rules -> 'rules'::text)) = 'array'::text) AND (jsonb_typeof((rules -> 'hard_fail_conditions'::text)) = 'array'::text) AND (((rules ->> 'pass_threshold'::text))::numeric >= (0)::numeric) AND (((rules ->> 'pass_threshold'::text))::numeric <= (1)::numeric)))

## Indexes

- `idx_leo_vetting_rubrics_status`
  ```sql
  CREATE INDEX idx_leo_vetting_rubrics_status ON public.leo_vetting_rubrics USING btree (status)
  ```
- `idx_leo_vetting_rubrics_version`
  ```sql
  CREATE INDEX idx_leo_vetting_rubrics_version ON public.leo_vetting_rubrics USING btree (version)
  ```
- `leo_vetting_rubrics_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_vetting_rubrics_pkey ON public.leo_vetting_rubrics USING btree (id)
  ```
- `uq_leo_vetting_rubrics_version`
  ```sql
  CREATE UNIQUE INDEX uq_leo_vetting_rubrics_version ON public.leo_vetting_rubrics USING btree (version)
  ```

## RLS Policies

### 1. rubrics_select_all (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. rubrics_service_role (ALL)

- **Roles**: {public}
- **Using**: `(((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
