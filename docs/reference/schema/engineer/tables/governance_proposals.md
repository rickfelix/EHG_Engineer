# governance_proposals Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T15:48:51.043Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (38 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| proposal_key | `character varying(100)` | **NO** | - | - |
| title | `character varying(500)` | **NO** | - | - |
| description | `text` | **NO** | - | - |
| proposal_type | `character varying(50)` | **NO** | - | - |
| current_state | `character varying(50)` | **NO** | `'draft'::character varying` | - |
| previous_state | `character varying(50)` | YES | - | - |
| sd_id | `character varying(50)` | YES | - | - |
| prd_id | `character varying(100)` | YES | - | - |
| parent_proposal_id | `uuid` | YES | - | - |
| submitted_by | `character varying(100)` | **NO** | - | - |
| submitted_at | `timestamp without time zone` | YES | - | - |
| submitter_role | `character varying(50)` | YES | - | - |
| submitter_rationale | `text` | YES | - | - |
| approval_required_from | `jsonb` | YES | `'[]'::jsonb` | - |
| approvals_received | `jsonb` | YES | `'[]'::jsonb` | - |
| approval_threshold | `integer(32)` | YES | `1` | - |
| rejection_reason | `text` | YES | - | - |
| priority | `character varying(20)` | YES | `'medium'::character varying` | - |
| urgency_score | `integer(32)` | YES | - | - |
| due_date | `date` | YES | - | - |
| last_activity_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| stale_flagged_at | `timestamp without time zone` | YES | - | - |
| stale_notification_sent | `boolean` | YES | `false` | - |
| implementation_plan | `text` | YES | - | - |
| estimated_effort_hours | `integer(32)` | YES | - | - |
| actual_effort_hours | `integer(32)` | YES | - | - |
| implementation_notes | `text` | YES | - | - |
| tags | `ARRAY` | YES | - | - |
| category | `character varying(100)` | YES | - | - |
| impact_assessment | `jsonb` | YES | - | - |
| risk_assessment | `jsonb` | YES | - | - |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| created_by | `character varying(100)` | YES | `'SYSTEM'::character varying` | - |
| updated_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| updated_by | `character varying(100)` | YES | - | - |
| completed_at | `timestamp without time zone` | YES | - | - |
| completed_by | `character varying(100)` | YES | - | - |

## Constraints

### Primary Key
- `governance_proposals_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `governance_proposals_parent_proposal_id_fkey`: parent_proposal_id → governance_proposals(id)
- `governance_proposals_prd_id_fkey`: prd_id → product_requirements_v2(id)
- `governance_proposals_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Unique Constraints
- `governance_proposals_proposal_key_key`: UNIQUE (proposal_key)

### Check Constraints
- `governance_proposals_current_state_check`: CHECK (((current_state)::text = ANY ((ARRAY['draft'::character varying, 'submitted'::character varying, 'under_review'::character varying, 'in_approval'::character varying, 'approved'::character varying, 'rejected'::character varying, 'implementing'::character varying, 'implemented'::character varying, 'archived'::character varying, 'withdrawn'::character varying])::text[])))
- `governance_proposals_priority_check`: CHECK (((priority)::text = ANY ((ARRAY['critical'::character varying, 'high'::character varying, 'medium'::character varying, 'low'::character varying])::text[])))
- `governance_proposals_proposal_type_check`: CHECK (((proposal_type)::text = ANY ((ARRAY['strategic_directive'::character varying, 'product_requirement'::character varying, 'technical_change'::character varying, 'process_improvement'::character varying, 'policy_update'::character varying, 'resource_request'::character varying])::text[])))
- `governance_proposals_urgency_score_check`: CHECK (((urgency_score >= 1) AND (urgency_score <= 10)))
- `valid_proposal_key`: CHECK (((proposal_key)::text ~ '^PROP-[0-9]{4}-[0-9]{6}$'::text))

## Indexes

- `governance_proposals_pkey`
  ```sql
  CREATE UNIQUE INDEX governance_proposals_pkey ON public.governance_proposals USING btree (id)
  ```
- `governance_proposals_proposal_key_key`
  ```sql
  CREATE UNIQUE INDEX governance_proposals_proposal_key_key ON public.governance_proposals USING btree (proposal_key)
  ```
- `idx_proposals_last_activity`
  ```sql
  CREATE INDEX idx_proposals_last_activity ON public.governance_proposals USING btree (last_activity_at)
  ```
- `idx_proposals_priority`
  ```sql
  CREATE INDEX idx_proposals_priority ON public.governance_proposals USING btree (priority)
  ```
- `idx_proposals_stale`
  ```sql
  CREATE INDEX idx_proposals_stale ON public.governance_proposals USING btree (stale_flagged_at) WHERE (stale_flagged_at IS NOT NULL)
  ```
- `idx_proposals_state`
  ```sql
  CREATE INDEX idx_proposals_state ON public.governance_proposals USING btree (current_state)
  ```
- `idx_proposals_submitted_at`
  ```sql
  CREATE INDEX idx_proposals_submitted_at ON public.governance_proposals USING btree (submitted_at DESC)
  ```

## RLS Policies

### 1. authenticated_read_governance_proposals (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_governance_proposals (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trigger_proposal_state_change

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION proposal_state_change_trigger()`

---

[← Back to Schema Overview](../database-schema-overview.md)
