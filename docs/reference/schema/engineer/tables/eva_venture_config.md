# eva_venture_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-12T16:40:57.046Z
**Rows**: 1
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| key | `character varying(128)` | **NO** | - | Unique config key. Use dotted scope prefix for namespacing (e.g. 'vision_repair_loop_enabled', 'venture:<uuid>:flag_name'). |
| value | `jsonb` | **NO** | - | JSONB value. For boolean flags, store as JSON boolean (true/false). For complex configs, store as object. |
| description | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_venture_config_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `eva_venture_config_key_key`: UNIQUE (key)

## Indexes

- `eva_venture_config_key_key`
  ```sql
  CREATE UNIQUE INDEX eva_venture_config_key_key ON public.eva_venture_config USING btree (key)
  ```
- `eva_venture_config_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_venture_config_pkey ON public.eva_venture_config USING btree (id)
  ```
- `idx_eva_venture_config_key_lookup`
  ```sql
  CREATE INDEX idx_eva_venture_config_key_lookup ON public.eva_venture_config USING btree (key)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
