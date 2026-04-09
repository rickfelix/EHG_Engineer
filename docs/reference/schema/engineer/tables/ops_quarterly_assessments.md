# ops_quarterly_assessments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-09T20:19:29.104Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| assessment_type | `text` | **NO** | - | - |
| quarter | `text` | **NO** | - | - |
| status | `text` | **NO** | `'scheduled'::text` | - |
| scheduled_date | `date` | YES | - | - |
| completed_date | `date` | YES | - | - |
| findings | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `ops_quarterly_assessments_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `ops_quarterly_assessments_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `ops_quarterly_assessments_venture_id_assessment_type_quarte_key`: UNIQUE (venture_id, assessment_type, quarter)

### Check Constraints
- `ops_quarterly_assessments_assessment_type_check`: CHECK ((assessment_type = ANY (ARRAY['risk_recalibration'::text, 'exit_readiness'::text, 'competitive_landscape'::text, 'financial_health'::text])))
- `ops_quarterly_assessments_status_check`: CHECK ((status = ANY (ARRAY['scheduled'::text, 'in_progress'::text, 'completed'::text, 'skipped'::text])))

## Indexes

- `idx_ops_quarterly_assessments_status`
  ```sql
  CREATE INDEX idx_ops_quarterly_assessments_status ON public.ops_quarterly_assessments USING btree (status) WHERE (status = ANY (ARRAY['scheduled'::text, 'in_progress'::text]))
  ```
- `idx_ops_quarterly_assessments_venture_quarter`
  ```sql
  CREATE INDEX idx_ops_quarterly_assessments_venture_quarter ON public.ops_quarterly_assessments USING btree (venture_id, quarter DESC)
  ```
- `ops_quarterly_assessments_pkey`
  ```sql
  CREATE UNIQUE INDEX ops_quarterly_assessments_pkey ON public.ops_quarterly_assessments USING btree (id)
  ```
- `ops_quarterly_assessments_venture_id_assessment_type_quarte_key`
  ```sql
  CREATE UNIQUE INDEX ops_quarterly_assessments_venture_id_assessment_type_quarte_key ON public.ops_quarterly_assessments USING btree (venture_id, assessment_type, quarter)
  ```

## RLS Policies

### 1. ops_quarterly_assessments_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. ops_quarterly_assessments_venture_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 3. ops_quarterly_assessments_venture_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 4. ops_quarterly_assessments_venture_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

---

[← Back to Schema Overview](../database-schema-overview.md)
