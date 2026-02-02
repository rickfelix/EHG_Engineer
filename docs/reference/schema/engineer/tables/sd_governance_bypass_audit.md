# sd_governance_bypass_audit Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-02T02:20:58.352Z
**Rows**: 296
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | **NO** | - | - |
| trigger_name | `character varying(100)` | **NO** | - | - |
| actor_role | `character varying(50)` | **NO** | - | - |
| bypass_reason | `text` | YES | - | - |
| automation_context | `jsonb` | YES | - | - |
| bypassed_at | `timestamp with time zone` | YES | `now()` | - |
| old_values | `jsonb` | YES | - | - |
| new_values | `jsonb` | YES | - | - |

## Constraints

### Primary Key
- `sd_governance_bypass_audit_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_governance_bypass_actor`
  ```sql
  CREATE INDEX idx_governance_bypass_actor ON public.sd_governance_bypass_audit USING btree (actor_role)
  ```
- `idx_governance_bypass_sd`
  ```sql
  CREATE INDEX idx_governance_bypass_sd ON public.sd_governance_bypass_audit USING btree (sd_id)
  ```
- `idx_governance_bypass_trigger`
  ```sql
  CREATE INDEX idx_governance_bypass_trigger ON public.sd_governance_bypass_audit USING btree (trigger_name)
  ```
- `sd_governance_bypass_audit_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_governance_bypass_audit_pkey ON public.sd_governance_bypass_audit USING btree (id)
  ```

## RLS Policies

### 1. bypass_audit_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. bypass_audit_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
