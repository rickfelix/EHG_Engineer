# stage_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-09T20:19:29.104Z
**Rows**: 25
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| stage_number | `integer(32)` | **NO** | - | - |
| stage_name | `text` | **NO** | - | - |
| stage_key | `text` | **NO** | - | - |
| gate_type | `text` | **NO** | `'none'::text` | - |
| review_mode | `text` | **NO** | `'auto'::text` | - |
| chunk | `text` | **NO** | - | - |
| description | `text` | YES | - | - |

## Constraints

### Primary Key
- `stage_config_pkey`: PRIMARY KEY (stage_number)

### Unique Constraints
- `stage_config_stage_key_key`: UNIQUE (stage_key)

### Check Constraints
- `stage_config_gate_type_check`: CHECK ((gate_type = ANY (ARRAY['none'::text, 'kill'::text, 'promotion'::text])))
- `stage_config_review_mode_check`: CHECK ((review_mode = ANY (ARRAY['auto'::text, 'review'::text, 'manual'::text])))

## Indexes

- `stage_config_pkey`
  ```sql
  CREATE UNIQUE INDEX stage_config_pkey ON public.stage_config USING btree (stage_number)
  ```
- `stage_config_stage_key_key`
  ```sql
  CREATE UNIQUE INDEX stage_config_stage_key_key ON public.stage_config USING btree (stage_key)
  ```

## RLS Policies

### 1. deny_write_stage_config (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `false`

### 2. select_stage_config (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trg_stage_config_audit

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION fn_stage_config_audit_trigger()`

---

[← Back to Schema Overview](../database-schema-overview.md)
