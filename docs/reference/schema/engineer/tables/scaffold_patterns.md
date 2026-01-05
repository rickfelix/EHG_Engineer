# scaffold_patterns Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-05T02:07:57.612Z
**Rows**: 49
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| pattern_name | `text` | **NO** | - | - |
| pattern_type | `text` | **NO** | - | Category of pattern: component, hook, service, page, layout, api_route, database_table, rls_policy, migration |
| template_code | `text` | **NO** | - | - |
| variables | `jsonb` | YES | `'[]'::jsonb` | JSONB array of variable placeholders used in template_code |
| dependencies | `jsonb` | YES | `'[]'::jsonb` | JSONB array of pattern dependencies or package requirements |
| version | `integer(32)` | YES | `1` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `scaffold_patterns_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `scaffold_patterns_pattern_name_key`: UNIQUE (pattern_name)

### Check Constraints
- `scaffold_patterns_pattern_type_check`: CHECK ((pattern_type = ANY (ARRAY['component'::text, 'hook'::text, 'service'::text, 'page'::text, 'layout'::text, 'api_route'::text, 'database_table'::text, 'rls_policy'::text, 'migration'::text])))

## Indexes

- `idx_scaffold_patterns_pattern_name`
  ```sql
  CREATE INDEX idx_scaffold_patterns_pattern_name ON public.scaffold_patterns USING btree (pattern_name)
  ```
- `idx_scaffold_patterns_pattern_type`
  ```sql
  CREATE INDEX idx_scaffold_patterns_pattern_type ON public.scaffold_patterns USING btree (pattern_type)
  ```
- `scaffold_patterns_pattern_name_key`
  ```sql
  CREATE UNIQUE INDEX scaffold_patterns_pattern_name_key ON public.scaffold_patterns USING btree (pattern_name)
  ```
- `scaffold_patterns_pkey`
  ```sql
  CREATE UNIQUE INDEX scaffold_patterns_pkey ON public.scaffold_patterns USING btree (id)
  ```

## RLS Policies

### 1. Allow all for authenticated (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 2. Allow select for anon (SELECT)

- **Roles**: {anon}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
