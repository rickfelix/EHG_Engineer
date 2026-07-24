# venture_inbound_messages Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| channel_type | `text` | **NO** | - | - |
| channel_id | `uuid` | YES | - | - |
| external_message_id | `text` | **NO** | - | - |
| raw_text | `text` | **NO** | - | - |
| sanitization_status | `text` | **NO** | `'unprocessed'::text` | - |
| quarantine_reason | `text` | YES | - | - |
| received_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_inbound_messages_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_inbound_messages_channel_id_fkey`: channel_id → distribution_channels(id)
- `venture_inbound_messages_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_inbound_messages_channel_type_external_message_id_key`: UNIQUE (channel_type, external_message_id)

### Check Constraints
- `venture_inbound_messages_sanitization_status_check`: CHECK ((sanitization_status = ANY (ARRAY['unprocessed'::text, 'sanitized'::text, 'quarantined'::text])))

## Indexes

- `idx_vim_status`
  ```sql
  CREATE INDEX idx_vim_status ON public.venture_inbound_messages USING btree (sanitization_status)
  ```
- `idx_vim_venture`
  ```sql
  CREATE INDEX idx_vim_venture ON public.venture_inbound_messages USING btree (venture_id)
  ```
- `venture_inbound_messages_channel_type_external_message_id_key`
  ```sql
  CREATE UNIQUE INDEX venture_inbound_messages_channel_type_external_message_id_key ON public.venture_inbound_messages USING btree (channel_type, external_message_id)
  ```
- `venture_inbound_messages_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_inbound_messages_pkey ON public.venture_inbound_messages USING btree (id)
  ```

## RLS Policies

### 1. vim_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. vim_venture_access (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
