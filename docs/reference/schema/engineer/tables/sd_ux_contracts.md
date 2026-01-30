# sd_ux_contracts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-30T20:35:58.689Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| parent_sd_id | `character varying(50)` | **NO** | - | - |
| contract_version | `integer(32)` | **NO** | `1` | - |
| component_paths | `ARRAY` | **NO** | - | - |
| forbidden_paths | `ARRAY` | YES | - | - |
| required_design_tokens | `ARRAY` | **NO** | `ARRAY['color'::text, 'spacing'::text, 'typography'::text]` | - |
| cultural_design_style | `character varying(30)` | YES | `NULL::character varying` | - |
| max_component_loc | `integer(32)` | **NO** | `600` | - |
| navigation_patterns | `jsonb` | YES | - | - |
| error_handling_pattern | `character varying(50)` | YES | `'toast'::character varying` | - |
| loading_state_pattern | `character varying(50)` | YES | `'skeleton'::character varying` | - |
| min_wcag_level | `character varying(10)` | **NO** | `'AA'::character varying` | - |
| description | `text` | YES | - | - |
| rationale | `text` | YES | - | - |
| created_by | `character varying(100)` | YES | `'system'::character varying` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `sd_ux_contracts_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_ux_contracts_parent_sd_id_fkey`: parent_sd_id → strategic_directives_v2(id)

### Unique Constraints
- `unique_ux_contract_version`: UNIQUE (parent_sd_id, contract_version)

## Indexes

- `idx_ux_contracts_cultural_style`
  ```sql
  CREATE INDEX idx_ux_contracts_cultural_style ON public.sd_ux_contracts USING btree (cultural_design_style) WHERE (cultural_design_style IS NOT NULL)
  ```
- `idx_ux_contracts_parent_sd`
  ```sql
  CREATE INDEX idx_ux_contracts_parent_sd ON public.sd_ux_contracts USING btree (parent_sd_id)
  ```
- `sd_ux_contracts_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_ux_contracts_pkey ON public.sd_ux_contracts USING btree (id)
  ```
- `unique_ux_contract_version`
  ```sql
  CREATE UNIQUE INDEX unique_ux_contract_version ON public.sd_ux_contracts USING btree (parent_sd_id, contract_version)
  ```

## RLS Policies

### 1. sd_ux_contracts_delete (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. sd_ux_contracts_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. sd_ux_contracts_select (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 4. sd_ux_contracts_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### update_sd_ux_contracts_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
