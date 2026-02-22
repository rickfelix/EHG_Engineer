# compliance_events Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T00:37:34.488Z
**Rows**: 8
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| event_id | `text` | **NO** | - | - |
| event_type | `text` | **NO** | - | Type of compliance event for routing and filtering |
| check_id | `uuid` | YES | - | - |
| policy_id | `text` | YES | - | - |
| stage_number | `integer(32)` | YES | - | - |
| severity | `text` | YES | - | - |
| summary | `text` | **NO** | - | - |
| details | `jsonb` | YES | `'{}'::jsonb` | - |
| is_read | `boolean` | YES | `false` | - |
| read_at | `timestamp with time zone` | YES | - | - |
| emitted_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `compliance_events_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `compliance_events_check_id_fkey`: check_id → compliance_checks(id)
- `compliance_events_policy_id_fkey`: policy_id → compliance_policies(policy_id)

### Unique Constraints
- `compliance_events_event_id_key`: UNIQUE (event_id)

### Check Constraints
- `compliance_events_event_type_check`: CHECK ((event_type = ANY (ARRAY['check_started'::text, 'check_completed'::text, 'check_failed'::text, 'violation_detected'::text, 'violation_resolved'::text, 'policy_changed'::text, 'remediation_created'::text])))
- `compliance_events_severity_check`: CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text, 'info'::text])))
- `compliance_events_stage_number_check`: CHECK (((stage_number >= 1) AND (stage_number <= 25)))

## Indexes

- `compliance_events_event_id_key`
  ```sql
  CREATE UNIQUE INDEX compliance_events_event_id_key ON public.compliance_events USING btree (event_id)
  ```
- `compliance_events_pkey`
  ```sql
  CREATE UNIQUE INDEX compliance_events_pkey ON public.compliance_events USING btree (id)
  ```
- `idx_compliance_events_check_id`
  ```sql
  CREATE INDEX idx_compliance_events_check_id ON public.compliance_events USING btree (check_id)
  ```
- `idx_compliance_events_emitted_at`
  ```sql
  CREATE INDEX idx_compliance_events_emitted_at ON public.compliance_events USING btree (emitted_at DESC)
  ```
- `idx_compliance_events_event_type`
  ```sql
  CREATE INDEX idx_compliance_events_event_type ON public.compliance_events USING btree (event_type)
  ```
- `idx_compliance_events_is_read`
  ```sql
  CREATE INDEX idx_compliance_events_is_read ON public.compliance_events USING btree (is_read) WHERE (is_read = false)
  ```
- `idx_compliance_events_policy_id`
  ```sql
  CREATE INDEX idx_compliance_events_policy_id ON public.compliance_events USING btree (policy_id)
  ```
- `idx_compliance_events_severity`
  ```sql
  CREATE INDEX idx_compliance_events_severity ON public.compliance_events USING btree (severity)
  ```

## RLS Policies

### 1. compliance_events_authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. compliance_events_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
