# defect_classes Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-13T06:31:02.341Z
**Rows**: 12
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| class_key | `text` | **NO** | - | - |
| family_description | `text` | **NO** | - | - |
| memory_index_anchor | `text` | YES | - | - |
| first_witnessed | `timestamp with time zone` | **NO** | `now()` | - |
| verified_fix_date | `timestamp with time zone` | YES | - | - |
| fixing_sd_or_qf | `text` | YES | - | - |
| classified_by | `text` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `defect_classes_pkey`: PRIMARY KEY (class_key)

## Indexes

- `defect_classes_pkey`
  ```sql
  CREATE UNIQUE INDEX defect_classes_pkey ON public.defect_classes USING btree (class_key)
  ```

## RLS Policies

### 1. defect_classes_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
