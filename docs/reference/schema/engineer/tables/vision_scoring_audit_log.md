# vision_scoring_audit_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-19T00:48:02.791Z
**Rows**: 176
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | **NO** | - | - |
| sd_type | `text` | **NO** | - | - |
| total_dims | `integer(32)` | **NO** | `0` | - |
| addressable_count | `integer(32)` | **NO** | `0` | - |
| base_threshold | `integer(32)` | **NO** | - | - |
| adjusted_threshold | `integer(32)` | **NO** | - | - |
| score | `integer(32)` | YES | - | - |
| verdict | `text` | **NO** | - | - |
| floor_rule_triggered | `boolean` | **NO** | `false` | - |
| evaluation_context | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `vision_scoring_audit_log_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_vision_audit_created_at`
  ```sql
  CREATE INDEX idx_vision_audit_created_at ON public.vision_scoring_audit_log USING btree (created_at)
  ```
- `idx_vision_audit_sd_id`
  ```sql
  CREATE INDEX idx_vision_audit_sd_id ON public.vision_scoring_audit_log USING btree (sd_id)
  ```
- `idx_vision_audit_verdict`
  ```sql
  CREATE INDEX idx_vision_audit_verdict ON public.vision_scoring_audit_log USING btree (verdict)
  ```
- `vision_scoring_audit_log_pkey`
  ```sql
  CREATE UNIQUE INDEX vision_scoring_audit_log_pkey ON public.vision_scoring_audit_log USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
