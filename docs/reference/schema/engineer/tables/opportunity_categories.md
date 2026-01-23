# opportunity_categories Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T04:03:45.232Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| opportunity_id | `uuid` | **NO** | - | - |
| category_name | `character varying(100)` | **NO** | - | - |
| category_value | `character varying(255)` | YES | - | - |
| confidence_score | `numeric(3,2)` | YES | - | - |
| assigned_by | `character varying(50)` | YES | `'system'::character varying` | - |
| created_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `opportunity_categories_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `opportunity_categories_opportunity_id_fkey`: opportunity_id → opportunities(id)

### Unique Constraints
- `opportunity_categories_opportunity_id_category_name_key`: UNIQUE (opportunity_id, category_name)

### Check Constraints
- `opportunity_categories_confidence_score_check`: CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric)))

## Indexes

- `idx_categories_name`
  ```sql
  CREATE INDEX idx_categories_name ON public.opportunity_categories USING btree (category_name)
  ```
- `idx_categories_opportunity`
  ```sql
  CREATE INDEX idx_categories_opportunity ON public.opportunity_categories USING btree (opportunity_id)
  ```
- `opportunity_categories_opportunity_id_category_name_key`
  ```sql
  CREATE UNIQUE INDEX opportunity_categories_opportunity_id_category_name_key ON public.opportunity_categories USING btree (opportunity_id, category_name)
  ```
- `opportunity_categories_pkey`
  ```sql
  CREATE UNIQUE INDEX opportunity_categories_pkey ON public.opportunity_categories USING btree (id)
  ```

## RLS Policies

### 1. authenticated_all_categories (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
