# portfolio_evidence Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 1
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| evidence_kind | `text` | **NO** | - | - |
| provenance | `text` | **NO** | - | - |
| source_identity | `uuid` | YES | - | - |
| source_module | `text` | YES | - | - |
| subject_type | `text` | YES | - | - |
| subject_id | `text` | YES | - | - |
| payload | `jsonb` | **NO** | `'{}'::jsonb` | - |
| observed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `portfolio_evidence_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `portfolio_evidence_source_identity_fkey`: source_identity → org_agent_identities(id)

### Check Constraints
- `portfolio_evidence_provenance_check`: CHECK ((provenance = ANY (ARRAY['real_event'::text, 'replayed_fixture'::text, 'synthetic'::text, 'attested'::text, 'derived'::text])))

## Indexes

- `idx_portfolio_evidence_subject`
  ```sql
  CREATE INDEX idx_portfolio_evidence_subject ON public.portfolio_evidence USING btree (subject_type, subject_id)
  ```
- `idx_portfolio_evidence_venture_kind`
  ```sql
  CREATE INDEX idx_portfolio_evidence_venture_kind ON public.portfolio_evidence USING btree (venture_id, evidence_kind)
  ```
- `portfolio_evidence_pkey`
  ```sql
  CREATE UNIQUE INDEX portfolio_evidence_pkey ON public.portfolio_evidence USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_portfolio_evidence (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
