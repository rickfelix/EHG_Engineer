# srip_quality_checks Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-14T17:46:47.863Z
**Rows**: N/A (RLS restricted)
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| synthesis_prompt_id | `uuid` | YES | - | - |
| domain_scores | `jsonb` | **NO** | `'{}'::jsonb` | JSONB containing scores for each quality domain: layout, visual_composition, design_system, interaction, technical, accessibility. |
| overall_score | `numeric(5,2)` | YES | - | Weighted overall fidelity score (0-100) aggregated from domain scores. |
| gaps | `jsonb` | YES | `'[]'::jsonb` | JSONB array of actionable improvement items identified during quality assessment. |
| pass_threshold | `numeric(5,2)` | YES | `80.00` | Minimum overall score required to pass quality check (default 80.00). |
| passed | `boolean` | YES | - | Generated column: true when overall_score >= pass_threshold. |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `character varying(100)` | YES | - | - |

## Constraints

### Primary Key
- `srip_quality_checks_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `srip_quality_checks_synthesis_prompt_id_fkey`: synthesis_prompt_id → srip_synthesis_prompts(id)
- `srip_quality_checks_venture_id_fkey`: venture_id → ventures(id)

## Indexes

- `idx_srip_quality_checks_domain_scores`
  ```sql
  CREATE INDEX idx_srip_quality_checks_domain_scores ON public.srip_quality_checks USING gin (domain_scores)
  ```
- `idx_srip_quality_checks_venture_id`
  ```sql
  CREATE INDEX idx_srip_quality_checks_venture_id ON public.srip_quality_checks USING btree (venture_id)
  ```
- `srip_quality_checks_pkey`
  ```sql
  CREATE UNIQUE INDEX srip_quality_checks_pkey ON public.srip_quality_checks USING btree (id)
  ```

## RLS Policies

### 1. srip_quality_checks_delete_policy (DELETE)

- **Roles**: {public}
- **Using**: `true`

### 2. srip_quality_checks_insert_policy (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 3. srip_quality_checks_select_policy (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 4. srip_quality_checks_update_policy (UPDATE)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
