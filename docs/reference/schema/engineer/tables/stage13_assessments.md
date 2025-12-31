# stage13_assessments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-12-31T16:02:09.576Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| exit_readiness_score | `integer(32)` | **NO** | - | - |
| components | `jsonb` | **NO** | `'{}'::jsonb` | - |
| eva_model_version | `character varying(50)` | YES | `'v1.0.0'::character varying` | - |
| eva_confidence | `numeric(5,2)` | YES | - | - |
| processing_time_ms | `integer(32)` | YES | - | - |
| assessment_type | `character varying(50)` | YES | `'standard'::character varying` | - |
| status | `character varying(20)` | YES | `'completed'::character varying` | - |
| error_message | `text` | YES | - | - |
| readiness_tracking_id | `uuid` | YES | - | - |
| requested_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `stage13_assessments_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `stage13_assessments_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `stage13_assessments_assessment_type_check`: CHECK (((assessment_type)::text = ANY ((ARRAY['standard'::character varying, 'gate_validation'::character varying, 'chairman_requested'::character varying, 'emergency'::character varying])::text[])))
- `stage13_assessments_exit_readiness_score_check`: CHECK (((exit_readiness_score >= 0) AND (exit_readiness_score <= 100)))
- `stage13_assessments_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))

## Indexes

- `idx_stage13_assessments_created`
  ```sql
  CREATE INDEX idx_stage13_assessments_created ON public.stage13_assessments USING btree (created_at DESC)
  ```
- `idx_stage13_assessments_score`
  ```sql
  CREATE INDEX idx_stage13_assessments_score ON public.stage13_assessments USING btree (exit_readiness_score)
  ```
- `idx_stage13_assessments_status`
  ```sql
  CREATE INDEX idx_stage13_assessments_status ON public.stage13_assessments USING btree (status)
  ```
- `idx_stage13_assessments_type`
  ```sql
  CREATE INDEX idx_stage13_assessments_type ON public.stage13_assessments USING btree (assessment_type)
  ```
- `idx_stage13_assessments_venture`
  ```sql
  CREATE INDEX idx_stage13_assessments_venture ON public.stage13_assessments USING btree (venture_id)
  ```
- `stage13_assessments_pkey`
  ```sql
  CREATE UNIQUE INDEX stage13_assessments_pkey ON public.stage13_assessments USING btree (id)
  ```

## RLS Policies

### 1. Company access stage13_assessments (ALL)

- **Roles**: {public}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

## Triggers

### update_stage13_assessments_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
