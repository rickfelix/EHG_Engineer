# council_adjudications Table

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

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| adjudication_id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_candidate_id | `uuid` | YES | - | - |
| council_id | `uuid` | YES | - | - |
| adjudicator_perspective_id | `uuid` | YES | - | - |
| consensus_summary | `text` | YES | - | - |
| disagreement_summary | `text` | YES | - | - |
| minority_view | `text` | **NO** | `''::text` | - |
| evidence_quality | `text` | YES | - | - |
| council_confidence | `numeric(4,3)` | YES | - | - |
| recommendation | `text` | YES | - | - |
| recommended_experiments | `jsonb` | **NO** | `'[]'::jsonb` | - |
| monitoring_triggers | `jsonb` | **NO** | `'[]'::jsonb` | - |
| kill_conditions | `jsonb` | **NO** | `'[]'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `council_adjudications_pkey`: PRIMARY KEY (adjudication_id)

### Check Constraints
- `council_adjudications_council_confidence_check`: CHECK (((council_confidence IS NULL) OR ((council_confidence >= (0)::numeric) AND (council_confidence <= (1)::numeric))))
- `council_adjudications_evidence_quality_check`: CHECK (((evidence_quality IS NULL) OR (evidence_quality = ANY (ARRAY['low'::text, 'moderate'::text, 'strong'::text, 'very_strong'::text]))))

## Indexes

- `council_adjudications_pkey`
  ```sql
  CREATE UNIQUE INDEX council_adjudications_pkey ON public.council_adjudications USING btree (adjudication_id)
  ```

## RLS Policies

### 1. service_role_all_council_adjudications (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
