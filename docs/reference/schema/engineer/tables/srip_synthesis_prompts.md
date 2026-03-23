# srip_synthesis_prompts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-23T17:34:16.821Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| site_dna_id | `uuid` | YES | - | - |
| brand_interview_id | `uuid` | YES | - | - |
| prompt_text | `text` | **NO** | - | The full synthesized prompt text combining design DNA and brand context for one-shot site replication. |
| fidelity_target | `numeric(5,2)` | YES | `80.00` | Target fidelity score (0-100) that the generated site should achieve against the reference. |
| version | `integer(32)` | YES | `1` | Version number for prompt iterations. New versions supersede previous ones. |
| token_count | `integer(32)` | YES | - | Estimated token length of the prompt for LLM context budget planning. |
| status | `character varying(20)` | YES | `'draft'::character varying` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `character varying(100)` | YES | - | - |

## Constraints

### Primary Key
- `srip_synthesis_prompts_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `srip_synthesis_prompts_brand_interview_id_fkey`: brand_interview_id → srip_brand_interviews(id)
- `srip_synthesis_prompts_site_dna_id_fkey`: site_dna_id → srip_site_dna(id)
- `srip_synthesis_prompts_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `srip_synthesis_prompts_status_check`: CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'superseded'::character varying])::text[])))

## Indexes

- `idx_srip_synthesis_prompts_status`
  ```sql
  CREATE INDEX idx_srip_synthesis_prompts_status ON public.srip_synthesis_prompts USING btree (status)
  ```
- `idx_srip_synthesis_prompts_venture_id`
  ```sql
  CREATE INDEX idx_srip_synthesis_prompts_venture_id ON public.srip_synthesis_prompts USING btree (venture_id)
  ```
- `srip_synthesis_prompts_pkey`
  ```sql
  CREATE UNIQUE INDEX srip_synthesis_prompts_pkey ON public.srip_synthesis_prompts USING btree (id)
  ```

## RLS Policies

### 1. srip_synthesis_prompts_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. srip_synthesis_prompts_venture_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 3. srip_synthesis_prompts_venture_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 4. srip_synthesis_prompts_venture_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

---

[← Back to Schema Overview](../database-schema-overview.md)
