# chairman_webauthn_credentials Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| chairman_user_id | `uuid` | **NO** | - | - |
| credential_id | `text` | **NO** | - | - |
| public_key | `text` | **NO** | - | - |
| sign_count | `bigint(64)` | **NO** | `0` | - |
| aaguid | `text` | YES | - | - |
| transports | `ARRAY` | YES | - | - |
| device_label | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| last_used_at | `timestamp with time zone` | YES | - | - |
| revoked_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `chairman_webauthn_credentials_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `chairman_webauthn_credentials_credential_id_key`: UNIQUE (credential_id)

## Indexes

- `chairman_webauthn_credentials_credential_id_key`
  ```sql
  CREATE UNIQUE INDEX chairman_webauthn_credentials_credential_id_key ON public.chairman_webauthn_credentials USING btree (credential_id)
  ```
- `chairman_webauthn_credentials_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_webauthn_credentials_pkey ON public.chairman_webauthn_credentials USING btree (id)
  ```
- `idx_chairman_webauthn_credentials_chairman_user_id`
  ```sql
  CREATE INDEX idx_chairman_webauthn_credentials_chairman_user_id ON public.chairman_webauthn_credentials USING btree (chairman_user_id) WHERE (revoked_at IS NULL)
  ```

## RLS Policies

### 1. chairman_webauthn_credentials_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
