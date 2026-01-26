# releases Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-26T04:26:11.529Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| version | `character varying(50)` | YES | - | - |
| name | `character varying(100)` | YES | - | - |
| status | `character varying(20)` | YES | `'planned'::character varying` | - |
| target_date | `date` | YES | - | - |
| shipped_at | `timestamp with time zone` | YES | - | - |
| notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `releases_pkey`: PRIMARY KEY (id)

### Check Constraints
- `releases_status_check`: CHECK (((status)::text = ANY ((ARRAY['planned'::character varying, 'active'::character varying, 'shipped'::character varying])::text[])))

## Indexes

- `idx_releases_status`
  ```sql
  CREATE INDEX idx_releases_status ON public.releases USING btree (status)
  ```
- `idx_releases_target`
  ```sql
  CREATE INDEX idx_releases_target ON public.releases USING btree (target_date)
  ```
- `idx_releases_venture`
  ```sql
  CREATE INDEX idx_releases_venture ON public.releases USING btree (venture_id)
  ```
- `releases_pkey`
  ```sql
  CREATE UNIQUE INDEX releases_pkey ON public.releases USING btree (id)
  ```

## RLS Policies

### 1. delete_releases_policy (DELETE)

- **Roles**: {service_role}
- **Using**: `true`

### 2. insert_releases_policy (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 3. select_releases_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. update_releases_policy (UPDATE)

- **Roles**: {service_role}
- **Using**: `true`

## Triggers

### trigger_update_releases_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_releases_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
