# grill_fixtures Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-28T02:32:45.335Z
**Rows**: 20
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| fixture_id | `text` | **NO** | - | - |
| question_text | `text` | **NO** | - | - |
| verified_answer | `text` | **NO** | - | - |
| category | `text` | YES | - | - |
| expected_to_converge | `boolean` | **NO** | `true` | - |
| notes | `text` | YES | - | - |
| deprecated_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `grill_fixtures_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `grill_fixtures_fixture_id_key`: UNIQUE (fixture_id)

## Indexes

- `grill_fixtures_fixture_id_key`
  ```sql
  CREATE UNIQUE INDEX grill_fixtures_fixture_id_key ON public.grill_fixtures USING btree (fixture_id)
  ```
- `grill_fixtures_pkey`
  ```sql
  CREATE UNIQUE INDEX grill_fixtures_pkey ON public.grill_fixtures USING btree (id)
  ```
- `idx_grill_fixtures_active`
  ```sql
  CREATE INDEX idx_grill_fixtures_active ON public.grill_fixtures USING btree (fixture_id) WHERE (deprecated_at IS NULL)
  ```

## RLS Policies

### 1. grill_fixtures_authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. grill_fixtures_service_write (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
