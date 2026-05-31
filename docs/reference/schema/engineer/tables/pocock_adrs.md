# pocock_adrs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-31T01:03:56.712Z
**Rows**: 12
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| adr_number | `integer(32)` | **NO** | - | - |
| slug | `text` | **NO** | - | - |
| title | `text` | **NO** | - | - |
| body | `text` | **NO** | - | - |
| status | `text` | **NO** | `'proposed'::text` | - |
| superseded_by | `uuid` | YES | - | - |
| source_pivot_event_id | `text` | YES | - | - |
| source_brainstorm_id | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| accepted_at | `timestamp with time zone` | YES | - | - |
| approved_by | `text` | YES | - | - |
| provenance_source | `text` | YES | - | AI-provenance source per Pocock pattern. Format: agent:SEAT:ROUND_ID | human:USER_ID. NULL = legacy / human-authored. SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-F. |

## Constraints

### Primary Key
- `pocock_adrs_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `pocock_adrs_source_brainstorm_id_fkey`: source_brainstorm_id → brainstorm_sessions(id)
- `pocock_adrs_superseded_by_fkey`: superseded_by → pocock_adrs(id)

### Unique Constraints
- `pocock_adrs_adr_number_key`: UNIQUE (adr_number)
- `pocock_adrs_slug_key`: UNIQUE (slug)

### Check Constraints
- `pocock_adrs_body_check`: CHECK ((length(body) <= 800))
- `pocock_adrs_status_check`: CHECK ((status = ANY (ARRAY['proposed'::text, 'accepted'::text, 'deprecated'::text, 'superseded'::text])))

## Indexes

- `idx_pocock_adrs_adr_number`
  ```sql
  CREATE INDEX idx_pocock_adrs_adr_number ON public.pocock_adrs USING btree (adr_number)
  ```
- `idx_pocock_adrs_status`
  ```sql
  CREATE INDEX idx_pocock_adrs_status ON public.pocock_adrs USING btree (status)
  ```
- `pocock_adrs_adr_number_key`
  ```sql
  CREATE UNIQUE INDEX pocock_adrs_adr_number_key ON public.pocock_adrs USING btree (adr_number)
  ```
- `pocock_adrs_pkey`
  ```sql
  CREATE UNIQUE INDEX pocock_adrs_pkey ON public.pocock_adrs USING btree (id)
  ```
- `pocock_adrs_slug_key`
  ```sql
  CREATE UNIQUE INDEX pocock_adrs_slug_key ON public.pocock_adrs USING btree (slug)
  ```

## RLS Policies

### 1. pocock_adrs_authenticated_read_accepted (SELECT)

- **Roles**: {authenticated}
- **Using**: `(status = 'accepted'::text)`

### 2. pocock_adrs_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
