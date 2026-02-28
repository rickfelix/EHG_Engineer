---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# hap_blocks_v2 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-28T03:49:53.877Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (22 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| hap_id | `character varying(50)` | **NO** | - | - |
| strategic_directive_id | `character varying(50)` | YES | - | - |
| execution_sequence_id | `character varying(50)` | YES | - | - |
| title | `character varying(500)` | **NO** | - | - |
| objective | `text` | **NO** | - | - |
| detailed_description | `text` | YES | - | - |
| status | `character varying(50)` | **NO** | - | - |
| timeline | `character varying(100)` | YES | - | - |
| timeline_rationale | `text` | YES | - | - |
| tasks | `jsonb` | YES | `'[]'::jsonb` | - |
| task_narrative | `text` | YES | - | - |
| completion_date | `timestamp without time zone` | YES | - | - |
| completion_notes | `text` | YES | - | - |
| subtask_count | `integer(32)` | YES | `0` | - |
| estimated_duration_minutes | `integer(32)` | YES | - | - |
| implementation_notes | `text` | YES | - | - |
| technical_considerations | `text` | YES | - | - |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| updated_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| created_by | `character varying(100)` | YES | - | - |
| updated_by | `character varying(100)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `hap_blocks_v2_pkey`: PRIMARY KEY (hap_id)

### Foreign Keys
- `hap_blocks_v2_execution_sequence_id_fkey`: execution_sequence_id → execution_sequences_v2(id)
- `hap_blocks_v2_strategic_directive_id_fkey`: strategic_directive_id → strategic_directives_v2(id)

## Indexes

- `hap_blocks_v2_pkey`
  ```sql
  CREATE UNIQUE INDEX hap_blocks_v2_pkey ON public.hap_blocks_v2 USING btree (hap_id)
  ```
- `idx_hap_blocks_v2_directive`
  ```sql
  CREATE INDEX idx_hap_blocks_v2_directive ON public.hap_blocks_v2 USING btree (strategic_directive_id)
  ```
- `idx_hap_blocks_v2_sequence`
  ```sql
  CREATE INDEX idx_hap_blocks_v2_sequence ON public.hap_blocks_v2 USING btree (execution_sequence_id)
  ```
- `idx_hap_blocks_v2_status`
  ```sql
  CREATE INDEX idx_hap_blocks_v2_status ON public.hap_blocks_v2 USING btree (status)
  ```

## RLS Policies

### 1. authenticated_read_hap_blocks_v2 (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_hap_blocks_v2 (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_hap_blocks_v2_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
