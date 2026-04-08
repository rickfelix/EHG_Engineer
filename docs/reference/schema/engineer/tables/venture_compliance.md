# venture_compliance Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-08T23:38:51.192Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| check_type | `text` | **NO** | - | Type of conformance check performed |
| status | `text` | **NO** | `'pending'::text` | Check result: pending, passing, failing, warning, or skipped |
| score | `integer(32)` | YES | - | Numeric score (0-100) for this specific check |
| details | `jsonb` | YES | `'{}'::jsonb` | JSONB object with specific findings and diagnostics from the check |
| checked_at | `timestamp with time zone` | **NO** | `now()` | - |
| checked_by | `text` | YES | - | What initiated the check: ci_gate, manual, or scheduled |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_compliance_pkey`: PRIMARY KEY (id)

### Check Constraints
- `venture_compliance_check_type_check`: CHECK ((check_type = ANY (ARRAY['structure'::text, 'dependencies'::text, 'lint_config'::text, 'tailwind_config'::text, 'design_tokens'::text, 'supabase_config'::text, 'ci_cd'::text, 'full_audit'::text])))
- `venture_compliance_score_check`: CHECK (((score >= 0) AND (score <= 100)))
- `venture_compliance_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'passing'::text, 'failing'::text, 'warning'::text, 'skipped'::text])))

## Indexes

- `idx_venture_compliance_venture_check`
  ```sql
  CREATE INDEX idx_venture_compliance_venture_check ON public.venture_compliance USING btree (venture_id, check_type)
  ```
- `venture_compliance_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_compliance_pkey ON public.venture_compliance USING btree (id)
  ```

## RLS Policies

### 1. authenticated_select_venture_compliance (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_venture_compliance (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
