# chairman_directives Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T18:04:39.649Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| command_text | `text` | **NO** | - | - |
| venture_id | `uuid` | YES | - | - |
| portfolio_id | `uuid` | YES | - | - |
| status | `character varying(30)` | **NO** | `'processing'::character varying` | - |
| priority | `character varying(10)` | **NO** | `'normal'::character varying` | - |
| issued_by | `uuid` | YES | - | - |
| correlation_id | `uuid` | YES | - | - |
| eva_interpretation | `jsonb` | YES | `'{}'::jsonb` | - |
| eva_response | `text` | YES | - | - |
| result | `jsonb` | YES | `'{}'::jsonb` | - |
| error_message | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| delegated_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `chairman_directives_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `chairman_directives_issued_by_fkey`: issued_by → users(id)
- `chairman_directives_portfolio_id_fkey`: portfolio_id → portfolios(id)
- `chairman_directives_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `chairman_directives_priority_check`: CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying, 'urgent'::character varying])::text[])))
- `chairman_directives_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'running'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying, 'partial_success'::character varying, 'completed_with_errors'::character varying, 'delegated'::character varying, 'active'::character varying])::text[])))

## Indexes

- `chairman_directives_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_directives_pkey ON public.chairman_directives USING btree (id)
  ```
- `idx_chairman_directives_created`
  ```sql
  CREATE INDEX idx_chairman_directives_created ON public.chairman_directives USING btree (created_at DESC)
  ```
- `idx_chairman_directives_issued_by`
  ```sql
  CREATE INDEX idx_chairman_directives_issued_by ON public.chairman_directives USING btree (issued_by)
  ```
- `idx_chairman_directives_status`
  ```sql
  CREATE INDEX idx_chairman_directives_status ON public.chairman_directives USING btree (status)
  ```
- `idx_chairman_directives_venture`
  ```sql
  CREATE INDEX idx_chairman_directives_venture ON public.chairman_directives USING btree (venture_id)
  ```
- `idx_directive_correlation`
  ```sql
  CREATE INDEX idx_directive_correlation ON public.chairman_directives USING btree (correlation_id)
  ```

## RLS Policies

### 1. chairman_directives_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `fn_is_chairman()`

### 2. chairman_directives_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`

### 3. chairman_directives_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 4. chairman_directives_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`
- **With Check**: `fn_is_chairman()`

## Triggers

### update_chairman_directives_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
