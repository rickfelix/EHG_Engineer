# agent_skills Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T14:34:13.063Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| skill_key | `character varying(100)` | **NO** | - | - |
| name | `character varying(200)` | **NO** | - | - |
| version | `character varying(20)` | **NO** | `'1.0.0'::character varying` | - |
| description | `text` | YES | - | - |
| triggers | `jsonb` | **NO** | `'[]'::jsonb` | Array of keyword strings that trigger this skill injection |
| context_keywords | `jsonb` | **NO** | `'[]'::jsonb` | - |
| required_tools | `jsonb` | **NO** | `'[]'::jsonb` | - |
| context_access | `character varying(20)` | YES | `'readonly'::character varying` | - |
| agent_scope | `jsonb` | **NO** | `'[]'::jsonb` | Agent codes that can use this skill (empty array = all agents) |
| category_scope | `jsonb` | **NO** | `'[]'::jsonb` | - |
| dependencies | `jsonb` | **NO** | `'[]'::jsonb` | - |
| content_hash | `character varying(64)` | YES | - | - |
| file_path | `character varying(500)` | YES | - | - |
| active | `boolean` | **NO** | `true` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `agent_skills_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `agent_skills_skill_key_key`: UNIQUE (skill_key)

### Check Constraints
- `chk_skill_context_access`: CHECK (((context_access)::text = ANY ((ARRAY['full'::character varying, 'readonly'::character varying, 'minimal'::character varying])::text[])))
- `chk_skill_version`: CHECK (((version)::text ~ '^\d+\.\d+\.\d+$'::text))

## Indexes

- `agent_skills_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_skills_pkey ON public.agent_skills USING btree (id)
  ```
- `agent_skills_skill_key_key`
  ```sql
  CREATE UNIQUE INDEX agent_skills_skill_key_key ON public.agent_skills USING btree (skill_key)
  ```
- `idx_agent_skills_active`
  ```sql
  CREATE INDEX idx_agent_skills_active ON public.agent_skills USING btree (active) WHERE (active = true)
  ```
- `idx_agent_skills_agent_scope`
  ```sql
  CREATE INDEX idx_agent_skills_agent_scope ON public.agent_skills USING gin (agent_scope)
  ```
- `idx_agent_skills_context`
  ```sql
  CREATE INDEX idx_agent_skills_context ON public.agent_skills USING gin (context_keywords)
  ```
- `idx_agent_skills_triggers`
  ```sql
  CREATE INDEX idx_agent_skills_triggers ON public.agent_skills USING gin (triggers)
  ```

## Triggers

### trg_agent_skills_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_agent_skills_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
