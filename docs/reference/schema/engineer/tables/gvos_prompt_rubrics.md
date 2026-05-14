# gvos_prompt_rubrics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-14T00:42:41.193Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| version | `integer(32)` | **NO** | - | - |
| weights | `jsonb` | **NO** | - | JSONB object mapping dimension names to weights (0..100 each). Sum should equal 100. Example: {"completeness":15,"archetype_specificity":15,"typography_declared":10,"layout_token_density":15,"color_interaction":10,"negative_prompts":15,"reference_urls":10,"library_motion":10} |
| threshold_green | `integer(32)` | **NO** | - | - |
| threshold_yellow_soft | `integer(32)` | **NO** | - | - |
| threshold_yellow_hard | `integer(32)` | **NO** | - | - |
| threshold_red | `integer(32)` | **NO** | `0` | - |
| active | `boolean` | **NO** | `false` | Exactly one row has active=TRUE at any time (enforced by partial unique index uq_gvos_prompt_rubrics_active_one on a constant expression — CRIT-2 fix). |
| notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | **NO** | `'system'::text` | - |

## Constraints

### Primary Key
- `gvos_prompt_rubrics_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `gvos_prompt_rubrics_version_key`: UNIQUE (version)

### Check Constraints
- `gvos_prompt_rubrics_threshold_green_check`: CHECK (((threshold_green >= 0) AND (threshold_green <= 100)))
- `gvos_prompt_rubrics_threshold_red_check`: CHECK (((threshold_red >= 0) AND (threshold_red <= 100)))
- `gvos_prompt_rubrics_threshold_yellow_hard_check`: CHECK (((threshold_yellow_hard >= 0) AND (threshold_yellow_hard <= 100)))
- `gvos_prompt_rubrics_threshold_yellow_soft_check`: CHECK (((threshold_yellow_soft >= 0) AND (threshold_yellow_soft <= 100)))
- `gvos_prompt_rubrics_thresholds_monotonic`: CHECK (((threshold_green > threshold_yellow_soft) AND (threshold_yellow_soft > threshold_yellow_hard) AND (threshold_yellow_hard > threshold_red)))
- `gvos_prompt_rubrics_version_check`: CHECK ((version >= 1))

## Indexes

- `gvos_prompt_rubrics_pkey`
  ```sql
  CREATE UNIQUE INDEX gvos_prompt_rubrics_pkey ON public.gvos_prompt_rubrics USING btree (id)
  ```
- `gvos_prompt_rubrics_version_key`
  ```sql
  CREATE UNIQUE INDEX gvos_prompt_rubrics_version_key ON public.gvos_prompt_rubrics USING btree (version)
  ```
- `uq_gvos_prompt_rubrics_active_one`
  ```sql
  CREATE UNIQUE INDEX uq_gvos_prompt_rubrics_active_one ON public.gvos_prompt_rubrics USING btree ((true)) WHERE (active = true)
  ```

## RLS Policies

### 1. gvos_prompt_rubrics_insert_admin (INSERT)

- **Roles**: {public}
- **With Check**: `is_leo_admin()`

### 2. gvos_prompt_rubrics_select_authenticated (SELECT)

- **Roles**: {public}
- **Using**: `(auth.role() = ANY (ARRAY['authenticated'::text, 'service_role'::text, 'anon'::text]))`

## Triggers

### gvos_prompt_rubrics_block_delete_trigger

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION gvos_prompt_rubrics_block_mutation()`

### gvos_prompt_rubrics_block_update_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION gvos_prompt_rubrics_block_mutation()`

---

[← Back to Schema Overview](../database-schema-overview.md)
