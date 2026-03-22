# stage_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-22T18:00:11.108Z
**Rows**: 25
**RLS**: Disabled

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

---

[← Back to Schema Overview](../database-schema-overview.md)
