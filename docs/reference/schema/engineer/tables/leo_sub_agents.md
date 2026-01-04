# leo_sub_agents Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-04T20:01:25.156Z
**Rows**: 26
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `character varying(50)` | **NO** | `gen_random_uuid()` | - |
| code | `text` | **NO** | - | Sub-agent unique code identifier. QUICKFIX added 2025-11-17 for lightweight UAT issue resolution. |
| name | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| activation_type | `text` | YES | - | - |
| priority | `integer(32)` | YES | `0` | - |
| script_path | `text` | YES | - | - |
| context_file | `text` | YES | - | - |
| active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| capabilities | `jsonb` | YES | `'[]'::jsonb` | - |
| domain_embedding | `USER-DEFINED` | YES | - | - |
| embedding_generated_at | `timestamp with time zone` | YES | - | - |
| embedding_model | `character varying(100)` | YES | `'text-embedding-3-small'::character varying` | - |

## Constraints

### Primary Key
- `leo_sub_agents_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `leo_sub_agents_code_key`: UNIQUE (code)

### Check Constraints
- `leo_sub_agents_activation_type_check`: CHECK ((activation_type = ANY (ARRAY['automatic'::text, 'manual'::text])))

## Indexes

- `idx_leo_sub_agents_embedding`
  ```sql
  CREATE INDEX idx_leo_sub_agents_embedding ON public.leo_sub_agents USING ivfflat (domain_embedding vector_cosine_ops) WITH (lists='10')
  ```
- `leo_sub_agents_code_key`
  ```sql
  CREATE UNIQUE INDEX leo_sub_agents_code_key ON public.leo_sub_agents USING btree (code)
  ```
- `leo_sub_agents_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_sub_agents_pkey ON public.leo_sub_agents USING btree (id)
  ```

## RLS Policies

### 1. Anon users can read sub_agents (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. authenticated_read_leo_sub_agents (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. service_role_all_leo_sub_agents (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Usage Examples

_Common query patterns for this table:_


```javascript
// Get all active sub-agents
const { data, error } = await supabase
  .from('leo_sub_agents')
  .select('*')
  .eq('active', true)
  .order('priority', { ascending: false });

// Get sub-agent by code
const { data, error } = await supabase
  .from('leo_sub_agents')
  .select('*')
  .eq('code', 'DATABASE')
  .single();
```
---

[← Back to Schema Overview](../database-schema-overview.md)
