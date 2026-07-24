# venture_db_secrets Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| db_provider | `text` | **NO** | - | - |
| connection_url | `text` | YES | - | - |
| secret_ref | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_db_secrets_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `venture_db_secrets_venture_id_key`: UNIQUE (venture_id)

### Check Constraints
- `venture_db_secrets_db_provider_check`: CHECK ((db_provider = ANY (ARRAY['d1'::text, 'neon'::text, 'replit-postgres'::text])))

## Indexes

- `idx_venture_db_secrets_venture`
  ```sql
  CREATE INDEX idx_venture_db_secrets_venture ON public.venture_db_secrets USING btree (venture_id)
  ```
- `venture_db_secrets_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_db_secrets_pkey ON public.venture_db_secrets USING btree (id)
  ```
- `venture_db_secrets_venture_id_key`
  ```sql
  CREATE UNIQUE INDEX venture_db_secrets_venture_id_key ON public.venture_db_secrets USING btree (venture_id)
  ```

## RLS Policies

### 1. venture_db_secrets_read (SELECT)

- **Roles**: {public}
- **Using**: `((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text))`

### 2. venture_db_secrets_service_write (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
