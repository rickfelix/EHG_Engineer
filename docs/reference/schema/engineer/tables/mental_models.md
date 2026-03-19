# mental_models Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-19T13:12:43.904Z
**Rows**: 18
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `text` | **NO** | - | - |
| slug | `text` | **NO** | - | - |
| category | `text` | **NO** | - | - |
| description | `text` | **NO** | - | - |
| core_concept | `text` | **NO** | - | - |
| applicable_stages | `ARRAY` | **NO** | - | Array of stage numbers where this model applies (e.g., {0,1,2}) |
| applicable_paths | `ARRAY` | YES | - | Array of path names (competitor_teardown, discovery_mode, blueprint_browse) |
| applicable_strategies | `ARRAY` | YES | - | - |
| applicable_archetypes | `ARRAY` | YES | - | - |
| difficulty_level | `text` | YES | `'intermediate'::text` | - |
| exercise_template | `jsonb` | YES | - | - |
| evaluation_rubric | `jsonb` | YES | - | - |
| artifact_template | `jsonb` | YES | - | - |
| prompt_context_block | `text` | YES | - | Pre-formatted text block for injection into LLM prompts |
| is_active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `mental_models_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `mental_models_slug_key`: UNIQUE (slug)

### Check Constraints
- `mental_models_category_check`: CHECK ((category = ANY (ARRAY['decision'::text, 'market'::text, 'psychology'::text, 'growth'::text, 'framework'::text])))
- `mental_models_difficulty_level_check`: CHECK ((difficulty_level = ANY (ARRAY['basic'::text, 'intermediate'::text, 'advanced'::text])))

## Indexes

- `idx_mental_models_active`
  ```sql
  CREATE INDEX idx_mental_models_active ON public.mental_models USING btree (is_active) WHERE (is_active = true)
  ```
- `idx_mental_models_category`
  ```sql
  CREATE INDEX idx_mental_models_category ON public.mental_models USING btree (category)
  ```
- `idx_mental_models_paths`
  ```sql
  CREATE INDEX idx_mental_models_paths ON public.mental_models USING gin (applicable_paths)
  ```
- `idx_mental_models_stages`
  ```sql
  CREATE INDEX idx_mental_models_stages ON public.mental_models USING gin (applicable_stages)
  ```
- `mental_models_pkey`
  ```sql
  CREATE UNIQUE INDEX mental_models_pkey ON public.mental_models USING btree (id)
  ```
- `mental_models_slug_key`
  ```sql
  CREATE UNIQUE INDEX mental_models_slug_key ON public.mental_models USING btree (slug)
  ```

## RLS Policies

### 1. mental_models_anon_select (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. mental_models_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_mental_models_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
