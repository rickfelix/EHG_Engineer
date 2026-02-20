# evaluation_profiles Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-20T19:27:37.470Z
**Rows**: 9
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `text` | **NO** | - | - |
| version | `integer(32)` | **NO** | `1` | - |
| description | `text` | YES | - | - |
| weights | `jsonb` | **NO** | `'{}'::jsonb` | JSONB mapping synthesis component names to weight values (0-1, should sum to 1.0) |
| is_active | `boolean` | **NO** | `false` | Only one profile can be active at a time (enforced by trigger) |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | YES | `'system'::text` | - |
| gate_thresholds | `jsonb` | **NO** | `'{}'::jsonb` | Profile-specific reality gate threshold overrides. Keyed by boundary (e.g. "5->6"), each containing artifact_type → min_quality_score overrides. |

## Constraints

### Primary Key
- `evaluation_profiles_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `evaluation_profiles_name_version_key`: UNIQUE (name, version)
- `uq_evaluation_profiles_name_version`: UNIQUE (name, version)

## Indexes

- `evaluation_profiles_name_version_key`
  ```sql
  CREATE UNIQUE INDEX evaluation_profiles_name_version_key ON public.evaluation_profiles USING btree (name, version)
  ```
- `evaluation_profiles_pkey`
  ```sql
  CREATE UNIQUE INDEX evaluation_profiles_pkey ON public.evaluation_profiles USING btree (id)
  ```
- `idx_evaluation_profiles_active`
  ```sql
  CREATE INDEX idx_evaluation_profiles_active ON public.evaluation_profiles USING btree (is_active) WHERE (is_active = true)
  ```
- `uq_evaluation_profiles_name_version`
  ```sql
  CREATE UNIQUE INDEX uq_evaluation_profiles_name_version ON public.evaluation_profiles USING btree (name, version)
  ```

## RLS Policies

### 1. evaluation_profiles_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. evaluation_profiles_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_enforce_single_active_profile

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION enforce_single_active_profile()`

### trg_enforce_single_active_profile

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION enforce_single_active_profile()`

### trg_update_evaluation_profiles_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_evaluation_profiles_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
