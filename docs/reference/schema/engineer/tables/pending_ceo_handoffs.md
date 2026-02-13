# pending_ceo_handoffs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T20:38:04.433Z
**Rows**: 4
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| handoff_type | `character varying(50)` | YES | `'stage_transition'::character varying` | - |
| from_stage | `integer(32)` | YES | - | - |
| to_stage | `integer(32)` | YES | - | - |
| vp_agent_id | `text` | YES | - | - |
| handoff_data | `jsonb` | YES | `'{}'::jsonb` | - |
| status | `character varying(30)` | YES | `'pending'::character varying` | - |
| proposed_at | `timestamp with time zone` | YES | `now()` | - |
| reviewed_by | `text` | YES | - | - |
| reviewed_at | `timestamp with time zone` | YES | - | - |
| review_notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `pending_ceo_handoffs_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `pending_ceo_handoffs_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `chk_stage_values_for_transitions`: CHECK ((((handoff_type)::text = 'strategic_pivot'::text) OR ((from_stage IS NOT NULL) AND (to_stage IS NOT NULL))))
- `pending_ceo_handoffs_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'changes_requested'::character varying])::text[])))

## Indexes

- `idx_pending_ceo_handoffs_status`
  ```sql
  CREATE INDEX idx_pending_ceo_handoffs_status ON public.pending_ceo_handoffs USING btree (status) WHERE ((status)::text = 'pending'::text)
  ```
- `idx_pending_ceo_handoffs_status_created`
  ```sql
  CREATE INDEX idx_pending_ceo_handoffs_status_created ON public.pending_ceo_handoffs USING btree (status, created_at)
  ```
- `idx_pending_ceo_handoffs_venture`
  ```sql
  CREATE INDEX idx_pending_ceo_handoffs_venture ON public.pending_ceo_handoffs USING btree (venture_id)
  ```
- `pending_ceo_handoffs_pkey`
  ```sql
  CREATE UNIQUE INDEX pending_ceo_handoffs_pkey ON public.pending_ceo_handoffs USING btree (id)
  ```

## RLS Policies

### 1. pending_ceo_handoffs_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. pending_ceo_handoffs_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
