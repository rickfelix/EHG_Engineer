# compliance_policies Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T03:50:45.752Z
**Rows**: 6
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| policy_id | `text` | **NO** | - | - |
| policy_name | `text` | **NO** | - | - |
| policy_version | `integer(32)` | **NO** | `1` | - |
| category | `text` | **NO** | - | - |
| severity | `text` | **NO** | - | - |
| is_active | `boolean` | **NO** | `true` | - |
| description | `text` | YES | - | - |
| rule_config | `jsonb` | **NO** | `'{}'::jsonb` | JSONB configuration for the compliance check logic |
| applicable_stages | `jsonb` | YES | `'[]'::jsonb` | Array of stage numbers this policy applies to, empty = all stages |
| remediation_template | `text` | YES | - | - |
| remediation_priority | `text` | YES | `'medium'::text` | - |
| created_by | `text` | YES | `'system'::text` | - |
| updated_by | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| superseded_by | `uuid` | YES | - | - |
| supersedes | `uuid` | YES | - | - |

## Constraints

### Primary Key
- `compliance_policies_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `compliance_policies_superseded_by_fkey`: superseded_by → compliance_policies(id)
- `compliance_policies_supersedes_fkey`: supersedes → compliance_policies(id)

### Unique Constraints
- `compliance_policies_policy_id_key`: UNIQUE (policy_id)

### Check Constraints
- `compliance_policies_category_check`: CHECK ((category = ANY (ARRAY['crewai'::text, 'dossier'::text, 'session'::text, 'integration'::text, 'custom'::text])))
- `compliance_policies_remediation_priority_check`: CHECK ((remediation_priority = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text])))
- `compliance_policies_severity_check`: CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text, 'info'::text])))

## Indexes

- `compliance_policies_pkey`
  ```sql
  CREATE UNIQUE INDEX compliance_policies_pkey ON public.compliance_policies USING btree (id)
  ```
- `compliance_policies_policy_id_key`
  ```sql
  CREATE UNIQUE INDEX compliance_policies_policy_id_key ON public.compliance_policies USING btree (policy_id)
  ```
- `idx_compliance_policies_category`
  ```sql
  CREATE INDEX idx_compliance_policies_category ON public.compliance_policies USING btree (category)
  ```
- `idx_compliance_policies_is_active`
  ```sql
  CREATE INDEX idx_compliance_policies_is_active ON public.compliance_policies USING btree (is_active)
  ```
- `idx_compliance_policies_policy_id`
  ```sql
  CREATE INDEX idx_compliance_policies_policy_id ON public.compliance_policies USING btree (policy_id)
  ```
- `idx_compliance_policies_severity`
  ```sql
  CREATE INDEX idx_compliance_policies_severity ON public.compliance_policies USING btree (severity)
  ```

## RLS Policies

### 1. compliance_policies_authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. compliance_policies_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_compliance_policies_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
