# compliance_checks Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-25T20:22:28.434Z
**Rows**: 12
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| run_id | `text` | **NO** | - | - |
| run_type | `text` | **NO** | - | scheduled=P7D cron, manual=human triggered, on_demand=API triggered |
| started_at | `timestamp with time zone` | **NO** | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| total_stages | `integer(32)` | **NO** | `25` | - |
| passed | `integer(32)` | YES | `0` | - |
| failed | `integer(32)` | YES | `0` | - |
| skipped | `integer(32)` | YES | `0` | - |
| critical_score | `numeric(5,2)` | YES | `0.00` | Weighted score for critical compliance rules (0-100) |
| overall_score | `numeric(5,2)` | YES | `0.00` | - |
| results | `jsonb` | YES | `'{}'::jsonb` | - |
| status | `text` | **NO** | `'running'::text` | - |
| error_message | `text` | YES | - | - |
| created_by | `text` | YES | `'github-actions'::text` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `compliance_checks_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `compliance_checks_run_id_key`: UNIQUE (run_id)

### Check Constraints
- `compliance_checks_run_type_check`: CHECK ((run_type = ANY (ARRAY['scheduled'::text, 'manual'::text, 'on_demand'::text])))
- `compliance_checks_status_check`: CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))

## Indexes

- `compliance_checks_pkey`
  ```sql
  CREATE UNIQUE INDEX compliance_checks_pkey ON public.compliance_checks USING btree (id)
  ```
- `compliance_checks_run_id_key`
  ```sql
  CREATE UNIQUE INDEX compliance_checks_run_id_key ON public.compliance_checks USING btree (run_id)
  ```
- `idx_compliance_checks_created_at`
  ```sql
  CREATE INDEX idx_compliance_checks_created_at ON public.compliance_checks USING btree (created_at DESC)
  ```
- `idx_compliance_checks_run_id`
  ```sql
  CREATE INDEX idx_compliance_checks_run_id ON public.compliance_checks USING btree (run_id)
  ```
- `idx_compliance_checks_run_type`
  ```sql
  CREATE INDEX idx_compliance_checks_run_type ON public.compliance_checks USING btree (run_type)
  ```
- `idx_compliance_checks_status`
  ```sql
  CREATE INDEX idx_compliance_checks_status ON public.compliance_checks USING btree (status)
  ```

## RLS Policies

### 1. compliance_checks_authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. compliance_checks_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_compliance_checks_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
