# agents Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-11T15:28:08.227Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| agent_key | `character varying(100)` | **NO** | - | - |
| name | `character varying(200)` | **NO** | - | - |
| role | `text` | **NO** | - | - |
| capabilities | `jsonb` | YES | `'[]'::jsonb` | - |
| permissions | `jsonb` | YES | `'{}'::jsonb` | - |
| status | `text` | **NO** | `'active'::text` | - |
| agent_type | `text` | **NO** | `'ceo'::text` | - |
| created_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `agents_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `agents_agent_key_key`: UNIQUE (agent_key)

### Check Constraints
- `agents_agent_type_check`: CHECK ((agent_type = ANY (ARRAY['ceo'::text, 'executive'::text, 'specialist'::text, 'advisor'::text])))
- `agents_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text])))

## Indexes

- `agents_agent_key_key`
  ```sql
  CREATE UNIQUE INDEX agents_agent_key_key ON public.agents USING btree (agent_key)
  ```
- `agents_pkey`
  ```sql
  CREATE UNIQUE INDEX agents_pkey ON public.agents USING btree (id)
  ```
- `idx_agents_key`
  ```sql
  CREATE INDEX idx_agents_key ON public.agents USING btree (agent_key)
  ```
- `idx_agents_status`
  ```sql
  CREATE INDEX idx_agents_status ON public.agents USING btree (status)
  ```
- `idx_agents_type`
  ```sql
  CREATE INDEX idx_agents_type ON public.agents USING btree (agent_type)
  ```

## RLS Policies

### 1. agents_authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. agents_chairman_full_access (ALL)

- **Roles**: {public}
- **Using**: `fn_is_chairman()`
- **With Check**: `fn_is_chairman()`

## Triggers

### trg_agents_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_agents_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
