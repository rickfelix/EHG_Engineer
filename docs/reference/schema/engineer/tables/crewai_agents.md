# crewai_agents Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-09T04:05:18.684Z
**Rows**: 80
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (45 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | - | - |
| agent_key | `text` | YES | - | - |
| name | `text` | YES | - | - |
| role | `text` | YES | - | - |
| goal | `text` | YES | - | - |
| backstory | `text` | YES | - | - |
| department_id | `uuid` | YES | - | - |
| tools | `jsonb` | YES | - | - |
| llm_model | `text` | YES | - | - |
| max_tokens | `integer(32)` | YES | - | - |
| temperature | `numeric` | YES | - | - |
| status | `text` | YES | - | - |
| execution_count | `integer(32)` | YES | - | - |
| avg_execution_time_ms | `integer(32)` | YES | - | - |
| last_executed_at | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |
| max_rpm | `integer(32)` | YES | - | - |
| max_iter | `integer(32)` | YES | - | - |
| max_execution_time | `integer(32)` | YES | - | - |
| max_retry_limit | `integer(32)` | YES | - | - |
| allow_delegation | `boolean` | YES | - | - |
| allow_code_execution | `boolean` | YES | - | - |
| code_execution_mode | `text` | YES | - | - |
| respect_context_window | `boolean` | YES | - | - |
| cache_enabled | `boolean` | YES | - | - |
| memory_enabled | `boolean` | YES | - | - |
| memory_config_id | `text` | YES | - | - |
| reasoning_enabled | `boolean` | YES | - | - |
| max_reasoning_attempts | `integer(32)` | YES | - | - |
| system_template | `text` | YES | - | - |
| prompt_template | `text` | YES | - | - |
| response_template | `text` | YES | - | - |
| inject_date | `boolean` | YES | - | - |
| date_format | `text` | YES | - | - |
| multimodal_enabled | `boolean` | YES | - | - |
| function_calling_llm | `text` | YES | - | - |
| use_system_prompt | `boolean` | YES | - | - |
| knowledge_sources | `jsonb` | YES | - | - |
| embedder_config | `text` | YES | - | - |
| verbose | `boolean` | YES | - | - |
| step_callback_url | `text` | YES | - | - |
| compatible_stages | `jsonb` | YES | - | - |
| avg_cost_usd | `integer(32)` | YES | - | - |
| success_rate | `integer(32)` | YES | - | - |

## Constraints

### Primary Key
- `crewai_agents_pkey`: PRIMARY KEY (id)

## Indexes

- `crewai_agents_pkey`
  ```sql
  CREATE UNIQUE INDEX crewai_agents_pkey ON public.crewai_agents USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_crewai_agents (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_crewai_agents (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
