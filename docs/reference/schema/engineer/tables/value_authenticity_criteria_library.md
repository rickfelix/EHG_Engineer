# value_authenticity_criteria_library Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 5
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| criterion_id | `text` | **NO** | - | - |
| contract_version | `integer(32)` | **NO** | `1` | - |
| t_form | `text` | **NO** | - | - |
| title | `text` | **NO** | - | - |
| description | `text` | **NO** | - | - |
| parameter_schema | `jsonb` | **NO** | `'{}'::jsonb` | - |
| parameter_schema_notes | `text` | YES | - | - |
| evidence_grade | `text` | YES | - | - |
| hard_catcher | `boolean` | **NO** | - | - |
| mock_distinguishing_proof | `text` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `value_authenticity_criteria_library_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `value_authenticity_criteria_library_criterion_id_key`: UNIQUE (criterion_id)

### Check Constraints
- `value_authenticity_criteria_library_evidence_grade_check`: CHECK ((evidence_grade = ANY (ARRAY['E0'::text, 'E1'::text, 'E2'::text, 'E3'::text])))
- `value_authenticity_criteria_library_t_form_check`: CHECK ((t_form = ANY (ARRAY['T0'::text, 'T1'::text, 'T2'::text, 'T3'::text, 'T4'::text])))

## Indexes

- `idx_value_authenticity_criteria_library_t_form`
  ```sql
  CREATE INDEX idx_value_authenticity_criteria_library_t_form ON public.value_authenticity_criteria_library USING btree (t_form)
  ```
- `value_authenticity_criteria_library_criterion_id_key`
  ```sql
  CREATE UNIQUE INDEX value_authenticity_criteria_library_criterion_id_key ON public.value_authenticity_criteria_library USING btree (criterion_id)
  ```
- `value_authenticity_criteria_library_pkey`
  ```sql
  CREATE UNIQUE INDEX value_authenticity_criteria_library_pkey ON public.value_authenticity_criteria_library USING btree (id)
  ```

## RLS Policies

### 1. authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
