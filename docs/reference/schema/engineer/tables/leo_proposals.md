# leo_proposals Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T14:48:33.761Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| title | `text` | **NO** | - | - |
| body | `text` | **NO** | - | - |
| proposer_id | `uuid` | **NO** | - | - |
| status | `USER-DEFINED` | **NO** | `'draft'::leo_proposal_status` | - |
| vetting_status | `USER-DEFINED` | **NO** | `'not_started'::leo_vetting_status` | - |
| rejection_reason | `USER-DEFINED` | YES | - | - |
| category | `text` | YES | - | - |
| tags | `ARRAY` | YES | - | - |
| priority | `text` | YES | `'medium'::text` | - |
| estimated_impact | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| submitted_at | `timestamp with time zone` | YES | - | - |
| vetted_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `leo_proposals_pkey`: PRIMARY KEY (id)

### Check Constraints
- `chk_priority_values`: CHECK ((priority = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text])))
- `chk_rejection_reason_required`: CHECK ((((status = 'rejected'::leo_proposal_status) AND (rejection_reason IS NOT NULL)) OR ((status <> 'rejected'::leo_proposal_status) AND (rejection_reason IS NULL))))

## Indexes

- `idx_leo_proposals_created`
  ```sql
  CREATE INDEX idx_leo_proposals_created ON public.leo_proposals USING btree (created_at DESC)
  ```
- `idx_leo_proposals_proposer`
  ```sql
  CREATE INDEX idx_leo_proposals_proposer ON public.leo_proposals USING btree (proposer_id)
  ```
- `idx_leo_proposals_status`
  ```sql
  CREATE INDEX idx_leo_proposals_status ON public.leo_proposals USING btree (status)
  ```
- `leo_proposals_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_proposals_pkey ON public.leo_proposals USING btree (id)
  ```

## RLS Policies

### 1. proposals_insert_own (INSERT)

- **Roles**: {public}
- **With Check**: `((proposer_id)::text = COALESCE(NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text), '00000000-0000-0000-0000-000000000000'::text))`

### 2. proposals_select_own (SELECT)

- **Roles**: {public}
- **Using**: `(((proposer_id)::text = COALESCE(NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text), '00000000-0000-0000-0000-000000000000'::text)) OR (status <> 'draft'::leo_proposal_status))`

### 3. proposals_service_role (ALL)

- **Roles**: {public}
- **Using**: `(((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text)`

### 4. proposals_update_own_draft (UPDATE)

- **Roles**: {public}
- **Using**: `(((proposer_id)::text = COALESCE(NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text), '00000000-0000-0000-0000-000000000000'::text)) AND (status = 'draft'::leo_proposal_status))`

## Triggers

### trg_log_proposal_transition

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION fn_log_proposal_transition()`

### trg_update_proposal_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION fn_update_proposal_timestamp()`

### trg_validate_proposal_transition

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION fn_validate_proposal_transition()`

---

[← Back to Schema Overview](../database-schema-overview.md)
