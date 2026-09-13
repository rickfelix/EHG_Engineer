# defect_class_specimens Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-13T06:31:02.341Z
**Rows**: 43
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| class_key | `text` | YES | - | - |
| source_type | `text` | **NO** | - | - |
| source_id | `text` | **NO** | - | - |
| witnessed_at | `timestamp with time zone` | **NO** | - | - |
| classified_by | `text` | **NO** | - | - |
| classified_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `defect_class_specimens_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `defect_class_specimens_class_key_fkey`: class_key → defect_classes(class_key)

### Check Constraints
- `defect_class_specimens_source_type_check`: CHECK ((source_type = ANY (ARRAY['feedback'::text, 'quick_fix'::text, 'sd'::text])))

## Indexes

- `defect_class_specimens_pkey`
  ```sql
  CREATE UNIQUE INDEX defect_class_specimens_pkey ON public.defect_class_specimens USING btree (id)
  ```
- `idx_defect_class_specimens_class_key`
  ```sql
  CREATE INDEX idx_defect_class_specimens_class_key ON public.defect_class_specimens USING btree (class_key)
  ```
- `idx_defect_class_specimens_unclassified`
  ```sql
  CREATE INDEX idx_defect_class_specimens_unclassified ON public.defect_class_specimens USING btree (witnessed_at) WHERE (class_key IS NULL)
  ```
- `uq_defect_class_specimens_source`
  ```sql
  CREATE UNIQUE INDEX uq_defect_class_specimens_source ON public.defect_class_specimens USING btree (source_type, source_id)
  ```

## RLS Policies

### 1. defect_class_specimens_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
