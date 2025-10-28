# ehg_component_patterns Table

**Generated**: 2025-10-28T12:15:30.153Z
**Database**: EHG_Engineer (dedlbzhpgkmetvhbkyzq)
**Rows**: 4
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| pattern_name | `text` | **NO** | - | - |
| pattern_type | `text` | **NO** | - | - |
| component_path | `text` | YES | - | - |
| description | `text` | YES | - | - |
| example_usage | `ARRAY` | YES | - | - |
| design_system_compliance | `boolean` | YES | `true` | - |
| accessibility_notes | `text` | YES | - | - |
| best_practices | `ARRAY` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `ehg_component_patterns_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `ehg_component_patterns_pattern_name_key`: UNIQUE (pattern_name)

## Indexes

- `ehg_component_patterns_pattern_name_key`
  ```sql
  CREATE UNIQUE INDEX ehg_component_patterns_pattern_name_key ON public.ehg_component_patterns USING btree (pattern_name)
  ```
- `ehg_component_patterns_pkey`
  ```sql
  CREATE UNIQUE INDEX ehg_component_patterns_pkey ON public.ehg_component_patterns USING btree (id)
  ```
- `idx_component_patterns_type`
  ```sql
  CREATE INDEX idx_component_patterns_type ON public.ehg_component_patterns USING btree (pattern_type)
  ```

## RLS Policies

### 1. Allow read access to component patterns (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
