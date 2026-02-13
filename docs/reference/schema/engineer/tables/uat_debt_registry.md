# uat_debt_registry Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T14:25:45.422Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | **NO** | - | Strategic Directive ID (TEXT, matches strategic_directives_v2.id) |
| source | `text` | **NO** | - | - |
| category | `text` | **NO** | - | - |
| severity | `text` | **NO** | - | - |
| confidence | `numeric(3,2)` | YES | - | - |
| description | `text` | **NO** | - | - |
| evidence | `jsonb` | YES | `'{}'::jsonb` | - |
| vision_qa_session_id | `uuid` | YES | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| area | `text` | YES | - | - |
| issue_signature | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| resolved_by | `text` | YES | - | - |
| resolved_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `uat_debt_registry_pkey`: PRIMARY KEY (id)

### Check Constraints
- `uat_debt_registry_category_check`: CHECK ((category = ANY (ARRAY['bug'::text, 'accessibility'::text, 'performance'::text, 'ux_judgment'::text, 'untested'::text])))
- `uat_debt_registry_confidence_check`: CHECK (((confidence >= 0.00) AND (confidence <= 1.00)))
- `uat_debt_registry_severity_check`: CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text])))
- `uat_debt_registry_source_check`: CHECK ((source = ANY (ARRAY['vision_qa'::text, 'skip'::text, 'manual'::text])))
- `uat_debt_registry_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'in_review'::text, 'resolved'::text, 'wontfix'::text])))

## Indexes

- `idx_uat_debt_created_at`
  ```sql
  CREATE INDEX idx_uat_debt_created_at ON public.uat_debt_registry USING btree (created_at DESC)
  ```
- `idx_uat_debt_evidence`
  ```sql
  CREATE INDEX idx_uat_debt_evidence ON public.uat_debt_registry USING gin (evidence)
  ```
- `idx_uat_debt_issue_signature`
  ```sql
  CREATE INDEX idx_uat_debt_issue_signature ON public.uat_debt_registry USING btree (issue_signature) WHERE (issue_signature IS NOT NULL)
  ```
- `idx_uat_debt_sd_id`
  ```sql
  CREATE INDEX idx_uat_debt_sd_id ON public.uat_debt_registry USING btree (sd_id)
  ```
- `idx_uat_debt_session`
  ```sql
  CREATE INDEX idx_uat_debt_session ON public.uat_debt_registry USING btree (vision_qa_session_id) WHERE (vision_qa_session_id IS NOT NULL)
  ```
- `idx_uat_debt_status_area`
  ```sql
  CREATE INDEX idx_uat_debt_status_area ON public.uat_debt_registry USING btree (status, area)
  ```
- `uat_debt_registry_pkey`
  ```sql
  CREATE UNIQUE INDEX uat_debt_registry_pkey ON public.uat_debt_registry USING btree (id)
  ```

## RLS Policies

### 1. Allow service role full access on uat_debt_registry (ALL)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_uat_debt_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_uat_debt_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
