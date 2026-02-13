# venture_archetypes Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T20:38:04.433Z
**Rows**: 14
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (22 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `character varying(100)` | **NO** | - | - |
| description | `text` | YES | - | - |
| visual_theme | `jsonb` | YES | `'{}'::jsonb` | - |
| is_default | `boolean` | YES | `false` | - |
| icon | `character varying(50)` | YES | - | - |
| color | `character varying(50)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| archetype_key | `text` | YES | - | - |
| detection_keywords | `ARRAY` | YES | `'{}'::text[]` | - |
| detection_patterns | `jsonb` | YES | - | - |
| total_ventures | `integer(32)` | YES | `0` | - |
| graduated_count | `integer(32)` | YES | `0` | - |
| killed_count | `integer(32)` | YES | `0` | - |
| avg_completion_stages | `numeric(4,1)` | YES | - | - |
| common_kill_stages | `ARRAY` | YES | `'{}'::integer[]` | - |
| common_kill_reasons | `ARRAY` | YES | `'{}'::text[]` | - |
| recommended_strategies | `jsonb` | YES | `'[]'::jsonb` | - |
| known_pitfalls | `jsonb` | YES | `'[]'::jsonb` | - |
| benchmark_metrics | `jsonb` | YES | - | - |
| is_active | `boolean` | YES | `true` | - |

## Constraints

### Primary Key
- `venture_archetypes_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `venture_archetypes_archetype_key_key`: UNIQUE (archetype_key)

## Indexes

- `venture_archetypes_archetype_key_key`
  ```sql
  CREATE UNIQUE INDEX venture_archetypes_archetype_key_key ON public.venture_archetypes USING btree (archetype_key)
  ```
- `venture_archetypes_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_archetypes_pkey ON public.venture_archetypes USING btree (id)
  ```

## RLS Policies

### 1. Allow insert for authenticated (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 2. Allow update for authenticated (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 3. select_venture_archetypes_policy (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 4. venture_archetypes_delete (DELETE)

- **Roles**: {service_role}
- **Using**: `true`

### 5. venture_archetypes_service_all (ALL)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_venture_archetypes_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
