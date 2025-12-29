# remediation_manifests Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-12-29T04:33:05.729Z
**Rows**: 1
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| rcr_id | `uuid` | **NO** | - | - |
| immediate_fix | `text` | YES | - | - |
| proposed_changes | `jsonb` | **NO** | - | - |
| impact_assessment | `jsonb` | **NO** | - | - |
| risk_score | `integer(32)` | YES | - | - |
| affected_sd_count | `integer(32)` | YES | `1` | - |
| verification_plan | `jsonb` | **NO** | - | - |
| acceptance_criteria | `jsonb` | **NO** | - | - |
| preventive_actions | `jsonb` | YES | `'[]'::jsonb` | - |
| process_improvements | `jsonb` | YES | `'[]'::jsonb` | - |
| owner_agent | `text` | **NO** | - | - |
| assigned_to | `text` | YES | - | - |
| status | `text` | **NO** | `'PENDING'::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| approved_at | `timestamp with time zone` | YES | - | - |
| implemented_at | `timestamp with time zone` | YES | - | - |
| verified_at | `timestamp with time zone` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `remediation_manifests_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `remediation_manifests_rcr_id_fkey`: rcr_id → root_cause_reports(id)

### Check Constraints
- `remediation_manifests_owner_agent_check`: CHECK ((owner_agent = ANY (ARRAY['PLAN'::text, 'EXEC'::text, 'LEAD'::text, 'EVA'::text, 'SUBAGENT'::text, 'MANUAL'::text])))
- `remediation_manifests_risk_score_check`: CHECK (((risk_score >= 0) AND (risk_score <= 100)))
- `remediation_manifests_status_check`: CHECK ((status = ANY (ARRAY['PENDING'::text, 'UNDER_REVIEW'::text, 'APPROVED'::text, 'REJECTED'::text, 'IN_PROGRESS'::text, 'IMPLEMENTED'::text, 'VERIFIED'::text, 'FAILED_VERIFICATION'::text])))

## Indexes

- `idx_capa_owner`
  ```sql
  CREATE INDEX idx_capa_owner ON public.remediation_manifests USING btree (owner_agent, status)
  ```
- `idx_capa_rcr_id`
  ```sql
  CREATE INDEX idx_capa_rcr_id ON public.remediation_manifests USING btree (rcr_id)
  ```
- `idx_capa_status`
  ```sql
  CREATE INDEX idx_capa_status ON public.remediation_manifests USING btree (status, created_at DESC)
  ```
- `remediation_manifests_pkey`
  ```sql
  CREATE UNIQUE INDEX remediation_manifests_pkey ON public.remediation_manifests USING btree (id)
  ```

## RLS Policies

### 1. public_insert_remediation_manifests (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. public_select_remediation_manifests (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 3. public_update_remediation_manifests (UPDATE)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

### 4. service_role_all_remediation_manifests (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trigger_update_rcr_on_capa_verified

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION update_rcr_on_capa_verified()`

---

[← Back to Schema Overview](../database-schema-overview.md)
