# venture_quality_findings Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-06-02T15:21:08.368Z
**Rows**: 6
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| stage_number | `integer(32)` | **NO** | - | Stage that emitted the finding. Currently always 20; column kept open (no CHECK pin) for forward compatibility with future stages adopting the fabric. |
| finding_category | `text` | **NO** | - | - |
| severity | `text` | **NO** | - | - |
| finding_hash | `text` | **NO** | - | Deterministic dedup key. See lib/eva/quality-findings/finding-shape.js::computeFindingHash. |
| evidence_pointer | `jsonb` | **NO** | `'{}'::jsonb` | - |
| sd_key | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| status | `text` | **NO** | `'pending'::text` | FR-C status machine. Forward-only transitions enforced by venture_quality_findings_status_transition_trg. pending->sd_filed/cancelled; sd_filed->resolved/cancelled. |
| sd_filed_at | `timestamp with time zone` | YES | - | Set atomically by BEFORE UPDATE trigger when status transitions pending->sd_filed. |
| resolved_at_v2 | `timestamp with time zone` | YES | - | Set atomically by BEFORE UPDATE trigger when status transitions sd_filed->resolved. Distinct from the legacy resolved_at column (kept for compatibility with the parent_finding_hash generator). |
| cancelled_at | `timestamp with time zone` | YES | - | Set atomically by BEFORE UPDATE trigger when status transitions to cancelled (from pending or sd_filed). |

## Constraints

### Primary Key
- `venture_quality_findings_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `venture_quality_findings_unique_hash`: UNIQUE (venture_id, finding_hash)

### Check Constraints
- `venture_quality_findings_finding_category_check`: CHECK ((finding_category = ANY (ARRAY['npm_audit'::text, 'secrets'::text, 'lint'::text, 'test_suite'::text, 'unit_test'::text, 'e2e_test'::text, 'uat_test'::text, 'bug_report'::text, 'uat_signoff'::text, 'capability'::text])))
- `venture_quality_findings_severity_check`: CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text])))
- `venture_quality_findings_status_chk`: CHECK ((status = ANY (ARRAY['pending'::text, 'sd_filed'::text, 'resolved'::text, 'cancelled'::text])))

## Indexes

- `venture_quality_findings_category_idx`
  ```sql
  CREATE INDEX venture_quality_findings_category_idx ON public.venture_quality_findings USING btree (finding_category)
  ```
- `venture_quality_findings_pending_idx`
  ```sql
  CREATE INDEX venture_quality_findings_pending_idx ON public.venture_quality_findings USING btree (venture_id, finding_category, severity) WHERE (status = 'pending'::text)
  ```
- `venture_quality_findings_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_quality_findings_pkey ON public.venture_quality_findings USING btree (id)
  ```
- `venture_quality_findings_severity_idx`
  ```sql
  CREATE INDEX venture_quality_findings_severity_idx ON public.venture_quality_findings USING btree (severity)
  ```
- `venture_quality_findings_unique_hash`
  ```sql
  CREATE UNIQUE INDEX venture_quality_findings_unique_hash ON public.venture_quality_findings USING btree (venture_id, finding_hash)
  ```
- `venture_quality_findings_unresolved_idx`
  ```sql
  CREATE INDEX venture_quality_findings_unresolved_idx ON public.venture_quality_findings USING btree (venture_id, finding_category) WHERE (resolved_at IS NULL)
  ```
- `venture_quality_findings_venture_idx`
  ```sql
  CREATE INDEX venture_quality_findings_venture_idx ON public.venture_quality_findings USING btree (venture_id)
  ```

## RLS Policies

### 1. venture_quality_findings_authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. venture_quality_findings_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### venture_quality_findings_status_transition_trg

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION venture_quality_findings_status_transition_fn()`

---

[← Back to Schema Overview](../database-schema-overview.md)
