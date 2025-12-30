# leo_protocols Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-12-30T21:56:22.248Z
**Rows**: 5
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `character varying(50)` | **NO** | - | - |
| version | `character varying(50)` | **NO** | - | - |
| status | `character varying(20)` | **NO** | - | - |
| title | `character varying(500)` | **NO** | - | - |
| description | `text` | YES | - | - |
| content | `text` | YES | - | - |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| created_by | `character varying(100)` | YES | - | - |
| superseded_by | `character varying(50)` | YES | - | - |
| superseded_at | `timestamp without time zone` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `leo_protocols_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_protocols_superseded_by_fkey`: superseded_by → leo_protocols(id)

### Unique Constraints
- `leo_protocols_version_key`: UNIQUE (version)

### Check Constraints
- `leo_protocols_status_check`: CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'superseded'::character varying, 'draft'::character varying, 'deprecated'::character varying])::text[])))

## Indexes

- `idx_leo_protocols_status`
  ```sql
  CREATE INDEX idx_leo_protocols_status ON public.leo_protocols USING btree (status)
  ```
- `idx_leo_protocols_version`
  ```sql
  CREATE INDEX idx_leo_protocols_version ON public.leo_protocols USING btree (version)
  ```
- `leo_protocols_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_protocols_pkey ON public.leo_protocols USING btree (id)
  ```
- `leo_protocols_version_key`
  ```sql
  CREATE UNIQUE INDEX leo_protocols_version_key ON public.leo_protocols USING btree (version)
  ```
- `unique_active_protocol`
  ```sql
  CREATE UNIQUE INDEX unique_active_protocol ON public.leo_protocols USING btree (status) WHERE ((status)::text = 'active'::text)
  ```

## RLS Policies

### 1. anon_read_active_leo_protocols (SELECT)

- **Roles**: {anon}
- **Using**: `((status)::text = 'active'::text)`

### 2. authenticated_read_leo_protocols (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. service_role_all_leo_protocols (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_doctrine_constraint_protocols

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION enforce_doctrine_of_constraint()`

### trg_doctrine_constraint_protocols

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION enforce_doctrine_of_constraint()`

## Usage Examples

_Common query patterns for this table:_


```javascript
// Get active protocol
const { data, error } = await supabase
  .from('leo_protocols')
  .select('*')
  .eq('status', 'active')
  .single();
```
---

[← Back to Schema Overview](../database-schema-overview.md)
