# eva_idea_categories Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T00:14:08.377Z
**Rows**: 16
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| category_type | `text` | **NO** | - | - |
| code | `text` | **NO** | - | - |
| label | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| classification_keywords | `ARRAY` | YES | `'{}'::text[]` | - |
| is_active | `boolean` | YES | `true` | - |
| sort_order | `integer(32)` | YES | `0` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_idea_categories_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `eva_idea_categories_category_type_code_key`: UNIQUE (category_type, code)

### Check Constraints
- `eva_idea_categories_category_type_check`: CHECK ((category_type = ANY (ARRAY['venture_tag'::text, 'business_function'::text])))

## Indexes

- `eva_idea_categories_category_type_code_key`
  ```sql
  CREATE UNIQUE INDEX eva_idea_categories_category_type_code_key ON public.eva_idea_categories USING btree (category_type, code)
  ```
- `eva_idea_categories_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_idea_categories_pkey ON public.eva_idea_categories USING btree (id)
  ```
- `idx_eva_idea_categories_active`
  ```sql
  CREATE INDEX idx_eva_idea_categories_active ON public.eva_idea_categories USING btree (is_active) WHERE (is_active = true)
  ```
- `idx_eva_idea_categories_type`
  ```sql
  CREATE INDEX idx_eva_idea_categories_type ON public.eva_idea_categories USING btree (category_type)
  ```

## RLS Policies

### 1. manage_eva_idea_categories (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. select_eva_idea_categories (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trg_eva_idea_categories_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_eva_intake_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
