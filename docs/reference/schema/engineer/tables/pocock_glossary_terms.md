# pocock_glossary_terms Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-06-04T01:27:20.155Z
**Rows**: 30
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| term | `text` | **NO** | - | - |
| definition | `text` | **NO** | - | - |
| avoid_aliases | `ARRAY` | **NO** | `ARRAY[]::text[]` | - |
| relationships | `ARRAY` | **NO** | `ARRAY[]::text[]` | - |
| occurrence_count | `integer(32)` | **NO** | `0` | - |
| confidence_score | `numeric(4,3)` | **NO** | `0.000` | - |
| status | `text` | **NO** | `'draft'::text` | - |
| source_events | `jsonb` | **NO** | `'[]'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| approved_at | `timestamp with time zone` | YES | - | - |
| approved_by | `text` | YES | - | - |
| provenance_source | `text` | YES | - | AI-provenance source per Pocock pattern. Format: agent:SEAT:ROUND_ID | human:USER_ID. NULL = legacy / human-authored. SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-F. |

## Constraints

### Primary Key
- `pocock_glossary_terms_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `pocock_glossary_terms_term_key`: UNIQUE (term)

### Check Constraints
- `pocock_glossary_terms_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'deprecated'::text])))

## Indexes

- `idx_pocock_glossary_terms_created_at`
  ```sql
  CREATE INDEX idx_pocock_glossary_terms_created_at ON public.pocock_glossary_terms USING btree (created_at DESC)
  ```
- `idx_pocock_glossary_terms_status`
  ```sql
  CREATE INDEX idx_pocock_glossary_terms_status ON public.pocock_glossary_terms USING btree (status)
  ```
- `pocock_glossary_terms_pkey`
  ```sql
  CREATE UNIQUE INDEX pocock_glossary_terms_pkey ON public.pocock_glossary_terms USING btree (id)
  ```
- `pocock_glossary_terms_term_key`
  ```sql
  CREATE UNIQUE INDEX pocock_glossary_terms_term_key ON public.pocock_glossary_terms USING btree (term)
  ```

## RLS Policies

### 1. pocock_glossary_terms_authenticated_read_approved (SELECT)

- **Roles**: {authenticated}
- **Using**: `(status = 'approved'::text)`

### 2. pocock_glossary_terms_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
