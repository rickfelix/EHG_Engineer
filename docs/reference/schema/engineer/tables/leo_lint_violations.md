# leo_lint_violations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-23T00:48:48.735Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| violation_id | `uuid` | **NO** | `gen_random_uuid()` | - |
| run_id | `uuid` | YES | - | - |
| rule_id | `text` | **NO** | - | - |
| section_id | `uuid` | YES | - | - |
| file_path | `text` | YES | - | - |
| severity | `text` | **NO** | - | - |
| message | `text` | **NO** | - | - |
| context | `jsonb` | **NO** | `'{}'::jsonb` | - |
| status | `text` | **NO** | `'open'::text` | - |
| status_reason | `text` | YES | - | - |
| detected_at | `timestamp with time zone` | **NO** | `now()` | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| resolved_by | `text` | YES | - | - |

## Constraints

### Primary Key
- `leo_lint_violations_pkey`: PRIMARY KEY (violation_id)

### Foreign Keys
- `leo_lint_violations_rule_id_fkey`: rule_id → leo_lint_rules(rule_id)
- `leo_lint_violations_run_id_fkey`: run_id → leo_lint_run_history(run_id)

### Check Constraints
- `leo_lint_violations_severity_check`: CHECK ((severity = ANY (ARRAY['warn'::text, 'block'::text])))
- `leo_lint_violations_status_check`: CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text, 'false_positive'::text])))

## Indexes

- `idx_leo_lint_violations_rule_detected`
  ```sql
  CREATE INDEX idx_leo_lint_violations_rule_detected ON public.leo_lint_violations USING btree (rule_id, detected_at DESC)
  ```
- `idx_leo_lint_violations_run`
  ```sql
  CREATE INDEX idx_leo_lint_violations_run ON public.leo_lint_violations USING btree (run_id)
  ```
- `idx_leo_lint_violations_section`
  ```sql
  CREATE INDEX idx_leo_lint_violations_section ON public.leo_lint_violations USING btree (section_id) WHERE (section_id IS NOT NULL)
  ```
- `idx_leo_lint_violations_status_detected`
  ```sql
  CREATE INDEX idx_leo_lint_violations_status_detected ON public.leo_lint_violations USING btree (status, detected_at DESC) WHERE (status = 'open'::text)
  ```
- `leo_lint_violations_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_lint_violations_pkey ON public.leo_lint_violations USING btree (violation_id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
