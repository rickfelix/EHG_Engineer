---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-03-01
tags: [reference, auto-generated]
---
# folder_structure_snapshot Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-01T00:41:31.291Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| folder_path | `text` | **NO** | - | - |
| folder_name | `text` | **NO** | - | - |
| parent_path | `text` | YES | - | - |
| file_count | `integer(32)` | YES | `0` | - |
| subfolder_count | `integer(32)` | YES | `0` | - |
| total_size_bytes | `bigint(64)` | YES | `0` | - |
| folder_purpose | `text` | YES | - | - |
| owned_by_agent | `text` | YES | - | - |
| is_organized | `boolean` | YES | `true` | - |
| has_violations | `boolean` | YES | `false` | - |
| needs_cleanup | `boolean` | YES | `false` | - |
| snapshot_date | `timestamp with time zone` | YES | `now()` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `folder_structure_snapshot_pkey`: PRIMARY KEY (id)

### Check Constraints
- `folder_structure_snapshot_folder_purpose_check`: CHECK ((folder_purpose = ANY (ARRAY['DOCUMENTATION'::text, 'SOURCE_CODE'::text, 'SCRIPTS'::text, 'DATABASE'::text, 'ARCHIVE'::text, 'CONFIG'::text, 'TESTS'::text, 'BUILD'::text, 'TEMP'::text, 'UNKNOWN'::text])))
- `folder_structure_snapshot_owned_by_agent_check`: CHECK ((owned_by_agent = ANY (ARRAY['LEAD'::text, 'PLAN'::text, 'EXEC'::text, 'SHARED'::text, NULL::text])))

## Indexes

- `folder_structure_snapshot_pkey`
  ```sql
  CREATE UNIQUE INDEX folder_structure_snapshot_pkey ON public.folder_structure_snapshot USING btree (id)
  ```
- `idx_folder_snapshot_purpose`
  ```sql
  CREATE INDEX idx_folder_snapshot_purpose ON public.folder_structure_snapshot USING btree (folder_purpose)
  ```
- `idx_folder_snapshot_violations`
  ```sql
  CREATE INDEX idx_folder_snapshot_violations ON public.folder_structure_snapshot USING btree (has_violations)
  ```

## RLS Policies

### 1. authenticated_read_folder_structure_snapshot (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_folder_structure_snapshot (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
