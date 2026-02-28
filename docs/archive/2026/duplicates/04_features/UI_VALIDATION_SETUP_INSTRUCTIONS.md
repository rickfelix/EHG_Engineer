---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
<!-- ARCHIVED: 2026-01-26T16:26:33.431Z
     Reason: Duplicate of canonical file
     Original location: docs\04_features\UI_VALIDATION_SETUP_INSTRUCTIONS.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# UI Validation Tables Setup Instructions


## Metadata
- **Category**: Feature
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-24
- **Tags**: database, api, migration, schema

## Current Status
- Database password configured: ✅
- Direct PostgreSQL connection blocked by IPv6: ❌
- Tables need to be created manually: ⚠️

## Manual Setup Steps

### Option 1: Supabase Dashboard (Recommended)
1. Navigate to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql/new
2. Copy the entire contents of `database/migrations/008_ui_validation_schema.sql`
3. Paste into the SQL editor
4. Click "Run" to execute

### Option 2: Using psql (if you have IPv4 connectivity)
```bash
export PGPASSWORD="$SUPABASE_DB_PASSWORD"
psql "postgresql://postgres@db.dedlbzhpgkmetvhbkyzq.supabase.co:5432/postgres" -f database/migrations/008_ui_validation_schema.sql
```

### Option 3: Using Supabase CLI (requires Docker)
```bash
npx supabase link --project-ref dedlbzhpgkmetvhbkyzq
npx supabase db push
```

## Tables to be Created
- ui_validation_results
- prd_ui_mappings
- validation_evidence
- ui_validation_checkpoints
- ui_validation_summary (view)

## Verification
After creation, verify tables exist by running:
```javascript
node scripts/create-tables-via-api.js
```

## Network Issue Details
The system is attempting IPv6 connection but the network doesn't support it:
- Host resolves to: 2600:1f18:2e13:9d0f:baaf:5ed3:395b:d9c4
- Error: ENETUNREACH (Network unreachable)
- Solution: Use HTTPS API or manual SQL execution
