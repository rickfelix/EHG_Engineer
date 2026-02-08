# leo_feature_flag_audit Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-08T23:25:43.489Z
**Rows**: 12
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| flag_key | `text` | **NO** | - | Reference to leo_feature_flags.flag_key |
| action_type | `text` | **NO** | - | Type of action: create, update, transition, approval, rollback, expire |
| actor_id | `text` | YES | - | ID of the actor who performed the action |
| actor_type | `text` | YES | - | Type of actor: user, system, pipeline |
| before_state | `jsonb` | YES | - | State before the change (JSONB snapshot) |
| after_state | `jsonb` | YES | - | State after the change (JSONB snapshot) |
| reason | `text` | YES | - | Reason for the change (required for approvals) |
| correlation_id | `uuid` | YES | - | UUID to correlate related audit entries |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `leo_feature_flag_audit_pkey`: PRIMARY KEY (id)

### Check Constraints
- `chk_action_type`: CHECK ((action_type = ANY (ARRAY['create'::text, 'update'::text, 'transition'::text, 'approval'::text, 'rollback'::text, 'expire'::text])))
- `chk_actor_type`: CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'pipeline'::text]))))

## Indexes

- `idx_leo_feature_flag_audit_action_type`
  ```sql
  CREATE INDEX idx_leo_feature_flag_audit_action_type ON public.leo_feature_flag_audit USING btree (action_type)
  ```
- `idx_leo_feature_flag_audit_correlation_id`
  ```sql
  CREATE INDEX idx_leo_feature_flag_audit_correlation_id ON public.leo_feature_flag_audit USING btree (correlation_id) WHERE (correlation_id IS NOT NULL)
  ```
- `idx_leo_feature_flag_audit_created_at`
  ```sql
  CREATE INDEX idx_leo_feature_flag_audit_created_at ON public.leo_feature_flag_audit USING btree (created_at DESC)
  ```
- `idx_leo_feature_flag_audit_flag_key`
  ```sql
  CREATE INDEX idx_leo_feature_flag_audit_flag_key ON public.leo_feature_flag_audit USING btree (flag_key)
  ```
- `leo_feature_flag_audit_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_feature_flag_audit_pkey ON public.leo_feature_flag_audit USING btree (id)
  ```

## RLS Policies

### 1. leo_feature_flag_audit_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. leo_feature_flag_audit_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
