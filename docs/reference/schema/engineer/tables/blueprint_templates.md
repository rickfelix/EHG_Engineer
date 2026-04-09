# blueprint_templates Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-09T20:19:29.104Z
**Rows**: 12
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| artifact_type | `text` | **NO** | - | Type of planning artifact this template produces |
| archetype | `text` | **NO** | `'default'::text` | Venture archetype this template targets (default applies to all) |
| template_content | `jsonb` | YES | `'{}'::jsonb` | - |
| quality_rubric | `jsonb` | YES | `'{}'::jsonb` | JSONB rubric defining quality scoring criteria for this artifact type |
| version | `integer(32)` | YES | `1` | Template version number, incremented on updates |
| is_active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `text` | YES | `'system'::text` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| description | `text` | YES | - | - |

## Constraints

### Primary Key
- `blueprint_templates_pkey`: PRIMARY KEY (id)

### Check Constraints
- `blueprint_templates_artifact_type_check`: CHECK ((artifact_type = ANY (ARRAY['blueprint_product_roadmap'::text, 'blueprint_technical_architecture'::text, 'blueprint_data_model'::text, 'blueprint_erd_diagram'::text, 'blueprint_financial_projection'::text, 'blueprint_launch_readiness'::text, 'blueprint_sprint_plan'::text, 'blueprint_promotion_gate'::text, 'blueprint_api_contract'::text, 'blueprint_schema_spec'::text, 'blueprint_user_story_pack'::text, 'blueprint_risk_register'::text])))

## Indexes

- `blueprint_templates_pkey`
  ```sql
  CREATE UNIQUE INDEX blueprint_templates_pkey ON public.blueprint_templates USING btree (id)
  ```
- `idx_blueprint_templates_active_unique`
  ```sql
  CREATE UNIQUE INDEX idx_blueprint_templates_active_unique ON public.blueprint_templates USING btree (artifact_type, archetype) WHERE (is_active = true)
  ```

## RLS Policies

### 1. delete_blueprint_templates_policy (DELETE)

- **Roles**: {service_role}
- **Using**: `true`

### 2. insert_blueprint_templates_policy (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 3. select_blueprint_templates_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. update_blueprint_templates_policy (UPDATE)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_blueprint_templates_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
