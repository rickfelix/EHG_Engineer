# quick_fixes Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-31T20:56:09.379Z
**Rows**: 28
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (31 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `text` | **NO** | - | Format: QF-YYYYMMDD-NNN (e.g., QF-20251117-001) |
| title | `text` | **NO** | - | - |
| type | `text` | **NO** | - | Issue type: bug (broken functionality), polish (UX improvement), typo (text correction), documentation |
| severity | `text` | **NO** | - | Impact level: critical (blocking), high (major issue), medium (minor issue), low (nice-to-have) |
| found_during | `text` | YES | `'uat'::text` | - |
| description | `text` | **NO** | - | - |
| steps_to_reproduce | `text` | YES | - | - |
| expected_behavior | `text` | YES | - | - |
| actual_behavior | `text` | YES | - | - |
| screenshot_path | `text` | YES | - | - |
| estimated_loc | `integer(32)` | YES | - | Estimated lines of code to change. Auto-escalate if >50 LOC. |
| actual_loc | `integer(32)` | YES | - | Actual lines changed (measured via git diff). Hard cap at 50 LOC. |
| files_changed | `jsonb` | YES | - | - |
| status | `text` | YES | `'open'::text` | Workflow state: open (not started), in_progress (being fixed), completed (verified), escalated (converted to SD) |
| escalated_to_sd_id | `text` | YES | - | Reference to full Strategic Directive if escalated (>50 LOC, complexity, security, etc.) |
| escalation_reason | `text` | YES | - | - |
| branch_name | `text` | YES | - | - |
| commit_sha | `text` | YES | - | - |
| pr_url | `text` | YES | - | - |
| tests_passing | `boolean` | YES | `false` | Both unit and E2E smoke tests passing (Tier 1 requirement) |
| uat_verified | `boolean` | YES | `false` | User confirmed fix works during manual testing |
| verified_by | `text` | YES | - | - |
| verification_notes | `text` | YES | - | - |
| created_at | `timestamp without time zone` | YES | `now()` | - |
| started_at | `timestamp without time zone` | YES | - | - |
| completed_at | `timestamp without time zone` | YES | - | - |
| created_by | `text` | YES | `'UAT_AGENT'::text` | - |
| target_application | `text` | YES | - | Target repository: EHG (main app) or EHG_Engineer (infrastructure). Used by complete-quick-fix.js to run tests in correct directory. |
| compliance_score | `integer(32)` | YES | - | Self-scoring rubric result (0-100 scale). PASS: ≥90, WARN: 70-89, FAIL: <70 |
| compliance_verdict | `text` | YES | - | Rubric verdict: PASS (can complete), WARN (user review), FAIL (must refine/escalate) |
| compliance_details | `jsonb` | YES | - | Full rubric results including category scores, criteria results, and evidence |

## Constraints

### Primary Key
- `quick_fixes_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `quick_fixes_escalated_to_sd_id_fkey`: escalated_to_sd_id → strategic_directives_v2(id)

### Check Constraints
- `actual_loc_reasonable`: CHECK (((actual_loc IS NULL) OR (actual_loc <= 200)))
- `completed_requires_verification`: CHECK ((((status = 'completed'::text) AND (tests_passing = true) AND (uat_verified = true)) OR (status <> 'completed'::text)))
- `escalated_requires_reason`: CHECK ((((status = 'escalated'::text) AND (escalation_reason IS NOT NULL)) OR (status <> 'escalated'::text)))
- `loc_reasonable`: CHECK (((estimated_loc IS NULL) OR (estimated_loc <= 200)))
- `quick_fixes_compliance_score_check`: CHECK (((compliance_score >= 0) AND (compliance_score <= 100)))
- `quick_fixes_compliance_verdict_check`: CHECK ((compliance_verdict = ANY (ARRAY['PASS'::text, 'WARN'::text, 'FAIL'::text])))
- `quick_fixes_found_during_check`: CHECK ((found_during = ANY (ARRAY['uat'::text, 'manual-testing'::text, 'code-review'::text])))
- `quick_fixes_severity_check`: CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text])))
- `quick_fixes_status_check`: CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'completed'::text, 'escalated'::text])))
- `quick_fixes_target_application_check`: CHECK ((target_application = ANY (ARRAY['EHG'::text, 'EHG_Engineer'::text])))
- `quick_fixes_type_check`: CHECK ((type = ANY (ARRAY['bug'::text, 'polish'::text, 'typo'::text, 'documentation'::text])))

## Indexes

- `idx_quick_fixes_compliance_score`
  ```sql
  CREATE INDEX idx_quick_fixes_compliance_score ON public.quick_fixes USING btree (compliance_score) WHERE (compliance_score IS NOT NULL)
  ```
- `idx_quick_fixes_compliance_verdict`
  ```sql
  CREATE INDEX idx_quick_fixes_compliance_verdict ON public.quick_fixes USING btree (compliance_verdict) WHERE (compliance_verdict IS NOT NULL)
  ```
- `idx_quick_fixes_created`
  ```sql
  CREATE INDEX idx_quick_fixes_created ON public.quick_fixes USING btree (created_at DESC)
  ```
- `idx_quick_fixes_escalated_to_sd`
  ```sql
  CREATE INDEX idx_quick_fixes_escalated_to_sd ON public.quick_fixes USING btree (escalated_to_sd_id) WHERE (escalated_to_sd_id IS NOT NULL)
  ```
- `idx_quick_fixes_severity`
  ```sql
  CREATE INDEX idx_quick_fixes_severity ON public.quick_fixes USING btree (severity)
  ```
- `idx_quick_fixes_status`
  ```sql
  CREATE INDEX idx_quick_fixes_status ON public.quick_fixes USING btree (status)
  ```
- `idx_quick_fixes_type`
  ```sql
  CREATE INDEX idx_quick_fixes_type ON public.quick_fixes USING btree (type)
  ```
- `quick_fixes_pkey`
  ```sql
  CREATE UNIQUE INDEX quick_fixes_pkey ON public.quick_fixes USING btree (id)
  ```

## RLS Policies

### 1. Allow all operations for anon users (ALL)

- **Roles**: {anon}
- **Using**: `true`
- **With Check**: `true`

### 2. Allow all operations for authenticated users (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
