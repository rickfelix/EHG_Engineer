# gvos_archetypes Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-14T17:44:12.435Z
**Rows**: 11
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| display_name | `text` | **NO** | - | Chairman-facing card title (warm, plain-English). E.g., "Quiet Confidence". Used in S11 ArchetypeDisplayPanel. |
| prompt_token | `text` | **NO** | - | LLM-facing slug (edge-loaded for AI legibility). E.g., "Sovereign-Operator". Composer emits this in lovablePayload. Per Devi Round-1 AI-DSL finding: never rename, only deprecate + successor. |
| good_for_subtitle | `text` | **NO** | - | Chairman-friendly subtitle e.g., "B2B SaaS, fintech, compliance". Helps chairman recognize archetype intent without design vocabulary. |
| tokens_required | `jsonb` | **NO** | `'[]'::jsonb` | - |
| prompt_directives | `jsonb` | **NO** | `'{}'::jsonb` | - |
| substrate | `jsonb` | **NO** | - | - |
| accent | `jsonb` | **NO** | - | - |
| typography_voice | `text` | **NO** | - | - |
| industry_tags | `jsonb` | **NO** | `'[]'::jsonb` | - |
| audience_tags | `jsonb` | **NO** | `'[]'::jsonb` | - |
| business_model_tags | `jsonb` | **NO** | `'[]'::jsonb` | - |
| gating_class | `text` | YES | - | Optional gating class restricting auto-classification. E.g., "artist" for Artist-Expressive — venture must have business_model_class=artist to qualify. SECURITY-003 acceptance criterion. |
| negative_prompt_list | `jsonb` | **NO** | `'[]'::jsonb` | Per-archetype forbidden patterns (28 entries total across all archetypes per Aria Round-3 audit). E.g., Clinical-Evidence forbids "DNA-helix-overlay-on-blue-gradient"; Cinematic-Immersive forbids "natural-light-smiling-team-as-hero". Composer emits these as negative_prompts in lovablePayload. |
| archetype_category | `text` | YES | - | JOIN key to design_reference_library.archetype_category for reference URLs. Existing 11 distinct values: creator_tools, services, e_commerce, fintech, healthtech, ai_product, marketplace, real_estate, deeptech, edtech, saas. |
| excluded | `boolean` | **NO** | `false` | - |
| version | `integer(32)` | **NO** | `1` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `gvos_archetypes_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `gvos_archetypes_prompt_token_key`: UNIQUE (prompt_token)

### Check Constraints
- `gvos_archetypes_accent_is_object`: CHECK ((jsonb_typeof(accent) = 'object'::text))
- `gvos_archetypes_prompt_directives_is_object`: CHECK ((jsonb_typeof(prompt_directives) = 'object'::text))
- `gvos_archetypes_prompt_token_format`: CHECK ((prompt_token ~ '^[A-Z][A-Za-z0-9]*(-[A-Z][A-Za-z0-9]*)*$'::text))
- `gvos_archetypes_substrate_is_object`: CHECK ((jsonb_typeof(substrate) = 'object'::text))
- `gvos_archetypes_tokens_required_is_array`: CHECK ((jsonb_typeof(tokens_required) = 'array'::text))
- `gvos_archetypes_typography_voice_enum`: CHECK ((typography_voice = ANY (ARRAY['Geometric-Sans'::text, 'Humanist-Sans'::text, 'Transitional-Serif'::text, 'Slab-Display'::text, 'Mono-Operator'::text])))
- `gvos_archetypes_version_check`: CHECK ((version >= 1))

## Indexes

- `gvos_archetypes_pkey`
  ```sql
  CREATE UNIQUE INDEX gvos_archetypes_pkey ON public.gvos_archetypes USING btree (id)
  ```
- `gvos_archetypes_prompt_token_key`
  ```sql
  CREATE UNIQUE INDEX gvos_archetypes_prompt_token_key ON public.gvos_archetypes USING btree (prompt_token)
  ```
- `idx_gvos_archetypes_archetype_category`
  ```sql
  CREATE INDEX idx_gvos_archetypes_archetype_category ON public.gvos_archetypes USING btree (archetype_category) WHERE (archetype_category IS NOT NULL)
  ```
- `idx_gvos_archetypes_business_model_tags`
  ```sql
  CREATE INDEX idx_gvos_archetypes_business_model_tags ON public.gvos_archetypes USING gin (business_model_tags)
  ```
- `idx_gvos_archetypes_excluded`
  ```sql
  CREATE INDEX idx_gvos_archetypes_excluded ON public.gvos_archetypes USING btree (excluded) WHERE (excluded = true)
  ```
- `idx_gvos_archetypes_gating_class`
  ```sql
  CREATE INDEX idx_gvos_archetypes_gating_class ON public.gvos_archetypes USING btree (gating_class) WHERE (gating_class IS NOT NULL)
  ```
- `idx_gvos_archetypes_industry_tags`
  ```sql
  CREATE INDEX idx_gvos_archetypes_industry_tags ON public.gvos_archetypes USING gin (industry_tags)
  ```

## RLS Policies

### 1. gvos_archetypes_delete_admin_only (DELETE)

- **Roles**: {authenticated}
- **Using**: `is_leo_admin()`

### 2. gvos_archetypes_insert_admin_only (INSERT)

- **Roles**: {authenticated}
- **With Check**: `is_leo_admin()`

### 3. gvos_archetypes_select_authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. gvos_archetypes_update_admin_only (UPDATE)

- **Roles**: {authenticated}
- **Using**: `is_leo_admin()`
- **With Check**: `is_leo_admin()`

## Triggers

### gvos_archetypes_updated_at_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION gvos_archetypes_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
