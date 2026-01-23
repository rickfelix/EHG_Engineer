# story_test_mappings Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T02:02:13.651Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| user_story_id | `uuid` | **NO** | - | - |
| test_result_id | `uuid` | **NO** | - | - |
| test_run_id | `uuid` | **NO** | - | - |
| mapping_type | `character varying(50)` | **NO** | - | - |
| confidence_score | `numeric(3,2)` | YES | `1.00` | - |
| story_key_from_test | `character varying(100)` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `story_test_mappings_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `story_test_mappings_test_result_id_fkey`: test_result_id → test_results(id)
- `story_test_mappings_test_run_id_fkey`: test_run_id → test_runs(id)
- `story_test_mappings_user_story_id_fkey`: user_story_id → user_stories(id)

### Unique Constraints
- `story_test_mappings_user_story_id_test_result_id_key`: UNIQUE (user_story_id, test_result_id)

### Check Constraints
- `story_test_mappings_confidence_score_check`: CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric)))
- `story_test_mappings_mapping_type_check`: CHECK (((mapping_type)::text = ANY ((ARRAY['filename_match'::character varying, 'annotation_match'::character varying, 'manual_link'::character varying, 'auto_generated'::character varying])::text[])))

## Indexes

- `idx_story_test_mappings_run_id`
  ```sql
  CREATE INDEX idx_story_test_mappings_run_id ON public.story_test_mappings USING btree (test_run_id)
  ```
- `idx_story_test_mappings_story_id`
  ```sql
  CREATE INDEX idx_story_test_mappings_story_id ON public.story_test_mappings USING btree (user_story_id)
  ```
- `story_test_mappings_pkey`
  ```sql
  CREATE UNIQUE INDEX story_test_mappings_pkey ON public.story_test_mappings USING btree (id)
  ```
- `story_test_mappings_user_story_id_test_result_id_key`
  ```sql
  CREATE UNIQUE INDEX story_test_mappings_user_story_id_test_result_id_key ON public.story_test_mappings USING btree (user_story_id, test_result_id)
  ```

## RLS Policies

### 1. Allow inserts to story_test_mappings (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. Anyone can read story_test_mappings (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 3. No deletes from story_test_mappings (DELETE)

- **Roles**: {public}
- **Using**: `false`

### 4. No updates to story_test_mappings (UPDATE)

- **Roles**: {public}
- **Using**: `false`

## Triggers

### trigger_sync_test_evidence

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION sync_test_evidence_to_user_stories()`

---

[← Back to Schema Overview](../database-schema-overview.md)
