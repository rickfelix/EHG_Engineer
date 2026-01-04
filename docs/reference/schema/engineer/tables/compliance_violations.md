# compliance_violations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-04T22:58:02.355Z
**Rows**: 162
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (21 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| check_id | `uuid` | **NO** | - | - |
| stage_number | `integer(32)` | **NO** | - | - |
| violation_type | `text` | **NO** | - | - |
| severity | `text` | **NO** | - | critical=blocks operations, high=requires immediate action, medium/low=advisory |
| rule_id | `text` | YES | - | - |
| description | `text` | **NO** | - | - |
| expected_value | `text` | YES | - | - |
| actual_value | `text` | YES | - | - |
| remediation_sd_id | `text` | YES | - | - |
| status | `text` | **NO** | `'open'::text` | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| resolved_by | `text` | YES | - | - |
| notes | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| title | `character varying(255)` | YES | - | - |
| policy_id | `uuid` | YES | - | - |
| detected_at | `timestamp with time zone` | YES | `now()` | - |
| company_id | `uuid` | YES | - | - |

## Constraints

### Primary Key
- `compliance_violations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `compliance_violations_check_id_fkey`: check_id → compliance_checks(id)
- `compliance_violations_policy_id_fkey`: policy_id → governance_policies(id)

### Check Constraints
- `compliance_violations_severity_check`: CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text, 'info'::text])))
- `compliance_violations_stage_number_check`: CHECK (((stage_number >= 1) AND (stage_number <= 25)))
- `compliance_violations_status_check`: CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'remediated'::text, 'false_positive'::text])))

## Indexes

- `compliance_violations_pkey`
  ```sql
  CREATE UNIQUE INDEX compliance_violations_pkey ON public.compliance_violations USING btree (id)
  ```
- `idx_compliance_violations_check_id`
  ```sql
  CREATE INDEX idx_compliance_violations_check_id ON public.compliance_violations USING btree (check_id)
  ```
- `idx_compliance_violations_remediation_sd`
  ```sql
  CREATE INDEX idx_compliance_violations_remediation_sd ON public.compliance_violations USING btree (remediation_sd_id) WHERE (remediation_sd_id IS NOT NULL)
  ```
- `idx_compliance_violations_severity`
  ```sql
  CREATE INDEX idx_compliance_violations_severity ON public.compliance_violations USING btree (severity)
  ```
- `idx_compliance_violations_stage_number`
  ```sql
  CREATE INDEX idx_compliance_violations_stage_number ON public.compliance_violations USING btree (stage_number)
  ```
- `idx_compliance_violations_status`
  ```sql
  CREATE INDEX idx_compliance_violations_status ON public.compliance_violations USING btree (status)
  ```

## RLS Policies

### 1. authenticated_select_compliance_violations (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. compliance_violations_authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. compliance_violations_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_compliance_violations_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
