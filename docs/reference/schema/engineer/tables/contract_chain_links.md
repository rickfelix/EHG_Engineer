# contract_chain_links Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| parent_contract_type | `text` | **NO** | - | - |
| parent_contract_id | `uuid` | **NO** | - | - |
| child_contract_type | `text` | **NO** | - | - |
| child_contract_id | `uuid` | **NO** | - | - |
| link_type | `text` | **NO** | - | - |
| link_status | `text` | **NO** | `'active'::text` | - |
| correlation_id | `uuid` | YES | `gen_random_uuid()` | - |
| schema_version | `text` | **NO** | `'1.0.0'::text` | - |
| vocabulary_version | `text` | **NO** | `'1.0.0'::text` | - |
| smoke_test_passed_at | `timestamp with time zone` | YES | - | - |
| runtime_observed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `contract_chain_links_pkey`: PRIMARY KEY (id)

### Check Constraints
- `contract_chain_links_child_type_check`: CHECK ((child_contract_type = ANY (ARRAY['sd'::text, 'prd'::text, 'handoff'::text, 'user_story'::text, 'sub_agent_result'::text, 'retro'::text])))
- `contract_chain_links_link_status_check`: CHECK ((link_status = ANY (ARRAY['active'::text, 'superseded'::text, 'broken'::text])))
- `contract_chain_links_link_type_check`: CHECK ((link_type = ANY (ARRAY['produces'::text, 'consumes'::text, 'validates'::text, 'blocks'::text])))
- `contract_chain_links_parent_type_check`: CHECK ((parent_contract_type = ANY (ARRAY['sd'::text, 'prd'::text, 'handoff'::text, 'user_story'::text])))

## Indexes

- `contract_chain_links_pkey`
  ```sql
  CREATE UNIQUE INDEX contract_chain_links_pkey ON public.contract_chain_links USING btree (id)
  ```
- `idx_contract_chain_links_child`
  ```sql
  CREATE INDEX idx_contract_chain_links_child ON public.contract_chain_links USING btree (child_contract_type, child_contract_id)
  ```
- `idx_contract_chain_links_correlation`
  ```sql
  CREATE INDEX idx_contract_chain_links_correlation ON public.contract_chain_links USING btree (correlation_id)
  ```
- `idx_contract_chain_links_parent`
  ```sql
  CREATE INDEX idx_contract_chain_links_parent ON public.contract_chain_links USING btree (parent_contract_type, parent_contract_id)
  ```
- `idx_contract_chain_links_status`
  ```sql
  CREATE INDEX idx_contract_chain_links_status ON public.contract_chain_links USING btree (link_status)
  ```

## RLS Policies

### 1. contract_chain_links_read_all (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
