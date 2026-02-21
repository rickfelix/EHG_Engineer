# enhancement_proposal_audit Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-21T15:16:03.794Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| proposal_id | `uuid` | **NO** | - | - |
| actor_id | `uuid` | YES | - | - |
| from_status | `character varying(20)` | **NO** | - | - |
| to_status | `character varying(20)` | **NO** | - | - |
| request_id | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `enhancement_proposal_audit_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `enhancement_proposal_audit_proposal_id_fkey`: proposal_id → enhancement_proposals(id)

## Indexes

- `enhancement_proposal_audit_pkey`
  ```sql
  CREATE UNIQUE INDEX enhancement_proposal_audit_pkey ON public.enhancement_proposal_audit USING btree (id)
  ```
- `idx_enhancement_proposal_audit_proposal`
  ```sql
  CREATE INDEX idx_enhancement_proposal_audit_proposal ON public.enhancement_proposal_audit USING btree (proposal_id, created_at DESC)
  ```

## RLS Policies

### 1. authenticated_select_enhancement_proposal_audit (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_enhancement_proposal_audit (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
