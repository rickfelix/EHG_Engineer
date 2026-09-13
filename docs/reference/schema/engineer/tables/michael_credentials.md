# michael_credentials Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-13T06:31:02.341Z
**Rows**: 1
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| identifier | `text` | **NO** | - | - |
| encrypted_blob | `text` | YES | - | - |
| encryption_metadata | `jsonb` | YES | - | - |
| key_fingerprint | `text` | YES | - | - |
| scopes | `ARRAY` | **NO** | `'{}'::text[]` | - |
| expires_at | `timestamp with time zone` | YES | - | - |
| last_refreshed_at | `timestamp with time zone` | YES | - | - |
| last_error | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `michael_credentials_pkey`: PRIMARY KEY (id)

## Indexes

- `michael_credentials_identifier_uniq`
  ```sql
  CREATE UNIQUE INDEX michael_credentials_identifier_uniq ON public.michael_credentials USING btree (identifier)
  ```
- `michael_credentials_pkey`
  ```sql
  CREATE UNIQUE INDEX michael_credentials_pkey ON public.michael_credentials USING btree (id)
  ```

## RLS Policies

### 1. michael_credentials_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### michael_credentials_set_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION michael_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
