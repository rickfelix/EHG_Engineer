# agent_knowledge_base Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-18T00:33:06.277Z
**Rows**: 5
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| agent_code | `text` | **NO** | - | - |
| knowledge_type | `text` | YES | - | - |
| title | `text` | **NO** | - | - |
| content | `jsonb` | **NO** | - | - |
| tags | `ARRAY` | YES | - | - |
| confidence | `double precision(53)` | YES | - | - |
| usage_count | `integer(32)` | YES | `0` | - |
| last_used | `timestamp without time zone` | YES | - | - |
| related_sd_ids | `ARRAY` | YES | - | - |
| related_prd_ids | `ARRAY` | YES | - | - |
| related_knowledge_ids | `ARRAY` | YES | - | - |
| created_at | `timestamp without time zone` | YES | `now()` | - |
| updated_at | `timestamp without time zone` | YES | `now()` | - |
| expires_at | `timestamp without time zone` | YES | - | - |
| is_active | `boolean` | YES | `true` | - |

## Constraints

### Primary Key
- `agent_knowledge_base_pkey`: PRIMARY KEY (id)

### Check Constraints
- `agent_knowledge_base_confidence_check`: CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision)))
- `agent_knowledge_base_knowledge_type_check`: CHECK ((knowledge_type = ANY (ARRAY['finding'::text, 'rule'::text, 'pattern'::text, 'insight'::text])))

## Indexes

- `agent_knowledge_base_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_knowledge_base_pkey ON public.agent_knowledge_base USING btree (id)
  ```
- `idx_knowledge_agent`
  ```sql
  CREATE INDEX idx_knowledge_agent ON public.agent_knowledge_base USING btree (agent_code)
  ```
- `idx_knowledge_confidence`
  ```sql
  CREATE INDEX idx_knowledge_confidence ON public.agent_knowledge_base USING btree (confidence DESC)
  ```
- `idx_knowledge_tags`
  ```sql
  CREATE INDEX idx_knowledge_tags ON public.agent_knowledge_base USING gin (tags)
  ```
- `idx_knowledge_type`
  ```sql
  CREATE INDEX idx_knowledge_type ON public.agent_knowledge_base USING btree (knowledge_type)
  ```
- `idx_knowledge_usage`
  ```sql
  CREATE INDEX idx_knowledge_usage ON public.agent_knowledge_base USING btree (usage_count DESC)
  ```

## RLS Policies

### 1. authenticated_read_agent_knowledge_base (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_agent_knowledge_base (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
