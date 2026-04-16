# competitors Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-16T19:26:31.310Z
**Rows**: 3
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| name | `character varying(255)` | **NO** | - | - |
| website | `text` | YES | - | - |
| description | `text` | YES | - | - |
| strengths | `ARRAY` | YES | `'{}'::text[]` | - |
| weaknesses | `ARRAY` | YES | `'{}'::text[]` | - |
| analysis_data | `jsonb` | YES | `'{}'::jsonb` | - |
| source_url | `text` | YES | - | - |
| analyzed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| threat_level | `text` | YES | - | Competitive threat level: H(igh), M(edium), L(ow) |
| pricing_model | `text` | YES | - | How the competitor monetizes their product |
| market_position | `text` | YES | - | Free-text description of competitive market positioning |
| swot | `jsonb` | YES | `'{}'::jsonb` | Structured SWOT analysis: {strengths:[], weaknesses:[], opportunities:[], threats:[]} |
| lifecycle_stage | `text` | YES | - | Business lifecycle stage: seed, growth, mature, declining |
| global_competitor_id | `uuid` | YES | - | FK to global_competitors for cross-venture competitive intelligence linkage. |

## Constraints

### Primary Key
- `competitors_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `competitors_global_competitor_id_fkey`: global_competitor_id → global_competitors(id)
- `competitors_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `uq_competitors_venture_name`: UNIQUE (venture_id, name)

### Check Constraints
- `chk_competitors_lifecycle_stage`: CHECK ((lifecycle_stage = ANY (ARRAY['seed'::text, 'growth'::text, 'mature'::text, 'declining'::text])))
- `chk_competitors_pricing_model`: CHECK ((pricing_model = ANY (ARRAY['subscription'::text, 'freemium'::text, 'one_time'::text, 'usage_based'::text, 'marketplace'::text, 'advertising'::text, 'enterprise'::text, 'hybrid'::text])))
- `chk_competitors_threat_level`: CHECK ((threat_level = ANY (ARRAY['H'::text, 'M'::text, 'L'::text])))

## Indexes

- `competitors_pkey`
  ```sql
  CREATE UNIQUE INDEX competitors_pkey ON public.competitors USING btree (id)
  ```
- `idx_competitors_analyzed`
  ```sql
  CREATE INDEX idx_competitors_analyzed ON public.competitors USING btree (analyzed_at DESC)
  ```
- `idx_competitors_name`
  ```sql
  CREATE INDEX idx_competitors_name ON public.competitors USING btree (name)
  ```
- `idx_competitors_venture`
  ```sql
  CREATE INDEX idx_competitors_venture ON public.competitors USING btree (venture_id)
  ```
- `idx_competitors_venture_stage`
  ```sql
  CREATE INDEX idx_competitors_venture_stage ON public.competitors USING btree (venture_id, lifecycle_stage)
  ```
- `uq_competitors_venture_name`
  ```sql
  CREATE UNIQUE INDEX uq_competitors_venture_name ON public.competitors USING btree (venture_id, name)
  ```

## RLS Policies

### 1. Service role full access competitors (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. Users can delete own venture competitors (DELETE)

- **Roles**: {public}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 3. Users can insert own venture competitors (INSERT)

- **Roles**: {public}
- **With Check**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 4. Users can update own venture competitors (UPDATE)

- **Roles**: {public}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 5. Users can view own venture competitors (SELECT)

- **Roles**: {public}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

## Triggers

### competitors_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_competitors_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
