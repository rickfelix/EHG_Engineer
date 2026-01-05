# proposal_approvals Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-05T11:33:40.176Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| proposal_id | `uuid` | **NO** | - | - |
| approver_id | `character varying(100)` | **NO** | - | - |
| approver_role | `character varying(50)` | **NO** | - | - |
| approval_level | `integer(32)` | YES | `1` | - |
| decision | `character varying(20)` | **NO** | - | - |
| decision_reason | `text` | YES | - | - |
| conditions | `text` | YES | - | - |
| requested_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| decided_at | `timestamp without time zone` | YES | - | - |
| reminder_sent_at | `timestamp without time zone` | YES | - | - |
| escalated_at | `timestamp without time zone` | YES | - | - |
| comments | `text` | YES | - | - |
| attachments | `jsonb` | YES | - | - |

## Constraints

### Primary Key
- `proposal_approvals_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `proposal_approvals_proposal_id_fkey`: proposal_id → governance_proposals(id)

### Unique Constraints
- `proposal_approvals_proposal_id_approver_id_key`: UNIQUE (proposal_id, approver_id)

### Check Constraints
- `proposal_approvals_decision_check`: CHECK (((decision)::text = ANY ((ARRAY['approved'::character varying, 'rejected'::character varying, 'abstain'::character varying, 'request_info'::character varying])::text[])))

## Indexes

- `idx_approvals_pending`
  ```sql
  CREATE INDEX idx_approvals_pending ON public.proposal_approvals USING btree (decided_at) WHERE (decided_at IS NULL)
  ```
- `idx_approvals_proposal`
  ```sql
  CREATE INDEX idx_approvals_proposal ON public.proposal_approvals USING btree (proposal_id)
  ```
- `proposal_approvals_pkey`
  ```sql
  CREATE UNIQUE INDEX proposal_approvals_pkey ON public.proposal_approvals USING btree (id)
  ```
- `proposal_approvals_proposal_id_approver_id_key`
  ```sql
  CREATE UNIQUE INDEX proposal_approvals_proposal_id_approver_id_key ON public.proposal_approvals USING btree (proposal_id, approver_id)
  ```

## RLS Policies

### 1. authenticated_read_proposal_approvals (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_proposal_approvals (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
