# strategic_themes Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T02:46:03.894Z
**Rows**: 11
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| theme_key | `text` | **NO** | - | Human-readable unique key, e.g. THEME-2026-001 |
| title | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| year | `integer(32)` | **NO** | - | - |
| status | `text` | **NO** | `'draft'::text` | - |
| vision_key | `text` | YES | - | FK to eva_vision_documents.vision_key - the vision this theme was derived from |
| derived_from_vision | `boolean` | YES | `false` | Whether this theme was auto-derived from a vision document |
| source_dimensions | `jsonb` | YES | - | JSONB array of vision dimension keys used to derive this theme |
| created_by | `text` | YES | `'chairman'::text` | Who created this theme (default: chairman) |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `strategic_themes_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `strategic_themes_vision_key_fkey`: vision_key → eva_vision_documents(vision_key)

### Unique Constraints
- `strategic_themes_theme_key_key`: UNIQUE (theme_key)

### Check Constraints
- `strategic_themes_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])))

## Indexes

- `idx_strategic_themes_year`
  ```sql
  CREATE INDEX idx_strategic_themes_year ON public.strategic_themes USING btree (year)
  ```
- `strategic_themes_pkey`
  ```sql
  CREATE UNIQUE INDEX strategic_themes_pkey ON public.strategic_themes USING btree (id)
  ```
- `strategic_themes_theme_key_key`
  ```sql
  CREATE UNIQUE INDEX strategic_themes_theme_key_key ON public.strategic_themes USING btree (theme_key)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### set_strategic_themes_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trigger_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
