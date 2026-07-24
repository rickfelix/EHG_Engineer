# chairman_stepup_tokens Table

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

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| token | `uuid` | **NO** | `gen_random_uuid()` | - |
| decision_id | `uuid` | **NO** | - | - |
| chairman_user_id | `uuid` | **NO** | - | - |
| credential_id | `text` | YES | - | - |
| expires_at | `timestamp with time zone` | **NO** | - | - |
| consumed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `chairman_stepup_tokens_pkey`: PRIMARY KEY (token)

### Foreign Keys
- `chairman_stepup_tokens_credential_id_fkey`: credential_id → chairman_webauthn_credentials(credential_id)
- `chairman_stepup_tokens_decision_id_fkey`: decision_id → chairman_decisions(id)

## Indexes

- `chairman_stepup_tokens_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_stepup_tokens_pkey ON public.chairman_stepup_tokens USING btree (token)
  ```
- `idx_chairman_stepup_tokens_decision_id`
  ```sql
  CREATE INDEX idx_chairman_stepup_tokens_decision_id ON public.chairman_stepup_tokens USING btree (decision_id) WHERE (consumed_at IS NULL)
  ```

## RLS Policies

### 1. chairman_stepup_tokens_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
