# sd_capabilities Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-18T00:48:10.800Z
**Rows**: 206
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (24 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_uuid | `character varying` | **NO** | - | - |
| sd_id | `character varying(100)` | **NO** | - | - |
| capability_type | `character varying(50)` | **NO** | - | Capability type from formal taxonomy. Categories: ai_automation (agent, crew, tool, skill), infrastructure (database_schema, database_function, rls_policy, migration), application (api_endpoint, component, hook, service, utility), integration (workflow, webhook, external_integration), governance (validation_rule, quality_gate, protocol) |
| capability_key | `character varying(200)` | YES | - | TEMPORARILY NULLABLE: Investigating what inserts NULL values. Should be NOT NULL once root cause fixed. |
| action | `character varying(20)` | **NO** | - | - |
| action_details | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| category | `character varying(50)` | YES | - | - |
| name | `character varying(200)` | YES | - | - |
| description | `text` | YES | - | - |
| maturity_score | `integer(32)` | YES | `0` | Maturity level 0-5. Per taxonomy criteria: 0=concept, 1=basic, 2=functional, 3=reliable, 4=production-grade, 5=fully autonomous/published |
| extraction_score | `integer(32)` | YES | `0` | Extraction/reusability level 0-5. Per taxonomy: 0=hardcoded, 1=configurable, 2=adaptable, 3=generic, 4=published, 5=marketplace-ready |
| graph_centrality_score | `integer(32)` | YES | `0` | Graph centrality 0-5. Computed from dependency analysis and reuse count. Higher = more central to capability ecosystem |
| category_weight | `numeric(3,2)` | YES | `1.0` | Weight multiplier for Plane 1 scoring. ai_automation=1.5, governance=1.3, infrastructure=1.2, integration=1.1, application=1.0 |
| plane1_score | `numeric(5,2)` | YES | `0` | Computed Plane 1 score = (maturity + extraction + centrality) * category_weight. Max ~22.5 for AI capabilities |
| reuse_count | `integer(32)` | YES | `0` | Number of times this capability was reused in other SDs or ventures |
| reused_by_sds | `jsonb` | YES | `'[]'::jsonb` | Array of SD IDs that reuse this capability: [{sd_id, date, context}] |
| first_registered_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| last_reused_at | `timestamp without time zone` | YES | - | - |
| source_files | `jsonb` | YES | `'[]'::jsonb` | Array of file paths where this capability is implemented: ["lib/foo.js", "src/components/Bar.tsx"] |
| depends_on | `jsonb` | YES | `'[]'::jsonb` | Array of capability_keys this capability depends on |
| depended_by | `jsonb` | YES | `'[]'::jsonb` | Array of capability_keys that depend on this capability |
| taxonomy_domain | `text` | YES | - | - |

## Constraints

### Primary Key
- `sd_capabilities_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_capabilities_sd_uuid_fkey`: sd_uuid → strategic_directives_v2(id)

### Unique Constraints
- `sd_capabilities_sd_uuid_capability_key_action_key`: UNIQUE (sd_uuid, capability_key, action)

### Check Constraints
- `sd_capabilities_action_check`: CHECK (((action)::text = ANY ((ARRAY['registered'::character varying, 'updated'::character varying, 'deprecated'::character varying])::text[])))
- `sd_capabilities_capability_type_check`: CHECK (((capability_type)::text = ANY ((ARRAY['agent'::character varying, 'crew'::character varying, 'tool'::character varying, 'skill'::character varying, 'database_schema'::character varying, 'database_function'::character varying, 'rls_policy'::character varying, 'migration'::character varying, 'api_endpoint'::character varying, 'component'::character varying, 'hook'::character varying, 'service'::character varying, 'utility'::character varying, 'workflow'::character varying, 'webhook'::character varying, 'external_integration'::character varying, 'validation_rule'::character varying, 'quality_gate'::character varying, 'protocol'::character varying])::text[])))
- `sd_capabilities_category_check`: CHECK (((category)::text = ANY ((ARRAY['ai_automation'::character varying, 'infrastructure'::character varying, 'application'::character varying, 'integration'::character varying, 'governance'::character varying])::text[])))
- `sd_capabilities_extraction_score_check`: CHECK (((extraction_score >= 0) AND (extraction_score <= 5)))
- `sd_capabilities_graph_centrality_score_check`: CHECK (((graph_centrality_score >= 0) AND (graph_centrality_score <= 5)))
- `sd_capabilities_maturity_score_check`: CHECK (((maturity_score >= 0) AND (maturity_score <= 5)))

## Indexes

- `idx_sd_capabilities_action`
  ```sql
  CREATE INDEX idx_sd_capabilities_action ON public.sd_capabilities USING btree (action)
  ```
- `idx_sd_capabilities_capability_key`
  ```sql
  CREATE INDEX idx_sd_capabilities_capability_key ON public.sd_capabilities USING btree (capability_key)
  ```
- `idx_sd_capabilities_category`
  ```sql
  CREATE INDEX idx_sd_capabilities_category ON public.sd_capabilities USING btree (category)
  ```
- `idx_sd_capabilities_created_at`
  ```sql
  CREATE INDEX idx_sd_capabilities_created_at ON public.sd_capabilities USING btree (created_at)
  ```
- `idx_sd_capabilities_maturity`
  ```sql
  CREATE INDEX idx_sd_capabilities_maturity ON public.sd_capabilities USING btree (maturity_score)
  ```
- `idx_sd_capabilities_plane1`
  ```sql
  CREATE INDEX idx_sd_capabilities_plane1 ON public.sd_capabilities USING btree (plane1_score DESC)
  ```
- `idx_sd_capabilities_reuse_count`
  ```sql
  CREATE INDEX idx_sd_capabilities_reuse_count ON public.sd_capabilities USING btree (reuse_count DESC)
  ```
- `idx_sd_capabilities_sd_uuid`
  ```sql
  CREATE INDEX idx_sd_capabilities_sd_uuid ON public.sd_capabilities USING btree (sd_uuid)
  ```
- `sd_capabilities_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_capabilities_pkey ON public.sd_capabilities USING btree (id)
  ```
- `sd_capabilities_sd_uuid_capability_key_action_key`
  ```sql
  CREATE UNIQUE INDEX sd_capabilities_sd_uuid_capability_key_action_key ON public.sd_capabilities USING btree (sd_uuid, capability_key, action)
  ```

## RLS Policies

### 1. Authenticated users can read sd_capabilities (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Service role full access on sd_capabilities (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 3. authenticated_read_sd_capabilities (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trg_compute_plane1_score

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION fn_compute_plane1_score()`

### trg_compute_plane1_score

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION fn_compute_plane1_score()`

---

[← Back to Schema Overview](../database-schema-overview.md)
