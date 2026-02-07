# user_organizations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T22:23:03.207Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (5 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| user_id | `uuid` | **NO** | - | - |
| organization_id | `uuid` | **NO** | - | - |
| role | `text` | **NO** | `'member'::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `user_organizations_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `user_organizations_user_id_organization_id_key`: UNIQUE (user_id, organization_id)

### Check Constraints
- `user_organizations_role_check`: CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'evaluator'::text, 'member'::text])))

## Indexes

- `idx_user_organizations_org_id`
  ```sql
  CREATE INDEX idx_user_organizations_org_id ON public.user_organizations USING btree (organization_id)
  ```
- `idx_user_organizations_user_id`
  ```sql
  CREATE INDEX idx_user_organizations_user_id ON public.user_organizations USING btree (user_id)
  ```
- `user_organizations_pkey`
  ```sql
  CREATE UNIQUE INDEX user_organizations_pkey ON public.user_organizations USING btree (id)
  ```
- `user_organizations_user_id_organization_id_key`
  ```sql
  CREATE UNIQUE INDEX user_organizations_user_id_organization_id_key ON public.user_organizations USING btree (user_id, organization_id)
  ```

## RLS Policies

### 1. Users can view their own org memberships (SELECT)

- **Roles**: {public}
- **Using**: `(user_id = auth.uid())`

---

[← Back to Schema Overview](../database-schema-overview.md)
