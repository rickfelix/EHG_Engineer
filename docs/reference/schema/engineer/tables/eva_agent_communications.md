# eva_agent_communications Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T00:58:19.770Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| communication_id | `uuid` | **NO** | `gen_random_uuid()` | - |
| session_id | `uuid` | YES | - | - |
| from_agent_id | `uuid` | YES | - | - |
| to_agent_id | `uuid` | YES | - | - |
| from_agent_type | `text` | YES | - | Denormalized for reporting (EVA, AI_CEO, etc.) |
| to_agent_type | `text` | YES | - | Denormalized for reporting |
| message_type | `text` | **NO** | - | - |
| message_content | `jsonb` | **NO** | - | JSONB payload with message data (action, parameters, results, context) |
| priority | `text` | YES | `'normal'::text` | - |
| status | `text` | YES | `'sent'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| delivered_at | `timestamp with time zone` | YES | - | - |
| read_at | `timestamp with time zone` | YES | - | - |
| acknowledged_at | `timestamp with time zone` | YES | - | - |
| in_reply_to | `uuid` | YES | - | - |
| response_required | `boolean` | YES | `false` | - |
| response_deadline | `timestamp with time zone` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | Additional context, attachments, etc. |

## Constraints

### Primary Key
- `eva_agent_communications_pkey`: PRIMARY KEY (communication_id)

### Foreign Keys
- `eva_agent_communications_in_reply_to_fkey`: in_reply_to → eva_agent_communications(communication_id)
- `eva_agent_communications_session_id_fkey`: session_id → eva_orchestration_sessions(session_id)

### Check Constraints
- `eva_agent_communications_message_type_check`: CHECK ((message_type = ANY (ARRAY['request'::text, 'response'::text, 'notification'::text, 'handoff'::text, 'escalation'::text, 'broadcast'::text])))
- `eva_agent_communications_priority_check`: CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'critical'::text])))
- `eva_agent_communications_status_check`: CHECK ((status = ANY (ARRAY['sent'::text, 'delivered'::text, 'read'::text, 'acknowledged'::text, 'failed'::text])))

## Indexes

- `eva_agent_communications_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_agent_communications_pkey ON public.eva_agent_communications USING btree (communication_id)
  ```
- `idx_eva_comms_from_agent`
  ```sql
  CREATE INDEX idx_eva_comms_from_agent ON public.eva_agent_communications USING btree (from_agent_id)
  ```
- `idx_eva_comms_reply_to`
  ```sql
  CREATE INDEX idx_eva_comms_reply_to ON public.eva_agent_communications USING btree (in_reply_to)
  ```
- `idx_eva_comms_session`
  ```sql
  CREATE INDEX idx_eva_comms_session ON public.eva_agent_communications USING btree (session_id)
  ```
- `idx_eva_comms_status`
  ```sql
  CREATE INDEX idx_eva_comms_status ON public.eva_agent_communications USING btree (status)
  ```
- `idx_eva_comms_to_agent`
  ```sql
  CREATE INDEX idx_eva_comms_to_agent ON public.eva_agent_communications USING btree (to_agent_id)
  ```
- `idx_eva_comms_type`
  ```sql
  CREATE INDEX idx_eva_comms_type ON public.eva_agent_communications USING btree (message_type)
  ```

## RLS Policies

### 1. Allow insert for authenticated (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 2. Allow update for authenticated (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 3. eva_agent_communications_delete (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. eva_comms_company_access (SELECT)

- **Roles**: {public}
- **Using**: `(session_id IN ( SELECT eva_orchestration_sessions.session_id
   FROM eva_orchestration_sessions
  WHERE (eva_orchestration_sessions.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE ((user_company_access.user_id = auth.uid()) AND (user_company_access.is_active = true))))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
