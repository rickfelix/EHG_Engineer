# leo_feature_flags Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T17:46:55.871Z
**Rows**: 4
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| flag_key | `text` | **NO** | - | Unique identifier used in code (e.g., quality_layer_sanitization) |
| display_name | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| is_enabled | `boolean` | **NO** | `false` | Global enable/disable toggle - if false, flag always evaluates to disabled |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `leo_feature_flags_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `leo_feature_flags_flag_key_key`: UNIQUE (flag_key)

## Indexes

- `idx_leo_feature_flags_flag_key`
  ```sql
  CREATE INDEX idx_leo_feature_flags_flag_key ON public.leo_feature_flags USING btree (flag_key)
  ```
- `leo_feature_flags_flag_key_key`
  ```sql
  CREATE UNIQUE INDEX leo_feature_flags_flag_key_key ON public.leo_feature_flags USING btree (flag_key)
  ```
- `leo_feature_flags_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_feature_flags_pkey ON public.leo_feature_flags USING btree (id)
  ```

## Triggers

### set_updated_at_leo_feature_flags

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trigger_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
