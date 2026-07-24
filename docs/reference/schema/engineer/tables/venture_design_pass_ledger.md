# venture_design_pass_ledger Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 6
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| venture_name | `text` | **NO** | - | - |
| build_path | `text` | **NO** | - | - |
| build_state | `text` | **NO** | - | - |
| design_pass | `text` | **NO** | - | - |
| evidence_basis | `text` | **NO** | - | - |
| disposition | `text` | **NO** | - | - |
| is_cancelled | `boolean` | **NO** | `false` | - |
| remediation_status | `text` | **NO** | `'not_applicable'::text` | - |
| evidence_detail | `jsonb` | YES | - | - |
| classifier_version | `text` | **NO** | - | - |
| classifier_run_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_design_pass_ledger_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_design_pass_ledger_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_design_pass_ledger_venture_id_key`: UNIQUE (venture_id)

### Check Constraints
- `venture_design_pass_ledger_build_state_check`: CHECK ((build_state = ANY (ARRAY['realized'::text, 'latent'::text, 'insufficient_evidence'::text])))
- `venture_design_pass_ledger_design_pass_check`: CHECK ((design_pass = ANY (ARRAY['yes'::text, 'no'::text, 'insufficient_evidence'::text])))
- `venture_design_pass_ledger_disposition_check`: CHECK ((disposition = ANY (ARRAY['realized_defect'::text, 'realized_design_pass_confirmed'::text, 'latent_at_risk'::text, 'insufficient_evidence'::text])))
- `venture_design_pass_ledger_evidence_basis_check`: CHECK ((evidence_basis = ANY (ARRAY['structural_ui'::text, 'stitch_artifact'::text, 'design_fidelity_score'::text, 'none'::text])))
- `venture_design_pass_ledger_remediation_status_check`: CHECK ((remediation_status = ANY (ARRAY['not_applicable'::text, 'none_found'::text, 'remediation_in_progress'::text, 'remediation_completed'::text])))

## Indexes

- `venture_design_pass_ledger_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_design_pass_ledger_pkey ON public.venture_design_pass_ledger USING btree (id)
  ```
- `venture_design_pass_ledger_venture_id_key`
  ```sql
  CREATE UNIQUE INDEX venture_design_pass_ledger_venture_id_key ON public.venture_design_pass_ledger USING btree (venture_id)
  ```

## RLS Policies

### 1. venture_design_pass_ledger_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. venture_design_pass_ledger_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_venture_design_pass_ledger_touch_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION fn_venture_design_pass_ledger_touch_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
