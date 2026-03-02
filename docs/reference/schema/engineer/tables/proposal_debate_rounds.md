# proposal_debate_rounds Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-02T01:18:17.458Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| debate_id | `uuid` | **NO** | - | - |
| round_index | `integer(32)` | **NO** | - | - |
| started_at | `timestamp with time zone` | YES | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| persona_outputs | `jsonb` | **NO** | `'{}'::jsonb` | - |
| orchestrator_summary | `text` | YES | - | - |
| consensus_check | `jsonb` | YES | - | - |
| provider_calls | `jsonb` | YES | `'[]'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `proposal_debate_rounds_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `proposal_debate_rounds_debate_id_fkey`: debate_id → proposal_debates(id)

### Check Constraints
- `proposal_debate_rounds_round_index_check`: CHECK ((round_index >= 0))

## Indexes

- `idx_debate_rounds_debate_id`
  ```sql
  CREATE INDEX idx_debate_rounds_debate_id ON public.proposal_debate_rounds USING btree (debate_id)
  ```
- `idx_debate_rounds_debate_round`
  ```sql
  CREATE UNIQUE INDEX idx_debate_rounds_debate_round ON public.proposal_debate_rounds USING btree (debate_id, round_index)
  ```
- `proposal_debate_rounds_pkey`
  ```sql
  CREATE UNIQUE INDEX proposal_debate_rounds_pkey ON public.proposal_debate_rounds USING btree (id)
  ```

## RLS Policies

### 1. proposal_debate_rounds_read (SELECT)

- **Roles**: {public}
- **Using**: `(auth.role() = 'authenticated'::text)`

### 2. proposal_debate_rounds_service_all (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
