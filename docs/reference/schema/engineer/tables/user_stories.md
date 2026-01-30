# user_stories Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-30T13:00:06.703Z
**Rows**: 2,148
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (37 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| story_key | `character varying(50)` | **NO** | - | - |
| prd_id | `character varying(100)` | YES | - | - |
| sd_id | `character varying(50)` | YES | - | - |
| title | `character varying(500)` | **NO** | - | - |
| user_role | `character varying(100)` | **NO** | - | - |
| user_want | `text` | **NO** | - | - |
| user_benefit | `text` | **NO** | - | - |
| story_points | `integer(32)` | YES | - | - |
| priority | `character varying(20)` | YES | `'medium'::character varying` | - |
| status | `character varying(50)` | YES | `'draft'::character varying` | - |
| sprint | `character varying(50)` | YES | - | - |
| acceptance_criteria | `jsonb` | YES | `'[]'::jsonb` | - |
| definition_of_done | `jsonb` | YES | `'[]'::jsonb` | - |
| depends_on | `ARRAY` | YES | `'{}'::uuid[]` | - |
| blocks | `ARRAY` | YES | `'{}'::uuid[]` | - |
| technical_notes | `text` | YES | - | - |
| implementation_approach | `text` | YES | - | - |
| test_scenarios | `jsonb` | YES | `'[]'::jsonb` | - |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| created_by | `character varying(100)` | YES | `'SYSTEM'::character varying` | - |
| updated_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| updated_by | `character varying(100)` | YES | - | - |
| completed_at | `timestamp without time zone` | YES | - | - |
| completed_by | `character varying(100)` | YES | - | - |
| actual_points | `integer(32)` | YES | - | - |
| time_spent_hours | `numeric(10,2)` | YES | - | - |
| e2e_test_path | `character varying(500)` | YES | - | Path to Playwright E2E test file (e.g., tests/e2e/user-login.spec.ts) |
| e2e_test_status | `character varying(50)` | YES | `'not_created'::character varying` | Status of E2E test: not_created, created, passing, failing, skipped |
| e2e_test_last_run | `timestamp with time zone` | YES | - | - |
| e2e_test_evidence | `text` | YES | - | URL to test evidence (screenshot, video, or HTML report) |
| e2e_test_failure_reason | `text` | YES | - | - |
| validation_status | `character varying(50)` | YES | `'pending'::character varying` | Overall validation status: pending, in_progress, validated, failed, skipped |
| implementation_context | `text` | YES | - | Auto-enriched context from retrospectives and Context7: {files: [], dependencies: [], apis: [], patterns: []} |
| architecture_references | `jsonb` | YES | `'[]'::jsonb` | BMAD Enhancement: Array of relevant architecture docs, component paths, existing patterns to follow |
| example_code_patterns | `jsonb` | YES | `'[]'::jsonb` | BMAD Enhancement: Array of code examples, patterns, snippets to guide implementation |
| testing_scenarios | `jsonb` | YES | `'[]'::jsonb` | BMAD Enhancement: Array of test scenarios with expected inputs/outputs |

## Constraints

### Primary Key
- `user_stories_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `user_stories_prd_id_fkey`: prd_id → product_requirements_v2(id)
- `user_stories_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Unique Constraints
- `user_stories_story_key_key`: UNIQUE (story_key)

### Check Constraints
- `implementation_context_required`: CHECK (((implementation_context IS NOT NULL) AND (implementation_context <> ''::text) AND (implementation_context <> '{}'::text) AND (implementation_context <> 'null'::text) AND (length(implementation_context) > 10)))
- `user_stories_e2e_test_status_check`: CHECK (((e2e_test_status)::text = ANY ((ARRAY['not_created'::character varying, 'created'::character varying, 'passing'::character varying, 'failing'::character varying, 'skipped'::character varying])::text[])))
- `user_stories_priority_check`: CHECK (((priority)::text = ANY ((ARRAY['critical'::character varying, 'high'::character varying, 'medium'::character varying, 'low'::character varying, 'minimal'::character varying])::text[])))
- `user_stories_status_check`: CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'ready'::character varying, 'in_progress'::character varying, 'testing'::character varying, 'completed'::character varying, 'blocked'::character varying])::text[])))
- `user_stories_validation_status_check`: CHECK (((validation_status)::text = ANY ((ARRAY['pending'::character varying, 'in_progress'::character varying, 'validated'::character varying, 'failed'::character varying, 'skipped'::character varying])::text[])))
- `valid_story_key`: CHECK (((story_key)::text ~ '^[A-Z0-9-]+:US-[0-9]{3,}$'::text))

## Indexes

- `idx_stories_created`
  ```sql
  CREATE INDEX idx_stories_created ON public.user_stories USING btree (created_at DESC)
  ```
- `idx_stories_prd`
  ```sql
  CREATE INDEX idx_stories_prd ON public.user_stories USING btree (prd_id)
  ```
- `idx_stories_priority`
  ```sql
  CREATE INDEX idx_stories_priority ON public.user_stories USING btree (priority)
  ```
- `idx_stories_sd`
  ```sql
  CREATE INDEX idx_stories_sd ON public.user_stories USING btree (sd_id)
  ```
- `idx_stories_sprint`
  ```sql
  CREATE INDEX idx_stories_sprint ON public.user_stories USING btree (sprint)
  ```
- `idx_stories_status`
  ```sql
  CREATE INDEX idx_stories_status ON public.user_stories USING btree (status)
  ```
- `idx_user_stories_e2e_status`
  ```sql
  CREATE INDEX idx_user_stories_e2e_status ON public.user_stories USING btree (sd_id, e2e_test_status)
  ```
- `idx_user_stories_validation_status`
  ```sql
  CREATE INDEX idx_user_stories_validation_status ON public.user_stories USING btree (sd_id, validation_status)
  ```
- `user_stories_pkey`
  ```sql
  CREATE UNIQUE INDEX user_stories_pkey ON public.user_stories USING btree (id)
  ```
- `user_stories_story_key_key`
  ```sql
  CREATE UNIQUE INDEX user_stories_story_key_key ON public.user_stories USING btree (story_key)
  ```

## RLS Policies

### 1. authenticated_read_user_stories (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_user_stories (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 3. user_stories_service_role_access (ALL)

- **Roles**: {authenticated}
- **Using**: `fn_is_service_role()`
- **With Check**: `fn_is_service_role()`

## Triggers

### audit_user_stories

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION governance_audit_trigger()`

### audit_user_stories

- **Timing**: AFTER DELETE
- **Action**: `EXECUTE FUNCTION governance_audit_trigger()`

### audit_user_stories

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION governance_audit_trigger()`

### auto_validate_story_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION auto_validate_story_on_test_pass()`

### trg_warn_user_story_e2e

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION warn_user_story_e2e_status()`

### trigger_sync_story_to_deliverables

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION sync_story_to_deliverables()`

### update_story_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
