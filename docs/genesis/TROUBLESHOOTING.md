# Genesis Troubleshooting Guide

> **SD**: SD-GENESIS-FIX-001
> **Created**: 2026-01-08
> **Status**: Active

This guide helps diagnose and resolve common Genesis Virtual Bunker issues.

---

## Quick Diagnostic

Run the diagnostic script first:

```bash
node scripts/genesis-pipeline-diagnostic.js
```

This checks:
- Database tables exist and are configured
- Vercel CLI is installed and authenticated
- Genesis modules load correctly
- Pipeline integration status

---

## Common Issues

### 1. Database Constraint Violation (epistemic_status)

**Symptom**: Error when trying to set epistemic_status to 'ratified', 'rejected', or 'deployment_failed'

```
ERROR: new row violates check constraint "simulation_sessions_epistemic_status_check"
```

**Root Cause**: Original constraint only allows: `simulation`, `official`, `archived`, `incinerated`

**Fix**: Apply migration to expand constraint:

```sql
-- database/migrations/20260108_fix_epistemic_status_constraint.sql
ALTER TABLE simulation_sessions
  DROP CONSTRAINT IF EXISTS simulation_sessions_epistemic_status_check;

ALTER TABLE simulation_sessions
  ADD CONSTRAINT simulation_sessions_epistemic_status_check
  CHECK (epistemic_status IN (
    'simulation', 'official', 'archived', 'incinerated',
    'ratified', 'rejected', 'deployment_failed'
  ));
```

---

### 2. genesis_deployments Table Missing

**Symptom**: Deployment tracking fails silently, preview URLs never stored

```
Could not find the table 'public.genesis_deployments'
```

**Root Cause**: Table was never created during initial setup

**Fix**: Apply migration:

```sql
-- database/migrations/20260108_create_genesis_deployments.sql
CREATE TABLE IF NOT EXISTS genesis_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id UUID REFERENCES simulation_sessions(id),
  preview_url TEXT NOT NULL,
  deployment_id TEXT,
  -- ... see full migration
);
```

---

### 3. Vercel CLI Not Installed/Authenticated

**Symptom**: Deployments fail with "Vercel CLI not installed" or "Not logged in"

**Fix**:
```bash
# Install Vercel CLI
npm install -g vercel

# Authenticate
vercel login
```

---

### 4. PRD Generation Returns Stubs

**Symptom**: Generated PRDs contain `[STUB]` placeholder content

**Explanation**: This is expected behavior. AI-powered PRD generation is not yet implemented.

**Workaround**: Create PRDs manually via LEO Protocol or use the stub content as a template.

**Status Check**:
```javascript
import { getPRDGenerationStatus } from './lib/genesis/prd-generator.js';
console.log(getPRDGenerationStatus());
// { available: false, status: 'STUB', ... }
```

---

### 5. Preview URLs Always Null

**Symptom**: `simulation_sessions.preview_url` is always null

**Root Causes** (check in order):
1. `genesis_deployments` table doesn't exist (see #2)
2. Vercel CLI not installed/authenticated (see #3)
3. Deployment pipeline not being triggered
4. Quality gates failing before deployment

**Debug Steps**:
```bash
# Run diagnostic
node scripts/genesis-pipeline-diagnostic.js

# Check simulation sessions
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('simulation_sessions').select('id, preview_url, epistemic_status').then(console.log);
"
```

---

### 6. Tier Selection Not Working

**Symptom**: `simulation_tier` column doesn't exist or tier config not found

**Fix**: Apply migration:

```sql
-- database/migrations/20260108_add_simulation_tier.sql
ALTER TABLE simulation_sessions
  ADD COLUMN IF NOT EXISTS simulation_tier TEXT DEFAULT 'A'
  CHECK (simulation_tier IN ('A', 'B'));
```

**Usage**:
```javascript
import { createSimulationBranch, getTierConfig } from './lib/genesis/branch-lifecycle.js';

// Create Tier A (lite) simulation - default
const simA = await createSimulationBranch('My venture idea');

// Create Tier B (full) simulation
const simB = await createSimulationBranch('Complex venture', { tier: 'B' });

// Get tier configuration
const config = await getTierConfig('A');
console.log(config.features); // ['prd_generation', 'ai_mockups', ...]
```

---

## Architecture Overview

Genesis spans two codebases:

| Location | Purpose |
|----------|---------|
| `EHG_Engineer/lib/genesis/` | Infrastructure: DB queries, quality gates, deployment |
| `ehg/lib/genesis/` | Orchestration: ScaffoldEngine, repo creation |
| `ehg/scripts/genesis/` | Pipeline scripts, stage execution |

### Tiered Simulation System

| Tier | Name | Features | Default TTL |
|------|------|----------|-------------|
| A | Lite Simulation | PRD generation, AI mockups | 7 days |
| B | Full Simulation | + Scaffolding, GitHub repo, Vercel deploy | 30 days |

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `simulation_sessions` | Core simulation lifecycle tracking |
| `genesis_deployments` | Vercel preview deployment tracking |
| `genesis_tier_config` | Tier configuration (A/B) |
| `scaffold_patterns` | Pattern library for code generation |
| `soul_extractions` | Extracted requirements for regeneration |

---

## Migrations to Apply

If starting fresh or updating, apply these migrations in order:

1. `20251230_genesis_virtual_bunker.sql` - Base tables
2. `20260108_fix_epistemic_status_constraint.sql` - Expand status constraint
3. `20260108_create_genesis_deployments.sql` - Deployment tracking
4. `20260108_add_simulation_tier.sql` - Tiered simulation support

Apply via:
```bash
# Via Supabase SQL Editor (recommended)
# Or via pooler connection:
SUPABASE_POOLER_URL=<url> node scripts/execute-database-sql.js <migration-file>
```

---

## Getting Help

1. Run diagnostic script first
2. Check this troubleshooting guide
3. Review migration files for schema requirements
4. Check EHG App (`/mnt/c/_EHG/ehg`) for orchestration issues

---

*Last updated: 2026-01-08*
*SD: SD-GENESIS-FIX-001*
