# pattern_subagent_mapping Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-20T23:43:09.361Z
**Rows**: 59
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('pattern_subagent_mapping_id_seq'::regclass)` | - |
| pattern_id | `character varying(50)` | **NO** | - | - |
| sub_agent_code | `character varying(50)` | **NO** | - | - |
| mapping_type | `character varying(20)` | **NO** | - | - |
| trigger_phrase | `character varying(500)` | YES | - | - |
| trigger_id | `uuid` | YES | - | - |
| confidence | `numeric(3,2)` | YES | `1.0` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `pattern_subagent_mapping_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `pattern_subagent_mapping_pattern_id_sub_agent_code_key`: UNIQUE (pattern_id, sub_agent_code)

### Check Constraints
- `pattern_subagent_mapping_mapping_type_check`: CHECK (((mapping_type)::text = ANY ((ARRAY['category'::character varying, 'keyword'::character varying, 'manual'::character varying])::text[])))

## Indexes

- `idx_pattern_subagent_mapping_pattern`
  ```sql
  CREATE INDEX idx_pattern_subagent_mapping_pattern ON public.pattern_subagent_mapping USING btree (pattern_id)
  ```
- `idx_pattern_subagent_mapping_subagent`
  ```sql
  CREATE INDEX idx_pattern_subagent_mapping_subagent ON public.pattern_subagent_mapping USING btree (sub_agent_code)
  ```
- `idx_pattern_subagent_mapping_type`
  ```sql
  CREATE INDEX idx_pattern_subagent_mapping_type ON public.pattern_subagent_mapping USING btree (mapping_type)
  ```
- `pattern_subagent_mapping_pattern_id_sub_agent_code_key`
  ```sql
  CREATE UNIQUE INDEX pattern_subagent_mapping_pattern_id_sub_agent_code_key ON public.pattern_subagent_mapping USING btree (pattern_id, sub_agent_code)
  ```
- `pattern_subagent_mapping_pkey`
  ```sql
  CREATE UNIQUE INDEX pattern_subagent_mapping_pkey ON public.pattern_subagent_mapping USING btree (id)
  ```

## RLS Policies

### 1. Anon users can read pattern_subagent_mapping (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. authenticated_select_pattern_subagent_mapping (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. service_role_all_pattern_subagent_mapping (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trigger_pattern_subagent_mapping_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_pattern_subagent_mapping_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
