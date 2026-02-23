# sd_testing_status Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-23T22:55:54.652Z
**Rows**: 3
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (22 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying(50)` | **NO** | - | - |
| tested | `boolean` | **NO** | `false` | - |
| test_pass_rate | `numeric(5,2)` | YES | - | - |
| test_count | `integer(32)` | YES | `0` | - |
| tests_passed | `integer(32)` | YES | `0` | - |
| tests_failed | `integer(32)` | YES | `0` | - |
| last_tested_at | `timestamp without time zone` | YES | - | - |
| test_duration_seconds | `integer(32)` | YES | - | - |
| test_framework | `character varying(50)` | YES | - | - |
| screenshot_paths | `jsonb` | YES | `'[]'::jsonb` | - |
| test_results | `jsonb` | YES | `'{}'::jsonb` | - |
| testing_notes | `text` | YES | - | - |
| testing_sub_agent_used | `boolean` | YES | `false` | - |
| user_stories_sub_agent_used | `boolean` | YES | `false` | - |
| sub_agent_results | `jsonb` | YES | `'{}'::jsonb` | - |
| testing_priority | `integer(32)` | YES | `0` | - |
| next_in_queue | `boolean` | YES | `false` | - |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| updated_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| created_by | `character varying(100)` | YES | - | - |
| updated_by | `character varying(100)` | YES | - | - |

## Constraints

### Primary Key
- `sd_testing_status_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_testing_status_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Unique Constraints
- `sd_testing_status_sd_id_key`: UNIQUE (sd_id)

### Check Constraints
- `sd_testing_status_test_count_check`: CHECK ((test_count >= 0))
- `sd_testing_status_test_pass_rate_check`: CHECK (((test_pass_rate >= (0)::numeric) AND (test_pass_rate <= (100)::numeric)))
- `sd_testing_status_tests_failed_check`: CHECK ((tests_failed >= 0))
- `sd_testing_status_tests_passed_check`: CHECK ((tests_passed >= 0))
- `valid_fail_count`: CHECK ((tests_failed <= test_count))
- `valid_pass_count`: CHECK ((tests_passed <= test_count))
- `valid_total_tests`: CHECK (((tests_passed + tests_failed) = test_count))

## Indexes

- `idx_sd_testing_status_next_in_queue`
  ```sql
  CREATE INDEX idx_sd_testing_status_next_in_queue ON public.sd_testing_status USING btree (next_in_queue) WHERE (next_in_queue = true)
  ```
- `idx_sd_testing_status_priority`
  ```sql
  CREATE INDEX idx_sd_testing_status_priority ON public.sd_testing_status USING btree (testing_priority DESC)
  ```
- `idx_sd_testing_status_sd_id`
  ```sql
  CREATE INDEX idx_sd_testing_status_sd_id ON public.sd_testing_status USING btree (sd_id)
  ```
- `idx_sd_testing_status_tested`
  ```sql
  CREATE INDEX idx_sd_testing_status_tested ON public.sd_testing_status USING btree (tested)
  ```
- `sd_testing_status_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_testing_status_pkey ON public.sd_testing_status USING btree (id)
  ```
- `sd_testing_status_sd_id_key`
  ```sql
  CREATE UNIQUE INDEX sd_testing_status_sd_id_key ON public.sd_testing_status USING btree (sd_id)
  ```

## RLS Policies

### 1. authenticated_read_sd_testing_status (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_sd_testing_status (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trigger_auto_calculate_testing_priority

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION auto_calculate_testing_priority()`

### trigger_auto_calculate_testing_priority

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION auto_calculate_testing_priority()`

### trigger_update_sd_testing_status_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_sd_testing_status_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
