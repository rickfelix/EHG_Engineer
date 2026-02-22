# work_item_thresholds Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T02:46:03.894Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| tier1_max_loc | `integer(32)` | **NO** | `30` | - |
| tier2_max_loc | `integer(32)` | **NO** | `75` | - |
| is_active | `boolean` | **NO** | `false` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | YES | - | - |
| change_reason | `text` | YES | - | - |
| supersedes_id | `uuid` | YES | - | - |

## Constraints

### Primary Key
- `work_item_thresholds_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `work_item_thresholds_supersedes_id_fkey`: supersedes_id → work_item_thresholds(id)

## Indexes

- `idx_work_item_thresholds_active`
  ```sql
  CREATE INDEX idx_work_item_thresholds_active ON public.work_item_thresholds USING btree (is_active, created_at DESC)
  ```
- `idx_work_item_thresholds_single_active`
  ```sql
  CREATE UNIQUE INDEX idx_work_item_thresholds_single_active ON public.work_item_thresholds USING btree (is_active) WHERE (is_active = true)
  ```
- `work_item_thresholds_pkey`
  ```sql
  CREATE UNIQUE INDEX work_item_thresholds_pkey ON public.work_item_thresholds USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_work_item_thresholds (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_work_item_thresholds (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
