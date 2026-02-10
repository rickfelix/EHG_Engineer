# context_embeddings Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-10T05:38:09.001Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| context_hash | `character varying(64)` | **NO** | - | - |
| interaction_id | `uuid` | YES | - | - |
| embedding_vector | `USER-DEFINED` | YES | - | - |
| embedding_model | `character varying(100)` | **NO** | `'text-embedding-ada-002'::character varying` | - |
| context_type | `character varying(50)` | **NO** | - | - |
| context_summary | `text` | YES | - | - |
| successful_agents | `jsonb` | YES | - | - |
| context_complexity | `numeric(3,2)` | YES | - | - |
| similarity_matches | `integer(32)` | **NO** | `0` | - |
| avg_match_success | `numeric(3,2)` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| last_matched | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `context_embeddings_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `context_embeddings_interaction_id_fkey`: interaction_id → interaction_history(id)

### Unique Constraints
- `context_embeddings_context_hash_key`: UNIQUE (context_hash)

## Indexes

- `context_embeddings_context_hash_key`
  ```sql
  CREATE UNIQUE INDEX context_embeddings_context_hash_key ON public.context_embeddings USING btree (context_hash)
  ```
- `context_embeddings_pkey`
  ```sql
  CREATE UNIQUE INDEX context_embeddings_pkey ON public.context_embeddings USING btree (id)
  ```
- `idx_context_hash`
  ```sql
  CREATE INDEX idx_context_hash ON public.context_embeddings USING btree (context_hash)
  ```
- `idx_embedding_performance`
  ```sql
  CREATE INDEX idx_embedding_performance ON public.context_embeddings USING btree (avg_match_success DESC, similarity_matches DESC)
  ```

## RLS Policies

### 1. authenticated_read_context_embeddings (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_context_embeddings (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
