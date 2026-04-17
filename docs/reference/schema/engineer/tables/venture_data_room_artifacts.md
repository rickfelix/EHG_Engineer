# venture_data_room_artifacts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-17T00:14:05.959Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| artifact_type | `text` | **NO** | - | - |
| artifact_version | `integer(32)` | **NO** | `1` | - |
| content | `jsonb` | **NO** | `'{}'::jsonb` | - |
| content_hash | `text` | YES | - | - |
| is_current | `boolean` | **NO** | `true` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| generated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_data_room_artifacts_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_data_room_artifacts_venture_id_fkey`: venture_id → eva_ventures(id)

### Check Constraints
- `venture_data_room_artifacts_artifact_type_check`: CHECK ((artifact_type = ANY (ARRAY['financial'::text, 'ip'::text, 'team'::text, 'operations'::text, 'assets'::text])))

## Indexes

- `idx_data_room_current`
  ```sql
  CREATE INDEX idx_data_room_current ON public.venture_data_room_artifacts USING btree (venture_id, is_current) WHERE (is_current = true)
  ```
- `idx_data_room_venture_type`
  ```sql
  CREATE INDEX idx_data_room_venture_type ON public.venture_data_room_artifacts USING btree (venture_id, artifact_type)
  ```
- `venture_data_room_artifacts_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_data_room_artifacts_pkey ON public.venture_data_room_artifacts USING btree (id)
  ```

## RLS Policies

### 1. service_role_insert_venture_data_room_artifacts (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 2. service_role_select_venture_data_room_artifacts (SELECT)

- **Roles**: {service_role}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
