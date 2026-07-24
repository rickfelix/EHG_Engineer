# venture_legal_overrides Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| template_id | `uuid` | **NO** | - | - |
| substitution_values | `jsonb` | **NO** | `'{}'::jsonb` | - |
| is_active | `boolean` | **NO** | `true` | - |
| generated_content | `text` | YES | - | - |
| generated_at | `timestamp with time zone` | YES | - | - |
| published_at | `timestamp with time zone` | YES | - | - |
| published_url | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | YES | - | - |

## Constraints

### Primary Key
- `venture_legal_overrides_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_legal_overrides_template_id_fkey`: template_id → legal_templates(id)
- `venture_legal_overrides_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `unique_venture_template`: UNIQUE (venture_id, template_id)

## Indexes

- `idx_venture_legal_overrides_template`
  ```sql
  CREATE INDEX idx_venture_legal_overrides_template ON public.venture_legal_overrides USING btree (template_id)
  ```
- `idx_venture_legal_overrides_venture`
  ```sql
  CREATE INDEX idx_venture_legal_overrides_venture ON public.venture_legal_overrides USING btree (venture_id)
  ```
- `unique_venture_template`
  ```sql
  CREATE UNIQUE INDEX unique_venture_template ON public.venture_legal_overrides USING btree (venture_id, template_id)
  ```
- `venture_legal_overrides_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_legal_overrides_pkey ON public.venture_legal_overrides USING btree (id)
  ```

## RLS Policies

### 1. venture_legal_overrides_modify (ALL)

- **Roles**: {authenticated}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

### 2. venture_legal_overrides_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `((auth.role() = 'service_role'::text) OR fn_user_has_venture_access(venture_id))`

## Triggers

### venture_legal_overrides_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_legal_doc_tables_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
