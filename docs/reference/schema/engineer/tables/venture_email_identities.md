# venture_email_identities Table

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

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| domain | `text` | **NO** | - | - |
| cf_zone_id | `text` | YES | - | - |
| resend_domain_id | `text` | YES | - | - |
| scoped_key_id | `text` | YES | - | - |
| routes | `jsonb` | **NO** | `'{}'::jsonb` | - |
| provision_state | `text` | **NO** | `'pending'::text` | - |
| last_error | `text` | YES | - | - |
| lock_version | `integer(32)` | **NO** | `0` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_email_identities_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `venture_email_identities_domain_key`: UNIQUE (domain)

### Check Constraints
- `venture_email_identities_provision_state_check`: CHECK ((provision_state = ANY (ARRAY['pending'::text, 'registered'::text, 'domain_enrolled'::text, 'dns_written'::text, 'verified'::text, 'key_scoped'::text, 'routes_wired'::text, 'provisioned'::text, 'plan_mode'::text, 'failed'::text])))

## Indexes

- `idx_vei_active_state`
  ```sql
  CREATE INDEX idx_vei_active_state ON public.venture_email_identities USING btree (provision_state, updated_at) WHERE (provision_state <> ALL (ARRAY['provisioned'::text, 'plan_mode'::text, 'failed'::text]))
  ```
- `idx_vei_venture`
  ```sql
  CREATE INDEX idx_vei_venture ON public.venture_email_identities USING btree (venture_id) WHERE (venture_id IS NOT NULL)
  ```
- `venture_email_identities_domain_key`
  ```sql
  CREATE UNIQUE INDEX venture_email_identities_domain_key ON public.venture_email_identities USING btree (domain)
  ```
- `venture_email_identities_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_email_identities_pkey ON public.venture_email_identities USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_venture_email_identities (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
