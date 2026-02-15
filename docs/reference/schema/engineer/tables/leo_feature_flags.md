# leo_feature_flags Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-15T13:25:26.330Z
**Rows**: 4
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

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

## Constraints

### Primary Key
- `leo_feature_flags_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `leo_feature_flags_flag_key_key`: UNIQUE (flag_key)

### Check Constraints
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
- **Action**: `EXECUTE FUNCTION trigger_set_updated_at()`

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
