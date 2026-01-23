# eva_weekly_review_templates Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T11:54:04.563Z
**Rows**: 2
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| template_name | `character varying(255)` | **NO** | - | - |
| template_type | `character varying(50)` | **NO** | - | - |
| template_content | `text` | **NO** | - | - |
| variables | `jsonb` | **NO** | `'[]'::jsonb` | - |
| enabled | `boolean` | **NO** | `true` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_weekly_review_templates_pkey`: PRIMARY KEY (id)

### Check Constraints
- `eva_weekly_review_templates_template_type_check`: CHECK (((template_type)::text = ANY ((ARRAY['venture_summary'::character varying, 'portfolio_summary'::character varying, 'decision_digest'::character varying, 'alert_digest'::character varying])::text[])))

## Indexes

- `eva_weekly_review_templates_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_weekly_review_templates_pkey ON public.eva_weekly_review_templates USING btree (id)
  ```

## RLS Policies

### 1. Service role full access to review templates (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
