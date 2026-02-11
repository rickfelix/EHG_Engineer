# Genesis Virtual Bunker Addendum


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, api, e2e, migration

> **Document Version: GENESIS-VB-1.0**
> **Status: RATIFIED**
> **Date: 2025-12-30**
> **Supersedes: Hard Isolation sections of GENESIS_OATH_V3.md**

| Attribute | Value |
|-----------|-------|
| **Decision Type** | Architecture Simplification |
| **Approved By** | Chairman, OpenAI Council, AntiGravity Council, Claude Architect |
| **Effective Date** | 2025-12-30 |

---

## Executive Summary

This addendum supersedes the "Hard Isolation" architecture described in Genesis Oath v3.1. Instead of separate infrastructure (GitHub orgs, DNS, Supabase projects), we implement a **Virtual Bunker** approach using:

1. **AI Generation from Pattern Library** - No static templates
2. **Mock Mode Isolation** - Existing EHG mock infrastructure
3. **Ephemeral Deployments** - Vercel preview URLs
4. **Regeneration Gates** - Generate fresh code at promotion stages (not copy/elevate)

**Why the change:** Solo founder using Claude Code. Token costs trending to $0. Attention is the bottleneck, not infrastructure costs. Hard isolation adds complexity without proportional value.

---

## Decision Record

### The Original Spec (Hard Isolation)

Genesis Oath v3.1 specified:

| Resource | Simulation (Aries) | Production (Saturn) |
|----------|-------------------|---------------------|
| GitHub Org | `ehg-simulations` | `ehg-ventures` |
| Domain | `*.possible.ehg.dev` | `*.ehg.dev` |
| Database | `supabase-sim` project | `supabase-prod` project |
| Credentials | Simulation-only API keys | Production API keys |

**Problems identified:**

1. **Cost** - Separate infrastructure for each simulation (~$50-100/month)
2. **Complexity** - Managing multiple GitHub orgs, DNS, Supabase projects
3. **Maintenance** - Keeping simulation infra in sync with production patterns
4. **Overkill** - Solo founder doesn't need enterprise-grade isolation

### The Virtual Bunker Decision

**Core insight from AntiGravity Council:**

> "EHG_Engineer is the factory, not the product. You cannot branch the factory to create a product simulation."

**Resolution:** Virtual isolation through code patterns and mock data, not physical infrastructure separation.

| Resource | Virtual Bunker Approach |
|----------|------------------------|
| Code Generation | AI generates from pattern library (no template repo) |
| Data Isolation | Mock mode (`?mock=true` or `EHG_MOCK_MODE=true`) |
| Deployment | Vercel preview URLs (ephemeral, free tier) |
| Database | None during simulation (mock data only) |
| Credentials | None during simulation (mock mode enforced) |

---

## Architecture

### 1. Pattern Library (Replaces Static Templates)

Instead of maintaining a static template repository, we store validated code patterns as data:

```sql
CREATE TABLE scaffold_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_name TEXT NOT NULL UNIQUE,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'component', 'hook', 'service', 'page', 'layout',
    'api_route', 'database_table', 'rls_policy', 'migration'
  )),
  template_code TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  dependencies JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Example patterns
INSERT INTO scaffold_patterns (pattern_name, pattern_type, template_code, variables) VALUES
('auth_context', 'hook', '...code...', '["venture_name", "auth_provider"]'),
('dashboard_layout', 'layout', '...code...', '["venture_name", "nav_items"]'),
('crud_table', 'component', '...code...', '["entity_name", "columns"]'),
('supabase_client', 'service', '...code...', '["venture_name"]');
```

**Generation flow:**

```
Seed Text → PRD Generation → Schema Inference → Pattern Selection → Code Generation
```

**Economics:**
- Pattern library: ~100 patterns, stored in database
- Generation cost: ~$0.12 per venture (12K tokens)
- vs. Template maintenance: $2,000-4,000/year
- Aligns with "tokens → $0" trajectory

### 2. Mock Mode Isolation (Replaces Separate Infrastructure)

EHG already has production-grade mock infrastructure at `/mnt/c/_EHG/ehg/src/mocks/`:

```typescript
// Mock mode activation (already implemented in EHG)
export const isMockMode = (): boolean => {
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mock') === 'true') return true;
    if (localStorage.getItem('mockMode') === 'true') return true;
  }
  return process.env.EHG_MOCK_MODE === 'true';
};
```

**Canonical Environment Variable:** `EHG_MOCK_MODE` (matches playwright.config.ts)

**Mock capabilities:**
- Complete data registry with type-safe generators
- SeededRandom class for deterministic test data
- 971 LOC of mock generators
- Zero backend required for full app operation

**Simulation enforcement:**
All generated venture code MUST include:

```typescript
// SIMULATION ENFORCEMENT - DO NOT REMOVE
if (!isMockMode()) {
  throw new Error('Simulation venture must run in mock mode. Add ?mock=true to URL.');
}
```

This line is removed only at regeneration time (Stage 16+).

### 3. Ephemeral Deployments (Replaces Dedicated Hosting)

**Deployment target:** Vercel preview URLs

| Aspect | Specification |
|--------|--------------|
| URL Pattern | `{venture}-{hash}.vercel.app` |
| Cost | Free tier (100 deployments/day) |
| TTL | Auto-deleted after 90 days (Vercel default) |
| Database | None (mock mode enforced) |
| Secrets | None (mock mode enforced) |

**Deployment command:**
```bash
leo genesis deploy {simulation_id}
# Deploys to Vercel preview, returns URL
# Injects EHG_MOCK_MODE=true environment variable
```

### 4. Regeneration Gates (Replaces Elevation/Promotion)

The original spec described "elevation" - copying simulation artifacts to production. Virtual Bunker uses **regeneration** instead:

| Stage | Original (Elevation) | Virtual Bunker (Regeneration) |
|-------|---------------------|------------------------------|
| 16 | Copy `schema_sim_*` → `schema_*` | Generate fresh schema from validated requirements |
| 17 | Fork `ehg-simulations/*` → `ehg-ventures/*` | Generate fresh repo with production patterns |
| 22 | Redirect `*.possible.ehg.dev` → `*.ehg.dev` | Deploy fresh build to production domain |

**Why regeneration over elevation:**

1. **No drift** - Production code generated from validated requirements, not evolved simulation
2. **Clean slate** - No simulation hacks leak into production
3. **Lessons learned** - Regeneration incorporates learnings from Stages 4-15
4. **Simpler** - No migration scripts, no data sync, no credential swap

---

## Generation Pipeline

### Phase 1: Seed → PRD

```
Input:  "A marketplace for vintage synthesizers"
Output: PRD document with:
        - Problem statement
        - Target users
        - Core features (3-5)
        - Success metrics
        - Initial data model hypothesis
```

**PRD becomes OFFICIAL immediately** (not simulation). It's the validation target.

### Phase 2: PRD → Schema

```
Input:  PRD document
Output: Database schema with:
        - Core tables (inferred from features)
        - Relationships
        - RLS policies (basic)
        - Sample seed data
```

**Schema is tagged `epistemic_status: simulation`**. May be regenerated at Stage 16.

### Phase 3: Schema → Repository

```
Input:  Schema + PRD
Output: Complete repository with:
        - Next.js app structure
        - Generated components (from pattern library)
        - Mock data integration
        - Basic routing
        - Simulation enforcement checks
```

**Repository is ephemeral.** Deleted on incineration, regenerated at Stage 17.

### Phase 4: Repository → Live URL

```
Input:  Repository
Output: Vercel preview deployment
        - EHG_MOCK_MODE=true enforced
        - Watermark overlay ("SIMULATION")
        - No real database connection
```

---

## Generation Contract

**Added 2025-12-30 based on OpenAI validation feedback.**

Pattern selection and code generation is deterministic given these inputs:
- Seed text (venture description)
- PRD requirements (parsed features)
- Pattern library version (hash of all pattern IDs + updated_at timestamps)

### Quality Gates (v1)

All generated code must pass before deployment:

| Gate | Command | Failure Action |
|------|---------|----------------|
| TypeScript | `tsc --noEmit` | Fix type errors, regenerate |
| ESLint | `eslint . --max-warnings 0` | Fix lint errors |
| Startup | `EHG_MOCK_MODE=true npm run dev` | Debug, regenerate |
| Smoke Test | Playwright: homepage renders | Debug, regenerate |

### NOT Required for v1

- Full test suite coverage
- E2E test suite
- Performance benchmarks
- Security audit

### Pattern Composition Strategy

**AntiGravity recommendation:** Start with LARGE patterns, not atomic.

| Pattern Size | Example | Complexity |
|--------------|---------|------------|
| **Large (preferred)** | `full_dashboard_page` | Low - single template |
| Medium | `crud_table_with_modal` | Medium - 2-3 components |
| Atomic (avoid v1) | `button`, `input` | High - many compositions |

Large patterns reduce the "code compiler" risk. The AI selects and customizes complete page templates rather than assembling micro-components.

---

## Incineration Sequence

When a venture fails Stage 3 (Kill Gate) or TTL expires:

```
Day 0:   Stage 3 REJECT or TTL=0
Day 1:   Venture marked `status: archived`
         Simulation artifacts marked `archived_at: NOW()`
Day 2:   Vercel deployment deleted
         Repository deleted (if any)
Day 7:   Simulation data purged from database
Day 30:  Audit trail retained (minimal metadata only)
```

**No production resources exist to clean up** - that's the Virtual Bunker advantage.

---

## Ratification Contract

The `/ratify` command semantics remain unchanged from Genesis Oath v3.1:

**What `/ratify` DOES:**
- Creates venture entity at Stage 1
- Links PRD as official Stage 1-2 artifact
- Tags simulation artifacts to venture
- Schedules Stage 3 Kill Gate date
- Assigns Chairman as owner
- Starts TTL countdown (90 days)
- Prompts user to run `leo critique {venture_id}` for Stage 2

**What `/ratify` does NOT do:**
- Does NOT allocate production resources
- Does NOT create production database/repo/deployment
- Does NOT commit to building the simulated solution
- Does NOT bypass any validation gates
- Does NOT approve budget or timeline

---

## Soul Extraction Process

When a venture passes validation and reaches regeneration gates, we extract "soul" from the simulation:

### What Gets Extracted (Structured Requirements)

| Artifact | Extraction |
|----------|-----------|
| PRD | Already official - no extraction needed |
| Schema | Table names, relationships, field types (not implementation) |
| UI | User flows that worked, component inventory, navigation structure |
| Data | Seed data patterns, mock data shapes |

### What Gets Discarded

| Artifact | Reason |
|----------|--------|
| Simulation code | Regenerated fresh with production patterns |
| Mock implementations | Replaced with real integrations |
| Simulation-specific hacks | Clean slate principle |
| Evolved state | Start fresh from requirements |

### Extraction Format

```json
{
  "venture_id": "genesis-001",
  "extraction_date": "2026-03-15",
  "soul": {
    "validated_requirements": ["...from PRD..."],
    "data_model": {
      "entities": ["User", "Listing", "Transaction"],
      "relationships": ["User hasMany Listings", "..."]
    },
    "user_flows": [
      {"name": "Browse listings", "steps": ["...", "..."]},
      {"name": "Create listing", "steps": ["...", "..."]}
    ],
    "component_inventory": ["ListingCard", "SearchBar", "..."],
    "learnings": ["Users preferred grid view", "Search needs filters"]
  }
}
```

This extraction feeds into Stage 16/17/22 regeneration.

---

## Stage Integration Mapping

### Stage 1: Genesis Entry

| Aspect | Specification |
|--------|--------------|
| Artifact Type | `idea_brief` (existing workflow type) |
| Content | Genesis-generated PRD |
| Status | OFFICIAL (fact, not simulation) |
| Trigger | `/ratify` command |

### Stage 2: AI Multi-Model Critique

| Aspect | Specification |
|--------|--------------|
| Trigger | Manual invocation via `leo critique {venture_id}` |
| Input | PRD + Simulation artifacts |
| Output | Critique document, risk assessment |
| Agents | OpenAI, AntiGravity, Claude (triangulation) |

**Note:** Automated triggering (database trigger on venture creation) deferred to v2 to avoid async complexity. For v1, Chairman manually invokes critique after ratification.

### Stage 3: Kill Gate

| Aspect | Specification |
|--------|--------------|
| Decision | Chairman reviews critique, makes GO/NO-GO |
| On REJECT | Incineration sequence triggered |
| On APPROVE | Continue to Stage 4, simulation persists as reference |

### Stages 4-15: Validation with Simulation Reference

Simulation remains visible as "North Star" but:
- Cannot be edited (read-only)
- May become stale (that's OK)
- Serves as discussion reference
- No code from simulation enters production

### Stage 16: Schema Regeneration Gate

| Aspect | Specification |
|--------|--------------|
| Input | Soul extraction + Stage 15 user stories |
| Process | AI generates production schema from requirements |
| Output | Fresh schema in `ehg-ventures` namespace |
| Simulation | Archived (kept for audit) |

### Stage 17: Repository Regeneration Gate

| Aspect | Specification |
|--------|--------------|
| Input | Stage 16 schema + validated requirements |
| Process | AI generates production repository |
| Output | Fresh repo in `ehg-ventures` GitHub org |
| Simulation repo | Deleted |

### Stages 18-21: Production Build

Standard LEO workflow - build using real infrastructure.

### Stage 22-23: Production Deployment

| Aspect | Specification |
|--------|--------------|
| Domain | `{venture}.ehg.dev` (production) |
| Database | Real Supabase project |
| Credentials | Production secrets injected |

---

## Database Schema Changes

### New Tables

```sql
-- Simulation sessions (audit trail)
CREATE TABLE simulation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id),
  seed_text TEXT NOT NULL,
  prd_content JSONB,
  schema_content JSONB,
  repo_url TEXT,
  preview_url TEXT,
  epistemic_status TEXT DEFAULT 'simulation',
  ttl_days INTEGER DEFAULT 90,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  incinerated_at TIMESTAMPTZ
);

-- Pattern library
CREATE TABLE scaffold_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_name TEXT NOT NULL UNIQUE,
  pattern_type TEXT NOT NULL,
  template_code TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  dependencies JSONB DEFAULT '[]',
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Soul extractions (for regeneration gates)
CREATE TABLE soul_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id),
  simulation_session_id UUID REFERENCES simulation_sessions(id),
  extraction_stage INTEGER NOT NULL,
  soul_content JSONB NOT NULL,
  extracted_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Deferred Tables (v2)

- `elevation_log` - Not needed (regeneration replaces elevation)
- `token_usage` - Defer until cost tracking needed
- `pattern_versions` - Defer until pattern evolution needed

---

## CLI Commands

### Genesis Commands

```bash
# Create new simulation
leo genesis create "A marketplace for vintage synthesizers"
# → Generates PRD, Schema, Repo, deploys to preview
# → Returns simulation_id and preview URL

# View simulation status
leo genesis status {simulation_id}
# → Shows TTL, artifacts, epistemic status

# Ratify simulation (creates venture)
leo genesis ratify {simulation_id}
# → Creates venture at Stage 1
# → Links PRD as official artifact
# → Schedules Stage 3 Kill Gate

# Incinerate simulation (manual)
leo genesis incinerate {simulation_id}
# → Triggers incineration sequence

# Extend TTL (rare, logged)
leo genesis extend {simulation_id} --days=30 --reason="..."
# → Requires Chairman auth
# → Maximum 2 extensions
```

### Regeneration Commands

```bash
# Stage 16: Regenerate schema
leo regenerate schema {venture_id}
# → Extracts soul from simulation
# → Generates production schema
# → Archives simulation schema

# Stage 17: Regenerate repository
leo regenerate repo {venture_id}
# → Uses Stage 16 schema
# → Generates production repository
# → Deletes simulation repository
```

---

## Success Criteria

### v1 Launch (Sprint 1-3)

- [ ] `leo genesis create` generates PRD + Schema + basic UI
- [ ] Mock mode enforced in all generated code
- [ ] Vercel preview deployment works
- [ ] `/ratify` creates venture at Stage 1
- [ ] Incineration cleans up artifacts
- [ ] Pattern library has 20+ patterns

### v2 Enhancements (Post-Launch)

- [ ] Full repository generation (not just schema + UI)
- [ ] Polished terminal UI for ceremony
- [ ] Token cost tracking
- [ ] Pattern versioning and evolution

---

## Appendix: Council Verdicts

### OpenAI Council (2025-12-30)

> "STOP - Current specs describe hard isolation that doesn't match Virtual Bunker. Need addendum defining: pattern library architecture, mock mode enforcement, regeneration semantics."

**Resolved by:** This document

### AntiGravity Council (2025-12-30)

> "STOP - Factory vs Product gap. EHG_Engineer is orchestrator, cannot be branched for simulations. Need ephemeral approach with soul extraction."

**Resolved by:** This document (Section: Soul Extraction Process)

### Claude Architect (2025-12-30)

> "STOP - Triangulated verdict: all three perspectives agree specs need update before implementation can proceed."

**Resolved by:** This document

---

## Supersession Notice

This document supersedes the following sections of existing specs:

| Document | Superseded Sections |
|----------|-------------------|
| GENESIS_OATH_V3.md | "Namespace Split (Hard Isolation)", "Infrastructure Mapping" |
| SIMULATION_CHAMBER_ARCHITECTURE.md | All sections related to separate infrastructure |
| GENESIS_SPRINT_ROADMAP.md | Sprint 1 "Mason" scope (updated below) |

**Updated Sprint 1 (Mason) Scope:**

~~Original:~~
- ~~Ephemeral GitHub organization~~
- ~~Simulation domain setup~~
- ~~Simulation database namespace~~

**New:**
- Pattern library tables + seed data (20+ patterns)
- Schema generation from patterns
- Mock mode integration
- Basic CLI structure (`leo genesis create`)
- Vercel preview deployment pipeline

---

*Document generated: December 30, 2025*
*Approved for implementation: Genesis Virtual Bunker v1.0*
