# sub_agent_execution_results Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T15:19:57.449Z
**Rows**: 11,181
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | **NO** | - | Strategic Directive ID |
| sub_agent_code | `text` | **NO** | - | Short code (QA, SECURITY, DATABASE, etc.) |
| sub_agent_name | `text` | **NO** | - | Full sub-agent name |
| verdict | `text` | **NO** | - | Overall verdict (PASS, FAIL, BLOCKED, CONDITIONAL_PASS, WARNING) |
| confidence | `integer(32)` | **NO** | - | Confidence score 0-100 |
| critical_issues | `jsonb` | YES | `'[]'::jsonb` | Array of critical issues (JSONB) |
| warnings | `jsonb` | YES | `'[]'::jsonb` | Array of warnings (JSONB) |
| recommendations | `jsonb` | YES | `'[]'::jsonb` | Array of recommendations (JSONB) |
| detailed_analysis | `text` | YES | - | Full analysis text |
| execution_time | `integer(32)` | YES | `0` | Execution time in seconds |
| metadata | `jsonb` | YES | `'{}'::jsonb` | Additional metadata (JSONB) |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| risk_assessment_id | `uuid` | YES | - | BMAD Enhancement: Link to risk assessment if this execution was for RISK sub-agent |
| validation_mode | `text` | YES | `'prospective'::text` | Validation mode: prospective (default, pre-execution validation) or retrospective (post-execution review) |
| justification | `text` | YES | - | Required for CONDITIONAL_PASS verdicts: explanation of conditions and follow-up actions (min 50 chars) |
| conditions | `jsonb` | YES | - | Required for CONDITIONAL_PASS verdicts: array of follow-up action strings (non-empty array) |
| retro_contribution | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `sub_agent_execution_results_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sub_agent_execution_results_risk_assessment_id_fkey`: risk_assessment_id → risk_assessments(id)

### Check Constraints
- `check_conditional_pass_retrospective`: CHECK (((verdict <> 'CONDITIONAL_PASS'::text) OR (validation_mode = 'retrospective'::text)))
- `check_conditions_required`: CHECK (((verdict <> 'CONDITIONAL_PASS'::text) OR ((conditions IS NOT NULL) AND (jsonb_array_length(conditions) > 0))))
- `check_justification_required`: CHECK (((verdict <> 'CONDITIONAL_PASS'::text) OR ((justification IS NOT NULL) AND (length(justification) >= 50))))
- `check_validation_mode_values`: CHECK ((validation_mode = ANY (ARRAY['prospective'::text, 'retrospective'::text])))
- `critical_issues_max_100`: CHECK (((critical_issues IS NULL) OR (jsonb_typeof(critical_issues) <> 'array'::text) OR (jsonb_array_length(critical_issues) <= 100)))
- `metadata_max_size`: CHECK (((metadata IS NULL) OR (length((metadata)::text) <= 1048576)))
- `recommendations_max_50`: CHECK (((recommendations IS NULL) OR (jsonb_typeof(recommendations) <> 'array'::text) OR (jsonb_array_length(recommendations) <= 50)))
- `valid_confidence`: CHECK (((confidence >= 0) AND (confidence <= 100)))
- `valid_execution_time`: CHECK ((execution_time >= 0))
- `valid_verdict`: CHECK ((verdict = ANY (ARRAY['PASS'::text, 'FAIL'::text, 'BLOCKED'::text, 'CONDITIONAL_PASS'::text, 'WARNING'::text])))
- `warnings_max_100`: CHECK (((warnings IS NULL) OR (jsonb_typeof(warnings) <> 'array'::text) OR (jsonb_array_length(warnings) <= 100)))

## Indexes

- `idx_audit_trail`
  ```sql
  CREATE INDEX idx_audit_trail ON public.sub_agent_execution_results USING btree (created_at DESC) WHERE (verdict = 'CONDITIONAL_PASS'::text)
  ```
- `idx_sub_agent_results_created_at`
  ```sql
  CREATE INDEX idx_sub_agent_results_created_at ON public.sub_agent_execution_results USING btree (created_at DESC)
  ```
- `idx_sub_agent_results_risk_assessment`
  ```sql
  CREATE INDEX idx_sub_agent_results_risk_assessment ON public.sub_agent_execution_results USING btree (risk_assessment_id)
  ```
- `idx_sub_agent_results_sd_created`
  ```sql
  CREATE INDEX idx_sub_agent_results_sd_created ON public.sub_agent_execution_results USING btree (sd_id, created_at DESC)
  ```
- `idx_sub_agent_results_sd_id`
  ```sql
  CREATE INDEX idx_sub_agent_results_sd_id ON public.sub_agent_execution_results USING btree (sd_id)
  ```
- `idx_sub_agent_results_sub_agent_code`
  ```sql
  CREATE INDEX idx_sub_agent_results_sub_agent_code ON public.sub_agent_execution_results USING btree (sub_agent_code)
  ```
- `idx_sub_agent_results_verdict`
  ```sql
  CREATE INDEX idx_sub_agent_results_verdict ON public.sub_agent_execution_results USING btree (verdict)
  ```
- `idx_sub_agent_validation_mode`
  ```sql
  CREATE INDEX idx_sub_agent_validation_mode ON public.sub_agent_execution_results USING btree (sd_id, validation_mode)
  ```
- `idx_subagent_results_sd_id`
  ```sql
  CREATE INDEX idx_subagent_results_sd_id ON public.sub_agent_execution_results USING btree (sd_id)
  ```
- `idx_verdict_validation_mode`
  ```sql
  CREATE INDEX idx_verdict_validation_mode ON public.sub_agent_execution_results USING btree (verdict, validation_mode)
  ```
- `sub_agent_execution_results_pkey`
  ```sql
  CREATE UNIQUE INDEX sub_agent_execution_results_pkey ON public.sub_agent_execution_results USING btree (id)
  ```

## RLS Policies

### 1. Allow insert to service role (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. Allow read access to all users (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 3. Allow service_role to delete sub_agent_execution_results (DELETE)

- **Roles**: {service_role}
- **Using**: `true`

### 4. Allow update to service role (UPDATE)

- **Roles**: {public}
- **Using**: `true`

## Triggers

### strip_nested_findings_trigger

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION strip_nested_findings_from_metadata()`

### strip_nested_findings_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION strip_nested_findings_from_metadata()`

### trg_warn_testing_verdict

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION warn_testing_verdict()`

### trg_warn_testing_verdict

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION warn_testing_verdict()`

### trigger_complete_deliverables_on_subagent

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION complete_deliverables_on_subagent_pass()`

### trigger_complete_deliverables_on_subagent_update

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION complete_deliverables_on_subagent_pass()`

### update_sub_agent_results_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_sub_agent_results_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
