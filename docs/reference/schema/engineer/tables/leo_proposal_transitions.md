# leo_proposal_transitions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T03:50:45.752Z
**Rows**: 14
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (2 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| from_status | `text` | **NO** | - | - |
| to_status | `text` | **NO** | - | - |

## Constraints

### Primary Key
- `leo_proposal_transitions_pkey`: PRIMARY KEY (from_status, to_status)

## Indexes

- `leo_proposal_transitions_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_proposal_transitions_pkey ON public.leo_proposal_transitions USING btree (from_status, to_status)
  ```

## RLS Policies

### 1. Anon can read leo_proposal_transitions (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. Service role full access to leo_proposal_transitions (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
