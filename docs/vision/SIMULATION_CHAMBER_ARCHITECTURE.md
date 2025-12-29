# Simulation Chamber: Technical Architecture

> **Document Version: GENESIS-V3.1**
> **Vision Version: 3.1**
> **Status: RATIFIED**
> **Last Updated: 2025-12-29**

| Attribute | Value |
|-----------|-------|
| **Parent Document** | [GENESIS_OATH_V3.md](./GENESIS_OATH_V3.md) |
| **Implementation Sprint** | The Mason (Dec 29 – Jan 19) |
| **Technical Owner** | Claude Architect |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 3.1 | 2025-12-29 | Hard isolation requirements, elevation_log table, elevation API, chairman signature requirement |
| 3.0 | 2025-12-29 | Initial Simulation Chamber architecture |

---

## Overview

The Simulation Chamber is EHG's infrastructure for generating "possible futures" — complete venture artifacts that exist in a parallel reality until promoted to production through the 25-stage validation workflow.

---

## Core Concepts

### Epistemic Classification

All artifacts in EHG carry an epistemic status:

| Status | Meaning | Mutability | Production Impact |
|--------|---------|------------|-------------------|
| `fact` | Validated, official | Versioned changes only | Direct |
| `assumption` | Believed true, unvalidated | Can be challenged | Indirect |
| `simulation` | Possible future | Regenerable | None (isolated) |
| `unknown` | Acknowledged gap | Flagged for resolution | Blocked |

### The Two Namespaces (Hard Isolation)

**Aries Namespace (Simulation)**
- Domain: `*.possible.ehg.dev`
- GitHub: `github.com/ehg-simulations/`
- Database: `schema_sim_{venture}` (separate Supabase project)
- Vercel: Separate team account
- Purpose: Fast, ephemeral, experimental
- Lifecycle: TTL-bound, auto-archived
- Credentials: Simulation-only (NO production access)

**Saturn Namespace (Production)**
- Domain: `*.ehg.dev`
- GitHub: `github.com/ehg-ventures/`
- Database: `schema_{venture}` (production Supabase project)
- Vercel: Production team account
- Purpose: Validated, permanent, real
- Lifecycle: Version-controlled, backed up
- Credentials: Full production access

**CRITICAL: Hard Technical Boundaries**

Saturn namespace is **technically unreachable** from Aries:
- Different cloud accounts (separate billing)
- Different credential stores
- Different GitHub organizations (no cross-org access)
- Different Supabase projects (no shared connection strings)
- Different Vercel teams (no shared deployments)
- Simulation code cannot import production secrets

This is not a policy — it's an enforcement mechanism.

---

## Database Schema

### `simulation_artifacts`

Primary table for tracking all simulation artifacts.

```sql
CREATE TABLE simulation_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  simulation_id VARCHAR(100) NOT NULL,  -- e.g., "genesis_001"
  venture_id UUID REFERENCES ventures(id),
  artifact_type VARCHAR(50) NOT NULL,   -- 'prd', 'schema', 'repo', 'deployment'

  -- Epistemic Status
  epistemic_status VARCHAR(20) DEFAULT 'simulation'
    CHECK (epistemic_status IN ('simulation', 'pending_promotion', 'promoted', 'archived')),

  -- Content
  artifact_url TEXT,                     -- Location of artifact
  artifact_metadata JSONB DEFAULT '{}',  -- Type-specific metadata
  generation_config JSONB DEFAULT '{}',  -- Config used to generate

  -- Lifecycle
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ttl_days INTEGER DEFAULT 90,
  expires_at TIMESTAMPTZ GENERATED ALWAYS AS (created_at + (ttl_days || ' days')::INTERVAL) STORED,
  promoted_at TIMESTAMPTZ,
  promotion_stage INTEGER,               -- Stage where promoted (16, 17, 22)
  archived_at TIMESTAMPTZ,
  archive_reason VARCHAR(100),           -- 'ttl_expired', 'stage3_rejected', 'superseded'

  -- Ownership
  owner VARCHAR(100) DEFAULT 'chairman',
  created_by VARCHAR(100),

  -- Versioning
  version INTEGER DEFAULT 1,
  previous_version_id UUID REFERENCES simulation_artifacts(id),

  -- Indexes
  UNIQUE(simulation_id, venture_id, artifact_type, version)
);

-- Index for TTL cleanup
CREATE INDEX idx_simulation_artifacts_expires
  ON simulation_artifacts(expires_at)
  WHERE epistemic_status = 'simulation';

-- Index for venture lookup
CREATE INDEX idx_simulation_artifacts_venture
  ON simulation_artifacts(venture_id, artifact_type);
```

### `simulation_sessions`

Tracks Genesis ritual executions.

```sql
CREATE TABLE simulation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  simulation_id VARCHAR(100) UNIQUE NOT NULL,

  -- Input
  seed_text TEXT NOT NULL,
  seed_metadata JSONB DEFAULT '{}',

  -- Output
  venture_id UUID REFERENCES ventures(id),
  artifacts_generated JSONB DEFAULT '[]',  -- Array of artifact IDs

  -- Execution
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  ratified_at TIMESTAMPTZ,
  ratified_by VARCHAR(100),

  -- Status
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'generating', 'awaiting_ratification', 'ratified', 'failed', 'cancelled')),
  error_message TEXT,

  -- Metrics
  generation_duration_ms INTEGER,
  tokens_consumed INTEGER,
  cost_estimate DECIMAL(10,4)
);
```

### `elevation_log`

Audit trail for simulation-to-production elevations.

```sql
CREATE TABLE elevation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was elevated
  simulation_artifact_id UUID REFERENCES simulation_artifacts(id),
  venture_id UUID REFERENCES ventures(id),
  artifact_type VARCHAR(50) NOT NULL,

  -- Elevation details
  from_location TEXT NOT NULL,           -- Simulation location
  to_location TEXT NOT NULL,             -- Production location
  elevation_stage INTEGER NOT NULL,      -- 16, 17, or 22

  -- Decision
  elevated_by VARCHAR(100) NOT NULL,     -- Must be Chairman
  elevation_method VARCHAR(20) NOT NULL  -- 'copy', 'regenerate', 'hybrid'
    CHECK (elevation_method IN ('copy', 'regenerate', 'hybrid')),
  chairman_signature TEXT NOT NULL,      -- "I elevate this {type} to reality"
  elevation_notes TEXT,

  -- Timing
  elevated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Diff (if hybrid)
  diff_summary JSONB
);
```

---

## API Specification

### Genesis Loop Endpoint

```typescript
// POST /api/genesis/simulate
interface SimulateRequest {
  seed_text: string;
  simulation_id?: string;  // Auto-generated if not provided
  options?: {
    generate_schema: boolean;  // default: true
    generate_repo: boolean;    // default: true
    generate_deployment: boolean;  // default: true
    template?: string;  // Repo template to use
  };
}

interface SimulateResponse {
  simulation_id: string;
  status: 'generating' | 'awaiting_ratification' | 'failed';
  artifacts: {
    prd?: {
      id: string;
      status: 'generated';
      url: string;
    };
    schema?: {
      id: string;
      status: 'generated';
      tables: string[];
      namespace: string;
    };
    repo?: {
      id: string;
      status: 'generated';
      url: string;  // github.com/ehg-simulations/...
    };
    deployment?: {
      id: string;
      status: 'generated';
      url: string;  // *.possible.ehg.dev
    };
  };
  expires_at: string;  // ISO timestamp
}
```

### Ratification Endpoint

```typescript
// POST /api/genesis/ratify
interface RatifyRequest {
  simulation_id: string;
  venture_name: string;
  stage_3_scheduled?: string;  // ISO date for kill gate
}

interface RatifyResponse {
  venture_id: string;
  status: 'created';
  current_stage: 1;
  simulation_artifacts: string[];  // IDs of linked simulations
  stage_3_date: string;
}
```

### Elevation Endpoint

```typescript
// POST /api/genesis/elevate
interface ElevateRequest {
  simulation_artifact_id: string;
  elevation_method: 'copy' | 'regenerate' | 'hybrid';
  hybrid_diff?: object;  // Required if method is 'hybrid'
  chairman_signature: string;  // "I elevate this schema to reality"
  notes?: string;
}

interface ElevateResponse {
  elevation_id: string;
  from_location: string;
  to_location: string;
  status: 'elevated';
  elevation_stage: number;  // 16, 17, or 22
}
```

---

## Infrastructure Components

### GitHub Integration

**Simulation Organization Setup:**
```yaml
Organization: ehg-simulations
Purpose: Ephemeral venture repositories
Settings:
  - Public repos disabled
  - Auto-delete after TTL
  - No CI/CD (build on deploy only)
  - Minimal permissions
```

**Repository Creation Flow:**
```
1. Generate repo name: {venture-slug}-{simulation-id}
2. Create from template in ehg-simulations/
3. Push initial scaffold
4. Return repo URL
5. Schedule TTL cleanup
```

### Deployment Infrastructure

**Vercel Project Structure:**
```yaml
Project: ehg-simulations
Type: Monorepo with dynamic subdomains
Domains:
  - *.possible.ehg.dev
Environment:
  - SIMULATION_MODE=true
  - WATERMARK_ENABLED=true
Build:
  - Triggered on repo push
  - Minimal build (no optimization)
Cleanup:
  - Auto-delete deployments after TTL
```

**Watermark Implementation:**
```typescript
// Middleware for simulation deployments
export function simulationMiddleware(request: Request) {
  const response = await fetch(request);

  // Inject watermark banner
  const html = await response.text();
  const watermarkedHtml = html.replace(
    '</body>',
    `<div id="simulation-watermark" style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #f59e0b;
      color: black;
      text-align: center;
      padding: 8px;
      font-weight: bold;
      z-index: 99999;
    ">
      ⚠️ SIMULATION - NOT PRODUCTION - Venture must survive Stage 3 validation
    </div></body>`
  );

  return new Response(watermarkedHtml, response);
}
```

### Database Namespace

**Schema Isolation:**
```sql
-- Create simulation schema for venture
CREATE SCHEMA schema_sim_genesis_001;

-- All simulation tables go here
CREATE TABLE schema_sim_genesis_001.users (...);
CREATE TABLE schema_sim_genesis_001.products (...);

-- Tag the schema
COMMENT ON SCHEMA schema_sim_genesis_001 IS
  'SIMULATION: venture=genesis_001, expires=2026-05-14, ttl=90';
```

**Promotion (Copy to Production):**
```sql
-- At Stage 16, copy schema to production
CREATE SCHEMA schema_genesis_001;

-- Copy tables with data types (no data)
DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'schema_sim_genesis_001'
  LOOP
    EXECUTE format(
      'CREATE TABLE schema_genesis_001.%I (LIKE schema_sim_genesis_001.%I INCLUDING ALL)',
      tbl.tablename, tbl.tablename
    );
  END LOOP;
END $$;

-- Archive simulation schema
ALTER SCHEMA schema_sim_genesis_001 RENAME TO schema_sim_genesis_001_archived;
```

---

## Lifecycle Management

### TTL Enforcement

```typescript
// Cron job: daily at 00:00 UTC
async function cleanupExpiredSimulations() {
  // Find expired simulations
  const expired = await db.simulation_artifacts
    .where('expires_at', '<', new Date())
    .where('epistemic_status', '=', 'simulation');

  for (const artifact of expired) {
    // Archive the artifact
    await db.simulation_artifacts.update(artifact.id, {
      epistemic_status: 'archived',
      archived_at: new Date(),
      archive_reason: 'ttl_expired'
    });

    // Destroy infrastructure
    await destroySimulationInfrastructure(artifact);
  }
}

async function destroySimulationInfrastructure(artifact: SimulationArtifact) {
  switch (artifact.artifact_type) {
    case 'repo':
      await github.repos.delete(artifact.artifact_url);
      break;
    case 'deployment':
      await vercel.deployments.delete(artifact.artifact_metadata.deployment_id);
      break;
    case 'schema':
      await db.raw(`DROP SCHEMA ${artifact.artifact_metadata.schema_name} CASCADE`);
      break;
  }
}
```

### Stage 3 Rejection Cleanup

```typescript
// Triggered when venture fails Stage 3
async function handleStage3Rejection(ventureId: string) {
  // Find all simulation artifacts
  const artifacts = await db.simulation_artifacts
    .where('venture_id', '=', ventureId)
    .where('epistemic_status', '=', 'simulation');

  for (const artifact of artifacts) {
    // Archive immediately
    await db.simulation_artifacts.update(artifact.id, {
      epistemic_status: 'archived',
      archived_at: new Date(),
      archive_reason: 'stage3_rejected'
    });

    // Destroy infrastructure
    await destroySimulationInfrastructure(artifact);
  }

  // Log the rejection
  await db.system_events.insert({
    event_type: 'SIMULATION_CLEANUP',
    venture_id: ventureId,
    payload: { reason: 'stage3_rejected', artifacts_archived: artifacts.length }
  });
}
```

---

## Security Considerations

### Isolation

- Simulation schemas have no access to production data
- Simulation deployments use separate Supabase project (read-only demo data)
- GitHub simulation org has no access to production repos
- API keys for simulations are scoped and rotated

### Cost Controls

```typescript
const SIMULATION_LIMITS = {
  max_tables_per_schema: 50,
  max_repo_size_mb: 100,
  max_deployment_requests_per_day: 1000,
  max_concurrent_simulations: 10,
  max_cost_per_simulation_usd: 5.00
};
```

### Audit Trail

All simulation operations logged:
- Creation with full config
- Access attempts
- Promotion decisions
- Destruction events

---

## Monitoring

### Metrics

```typescript
const SIMULATION_METRICS = [
  'simulation_created_total',
  'simulation_ratified_total',
  'simulation_archived_total',
  'simulation_promoted_total',
  'simulation_ttl_expired_total',
  'simulation_stage3_rejected_total',
  'simulation_generation_duration_seconds',
  'simulation_infrastructure_cost_usd'
];
```

### Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| High failure rate | >10% simulations fail | Warning |
| Cost spike | Daily cost > $50 | Warning |
| Orphaned infrastructure | Artifacts without cleanup | Error |
| Promotion failure | Promotion to production fails | Critical |

---

## Integration Points

### EVA Orchestration

EVA monitors simulation state:
- Tracks active simulations per venture
- Alerts Chairman when Stage 3 approaches
- Triggers cleanup on rejection
- Recommends promotion at Stage 16/17

### Chairman Console

CLI commands:
```bash
leo simulations list              # List all active simulations
leo simulations status <id>       # Detail view of simulation
leo simulations promote <id>      # Initiate promotion flow
leo simulations archive <id>      # Manual archive
leo simulations regenerate <id>   # Regenerate from current PRD
```

### 25-Stage Workflow

Integration points:
- **Stage 1:** Simulation created, PRD official
- **Stage 2:** AI critiques simulation artifacts
- **Stage 3:** Kill gate — preserve or archive
- **Stage 16:** Schema elevation decision (Chairman signature required)
- **Stage 17:** Repo elevation decision (Chairman signature required)
- **Stage 22:** Deployment elevation decision (Chairman signature required)

---

*Architecture document generated: December 29, 2025*
*Part of Genesis Oath v3 documentation*
