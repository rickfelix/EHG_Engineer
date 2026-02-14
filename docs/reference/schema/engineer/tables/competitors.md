# competitors Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T14:46:52.935Z
**Rows**: 0
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| name | `character varying(255)` | **NO** | - | - |
| website | `text` | YES | - | - |
| description | `text` | YES | - | - |
| strengths | `ARRAY` | YES | `'{}'::text[]` | - |
| weaknesses | `ARRAY` | YES | `'{}'::text[]` | - |
| analysis_data | `jsonb` | YES | `'{}'::jsonb` | - |
| source_url | `text` | YES | - | - |
| analyzed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `competitors_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `competitors_venture_id_fkey`: venture_id → ventures(id)

## Indexes

- `competitors_pkey`
  ```sql
  CREATE UNIQUE INDEX competitors_pkey ON public.competitors USING btree (id)
  ```
- `idx_competitors_analyzed`
  ```sql
  CREATE INDEX idx_competitors_analyzed ON public.competitors USING btree (analyzed_at DESC)
  ```
- `idx_competitors_name`
  ```sql
  CREATE INDEX idx_competitors_name ON public.competitors USING btree (name)
  ```
- `idx_competitors_venture`
  ```sql
  CREATE INDEX idx_competitors_venture ON public.competitors USING btree (venture_id)
  ```

## RLS Policies

### 1. Service role full access competitors (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. Users can delete own venture competitors (DELETE)

- **Roles**: {public}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 3. Users can insert own venture competitors (INSERT)

- **Roles**: {public}
- **With Check**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 4. Users can update own venture competitors (UPDATE)

- **Roles**: {public}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 5. Users can view own venture competitors (SELECT)

- **Roles**: {public}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

## Triggers

### competitors_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_competitors_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
