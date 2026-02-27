# defect_taxonomy Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-27T22:03:40.633Z
**Rows**: 9
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('defect_taxonomy_id_seq'::regclass)` | - |
| category | `character varying(100)` | **NO** | - | - |
| parent_category | `character varying(100)` | YES | - | - |
| description | `text` | YES | - | - |
| prevention_stage | `text` | YES | - | - |
| typical_severity | `text` | YES | - | - |
| occurrence_count | `integer(32)` | YES | `0` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `defect_taxonomy_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `defect_taxonomy_category_key`: UNIQUE (category)

### Check Constraints
- `defect_taxonomy_prevention_stage_check`: CHECK ((prevention_stage = ANY (ARRAY['LEAD_PRE_APPROVAL'::text, 'PLAN_PRD'::text, 'EXEC_IMPL'::text, 'PLAN_VERIFY'::text, 'NEVER'::text])))

## Indexes

- `defect_taxonomy_category_key`
  ```sql
  CREATE UNIQUE INDEX defect_taxonomy_category_key ON public.defect_taxonomy USING btree (category)
  ```
- `defect_taxonomy_pkey`
  ```sql
  CREATE UNIQUE INDEX defect_taxonomy_pkey ON public.defect_taxonomy USING btree (id)
  ```

## RLS Policies

### 1. public_select_defect_taxonomy (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. service_role_all_defect_taxonomy (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
