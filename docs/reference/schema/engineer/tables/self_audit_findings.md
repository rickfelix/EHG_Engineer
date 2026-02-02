# self_audit_findings Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-02T04:52:34.874Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| routine_key | `text` | **NO** | - | - |
| mode | `text` | **NO** | - | - |
| title | `text` | **NO** | - | - |
| summary | `text` | **NO** | - | - |
| severity | `text` | **NO** | - | - |
| confidence | `numeric(3,2)` | **NO** | - | - |
| repo_ref | `text` | **NO** | - | - |
| commit_sha | `text` | **NO** | - | - |
| evidence_pack | `jsonb` | **NO** | - | JSONB containing EvidencePack with path, line_start, line_end, snippet, evidence_type per Contract A2 |
| fingerprint | `text` | **NO** | - | Hash for deduplication across runs |
| status | `text` | **NO** | `'open'::text` | - |
| dismissed_reason | `text` | YES | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `self_audit_findings_pkey`: PRIMARY KEY (id)

### Check Constraints
- `self_audit_findings_confidence_check`: CHECK (((confidence >= 0.00) AND (confidence <= 1.00)))
- `self_audit_findings_mode_check`: CHECK ((mode = ANY (ARRAY['finding'::text, 'proposal'::text, 'both'::text])))
- `self_audit_findings_severity_check`: CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])))
- `self_audit_findings_status_check`: CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text, 'dismissed'::text])))

## Indexes

- `idx_self_audit_findings_dedup`
  ```sql
  CREATE UNIQUE INDEX idx_self_audit_findings_dedup ON public.self_audit_findings USING btree (routine_key, fingerprint, commit_sha, mode)
  ```
- `idx_self_audit_findings_evidence_pack`
  ```sql
  CREATE INDEX idx_self_audit_findings_evidence_pack ON public.self_audit_findings USING gin (evidence_pack)
  ```
- `idx_self_audit_findings_routine_created`
  ```sql
  CREATE INDEX idx_self_audit_findings_routine_created ON public.self_audit_findings USING btree (routine_key, created_at DESC)
  ```
- `idx_self_audit_findings_status`
  ```sql
  CREATE INDEX idx_self_audit_findings_status ON public.self_audit_findings USING btree (status) WHERE (status = 'open'::text)
  ```
- `self_audit_findings_pkey`
  ```sql
  CREATE UNIQUE INDEX self_audit_findings_pkey ON public.self_audit_findings USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
