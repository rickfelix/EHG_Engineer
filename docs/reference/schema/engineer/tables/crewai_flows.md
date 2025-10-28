# crewai_flows Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| flow_key | `character varying(100)` | **NO** | - | - |
| flow_name | `character varying(200)` | **NO** | - | - |
| description | `text` | YES | - | - |
| flow_definition | `jsonb` | **NO** | - | JSON from React Flow: nodes, edges, positions, configurations |
| python_code | `text` | YES | - | Auto-generated Python code using CrewAI Flows decorators (@start, @listen, @router) |
| status | `character varying(20)` | YES | `'draft'::character varying` | - |
| version | `integer(32)` | YES | `1` | - |
| parent_flow_id | `uuid` | YES | - | - |
| created_by | `uuid` | YES | - | - |
| updated_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| published_at | `timestamp with time zone` | YES | - | - |
| metadata | `jsonb` | YES | - | - |
| tags | `ARRAY` | YES | `ARRAY[]::text[]` | - |
| execution_count | `integer(32)` | YES | `0` | - |
| last_executed_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `crewai_flows_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `crewai_flows_parent_flow_id_fkey`: parent_flow_id → crewai_flows(id)

### Unique Constraints
- `crewai_flows_flow_key_key`: UNIQUE (flow_key)

### Check Constraints
- `crewai_flows_status_check`: CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'archived'::character varying, 'deprecated'::character varying])::text[])))

## Indexes

- `crewai_flows_flow_key_key`
  ```sql
  CREATE UNIQUE INDEX crewai_flows_flow_key_key ON public.crewai_flows USING btree (flow_key)
  ```
- `crewai_flows_pkey`
  ```sql
  CREATE UNIQUE INDEX crewai_flows_pkey ON public.crewai_flows USING btree (id)
  ```
- `idx_crewai_flows_created_at`
  ```sql
  CREATE INDEX idx_crewai_flows_created_at ON public.crewai_flows USING btree (created_at DESC)
  ```
- `idx_crewai_flows_created_by`
  ```sql
  CREATE INDEX idx_crewai_flows_created_by ON public.crewai_flows USING btree (created_by)
  ```
- `idx_crewai_flows_search`
  ```sql
  CREATE INDEX idx_crewai_flows_search ON public.crewai_flows USING gin (to_tsvector('english'::regconfig, (((COALESCE(flow_name, ''::character varying))::text || ' '::text) || COALESCE(description, ''::text))))
  ```
- `idx_crewai_flows_status`
  ```sql
  CREATE INDEX idx_crewai_flows_status ON public.crewai_flows USING btree (status)
  ```
- `idx_crewai_flows_tags`
  ```sql
  CREATE INDEX idx_crewai_flows_tags ON public.crewai_flows USING gin (tags)
  ```

## RLS Policies

### 1. flows_create_own (INSERT)

- **Roles**: {public}
- **With Check**: `(auth.uid() = created_by)`

### 2. flows_delete_own_draft (DELETE)

- **Roles**: {public}
- **Using**: `((auth.uid() = created_by) AND ((status)::text = 'draft'::text))`

### 3. flows_read_active (SELECT)

- **Roles**: {public}
- **Using**: `(((status)::text = 'active'::text) OR ((status)::text = 'draft'::text))`

### 4. flows_update_own (UPDATE)

- **Roles**: {public}
- **Using**: `(auth.uid() = created_by)`

## Triggers

### flows_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
