# agent_coordination_state Table

**Generated**: 2025-10-28T12:15:30.153Z
**Database**: EHG_Engineer (dedlbzhpgkmetvhbkyzq)
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| coordination_id | `text` | **NO** | - | - |
| sd_id | `text` | YES | - | - |
| prd_id | `text` | YES | - | - |
| phase | `text` | YES | - | - |
| current_state | `text` | **NO** | - | - |
| active_agents | `ARRAY` | YES | - | - |
| completed_agents | `ARRAY` | YES | - | - |
| pending_agents | `ARRAY` | YES | - | - |
| failed_agents | `ARRAY` | YES | - | - |
| consensus_required | `boolean` | YES | `false` | - |
| consensus_threshold | `double precision(53)` | YES | `0.8` | - |
| votes | `jsonb` | YES | - | - |
| consensus_reached | `boolean` | YES | - | - |
| checkpoint_data | `jsonb` | YES | - | - |
| last_checkpoint | `timestamp without time zone` | YES | - | - |
| started_at | `timestamp without time zone` | YES | `now()` | - |
| updated_at | `timestamp without time zone` | YES | `now()` | - |
| completed_at | `timestamp without time zone` | YES | - | - |

## Constraints

### Primary Key
- `agent_coordination_state_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `agent_coordination_state_coordination_id_key`: UNIQUE (coordination_id)

### Check Constraints
- `agent_coordination_state_current_state_check`: CHECK ((current_state = ANY (ARRAY['INITIALIZING'::text, 'IN_PROGRESS'::text, 'WAITING_CONSENSUS'::text, 'WAITING_HUMAN'::text, 'COMPLETED'::text, 'FAILED'::text, 'CANCELLED'::text])))

## Indexes

- `agent_coordination_state_coordination_id_key`
  ```sql
  CREATE UNIQUE INDEX agent_coordination_state_coordination_id_key ON public.agent_coordination_state USING btree (coordination_id)
  ```
- `agent_coordination_state_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_coordination_state_pkey ON public.agent_coordination_state USING btree (id)
  ```
- `idx_coordination_prd_id`
  ```sql
  CREATE INDEX idx_coordination_prd_id ON public.agent_coordination_state USING btree (prd_id)
  ```
- `idx_coordination_sd_id`
  ```sql
  CREATE INDEX idx_coordination_sd_id ON public.agent_coordination_state USING btree (sd_id)
  ```
- `idx_coordination_state`
  ```sql
  CREATE INDEX idx_coordination_state ON public.agent_coordination_state USING btree (current_state)
  ```

## RLS Policies

### 1. authenticated_read_agent_coordination_state (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_agent_coordination_state (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
