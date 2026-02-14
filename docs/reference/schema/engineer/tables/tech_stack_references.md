# tech_stack_references Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T22:06:06.603Z
**Rows**: 0
**RLS**: Enabled (8 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying(50)` | **NO** | - | - |
| tech_stack | `text` | **NO** | - | - |
| source | `character varying(20)` | **NO** | - | Source of reference: local (retrospectives) or context7 (MCP) |
| reference_url | `text` | YES | - | - |
| code_snippet | `text` | YES | - | - |
| pros_cons_analysis | `jsonb` | YES | - | - |
| confidence_score | `numeric(3,2)` | YES | - | Confidence score 0-1 for relevance of this reference |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| expires_at | `timestamp with time zone` | **NO** | - | TTL expiration timestamp (24 hours from creation) |

## Constraints

### Primary Key
- `tech_stack_references_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `tech_stack_references_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Unique Constraints
- `tech_stack_references_sd_id_tech_stack_source_key`: UNIQUE (sd_id, tech_stack, source)

### Check Constraints
- `tech_stack_references_confidence_score_check`: CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric)))
- `tech_stack_references_source_check`: CHECK (((source)::text = ANY ((ARRAY['local'::character varying, 'context7'::character varying])::text[])))

## Indexes

- `idx_tech_stack_references_expires`
  ```sql
  CREATE INDEX idx_tech_stack_references_expires ON public.tech_stack_references USING btree (expires_at)
  ```
- `idx_tech_stack_references_sd`
  ```sql
  CREATE INDEX idx_tech_stack_references_sd ON public.tech_stack_references USING btree (sd_id)
  ```
- `tech_stack_references_pkey`
  ```sql
  CREATE UNIQUE INDEX tech_stack_references_pkey ON public.tech_stack_references USING btree (id)
  ```
- `tech_stack_references_sd_id_tech_stack_source_key`
  ```sql
  CREATE UNIQUE INDEX tech_stack_references_sd_id_tech_stack_source_key ON public.tech_stack_references USING btree (sd_id, tech_stack, source)
  ```

## RLS Policies

### 1. Allow anon users to delete tech_stack_references (DELETE)

- **Roles**: {anon}
- **Using**: `true`

### 2. Allow anon users to insert tech_stack_references (INSERT)

- **Roles**: {anon}
- **With Check**: `true`

### 3. Allow anon users to select tech_stack_references (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 4. Allow anon users to update tech_stack_references (UPDATE)

- **Roles**: {anon}
- **Using**: `true`
- **With Check**: `true`

### 5. Allow authenticated users to delete tech_stack_references (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 6. Allow authenticated users to read tech_stack_references (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 7. Allow authenticated users to update tech_stack_references (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 8. insert_tech_stack_references_policy (INSERT)

- **Roles**: {public}
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
