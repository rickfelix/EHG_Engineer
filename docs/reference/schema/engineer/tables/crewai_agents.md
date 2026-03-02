# crewai_agents Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-02T00:03:49.900Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `text` | YES | - | - |
| role | `text` | YES | - | - |
| backstory | `text` | YES | - | - |
| tools | `jsonb` | YES | `'[]'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `crewai_agents_pkey`: PRIMARY KEY (id)

## Indexes

- `crewai_agents_pkey`
  ```sql
  CREATE UNIQUE INDEX crewai_agents_pkey ON public.crewai_agents USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
