# persona_behavioral_data Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-01T22:49:08.070Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| persona_type | `text` | **NO** | - | Persona segment category (e.g. power_user, casual, churning) |
| behavioral_patterns | `jsonb` | **NO** | `'{}'::jsonb` | JSONB with aggregated anonymized patterns — no PII or customer-identifiable data |
| sample_size | `integer(32)` | **NO** | `0` | Number of customers in this aggregation |
| aggregation_period | `text` | YES | `'daily'::text` | How often this feed is refreshed: daily, weekly, monthly |
| metadata | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `text` | YES | `'ops-health-service'::text` | - |

## Constraints

### Primary Key
- `persona_behavioral_data_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `persona_behavioral_data_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `persona_behavioral_data_sample_size_check`: CHECK ((sample_size >= 0))

## Indexes

- `idx_persona_feed_venture_type`
  ```sql
  CREATE INDEX idx_persona_feed_venture_type ON public.persona_behavioral_data USING btree (venture_id, persona_type, created_at DESC)
  ```
- `persona_behavioral_data_pkey`
  ```sql
  CREATE UNIQUE INDEX persona_behavioral_data_pkey ON public.persona_behavioral_data USING btree (id)
  ```

## RLS Policies

### 1. persona_behavioral_data_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. persona_behavioral_data_venture_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 3. persona_behavioral_data_venture_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 4. persona_behavioral_data_venture_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

---

[← Back to Schema Overview](../database-schema-overview.md)
