# feedback Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-15T16:12:10.483Z
**Rows**: 27
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (51 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| type | `character varying(20)` | **NO** | - | - |
| source_application | `character varying(50)` | **NO** | - | - |
| source_type | `character varying(30)` | **NO** | - | - |
| source_id | `uuid` | YES | - | - |
| title | `character varying(255)` | **NO** | - | - |
| description | `text` | YES | - | - |
| status | `character varying(20)` | YES | `'new'::character varying` | - |
| priority | `character varying(10)` | YES | - | - |
| sd_id | `character varying(50)` | YES | - | - |
| user_id | `uuid` | YES | - | - |
| session_id | `character varying(100)` | YES | - | - |
| page_url | `character varying(500)` | YES | - | - |
| command | `character varying(100)` | YES | - | - |
| environment | `jsonb` | YES | - | - |
| severity | `character varying(20)` | YES | - | - |
| category | `character varying(50)` | YES | - | - |
| error_message | `text` | YES | - | - |
| stack_trace | `text` | YES | - | - |
| error_hash | `character varying(64)` | YES | - | - |
| occurrence_count | `integer(32)` | YES | `1` | - |
| first_seen | `timestamp with time zone` | YES | - | - |
| last_seen | `timestamp with time zone` | YES | - | - |
| resolution_type | `character varying(30)` | YES | - | - |
| value_estimate | `character varying(20)` | YES | - | - |
| effort_estimate | `character varying(20)` | YES | - | - |
| votes | `integer(32)` | YES | `0` | - |
| use_case | `text` | YES | - | - |
| original_type | `character varying(20)` | YES | - | - |
| converted_at | `timestamp with time zone` | YES | - | - |
| conversion_reason | `text` | YES | - | - |
| triaged_at | `timestamp with time zone` | YES | - | - |
| triaged_by | `character varying(100)` | YES | - | - |
| snoozed_until | `timestamp with time zone` | YES | - | - |
| ignore_pattern | `character varying(255)` | YES | - | - |
| ai_triage_suggestion | `jsonb` | YES | - | - |
| assigned_to | `character varying(100)` | YES | - | - |
| resolution_sd_id | `character varying(50)` | YES | - | - |
| resolution_notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| cluster_processed_at | `timestamp with time zone` | YES | - | Timestamp when feedback was processed by clustering job. NULL = not yet processed. |
| quick_fix_id | `text` | YES | - | Foreign key to quick_fixes.id. When feedback is resolved via a quick fix, this references the QF-YYYYMMDD-NNN identifier. Required when status=resolved (unless strategic_directive_id is set). |
| strategic_directive_id | `character varying(50)` | YES | - | Foreign key to strategic_directives_v2.id. When feedback is resolved via a full Strategic Directive, this references the SD-XXX-NNN identifier. Required when status=resolved (unless quick_fix_id is set). |
| duplicate_of_id | `uuid` | YES | - | Foreign key to feedback.id (self-reference). When status=duplicate, this references the original feedback item that this one duplicates. Cannot reference itself (enforced by CHECK constraint). |
| ai_triage_confidence | `integer(32)` | YES | - | Confidence score (0-100) from AI triage classification. Higher values indicate more certain classification. |
| ai_triage_classification | `character varying(50)` | YES | - | AI-determined classification: bug, enhancement, question, duplicate, invalid. May differ from user-submitted type. |
| ai_triage_source | `character varying(20)` | YES | - | Source of triage classification: llm (cloud/local LLM) or rules (rule-based fallback). |
| rubric_score | `integer(32)` | YES | - | Automated quality score (0-100) based on rubric evaluation |
| quality_assessment | `jsonb` | YES | - | Detailed rubric breakdown: {criteria: {name, score, rationale, weight}, overall_assessment} |

## Constraints

### Primary Key
- `feedback_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `fk_feedback_duplicate_of`: duplicate_of_id → feedback(id)
- `fk_feedback_duplicate_of_id`: duplicate_of_id → feedback(id)
- `fk_feedback_quick_fix`: quick_fix_id → quick_fixes(id)
- `fk_feedback_quick_fix_id`: quick_fix_id → quick_fixes(id)
- `fk_feedback_strategic_directive`: strategic_directive_id → strategic_directives_v2(id)

### Check Constraints
- `chk_ai_triage_confidence_range`: CHECK (((ai_triage_confidence IS NULL) OR ((ai_triage_confidence >= 0) AND (ai_triage_confidence <= 100))))
- `chk_ai_triage_source_valid`: CHECK (((ai_triage_source IS NULL) OR ((ai_triage_source)::text = ANY ((ARRAY['llm'::character varying, 'rules'::character varying])::text[]))))
- `chk_duplicate_requires_reference`: CHECK ((((status)::text <> 'duplicate'::text) OR ((duplicate_of_id IS NOT NULL) AND (duplicate_of_id <> id))))
- `chk_feedback_no_self_duplicate`: CHECK (((duplicate_of_id IS NULL) OR (duplicate_of_id <> id)))
- `chk_feedback_terminal_resolution`: CHECK (
CASE
    WHEN ((status)::text = 'resolved'::text) THEN ((resolution_sd_id IS NOT NULL) OR (quick_fix_id IS NOT NULL) OR (strategic_directive_id IS NOT NULL) OR ((resolution_notes IS NOT NULL) AND (length(TRIM(BOTH FROM resolution_notes)) > 0)))
    WHEN ((status)::text = 'wont_fix'::text) THEN ((resolution_notes IS NOT NULL) AND (length(TRIM(BOTH FROM resolution_notes)) > 0))
    WHEN ((status)::text = 'duplicate'::text) THEN (duplicate_of_id IS NOT NULL)
    ELSE true
END)
- `chk_resolved_requires_reference`: CHECK ((((status)::text <> 'resolved'::text) OR ((quick_fix_id IS NOT NULL) OR (strategic_directive_id IS NOT NULL) OR (resolution_sd_id IS NOT NULL) OR ((resolution_notes IS NOT NULL) AND (length(TRIM(BOTH FROM resolution_notes)) > 0)))))
- `chk_wont_fix_requires_notes`: CHECK ((((status)::text <> 'wont_fix'::text) OR ((resolution_notes IS NOT NULL) AND (length(TRIM(BOTH FROM resolution_notes)) > 0))))
- `feedback_effort_estimate_check`: CHECK (((effort_estimate)::text = ANY ((ARRAY['small'::character varying, 'medium'::character varying, 'large'::character varying])::text[])))
- `feedback_rubric_score_check`: CHECK (((rubric_score >= 0) AND (rubric_score <= 100)))
- `feedback_severity_check`: CHECK (((severity)::text = ANY ((ARRAY['critical'::character varying, 'high'::character varying, 'medium'::character varying, 'low'::character varying])::text[])))
- `feedback_source_type_check`: CHECK (((source_type)::text = ANY ((ARRAY['manual_feedback'::character varying, 'auto_capture'::character varying, 'uat_failure'::character varying, 'error_capture'::character varying, 'uncaught_exception'::character varying, 'unhandled_rejection'::character varying, 'manual_capture'::character varying, 'todoist_intake'::character varying, 'youtube_intake'::character varying])::text[])))
- `feedback_status_check`: CHECK (((status)::text = ANY (ARRAY[('new'::character varying)::text, ('triaged'::character varying)::text, ('in_progress'::character varying)::text, ('resolved'::character varying)::text, ('wont_fix'::character varying)::text, ('duplicate'::character varying)::text, ('invalid'::character varying)::text, ('backlog'::character varying)::text, ('shipped'::character varying)::text])))
- `feedback_type_check`: CHECK (((type)::text = ANY ((ARRAY['issue'::character varying, 'enhancement'::character varying])::text[])))
- `feedback_value_estimate_check`: CHECK (((value_estimate)::text = ANY ((ARRAY['high'::character varying, 'medium'::character varying, 'low'::character varying])::text[])))

## Indexes

- `feedback_pkey`
  ```sql
  CREATE UNIQUE INDEX feedback_pkey ON public.feedback USING btree (id)
  ```
- `idx_feedback_ai_triage_confidence`
  ```sql
  CREATE INDEX idx_feedback_ai_triage_confidence ON public.feedback USING btree (ai_triage_confidence) WHERE (ai_triage_confidence IS NOT NULL)
  ```
- `idx_feedback_clustering`
  ```sql
  CREATE INDEX idx_feedback_clustering ON public.feedback USING btree (error_hash, created_at DESC) WHERE (((status)::text = ANY ((ARRAY['new'::character varying, 'triaged'::character varying])::text[])) AND (cluster_processed_at IS NULL))
  ```
- `idx_feedback_created_at`
  ```sql
  CREATE INDEX idx_feedback_created_at ON public.feedback USING btree (created_at DESC)
  ```
- `idx_feedback_duplicate_of_id`
  ```sql
  CREATE INDEX idx_feedback_duplicate_of_id ON public.feedback USING btree (duplicate_of_id) WHERE (duplicate_of_id IS NOT NULL)
  ```
- `idx_feedback_enhancements`
  ```sql
  CREATE INDEX idx_feedback_enhancements ON public.feedback USING btree (created_at DESC) WHERE ((type)::text = 'enhancement'::text)
  ```
- `idx_feedback_error_hash`
  ```sql
  CREATE INDEX idx_feedback_error_hash ON public.feedback USING btree (error_hash) WHERE (error_hash IS NOT NULL)
  ```
- `idx_feedback_issues`
  ```sql
  CREATE INDEX idx_feedback_issues ON public.feedback USING btree (created_at DESC) WHERE ((type)::text = 'issue'::text)
  ```
- `idx_feedback_priority`
  ```sql
  CREATE INDEX idx_feedback_priority ON public.feedback USING btree (priority)
  ```
- `idx_feedback_quality_assessment`
  ```sql
  CREATE INDEX idx_feedback_quality_assessment ON public.feedback USING gin (quality_assessment)
  ```
- `idx_feedback_quick_fix_id`
  ```sql
  CREATE INDEX idx_feedback_quick_fix_id ON public.feedback USING btree (quick_fix_id) WHERE (quick_fix_id IS NOT NULL)
  ```
- `idx_feedback_rubric_score`
  ```sql
  CREATE INDEX idx_feedback_rubric_score ON public.feedback USING btree (rubric_score DESC NULLS LAST) WHERE (rubric_score IS NOT NULL)
  ```
- `idx_feedback_sd_id`
  ```sql
  CREATE INDEX idx_feedback_sd_id ON public.feedback USING btree (sd_id)
  ```
- `idx_feedback_severity`
  ```sql
  CREATE INDEX idx_feedback_severity ON public.feedback USING btree (severity) WHERE ((type)::text = 'issue'::text)
  ```
- `idx_feedback_snoozed`
  ```sql
  CREATE INDEX idx_feedback_snoozed ON public.feedback USING btree (snoozed_until) WHERE (snoozed_until IS NOT NULL)
  ```
- `idx_feedback_source_app`
  ```sql
  CREATE INDEX idx_feedback_source_app ON public.feedback USING btree (source_application)
  ```
- `idx_feedback_source_type`
  ```sql
  CREATE INDEX idx_feedback_source_type ON public.feedback USING btree (source_type)
  ```
- `idx_feedback_status`
  ```sql
  CREATE INDEX idx_feedback_status ON public.feedback USING btree (status)
  ```
- `idx_feedback_strategic_directive_id`
  ```sql
  CREATE INDEX idx_feedback_strategic_directive_id ON public.feedback USING btree (strategic_directive_id) WHERE (strategic_directive_id IS NOT NULL)
  ```
- `idx_feedback_value`
  ```sql
  CREATE INDEX idx_feedback_value ON public.feedback USING btree (value_estimate) WHERE ((type)::text = 'enhancement'::text)
  ```

## RLS Policies

### 1. delete_feedback_policy (DELETE)

- **Roles**: {service_role}
- **Using**: `true`

### 2. insert_feedback_policy (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 3. select_feedback_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. update_feedback_policy (UPDATE)

- **Roles**: {service_role}
- **Using**: `true`

## Triggers

### trg_log_feedback_resolution_violation

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION log_feedback_resolution_violation()`

### trg_log_feedback_resolution_violation

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION log_feedback_resolution_violation()`

### trigger_update_feedback_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_feedback_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
