# org_agent_identities Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 844
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| role_key | `text` | **NO** | - | - |
| display_name | `text` | YES | - | - |
| status | `text` | **NO** | `'active'::text` | - |
| context_profile | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `org_agent_identities_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `org_agent_identities_role_key_fkey`: role_key → org_agent_roles(role_key)

### Unique Constraints
- `org_agent_identities_venture_id_role_key_key`: UNIQUE (venture_id, role_key)

### Check Constraints
- `org_agent_identities_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'retired'::text])))

## Indexes

- `idx_org_agent_identities_venture`
  ```sql
  CREATE INDEX idx_org_agent_identities_venture ON public.org_agent_identities USING btree (venture_id)
  ```
- `org_agent_identities_pkey`
  ```sql
  CREATE UNIQUE INDEX org_agent_identities_pkey ON public.org_agent_identities USING btree (id)
  ```
- `org_agent_identities_shared_role_key_uidx`
  ```sql
  CREATE UNIQUE INDEX org_agent_identities_shared_role_key_uidx ON public.org_agent_identities USING btree (role_key) WHERE (venture_id IS NULL)
  ```
- `org_agent_identities_venture_id_role_key_key`
  ```sql
  CREATE UNIQUE INDEX org_agent_identities_venture_id_role_key_key ON public.org_agent_identities USING btree (venture_id, role_key)
  ```

## RLS Policies

### 1. service_role_all_org_agent_identities (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
