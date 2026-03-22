# risk_templates Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-22T07:56:11.782Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `text` | **NO** | - | - |
| category | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| default_likelihood | `integer(32)` | YES | - | - |
| default_impact | `integer(32)` | YES | - | - |
| mitigation_strategies | `ARRAY` | YES | `'{}'::text[]` | - |
| applicable_archetypes | `ARRAY` | YES | `'{}'::text[]` | - |
| applicable_stages | `ARRAY` | YES | `'{}'::integer[]` | - |
| created_by | `text` | YES | `'system'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `risk_templates_pkey`: PRIMARY KEY (id)

### Check Constraints
- `risk_templates_default_impact_check`: CHECK (((default_impact >= 1) AND (default_impact <= 5)))
- `risk_templates_default_likelihood_check`: CHECK (((default_likelihood >= 1) AND (default_likelihood <= 5)))

## Indexes

- `risk_templates_pkey`
  ```sql
  CREATE UNIQUE INDEX risk_templates_pkey ON public.risk_templates USING btree (id)
  ```

## RLS Policies

### 1. all_risk_templates_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. select_risk_templates_authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### set_updated_at_risk_templates

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trg_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
