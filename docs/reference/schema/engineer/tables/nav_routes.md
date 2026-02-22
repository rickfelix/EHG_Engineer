# nav_routes Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T00:37:34.488Z
**Rows**: 46
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| path | `text` | **NO** | - | - |
| title | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| section | `text` | **NO** | - | - |
| venture_stage | `integer(32)` | YES | - | - |
| maturity | `text` | **NO** | `'complete'::text` | - |
| icon_key | `text` | **NO** | - | - |
| sort_index | `integer(32)` | **NO** | - | - |
| is_enabled | `boolean` | **NO** | `true` | - |
| badge_key | `text` | YES | - | - |
| static_badge | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| personas | `ARRAY` | YES | `ARRAY['chairman'::text, 'builder'::text]` | - |
| persona_priority | `jsonb` | YES | `'{"builder": 50, "chairman": 50}'::jsonb` | - |

## Constraints

### Primary Key
- `nav_routes_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `nav_routes_path_key`: UNIQUE (path)

### Check Constraints
- `nav_routes_maturity_check`: CHECK ((maturity = ANY (ARRAY['draft'::text, 'development'::text, 'complete'::text])))

## Indexes

- `idx_nav_routes_maturity`
  ```sql
  CREATE INDEX idx_nav_routes_maturity ON public.nav_routes USING btree (maturity)
  ```
- `idx_nav_routes_persona_priority`
  ```sql
  CREATE INDEX idx_nav_routes_persona_priority ON public.nav_routes USING gin (persona_priority)
  ```
- `idx_nav_routes_personas`
  ```sql
  CREATE INDEX idx_nav_routes_personas ON public.nav_routes USING gin (personas)
  ```
- `idx_nav_routes_section`
  ```sql
  CREATE INDEX idx_nav_routes_section ON public.nav_routes USING btree (section)
  ```
- `idx_nav_routes_sort_index`
  ```sql
  CREATE INDEX idx_nav_routes_sort_index ON public.nav_routes USING btree (section, sort_index)
  ```
- `idx_nav_routes_venture_stage`
  ```sql
  CREATE INDEX idx_nav_routes_venture_stage ON public.nav_routes USING btree (venture_stage)
  ```
- `nav_routes_path_key`
  ```sql
  CREATE UNIQUE INDEX nav_routes_path_key ON public.nav_routes USING btree (path)
  ```
- `nav_routes_pkey`
  ```sql
  CREATE UNIQUE INDEX nav_routes_pkey ON public.nav_routes USING btree (id)
  ```

## RLS Policies

### 1. Allow authenticated users to delete nav_routes (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Allow authenticated users to insert nav_routes (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. Allow authenticated users to read nav_routes (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. Allow authenticated users to update nav_routes (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_nav_routes_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
