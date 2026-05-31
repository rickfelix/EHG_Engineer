# venture_gvos_profile Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-30T23:59:37.772Z
**Rows**: 3
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| archetype_id | `uuid` | YES | - | - |
| archetype_selection_method | `text` | YES | - | How the archetype was selected: rule_based (industry/audience tag match >=70% confidence), llm_fallback (rule confidence <70% so LLM classified), rule_fallback_below_threshold (LLM API down, used best rule match), emergency_default (LLM down AND no rule match — defaulted to Sovereign-Operator), or chairman_override (manual edit). FR-3 acceptance criterion. |
| archetype_selection_confidence | `numeric(4,3)` | YES | - | - |
| archetype_selection_rationale | `text` | YES | - | Free-text rationale stored on every row (mandatory for llm_fallback / rule_fallback_below_threshold / emergency_default rows per FR-3 acceptance criterion). |
| token_overrides | `jsonb` | **NO** | `'{}'::jsonb` | - |
| locked_prompt_snapshot | `jsonb` | YES | - | Immutable JSONB snapshot of {archetype, tokens, substrate, accent, typography_voice} written at S17 stage transition. Visual identity frozen here. Compliance tokens are NOT in snapshot — they propagate live via compliance_namespace_whitelist. FR-6 acceptance criterion. |
| locked_at | `timestamp with time zone` | YES | - | - |
| locked_version | `integer(32)` | YES | - | - |
| lovable_artifact | `jsonb` | YES | - | JSONB with type discriminator: github_sync (repo_url, branch, latest_commit_sha, webhook_subscribed_at) OR zip_upload (zip_storage_url, zip_extracted_manifest) OR inline_html (legacy). FR-7 acceptance criterion. |
| business_model_class | `text` | YES | - | Mirrors ventures.business_model_class (denormalized for trigger speed). Used by Artist-Expressive defense-in-depth gating trigger. |
| compliance_namespace_whitelist | `jsonb` | **NO** | `'["prefers-reduced-motion", "wcag-aa-contrast", "wcag-aaa-contrast", "focus-rings"]'::jsonb` | JSONB array of token category prefixes that propagate live (bypassing locked_prompt_snapshot). Default: prefers-reduced-motion, wcag-aa-contrast, wcag-aaa-contrast, focus-rings. Chairman can extend per-venture. |
| version | `integer(32)` | **NO** | `1` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_gvos_profile_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_gvos_profile_archetype_id_fkey`: archetype_id → gvos_archetypes(id)
- `venture_gvos_profile_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_gvos_profile_venture_id_version_key`: UNIQUE (venture_id, version)

### Check Constraints
- `venture_gvos_profile_archetype_selection_confidence_check`: CHECK (((archetype_selection_confidence IS NULL) OR ((archetype_selection_confidence >= (0)::numeric) AND (archetype_selection_confidence <= (1)::numeric))))
- `venture_gvos_profile_archetype_selection_method_check`: CHECK ((archetype_selection_method = ANY (ARRAY['rule_based'::text, 'llm_fallback'::text, 'rule_fallback_below_threshold'::text, 'emergency_default'::text, 'chairman_override'::text])))
- `venture_gvos_profile_compliance_whitelist_is_array`: CHECK ((jsonb_typeof(compliance_namespace_whitelist) = 'array'::text))
- `venture_gvos_profile_locked_pair_check`: CHECK (((locked_at IS NULL) = (locked_version IS NULL)))
- `venture_gvos_profile_lovable_artifact_type`: CHECK (((lovable_artifact IS NULL) OR ((lovable_artifact ->> 'type'::text) = ANY (ARRAY['github_sync'::text, 'zip_upload'::text, 'inline_html'::text]))))
- `venture_gvos_profile_snapshot_when_locked`: CHECK (((locked_at IS NULL) OR (locked_prompt_snapshot IS NOT NULL)))
- `venture_gvos_profile_token_overrides_is_object`: CHECK ((jsonb_typeof(token_overrides) = 'object'::text))
- `venture_gvos_profile_version_check`: CHECK ((version >= 1))

## Indexes

- `idx_venture_gvos_profile_archetype_id`
  ```sql
  CREATE INDEX idx_venture_gvos_profile_archetype_id ON public.venture_gvos_profile USING btree (archetype_id)
  ```
- `idx_venture_gvos_profile_locked_at`
  ```sql
  CREATE INDEX idx_venture_gvos_profile_locked_at ON public.venture_gvos_profile USING btree (locked_at) WHERE (locked_at IS NOT NULL)
  ```
- `idx_venture_gvos_profile_venture_id`
  ```sql
  CREATE INDEX idx_venture_gvos_profile_venture_id ON public.venture_gvos_profile USING btree (venture_id)
  ```
- `idx_venture_gvos_profile_venture_version`
  ```sql
  CREATE INDEX idx_venture_gvos_profile_venture_version ON public.venture_gvos_profile USING btree (venture_id, version DESC)
  ```
- `venture_gvos_profile_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_gvos_profile_pkey ON public.venture_gvos_profile USING btree (id)
  ```
- `venture_gvos_profile_venture_id_version_key`
  ```sql
  CREATE UNIQUE INDEX venture_gvos_profile_venture_id_version_key ON public.venture_gvos_profile USING btree (venture_id, version)
  ```

## RLS Policies

### 1. venture_gvos_profile_delete_chairman (DELETE)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`

### 2. venture_gvos_profile_insert_chairman (INSERT)

- **Roles**: {authenticated}
- **With Check**: `fn_is_chairman()`

### 3. venture_gvos_profile_select_chairman (SELECT)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`

### 4. venture_gvos_profile_update_chairman (UPDATE)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`
- **With Check**: `fn_is_chairman()`

## Triggers

### venture_gvos_profile_enforce_artist_gating_trigger

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION venture_gvos_profile_enforce_artist_gating()`

### venture_gvos_profile_enforce_artist_gating_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION venture_gvos_profile_enforce_artist_gating()`

### venture_gvos_profile_updated_at_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION venture_gvos_profile_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
