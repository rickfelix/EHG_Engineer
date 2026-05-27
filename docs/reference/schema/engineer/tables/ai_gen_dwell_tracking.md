# ai_gen_dwell_tracking Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-27T12:01:05.838Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| chairman_decision_id | `uuid` | **NO** | - | - |
| section_id | `text` | **NO** | - | - |
| server_started_at | `timestamp with time zone` | **NO** | - | - |
| server_ended_at | `timestamp with time zone` | YES | - | - |
| threshold_seconds | `integer(32)` | YES | `8` | - |
| dwell_seconds | `integer(32)` | YES | - | - |
| sufficient | `boolean` | YES | - | - |
| client_diagnostic_metadata | `jsonb` | YES | - | client clock for diagnostic only, never used for gating |

## Constraints

### Primary Key
- `ai_gen_dwell_tracking_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `ai_gen_dwell_tracking_chairman_decision_id_fkey`: chairman_decision_id → chairman_decisions(id)

## Indexes

- `ai_gen_dwell_tracking_pkey`
  ```sql
  CREATE UNIQUE INDEX ai_gen_dwell_tracking_pkey ON public.ai_gen_dwell_tracking USING btree (id)
  ```
- `idx_ai_gen_dwell_decision`
  ```sql
  CREATE INDEX idx_ai_gen_dwell_decision ON public.ai_gen_dwell_tracking USING btree (chairman_decision_id)
  ```
- `uq_ai_gen_dwell_decision_section`
  ```sql
  CREATE UNIQUE INDEX uq_ai_gen_dwell_decision_section ON public.ai_gen_dwell_tracking USING btree (chairman_decision_id, section_id)
  ```

## RLS Policies

### 1. ai_gen_dwell_chairman_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`

### 2. ai_gen_dwell_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
