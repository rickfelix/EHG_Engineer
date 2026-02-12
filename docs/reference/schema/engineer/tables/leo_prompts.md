# leo_prompts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-12T05:02:16.883Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `uuid` | **NO** | - | - |
| name | `text` | **NO** | - | - |
| version | `integer(32)` | **NO** | - | - |
| status | `text` | **NO** | `'draft'::text` | - |
| prompt_text | `text` | **NO** | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| checksum | `text` | **NO** | - | - |

## Constraints

### Primary Key
- `leo_prompts_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `uq_leo_prompts_checksum`: UNIQUE (checksum)
- `uq_leo_prompts_name_version`: UNIQUE (name, version)

### Check Constraints
- `leo_prompts_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'deprecated'::text])))

## Indexes

- `leo_prompts_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_prompts_pkey ON public.leo_prompts USING btree (id)
  ```
- `uq_leo_prompts_checksum`
  ```sql
  CREATE UNIQUE INDEX uq_leo_prompts_checksum ON public.leo_prompts USING btree (checksum)
  ```
- `uq_leo_prompts_name_version`
  ```sql
  CREATE UNIQUE INDEX uq_leo_prompts_name_version ON public.leo_prompts USING btree (name, version)
  ```

## RLS Policies

### 1. Anon can read active prompts (SELECT)

- **Roles**: {public}
- **Using**: `(status = 'active'::text)`

### 2. Service role full access to leo_prompts (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

## Triggers

### trg_leo_prompts_validate_checksum

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION leo_prompts_validate_checksum()`

### trg_leo_prompts_validate_checksum

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION leo_prompts_validate_checksum()`

---

[← Back to Schema Overview](../database-schema-overview.md)
