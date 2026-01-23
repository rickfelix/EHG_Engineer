# governance_policies Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T11:54:04.563Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (24 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| policy_code | `character varying(100)` | **NO** | - | - |
| policy_name | `character varying(255)` | **NO** | - | - |
| policy_version | `character varying(20)` | **NO** | `'1.0'::character varying` | - |
| policy_category | `character varying(100)` | **NO** | - | - |
| description | `text` | **NO** | - | - |
| policy_text | `text` | **NO** | - | - |
| requirements | `jsonb` | YES | `'{}'::jsonb` | - |
| compliance_framework | `character varying(100)` | YES | - | - |
| compliance_level | `character varying(20)` | YES | `'required'::character varying` | - |
| enforcement_level | `character varying(20)` | YES | `'medium'::character varying` | - |
| auto_enforcement | `boolean` | YES | `false` | - |
| violation_threshold | `integer(32)` | YES | `1` | - |
| status | `character varying(20)` | YES | `'draft'::character varying` | - |
| effective_date | `date` | YES | - | - |
| expiry_date | `date` | YES | - | - |
| review_frequency | `character varying(20)` | YES | `'quarterly'::character varying` | - |
| last_review_date | `date` | YES | - | - |
| next_review_date | `date` | YES | - | - |
| owner_id | `uuid` | YES | - | - |
| approver_id | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `uuid` | **NO** | `'00000000-0000-0000-0000-000000000000'::uuid` | - |

## Constraints

### Primary Key
- `governance_policies_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `governance_policies_policy_code_key`: UNIQUE (policy_code)

### Check Constraints
- `governance_policies_status_check`: CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'deprecated'::character varying, 'archived'::character varying])::text[])))

## Indexes

- `governance_policies_pkey`
  ```sql
  CREATE UNIQUE INDEX governance_policies_pkey ON public.governance_policies USING btree (id)
  ```
- `governance_policies_policy_code_key`
  ```sql
  CREATE UNIQUE INDEX governance_policies_policy_code_key ON public.governance_policies USING btree (policy_code)
  ```

## RLS Policies

### 1. Allow service_role to manage governance_policies (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. authenticated_select_governance_policies (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
