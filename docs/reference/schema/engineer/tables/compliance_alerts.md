# compliance_alerts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T15:28:12.179Z
**Rows**: 14
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| alert_type | `text` | **NO** | - | - |
| severity | `text` | **NO** | - | - |
| source | `text` | **NO** | - | - |
| message | `text` | **NO** | - | - |
| payload | `jsonb` | YES | `'{}'::jsonb` | - |
| resolved | `boolean` | YES | `false` | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| resolution_notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `compliance_alerts_pkey`: PRIMARY KEY (id)

### Check Constraints
- `compliance_alerts_alert_type_check`: CHECK ((alert_type = ANY (ARRAY['filesystem_drift'::text, 'boundary_violation'::text, 'missing_artifact'::text, 'gate_failure'::text, 'timeout'::text])))
- `compliance_alerts_severity_check`: CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'error'::text, 'critical'::text])))

## Indexes

- `compliance_alerts_pkey`
  ```sql
  CREATE UNIQUE INDEX compliance_alerts_pkey ON public.compliance_alerts USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_compliance_alerts (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_compliance_alerts (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
