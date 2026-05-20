# gvos_tokens Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-20T14:43:43.253Z
**Rows**: 46
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `text` | **NO** | - | - |
| category | `text` | **NO** | - | Token category: structural (layout), kinetic (motion), atmospheric (texture/color), compliance (a11y), typography, vertical-expansion (new in B2), hidden-risk (runtime fallbacks), pack (composite tokens that decompose at composer time). |
| definition | `text` | **NO** | - | - |
| implementation_hint | `text` | **NO** | - | - |
| framer_motion_pattern | `text` | YES | - | Framer-motion implementation hint (default motion_runtime). E.g., "useMotionValue + useSpring with damping: 30, stiffness: 400" for Magnetic Lerp. NULL for non-kinetic tokens. |
| libraries_required | `jsonb` | **NO** | `'[]'::jsonb` | - |
| accessibility_notes | `text` | YES | - | - |
| version_major | `integer(32)` | **NO** | `1` | - |
| version_minor | `integer(32)` | **NO** | `0` | - |
| version_patch | `integer(32)` | **NO** | `0` | - |
| disabled_for_archetypes | `jsonb` | **NO** | `'[]'::jsonb` | JSONB array of archetype prompt_tokens where this token is force-disabled. E.g., Zero-Radius Constraint is disabled_for_archetypes: ["Playful-Expressive"]. Composer respects this at expansion time. |
| optional_for_archetypes | `jsonb` | **NO** | `'[]'::jsonb` | - |
| deprecated_at | `timestamp with time zone` | YES | - | - |
| replaced_by | `uuid` | YES | - | When a token is deprecated, replaced_by points to the successor token. Per AI-DSL convention (Devi Round-1 finding): tokens are NEVER renamed in place to avoid LLM training-data contamination across versions; instead, deprecate the old + add successor. |
| sunset_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| prompt_emission | `jsonb` | YES | - | - |

## Constraints

### Primary Key
- `gvos_tokens_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `gvos_tokens_replaced_by_fkey`: replaced_by → gvos_tokens(id)

### Unique Constraints
- `gvos_tokens_name_key`: UNIQUE (name)

### Check Constraints
- `gvos_tokens_category_check`: CHECK ((category = ANY (ARRAY['structural'::text, 'kinetic'::text, 'atmospheric'::text, 'compliance'::text, 'typography'::text, 'vertical-expansion'::text, 'hidden-risk'::text, 'pack'::text, 'motion'::text])))
- `gvos_tokens_version_major_check`: CHECK ((version_major >= 0))
- `gvos_tokens_version_minor_check`: CHECK ((version_minor >= 0))
- `gvos_tokens_version_patch_check`: CHECK ((version_patch >= 0))

## Indexes

- `gvos_tokens_name_key`
  ```sql
  CREATE UNIQUE INDEX gvos_tokens_name_key ON public.gvos_tokens USING btree (name)
  ```
- `gvos_tokens_pkey`
  ```sql
  CREATE UNIQUE INDEX gvos_tokens_pkey ON public.gvos_tokens USING btree (id)
  ```
- `idx_gvos_tokens_category`
  ```sql
  CREATE INDEX idx_gvos_tokens_category ON public.gvos_tokens USING btree (category)
  ```
- `idx_gvos_tokens_deprecated_at`
  ```sql
  CREATE INDEX idx_gvos_tokens_deprecated_at ON public.gvos_tokens USING btree (deprecated_at) WHERE (deprecated_at IS NOT NULL)
  ```
- `idx_gvos_tokens_replaced_by`
  ```sql
  CREATE INDEX idx_gvos_tokens_replaced_by ON public.gvos_tokens USING btree (replaced_by) WHERE (replaced_by IS NOT NULL)
  ```

## RLS Policies

### 1. gvos_tokens_delete_admin_only (DELETE)

- **Roles**: {authenticated}
- **Using**: `is_leo_admin()`

### 2. gvos_tokens_insert_admin_only (INSERT)

- **Roles**: {authenticated}
- **With Check**: `is_leo_admin()`

### 3. gvos_tokens_select_authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. gvos_tokens_update_admin_only (UPDATE)

- **Roles**: {authenticated}
- **Using**: `is_leo_admin()`
- **With Check**: `is_leo_admin()`

## Triggers

### gvos_tokens_updated_at_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION gvos_tokens_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
