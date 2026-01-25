# leo_autonomous_directives Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-25T18:48:14.334Z
**Rows**: 5
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| directive_code | `character varying(50)` | **NO** | - | - |
| title | `character varying(200)` | **NO** | - | - |
| content | `text` | **NO** | - | - |
| enforcement_point | `character varying(50)` | **NO** | - | - |
| is_blocking | `boolean` | YES | `false` | - |
| applies_to_phases | `ARRAY` | YES | `ARRAY['LEAD'::text, 'PLAN'::text, 'EXEC'::text]` | - |
| display_order | `integer(32)` | YES | `0` | - |
| active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `leo_autonomous_directives_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `leo_autonomous_directives_directive_code_key`: UNIQUE (directive_code)

### Check Constraints
- `leo_autonomous_directives_enforcement_point_check`: CHECK (((enforcement_point)::text = ANY ((ARRAY['ALWAYS'::character varying, 'ON_FAILURE'::character varying, 'HANDOFF_START'::character varying])::text[])))

## Indexes

- `leo_autonomous_directives_directive_code_key`
  ```sql
  CREATE UNIQUE INDEX leo_autonomous_directives_directive_code_key ON public.leo_autonomous_directives USING btree (directive_code)
  ```
- `leo_autonomous_directives_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_autonomous_directives_pkey ON public.leo_autonomous_directives USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_leo_autonomous_directives (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
