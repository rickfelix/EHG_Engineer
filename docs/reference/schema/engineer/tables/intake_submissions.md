# intake_submissions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T20:53:11.137Z
**Rows**: 0
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| organization_id | `uuid` | **NO** | - | - |
| submitted_by | `uuid` | **NO** | - | - |
| submission_status | `text` | **NO** | `'draft'::text` | - |
| submission_number | `text` | YES | - | Human-readable unique identifier (INT-YYYY-NNN) |
| responses | `jsonb` | **NO** | `'{}'::jsonb` | Flexible JSONB structure for multi-step wizard responses |
| version | `integer(32)` | **NO** | `1` | Version number for tracking submission edits (1 = original) |
| previous_version_id | `uuid` | YES | - | Reference to previous version for historical tracking |
| fit_gate_score_id | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| submitted_at | `timestamp with time zone` | YES | - | - |
| evaluated_at | `timestamp with time zone` | YES | - | - |
| archived_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `intake_submissions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `fk_intake_submissions_fit_gate_score`: fit_gate_score_id → fit_gate_scores(id)
- `intake_submissions_previous_version_id_fkey`: previous_version_id → intake_submissions(id)

### Check Constraints
- `draft_no_submit_date`: CHECK ((((submission_status = 'draft'::text) AND (submitted_at IS NULL)) OR ((submission_status <> 'draft'::text) AND (submitted_at IS NOT NULL))))
- `evaluated_has_score`: CHECK ((((submission_status = 'evaluated'::text) AND (fit_gate_score_id IS NOT NULL)) OR (submission_status <> 'evaluated'::text)))
- `intake_submissions_submission_status_check`: CHECK ((submission_status = ANY (ARRAY['draft'::text, 'submitted'::text, 'under_review'::text, 'evaluated'::text, 'archived'::text])))
- `valid_submission_number`: CHECK ((submission_number ~ '^INT-\d{4}-\d{3,}$'::text))

## Indexes

- `idx_intake_submissions_created_at`
  ```sql
  CREATE INDEX idx_intake_submissions_created_at ON public.intake_submissions USING btree (created_at DESC)
  ```
- `idx_intake_submissions_org_id`
  ```sql
  CREATE INDEX idx_intake_submissions_org_id ON public.intake_submissions USING btree (organization_id)
  ```
- `idx_intake_submissions_responses_gin`
  ```sql
  CREATE INDEX idx_intake_submissions_responses_gin ON public.intake_submissions USING gin (responses)
  ```
- `idx_intake_submissions_status`
  ```sql
  CREATE INDEX idx_intake_submissions_status ON public.intake_submissions USING btree (submission_status)
  ```
- `idx_intake_submissions_submission_number`
  ```sql
  CREATE INDEX idx_intake_submissions_submission_number ON public.intake_submissions USING btree (submission_number)
  ```
- `idx_intake_submissions_submitted_by`
  ```sql
  CREATE INDEX idx_intake_submissions_submitted_by ON public.intake_submissions USING btree (submitted_by)
  ```
- `intake_submissions_pkey`
  ```sql
  CREATE UNIQUE INDEX intake_submissions_pkey ON public.intake_submissions USING btree (id)
  ```

## RLS Policies

### 1. admin_update_intake_submissions_policy (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(organization_id IN ( SELECT user_organizations.organization_id
   FROM user_organizations
  WHERE ((user_organizations.user_id = auth.uid()) AND (user_organizations.role = ANY (ARRAY['admin'::text, 'owner'::text])))))`
- **With Check**: `(organization_id IN ( SELECT user_organizations.organization_id
   FROM user_organizations
  WHERE ((user_organizations.user_id = auth.uid()) AND (user_organizations.role = ANY (ARRAY['admin'::text, 'owner'::text])))))`

### 2. delete_intake_submissions_policy (DELETE)

- **Roles**: {authenticated}
- **Using**: `((auth.uid() = submitted_by) AND (submission_status = 'draft'::text))`

### 3. insert_intake_submissions_policy (INSERT)

- **Roles**: {authenticated}
- **With Check**: `((auth.uid() = submitted_by) AND (organization_id IN ( SELECT user_organizations.organization_id
   FROM user_organizations
  WHERE (user_organizations.user_id = auth.uid()))))`

### 4. select_intake_submissions_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `((auth.uid() = submitted_by) OR (organization_id IN ( SELECT user_organizations.organization_id
   FROM user_organizations
  WHERE (user_organizations.user_id = auth.uid()))))`

### 5. update_intake_submissions_policy (UPDATE)

- **Roles**: {authenticated}
- **Using**: `((auth.uid() = submitted_by) AND (submission_status = 'draft'::text))`
- **With Check**: `((auth.uid() = submitted_by) AND (submission_status = 'draft'::text))`

## Triggers

### intake_submissions_evaluated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION set_evaluated_at_timestamp()`

### intake_submissions_generate_number

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION generate_submission_number()`

### intake_submissions_submitted_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION set_submitted_at_timestamp()`

### intake_submissions_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
