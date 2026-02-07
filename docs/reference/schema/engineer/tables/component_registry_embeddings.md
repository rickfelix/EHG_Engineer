# component_registry_embeddings Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T11:58:03.214Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (20 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `uuid_generate_v4()` | - |
| component_name | `text` | **NO** | - | - |
| component_category | `text` | **NO** | - | - |
| registry_source | `text` | **NO** | - | - |
| description | `text` | **NO** | - | Human-readable description used for semantic matching and explanation generation |
| use_cases | `jsonb` | YES | `'[]'::jsonb` | - |
| trigger_keywords | `ARRAY` | YES | `'{}'::text[]` | - |
| install_command | `text` | **NO** | - | - |
| dependencies | `jsonb` | YES | `'[]'::jsonb` | - |
| registry_dependencies | `jsonb` | YES | `'[]'::jsonb` | - |
| docs_url | `text` | YES | - | - |
| implementation_notes | `text` | YES | - | - |
| example_code | `text` | YES | - | - |
| primary_use_case | `text` | YES | - | Main use case for explainability (shown in "Why recommended" reasoning) |
| bundle_size_kb | `integer(32)` | YES | `0` | Approximate bundle size impact (used for warning generation) |
| common_alternatives | `jsonb` | YES | `'[]'::jsonb` | Alternative components with tradeoffs (e.g., lighter/heavier versions) |
| description_embedding | `USER-DEFINED` | YES | - | OpenAI text-embedding-3-small (1536 dimensions) for semantic similarity search via pgvector |
| confidence_weight | `double precision(53)` | YES | `1.0` | Popularity multiplier (1.0 = neutral, >1.0 = boost popular components, <1.0 = less popular) |
| created_at | `timestamp without time zone` | YES | `now()` | - |
| updated_at | `timestamp without time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `component_registry_embeddings_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `component_registry_embeddings_component_name_registry_sourc_key`: UNIQUE (component_name, registry_source)

### Check Constraints
- `component_registry_embeddings_component_category_check`: CHECK ((component_category = ANY (ARRAY['ui'::text, 'ai'::text, 'voice'::text, 'extended'::text, 'blocks'::text])))
- `component_registry_embeddings_confidence_weight_check`: CHECK (((confidence_weight >= (0.5)::double precision) AND (confidence_weight <= (2.0)::double precision)))
- `component_registry_embeddings_registry_source_check`: CHECK ((registry_source = ANY (ARRAY['shadcn-ui'::text, 'ai-elements'::text, 'openai-voice'::text, 'kibo-ui'::text, 'blocks-so'::text, 'reui'::text])))

## Indexes

- `component_registry_embeddings_component_name_registry_sourc_key`
  ```sql
  CREATE UNIQUE INDEX component_registry_embeddings_component_name_registry_sourc_key ON public.component_registry_embeddings USING btree (component_name, registry_source)
  ```
- `component_registry_embeddings_pkey`
  ```sql
  CREATE UNIQUE INDEX component_registry_embeddings_pkey ON public.component_registry_embeddings USING btree (id)
  ```
- `idx_component_category`
  ```sql
  CREATE INDEX idx_component_category ON public.component_registry_embeddings USING btree (component_category)
  ```
- `idx_component_name`
  ```sql
  CREATE INDEX idx_component_name ON public.component_registry_embeddings USING btree (component_name)
  ```
- `idx_component_registry`
  ```sql
  CREATE INDEX idx_component_registry ON public.component_registry_embeddings USING btree (registry_source)
  ```

## RLS Policies

### 1. authenticated_read_component_registry_embeddings (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_component_registry_embeddings (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_component_embeddings_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_component_embeddings_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
