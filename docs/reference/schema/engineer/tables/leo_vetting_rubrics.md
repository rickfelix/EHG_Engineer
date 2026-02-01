# leo_vetting_rubrics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T11:57:53.424Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `uuid` | **NO** | - | - |
| name | `text` | **NO** | - | - |
| version | `integer(32)` | **NO** | - | - |
| status | `text` | **NO** | `'draft'::text` | - |
| weights | `jsonb` | **NO** | - | - |
| criteria | `jsonb` | **NO** | - | - |
| scoring_scale | `jsonb` | **NO** | - | - |
| description | `text` | YES | - | - |
| effective_from | `timestamp with time zone` | **NO** | `now()` | - |
| effective_to | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `leo_vetting_rubrics_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `uq_leo_vetting_rubrics_name_version`: UNIQUE (name, version)

### Check Constraints
- `leo_vetting_rubrics_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'deprecated'::text])))

## Indexes

- `leo_vetting_rubrics_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_vetting_rubrics_pkey ON public.leo_vetting_rubrics USING btree (id)
  ```
- `uq_leo_vetting_rubrics_name_version`
  ```sql
  CREATE UNIQUE INDEX uq_leo_vetting_rubrics_name_version ON public.leo_vetting_rubrics USING btree (name, version)
  ```

## RLS Policies

### 1. Anon can read published rubrics (SELECT)

- **Roles**: {public}
- **Using**: `(status = 'published'::text)`

### 2. Service role full access to leo_vetting_rubrics (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

## Triggers

### trg_leo_vetting_rubrics_validate

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION leo_vetting_rubrics_validate()`

### trg_leo_vetting_rubrics_validate

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION leo_vetting_rubrics_validate()`

---

[← Back to Schema Overview](../database-schema-overview.md)
