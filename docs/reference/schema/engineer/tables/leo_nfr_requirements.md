# leo_nfr_requirements Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-06T13:58:48.132Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| prd_id | `text` | **NO** | - | - |
| perf_budget_ms | `integer(32)` | YES | - | - |
| bundle_kb | `integer(32)` | YES | - | - |
| memory_mb | `integer(32)` | YES | - | - |
| cpu_percent | `integer(32)` | YES | - | - |
| a11y_level | `text` | YES | - | - |
| security_profile | `text` | YES | - | - |
| compliance_standards | `jsonb` | YES | `'[]'::jsonb` | - |
| telemetry_spec | `jsonb` | YES | `'{}'::jsonb` | - |
| sla_requirements | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `leo_nfr_requirements_pkey`: PRIMARY KEY (id)

### Check Constraints
- `leo_nfr_requirements_a11y_level_check`: CHECK ((a11y_level = ANY (ARRAY['WCAG2.0-A'::text, 'WCAG2.0-AA'::text, 'WCAG2.0-AAA'::text, 'WCAG2.1-A'::text, 'WCAG2.1-AA'::text, 'WCAG2.1-AAA'::text])))
- `leo_nfr_requirements_bundle_kb_check`: CHECK ((bundle_kb > 0))
- `leo_nfr_requirements_cpu_percent_check`: CHECK (((cpu_percent >= 0) AND (cpu_percent <= 100)))
- `leo_nfr_requirements_memory_mb_check`: CHECK ((memory_mb > 0))
- `leo_nfr_requirements_perf_budget_ms_check`: CHECK ((perf_budget_ms > 0))
- `leo_nfr_requirements_security_profile_check`: CHECK ((security_profile = ANY (ARRAY['baseline'::text, 'standard'::text, 'enhanced'::text, 'maximum'::text])))

## Indexes

- `leo_nfr_requirements_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_nfr_requirements_pkey ON public.leo_nfr_requirements USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_nfr_requirements (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_nfr_requirements (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
