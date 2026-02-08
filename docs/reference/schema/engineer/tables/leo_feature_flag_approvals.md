# leo_feature_flag_approvals Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-08T23:57:20.132Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| flag_key | `text` | **NO** | - | Reference to leo_feature_flags.flag_key |
| transition_type | `text` | YES | - | Type of transition requiring approval (e.g., enable, disable, expire) |
| required_approvals | `integer(32)` | **NO** | - | Number of approvals required |
| approvals_received | `integer(32)` | **NO** | `0` | Number of approvals received so far |
| approver_ids | `ARRAY` | YES | `'{}'::text[]` | Array of user IDs who have approved |
| requester_id | `text` | YES | - | User ID who requested the change |
| status | `text` | **NO** | `'pending'::text` | Status: pending, approved, rejected |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| resolved_at | `timestamp with time zone` | YES | - | Timestamp when approval was finalized |

## Constraints

### Primary Key
- `leo_feature_flag_approvals_pkey`: PRIMARY KEY (id)

### Check Constraints
- `chk_approval_status`: CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
- `chk_approvals_count`: CHECK (((approvals_received >= 0) AND (approvals_received <= required_approvals)))

## Indexes

- `idx_leo_feature_flag_approvals_created_at`
  ```sql
  CREATE INDEX idx_leo_feature_flag_approvals_created_at ON public.leo_feature_flag_approvals USING btree (created_at DESC)
  ```
- `idx_leo_feature_flag_approvals_flag_key`
  ```sql
  CREATE INDEX idx_leo_feature_flag_approvals_flag_key ON public.leo_feature_flag_approvals USING btree (flag_key)
  ```
- `idx_leo_feature_flag_approvals_status`
  ```sql
  CREATE INDEX idx_leo_feature_flag_approvals_status ON public.leo_feature_flag_approvals USING btree (status) WHERE (status = 'pending'::text)
  ```
- `leo_feature_flag_approvals_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_feature_flag_approvals_pkey ON public.leo_feature_flag_approvals USING btree (id)
  ```

## RLS Policies

### 1. leo_feature_flag_approvals_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. leo_feature_flag_approvals_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
