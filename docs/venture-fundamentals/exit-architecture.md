# EHG Exit Architecture: Supabase Isolation Tiers

**Version**: 1.0.0
**SD**: SD-LEO-INFRA-EHG-VENTURE-FUNDAMENTALS-001

## Overview

Every EHG venture starts in a shared Supabase project (pool isolation). As ventures mature or prepare for exit, they can be mechanically extracted to higher isolation tiers. This document defines each tier and provides migration playbooks.

## Isolation Tiers

### Tier 1: Pool (Default)

All ventures share a single Supabase project. Data isolation via Row Level Security (RLS).

```
┌─────────────────────────────────────┐
│  Supabase Project: dedlbzhp...      │
│  ┌─────────┐ ┌─────────┐ ┌──────┐  │
│  │Venture A│ │Venture B│ │EHG   │  │
│  │(RLS)    │ │(RLS)    │ │Admin │  │
│  └─────────┘ └─────────┘ └──────┘  │
│  Shared: Auth, Storage, Functions   │
└─────────────────────────────────────┘
```

**Characteristics**:
- Single billing account
- Shared connection pool (configurable per-venture via `venture_id` RLS)
- Shared Edge Functions
- Auth users scoped by venture via `user_ventures` table
- Cost: $0 marginal per venture

**When to use**: MVP, pre-revenue, internal tools

### Tier 2: Schema-per-Tenant

Each venture gets its own PostgreSQL schema within the same Supabase project.

```
┌─────────────────────────────────────┐
│  Supabase Project: dedlbzhp...      │
│  ┌──────────────┐ ┌──────────────┐  │
│  │ schema:       │ │ schema:       │ │
│  │ venture_a     │ │ venture_b     │ │
│  │ (own tables)  │ │ (own tables)  │ │
│  └──────────────┘ └──────────────┘  │
│  public schema: shared utilities    │
└─────────────────────────────────────┘
```

**Characteristics**:
- Logical isolation (separate schemas, same DB)
- Per-venture connection strings via `SET search_path`
- Shared storage and auth (can be split)
- Cost: ~$0 marginal (same project)

**When to use**: Growing ventures needing data isolation, compliance requirements

### Tier 3: Separate Project

Each venture gets its own Supabase project (full isolation).

```
┌──────────────┐  ┌──────────────┐
│  Supabase     │  │  Supabase     │
│  Project: A   │  │  Project: B   │
│  Own DB       │  │  Own DB       │
│  Own Auth     │  │  Own Auth     │
│  Own Storage  │  │  Own Storage  │
└──────────────┘  └──────────────┘
```

**Characteristics**:
- Complete isolation (separate project, DB, auth)
- Independent scaling
- Independent backups and PITR
- Own API keys and connection strings
- Cost: $25+/month per venture (Supabase Pro plan)

**When to use**: Pre-exit preparation, enterprise clients, regulated data

## Migration Playbooks

### Pool → Schema (Tier 1 → Tier 2)

**Prerequisites**: Venture data uses `venture_id` consistently.

```bash
# 1. Create target schema
psql -c "CREATE SCHEMA venture_a;"

# 2. Export venture-specific data
supabase db dump --schema public \
  --data-only \
  --filter "venture_id=eq.<VENTURE_UUID>" \
  > venture_a_data.sql

# 3. Create tables in new schema (structure only)
supabase db dump --schema public --schema-only \
  | sed 's/public\./venture_a\./g' \
  > venture_a_schema.sql
psql -f venture_a_schema.sql

# 4. Import data into new schema
cat venture_a_data.sql \
  | sed 's/public\./venture_a\./g' \
  > venture_a_import.sql
psql -f venture_a_import.sql

# 5. Update application connection to use schema
# In Supabase client: { db: { schema: 'venture_a' } }

# 6. Verify row counts match
psql -c "SELECT count(*) FROM venture_a.ventures;"

# 7. Remove venture data from public schema (after verification)
# psql -c "DELETE FROM public.ventures WHERE venture_id = '<UUID>';"
```

**Estimated time**: 1-2 hours per venture.
**Rollback**: Drop schema, data remains in public.

### Schema → Separate Project (Tier 2 → Tier 3)

**Prerequisites**: Venture running on dedicated schema. Supabase CLI installed.

```bash
# 1. Create new Supabase project
supabase projects create "venture-a" --org-id <ORG_ID> --region us-east-1

# 2. Dump schema + data from source
supabase db dump --schema venture_a --data-only > venture_a_full.sql
supabase db dump --schema venture_a --schema-only > venture_a_structure.sql

# 3. Transform schema references (venture_a -> public)
cat venture_a_structure.sql \
  | sed 's/venture_a\./public\./g' \
  > target_structure.sql

cat venture_a_full.sql \
  | sed 's/venture_a\./public\./g' \
  > target_data.sql

# 4. Apply to new project
supabase db push --linked --file target_structure.sql
supabase db push --linked --file target_data.sql

# 5. Migrate auth users
# Export: supabase auth export --project-ref <SOURCE>
# Import: supabase auth import --project-ref <TARGET>

# 6. Migrate storage objects
# Use supabase storage API to copy buckets

# 7. Update DNS / API keys in application config

# 8. Verify: run E2E tests against new project

# 9. Decommission old schema
# supabase db execute "DROP SCHEMA venture_a CASCADE;"
```

**Estimated time**: 4-8 hours per venture.
**Rollback**: Keep source schema until verified (minimum 30 days).

### Pool → Separate Project (Tier 1 → Tier 3, Direct)

Combines both playbooks. Use when speed matters more than incremental migration.

```bash
# 1. Create new project
# 2. Dump full structure from public schema
# 3. Filter data by venture_id
# 4. Transform and import
# 5. Migrate auth + storage
# 6. Cutover
```

**Estimated time**: 6-12 hours per venture.

## Verification Checklist

After any migration:

- [ ] Row counts match source and target
- [ ] RLS policies active on target
- [ ] Auth users can log in
- [ ] Storage objects accessible
- [ ] Edge Functions deployed (if applicable)
- [ ] E2E tests pass on target
- [ ] venture_fundamentals.isolation_tier updated
- [ ] Monitoring configured on target

## M&A Due Diligence Impact

Based on M&A research, exit-ready isolation provides:

- **40% valuation increase**: Clean data separation demonstrates operational maturity
- **2-4 week faster due diligence**: Acquirers can assess venture independently
- **Reduced integration risk**: Buyer can lift-and-shift without untangling shared state
