# chairman_webauthn_challenges Table

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

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| chairman_user_id | `uuid` | **NO** | - | - |
| ceremony_type | `text` | **NO** | - | - |
| challenge | `text` | **NO** | - | - |
| decision_id | `uuid` | YES | - | - |
| expires_at | `timestamp with time zone` | **NO** | - | - |
| consumed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `chairman_webauthn_challenges_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `chairman_webauthn_challenges_decision_id_fkey`: decision_id → chairman_decisions(id)

### Check Constraints
- `chairman_webauthn_challenges_ceremony_type_check`: CHECK ((ceremony_type = ANY (ARRAY['registration'::text, 'assertion'::text])))

## Indexes

- `chairman_webauthn_challenges_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_webauthn_challenges_pkey ON public.chairman_webauthn_challenges USING btree (id)
  ```
- `idx_chairman_webauthn_challenges_user_ceremony`
  ```sql
  CREATE INDEX idx_chairman_webauthn_challenges_user_ceremony ON public.chairman_webauthn_challenges USING btree (chairman_user_id, ceremony_type) WHERE (consumed_at IS NULL)
  ```

## RLS Policies

### 1. chairman_webauthn_challenges_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
