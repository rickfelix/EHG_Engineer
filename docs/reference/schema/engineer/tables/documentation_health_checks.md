# documentation_health_checks Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-26T00:22:54.236Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| check_type | `text` | **NO** | - | - |
| scope | `text` | YES | `'GLOBAL'::text` | - |
| scope_identifier | `text` | YES | - | - |
| check_passed | `boolean` | YES | `false` | - |
| score | `integer(32)` | YES | - | - |
| issues_found | `integer(32)` | YES | `0` | - |
| issues_resolved | `integer(32)` | YES | `0` | - |
| findings | `jsonb` | YES | `'{}'::jsonb` | - |
| recommendations | `jsonb` | YES | `'[]'::jsonb` | - |
| triggered_by_event | `text` | YES | - | - |
| related_handoff_id | `text` | YES | - | - |
| check_date | `timestamp with time zone` | YES | `now()` | - |
| next_check_date | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `documentation_health_checks_pkey`: PRIMARY KEY (id)

### Check Constraints
- `documentation_health_checks_check_type_check`: CHECK ((check_type = ANY (ARRAY['COVERAGE'::text, 'QUALITY'::text, 'ORGANIZATION'::text, 'COMPLIANCE'::text, 'FRESHNESS'::text, 'COMPLETENESS'::text])))
- `documentation_health_checks_scope_check`: CHECK ((scope = ANY (ARRAY['GLOBAL'::text, 'SD'::text, 'AGENT'::text, 'FOLDER'::text])))
- `documentation_health_checks_score_check`: CHECK (((score >= 0) AND (score <= 100)))

## Indexes

- `documentation_health_checks_pkey`
  ```sql
  CREATE UNIQUE INDEX documentation_health_checks_pkey ON public.documentation_health_checks USING btree (id)
  ```
- `idx_health_checks_passed`
  ```sql
  CREATE INDEX idx_health_checks_passed ON public.documentation_health_checks USING btree (check_passed)
  ```
- `idx_health_checks_type`
  ```sql
  CREATE INDEX idx_health_checks_type ON public.documentation_health_checks USING btree (check_type)
  ```

## RLS Policies

### 1. authenticated_read_documentation_health_checks (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_documentation_health_checks (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
