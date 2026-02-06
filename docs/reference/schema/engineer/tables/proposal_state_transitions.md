# proposal_state_transitions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-06T01:21:49.751Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| proposal_id | `uuid` | **NO** | - | - |
| from_state | `character varying(50)` | **NO** | - | - |
| to_state | `character varying(50)` | **NO** | - | - |
| transition_reason | `text` | YES | - | - |
| triggered_by | `character varying(100)` | **NO** | - | - |
| triggered_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `proposal_state_transitions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `proposal_state_transitions_proposal_id_fkey`: proposal_id → governance_proposals(id)

## Indexes

- `idx_transitions_proposal`
  ```sql
  CREATE INDEX idx_transitions_proposal ON public.proposal_state_transitions USING btree (proposal_id)
  ```
- `idx_transitions_timestamp`
  ```sql
  CREATE INDEX idx_transitions_timestamp ON public.proposal_state_transitions USING btree (triggered_at DESC)
  ```
- `proposal_state_transitions_pkey`
  ```sql
  CREATE UNIQUE INDEX proposal_state_transitions_pkey ON public.proposal_state_transitions USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_proposal_state_transitions (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_proposal_state_transitions (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
