# venture_asset_registry Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-16T00:53:05.043Z
**Rows**: N/A (RLS restricted)
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| asset_name | `text` | **NO** | - | - |
| asset_type | `text` | **NO** | - | Category of asset: IP, software, data, brand, etc. |
| description | `text` | YES | - | - |
| estimated_value | `numeric(15,2)` | YES | - | - |
| provenance | `jsonb` | YES | `'{}'::jsonb` | JSON tracking origin, acquisition date, transfer history |
| created_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_asset_registry_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_asset_registry_created_by_fkey`: created_by → users(id)
- `venture_asset_registry_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `venture_asset_registry_asset_type_check`: CHECK ((asset_type = ANY (ARRAY['intellectual_property'::text, 'software'::text, 'data'::text, 'brand'::text, 'domain'::text, 'patent'::text, 'trademark'::text, 'contract'::text, 'license'::text, 'customer_list'::text, 'partnership'::text, 'infrastructure'::text, 'other'::text])))

## Indexes

- `idx_asset_registry_asset_type`
  ```sql
  CREATE INDEX idx_asset_registry_asset_type ON public.venture_asset_registry USING btree (asset_type)
  ```
- `idx_asset_registry_venture_id`
  ```sql
  CREATE INDEX idx_asset_registry_venture_id ON public.venture_asset_registry USING btree (venture_id)
  ```
- `venture_asset_registry_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_asset_registry_pkey ON public.venture_asset_registry USING btree (id)
  ```

## RLS Policies

### 1. asset_registry_delete_authenticated (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. asset_registry_insert_authenticated (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. asset_registry_select_authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. asset_registry_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 5. asset_registry_update_authenticated (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
