# prd_ui_mappings Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-30T13:36:19.189Z
**Rows**: 8
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| prd_id | `character varying(255)` | **NO** | - | - |
| requirement_id | `character varying(255)` | **NO** | - | - |
| requirement_text | `text` | **NO** | - | - |
| ui_component | `character varying(255)` | YES | - | - |
| ui_selector | `character varying(255)` | YES | - | - |
| ui_testid | `character varying(255)` | YES | - | - |
| expected_behavior | `text` | YES | - | - |
| is_implemented | `boolean` | YES | `false` | - |
| is_validated | `boolean` | YES | `false` | - |
| validation_date | `timestamp with time zone` | YES | - | - |
| validation_screenshot | `character varying(500)` | YES | - | - |
| priority | `character varying(20)` | YES | `'medium'::character varying` | - |
| created_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |
| updated_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `prd_ui_mappings_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `prd_ui_mappings_prd_id_requirement_id_key`: UNIQUE (prd_id, requirement_id)

## Indexes

- `idx_prd_mappings_implemented`
  ```sql
  CREATE INDEX idx_prd_mappings_implemented ON public.prd_ui_mappings USING btree (is_implemented)
  ```
- `idx_prd_mappings_prd`
  ```sql
  CREATE INDEX idx_prd_mappings_prd ON public.prd_ui_mappings USING btree (prd_id)
  ```
- `prd_ui_mappings_pkey`
  ```sql
  CREATE UNIQUE INDEX prd_ui_mappings_pkey ON public.prd_ui_mappings USING btree (id)
  ```
- `prd_ui_mappings_prd_id_requirement_id_key`
  ```sql
  CREATE UNIQUE INDEX prd_ui_mappings_prd_id_requirement_id_key ON public.prd_ui_mappings USING btree (prd_id, requirement_id)
  ```

## RLS Policies

### 1. authenticated_read_prd_ui_mappings (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_prd_ui_mappings (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
