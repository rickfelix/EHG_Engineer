# leo_artifacts Table

**Generated**: 2025-10-28T12:15:30.153Z
**Database**: EHG_Engineer (dedlbzhpgkmetvhbkyzq)
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| prd_id | `text` | **NO** | - | - |
| artifact_type | `text` | **NO** | - | - |
| artifact_name | `text` | **NO** | - | - |
| content | `jsonb` | **NO** | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `leo_artifacts_pkey`: PRIMARY KEY (id)

## Indexes

- `leo_artifacts_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_artifacts_pkey ON public.leo_artifacts USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_artifacts (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_artifacts (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
