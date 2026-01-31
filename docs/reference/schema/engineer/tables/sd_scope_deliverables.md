# sd_scope_deliverables Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-31T00:29:59.670Z
**Rows**: 3,153
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying(100)` | **NO** | - | - |
| deliverable_type | `character varying(50)` | YES | - | Classification of deliverable for filtering and reporting |
| deliverable_name | `character varying(500)` | **NO** | - | - |
| description | `text` | YES | - | - |
| extracted_from | `text` | YES | - | Source location in scope document for traceability |
| priority | `character varying(20)` | YES | `'required'::character varying` | Required deliverables block SD completion, optional do not |
| completion_status | `character varying(20)` | YES | `'pending'::character varying` | - |
| completion_evidence | `text` | YES | - | Link to proof of completion (commit hash, file path, URL, screenshot) |
| completion_notes | `text` | YES | - | - |
| verified_by | `character varying(20)` | YES | - | Agent or sub-agent that verified the deliverable completion |
| verified_at | `timestamp with time zone` | YES | - | - |
| verification_notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `character varying(100)` | YES | `'SYSTEM'::character varying` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| user_story_id | `uuid` | YES | - | Links deliverable to user story for bi-directional sync. When story validated, linked deliverables complete. |
| checkpoint_sd_id | `character varying(100)` | YES | - | Links deliverable to parent SD checkpoint. Enables progress rollup from child to parent SDs. |

## Constraints

### Primary Key
- `sd_scope_deliverables_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_scope_deliverables_checkpoint_sd_id_fkey`: checkpoint_sd_id → strategic_directives_v2(id)
- `sd_scope_deliverables_sd_id_fkey`: sd_id → strategic_directives_v2(id)
- `sd_scope_deliverables_user_story_id_fkey`: user_story_id → user_stories(id)

### Check Constraints
- `sd_scope_deliverables_completion_status_check`: CHECK (((completion_status)::text = ANY ((ARRAY['pending'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'skipped'::character varying, 'blocked'::character varying])::text[])))
- `sd_scope_deliverables_deliverable_type_check`: CHECK (((deliverable_type)::text = ANY ((ARRAY['database'::character varying, 'ui_feature'::character varying, 'api'::character varying, 'documentation'::character varying, 'configuration'::character varying, 'test'::character varying, 'migration'::character varying, 'integration'::character varying, 'other'::character varying])::text[])))
- `sd_scope_deliverables_priority_check`: CHECK (((priority)::text = ANY ((ARRAY['required'::character varying, 'optional'::character varying, 'nice_to_have'::character varying])::text[])))
- `sd_scope_deliverables_verified_by_check`: CHECK (((verified_by IS NULL) OR ((verified_by)::text = ANY ((ARRAY['EXEC'::character varying, 'PLAN'::character varying, 'LEAD'::character varying, 'QA_DIRECTOR'::character varying, 'DATABASE_ARCHITECT'::character varying, 'DESIGN_AGENT'::character varying, 'ARCHITECT'::character varying, 'database'::character varying, 'DATABASE'::character varying, 'database-agent'::character varying, 'DESIGN'::character varying, 'DESIGN_REVIEWER'::character varying, 'devops'::character varying, 'DOCMON'::character varying, 'EXEC_IMPL'::character varying, 'GITHUB'::character varying, 'GITHUB_ACTIONS'::character varying, 'LEAD_PRE_APPROVAL'::character varying, 'LEAD_VALIDATION'::character varying, 'PERFORMANCE'::character varying, 'qa'::character varying, 'QA'::character varying, 'RETRO'::character varying, 'RISK'::character varying, 'SD-CREWAI-ARCHITECTURE-001'::character varying, 'SD-VENTURE-UNIFICATION-001'::character varying, 'SECURITY'::character varying, 'STORIES'::character varying, 'testing'::character varying, 'TESTING'::character varying, 'TESTING_VALIDATOR'::character varying, 'VALIDATION'::character varying, 'VALIDATION_GATE'::character varying])::text[]))))

## Indexes

- `idx_scope_deliverables_checkpoint`
  ```sql
  CREATE INDEX idx_scope_deliverables_checkpoint ON public.sd_scope_deliverables USING btree (checkpoint_sd_id)
  ```
- `idx_scope_deliverables_sd`
  ```sql
  CREATE INDEX idx_scope_deliverables_sd ON public.sd_scope_deliverables USING btree (sd_id)
  ```
- `idx_scope_deliverables_status`
  ```sql
  CREATE INDEX idx_scope_deliverables_status ON public.sd_scope_deliverables USING btree (completion_status)
  ```
- `idx_scope_deliverables_type`
  ```sql
  CREATE INDEX idx_scope_deliverables_type ON public.sd_scope_deliverables USING btree (deliverable_type)
  ```
- `idx_scope_deliverables_user_story`
  ```sql
  CREATE INDEX idx_scope_deliverables_user_story ON public.sd_scope_deliverables USING btree (user_story_id)
  ```
- `idx_scope_deliverables_verified`
  ```sql
  CREATE INDEX idx_scope_deliverables_verified ON public.sd_scope_deliverables USING btree (verified_by, verified_at)
  ```
- `sd_scope_deliverables_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_scope_deliverables_pkey ON public.sd_scope_deliverables USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_sd_scope_deliverables (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_sd_scope_deliverables (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trigger_sync_deliverables_to_story

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION sync_deliverables_to_story()`

### update_sd_scope_deliverables_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_deliverables_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
