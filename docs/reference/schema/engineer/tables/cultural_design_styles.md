# cultural_design_styles Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-04T14:13:42.838Z
**Rows**: 4
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| style_key | `character varying(30)` | **NO** | - | - |
| display_name | `character varying(100)` | **NO** | - | - |
| description | `text` | YES | - | - |
| best_for | `ARRAY` | YES | - | - |
| characteristics | `text` | YES | - | - |
| variance_rules | `jsonb` | YES | - | - |
| tailwind_tokens | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `cultural_design_styles_pkey`: PRIMARY KEY (style_key)

## Indexes

- `cultural_design_styles_pkey`
  ```sql
  CREATE UNIQUE INDEX cultural_design_styles_pkey ON public.cultural_design_styles USING btree (style_key)
  ```

## RLS Policies

### 1. Allow insert for authenticated (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 2. Allow update for authenticated (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 3. cultural_design_styles_delete (DELETE)

- **Roles**: {service_role}
- **Using**: `true`

### 4. cultural_design_styles_select (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
