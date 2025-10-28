# sub_agent_execution_results Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 1,506
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (15 total)

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

## Constraints

### Primary Key
- `sub_agent_execution_results_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sub_agent_execution_results_risk_assessment_id_fkey`: risk_assessment_id → risk_assessments(id)

### Check Constraints
- `valid_confidence`: CHECK (((confidence >= 0) AND (confidence <= 100)))
- `valid_execution_time`: CHECK ((execution_time >= 0))
- `valid_verdict`: CHECK ((verdict = ANY (ARRAY['PASS'::text, 'FAIL'::text, 'BLOCKED'::text, 'CONDITIONAL_PASS'::text, 'WARNING'::text])))

## Indexes

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

### 3. Allow update to service role (UPDATE)

- **Roles**: {public}
- **Using**: `true`

## Triggers

### update_sub_agent_results_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_sub_agent_results_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
