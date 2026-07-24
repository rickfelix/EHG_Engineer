# leo_feature_flags Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 22
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| flag_key | `text` | **NO** | - | Unique identifier used in code (e.g., quality_layer_sanitization) |
| display_name | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| is_enabled | `boolean` | **NO** | `false` | Global enable/disable toggle - if false, flag always evaluates to disabled |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| lifecycle_state | `USER-DEFINED` | **NO** | `'enabled'::feature_flag_lifecycle_state` | Current lifecycle state of the feature flag |
| risk_tier | `USER-DEFINED` | **NO** | `'medium'::feature_flag_risk_tier` | Risk tier for governance and approval requirements |
| owner_type | `text` | YES | - | Type of owner: user or team |
| owner_id | `text` | YES | - | ID of the owner (user ID or team ID) |
| is_temporary | `boolean` | **NO** | `false` | Whether this flag is temporary and should expire |
| expiry_at | `timestamp with time zone` | YES | - | Expiration timestamp for temporary flags |
| row_version | `integer(32)` | **NO** | `1` | Version number for optimistic locking |
| gates_what | `text` | YES | - | Pending-Enablement Registry: human-readable description of WHAT this flag guards (the behaviour/code path that is OFF while is_enabled=false). Populated by default-OFF rollouts that self-register. See SD-LEO-INFRA-POLICY-GATED-AUTO-001A. |
| enablement_criteria | `text` | YES | - | Pending-Enablement Registry: the conditions that must hold before this default-OFF flag is enabled (e.g. "consumer migration deployed; 24h soak with no errors"). Read by the exec-email aged-pending surfacer. See SD-LEO-INFRA-POLICY-GATED-AUTO-001A. |
| rolled_out_at | `timestamp with time zone` | YES | - | Pending-Enablement Registry: timestamp when the default-OFF rollout that introduced this flag shipped. NULL = not a self-registered pending rollout. pending := is_enabled=false AND rolled_out_at IS NOT NULL AND lifecycle_state IN (draft,disabled). Aged-pending = now() - rolled_out_at exceeds threshold. See SD-LEO-INFRA-POLICY-GATED-AUTO-001A. |
| last_reviewed_at | `timestamp with time zone` | YES | - | Pending-Enablement Registry: timestamp of the last operator review of this pending flag. NULL = never reviewed since rollout. The aged-pending surfacer uses COALESCE(last_reviewed_at, rolled_out_at) as the staleness anchor. See SD-LEO-INFRA-POLICY-GATED-AUTO-001A. |
| target | `text` | YES | - | Pending-Enablement Registry: target application / scope this flag applies to (e.g. "EHG_Engineer", "EHG"). NULL = unscoped / global. See SD-LEO-INFRA-POLICY-GATED-AUTO-001A. |

## Constraints

### Primary Key
- `leo_feature_flags_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `leo_feature_flags_flag_key_key`: UNIQUE (flag_key)

### Check Constraints
- `chk_flag_lifecycle_enabled_consistency`: CHECK ((is_enabled = (lifecycle_state = 'enabled'::feature_flag_lifecycle_state)))
- `chk_owner_type`: CHECK (((owner_type IS NULL) OR (owner_type = ANY (ARRAY['user'::text, 'team'::text]))))

## Indexes

- `idx_leo_feature_flags_expiry_at`
  ```sql
  CREATE INDEX idx_leo_feature_flags_expiry_at ON public.leo_feature_flags USING btree (expiry_at) WHERE (expiry_at IS NOT NULL)
  ```
- `idx_leo_feature_flags_flag_key`
  ```sql
  CREATE INDEX idx_leo_feature_flags_flag_key ON public.leo_feature_flags USING btree (flag_key)
  ```
- `idx_leo_feature_flags_lifecycle_state`
  ```sql
  CREATE INDEX idx_leo_feature_flags_lifecycle_state ON public.leo_feature_flags USING btree (lifecycle_state)
  ```
- `leo_feature_flags_flag_key_key`
  ```sql
  CREATE UNIQUE INDEX leo_feature_flags_flag_key_key ON public.leo_feature_flags USING btree (flag_key)
  ```
- `leo_feature_flags_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_feature_flags_pkey ON public.leo_feature_flags USING btree (id)
  ```

## RLS Policies

### 1. leo_feature_flags_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. leo_feature_flags_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### set_updated_at_leo_feature_flags

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trigger_set_updated_at_flags_review_aware()`

### trg_audit_feature_flag_changes

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION fn_audit_feature_flag_changes()`

### trg_audit_feature_flag_changes

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION fn_audit_feature_flag_changes()`

### trg_increment_feature_flag_version

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION fn_increment_feature_flag_version()`

---

[← Back to Schema Overview](../database-schema-overview.md)
