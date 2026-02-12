# leo_proposal_transitions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-12T04:11:56.320Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| proposal_id | `uuid` | **NO** | - | - |
| from_status | `USER-DEFINED` | **NO** | - | - |
| to_status | `USER-DEFINED` | **NO** | - | - |
| actor_id | `uuid` | **NO** | - | - |
| rubric_version | `integer(32)` | YES | - | - |
| decision | `USER-DEFINED` | **NO** | `'none'::leo_vetting_decision` | - |
| rejection_reason | `USER-DEFINED` | YES | - | - |
| notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `leo_proposal_transitions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_proposal_transitions_proposal_id_fkey`: proposal_id → leo_proposals(id)

### Check Constraints
- `chk_transition_rejection_reason`: CHECK ((((to_status = 'rejected'::leo_proposal_status) AND (rejection_reason IS NOT NULL)) OR ((to_status <> 'rejected'::leo_proposal_status) AND (rejection_reason IS NULL))))

## Indexes

- `idx_leo_proposal_transitions_actor`
  ```sql
  CREATE INDEX idx_leo_proposal_transitions_actor ON public.leo_proposal_transitions USING btree (actor_id)
  ```
- `idx_leo_proposal_transitions_created`
  ```sql
  CREATE INDEX idx_leo_proposal_transitions_created ON public.leo_proposal_transitions USING btree (created_at DESC)
  ```
- `idx_leo_proposal_transitions_proposal`
  ```sql
  CREATE INDEX idx_leo_proposal_transitions_proposal ON public.leo_proposal_transitions USING btree (proposal_id)
  ```
- `leo_proposal_transitions_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_proposal_transitions_pkey ON public.leo_proposal_transitions USING btree (id)
  ```

## RLS Policies

### 1. transitions_select_all (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. transitions_service_role (ALL)

- **Roles**: {public}
- **Using**: `(((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
