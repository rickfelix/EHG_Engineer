# venture_archetypes Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-02T19:42:40.935Z
**Rows**: 8
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (9 total)

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

## Constraints

### Primary Key
- `venture_archetypes_pkey`: PRIMARY KEY (id)

## Indexes

- `venture_archetypes_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_archetypes_pkey ON public.venture_archetypes USING btree (id)
  ```

## RLS Policies

### 1. select_venture_archetypes_policy (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. venture_archetypes_delete (DELETE)

- **Roles**: {service_role}
- **Using**: `true`

## Triggers

### update_venture_archetypes_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
