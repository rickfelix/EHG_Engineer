# board_members Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-06T17:27:38.102Z
**Rows**: 7
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| agent_id | `uuid` | YES | - | - |
| board_role | `character varying(100)` | **NO** | - | - |
| voting_weight | `numeric(3,2)` | YES | `1.0` | - |
| expertise_domains | `ARRAY` | **NO** | - | - |
| appointment_date | `timestamp with time zone` | YES | `now()` | - |
| status | `character varying(20)` | YES | `'active'::character varying` | - |
| metadata | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `board_members_pkey`: PRIMARY KEY (id)

### Check Constraints
- `board_members_status_check`: CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'removed'::character varying])::text[])))

## Indexes

- `board_members_pkey`
  ```sql
  CREATE UNIQUE INDEX board_members_pkey ON public.board_members USING btree (id)
  ```
- `idx_board_members_agent_id`
  ```sql
  CREATE INDEX idx_board_members_agent_id ON public.board_members USING btree (agent_id)
  ```
- `idx_board_members_status`
  ```sql
  CREATE INDEX idx_board_members_status ON public.board_members USING btree (status)
  ```

## RLS Policies

### 1. anon_read_board_members (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. board_members_service_role_access (ALL)

- **Roles**: {authenticated}
- **Using**: `fn_is_service_role()`
- **With Check**: `fn_is_service_role()`

---

[← Back to Schema Overview](../database-schema-overview.md)
