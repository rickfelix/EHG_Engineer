# venture_decision_dossiers Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| dossier_id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_candidate_id | `uuid` | YES | - | - |
| council_adjudication_ids | `ARRAY` | **NO** | `'{}'::uuid[]` | - |
| overall_score | `numeric` | YES | - | - |
| overall_confidence | `numeric(4,3)` | YES | - | - |
| key_assumptions | `jsonb` | **NO** | `'[]'::jsonb` | - |
| major_disagreements | `jsonb` | **NO** | `'[]'::jsonb` | - |
| recommended_posture | `text` | YES | - | - |
| next_experiment | `text` | YES | - | - |
| experiment_budget | `numeric` | YES | - | - |
| expected_information_gain | `text` | YES | - | - |
| cost_of_waiting | `text` | YES | - | - |
| reversibility | `text` | YES | - | - |
| rick_decision_required | `boolean` | **NO** | `false` | - |
| generated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_decision_dossiers_pkey`: PRIMARY KEY (dossier_id)

### Check Constraints
- `venture_decision_dossiers_overall_confidence_check`: CHECK (((overall_confidence IS NULL) OR ((overall_confidence >= (0)::numeric) AND (overall_confidence <= (1)::numeric))))

## Indexes

- `venture_decision_dossiers_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_decision_dossiers_pkey ON public.venture_decision_dossiers USING btree (dossier_id)
  ```

## RLS Policies

### 1. service_role_all_venture_decision_dossiers (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
