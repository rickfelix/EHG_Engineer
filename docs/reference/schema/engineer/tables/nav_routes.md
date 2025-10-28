# nav_routes Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

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

### 1. nav_routes_delete (DELETE)

- **Roles**: {authenticated}
- **Using**: `((auth.jwt() ->> 'role'::text) = 'admin'::text)`

### 2. nav_routes_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `((auth.jwt() ->> 'role'::text) = 'admin'::text)`

### 3. nav_routes_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. nav_routes_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `((auth.jwt() ->> 'role'::text) = 'admin'::text)`

## Triggers

### update_nav_routes_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
