# Genesis Implementation Guide


## Metadata
- **Category**: Architecture
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, api, feature, guide

> **Purpose**: Definitive guide to Genesis codebase locations, file responsibilities, and integration patterns.
> **Last Updated**: 2026-01-01
> **Status**: Ground-truth validated via multi-AI triangulation

---

## Critical: Genesis Spans Two Codebases

Genesis is **NOT** contained in a single repository. Implementation is split across:

| Codebase | Path | Purpose | LOC |
|----------|------|---------|-----|
| **EHG_Engineer** | `/mnt/c/_EHG/EHG_Engineer/` | Infrastructure components | 3,228 |
| **EHG App** | `/mnt/c/_EHG/ehg/` | Pipeline orchestration | 5,254 |
| | | **Total** | **8,482** |

---

## File Location Map

### EHG_Engineer: `/lib/genesis/` (Infrastructure)

| File | LOC | Purpose |
|------|-----|---------|
| `branch-lifecycle.js` | 562 | Simulation session CRUD, incineration sequence |
| `pattern-library.js` | 157 | Database queries for `scaffold_patterns` table |
| `pattern-assembler.js` | 236 | Slot-based template composition `{{variable}}` |
| `quality-gates.js` | 370 | TypeScript, ESLint, Build, Smoke test gates |
| `vercel-deploy.js` | 325 | CLI-based Vercel deployment |
| `mock-mode.js` | 52 | Mock mode assertion utilities |
| `mock-mode-injector.js` | 351 | Inject mock mode checks into generated code |
| `watermark-middleware.js` | 213 | Visual "SIMULATION" watermark injection |
| `ttl-cleanup.js` | 312 | TTL expiration and garbage collection |

**Tests**: `/lib/genesis/__tests__/` (6 files, 650 LOC)

### EHG App: `/lib/genesis/` (Orchestrators)

| File | LOC | Purpose |
|------|-----|---------|
| `ScaffoldEngine.js` | 288 | Pattern selection → assembly → quality gates |
| `vercel-deploy.js` | 336 | Direct Vercel API v13 deployment |
| `mock-mode-verifier.js` | 369 | Post-deployment mock mode verification |
| `repo-creator.js` | 439 | Stage 17 GitHub repo creation |

### EHG App: `/scripts/genesis/` (Pipeline)

| File | LOC | Purpose | Stage |
|------|-----|---------|-------|
| `genesis-pipeline.js` | 398 | End-to-end orchestrator | 1 |
| `genesis-gate.js` | 441 | Ratification checkpoint | 1→2 |
| `pattern-selector.js` | 238 | PRD → pattern matching | 1 |
| `seed-patterns.js` | 1,324 | Pattern library definitions | Setup |
| `soul-extractor.js` | 419 | Requirement extraction | 16 |
| `regeneration-gate.js` | 416 | Promotion validation | 16 |
| `production-generator.js` | 586 | Production code generation | 17 |

---

## Which Codebase for What?

### Add to EHG_Engineer when:
- Building **reusable infrastructure** (database queries, deployment utilities)
- Creating **quality enforcement** (gates, validation, cleanup)
- Implementing **pattern storage/retrieval**
- Adding **test infrastructure**

### Add to EHG App when:
- Building **pipeline orchestration** (end-to-end flows)
- Creating **stage-specific logic** (Stage 16 extraction, Stage 17 generation)
- Implementing **user-facing features** (UI components, API endpoints)
- Adding **business logic** (ratification, approval workflows)

### Decision Tree
```
Is it a reusable utility with no stage logic?
  YES → EHG_Engineer/lib/genesis/
  NO  → Does it orchestrate multiple steps?
          YES → EHG App/scripts/genesis/
          NO  → Is it a UI component or API?
                  YES → EHG App/src/
                  NO  → EHG App/lib/genesis/
```

---

## Known Duplications

### vercel-deploy.js (EXISTS IN BOTH)

| Aspect | EHG_Engineer | EHG App |
|--------|--------------|---------|
| Approach | CLI (`vercel` command) | Direct API (v13) |
| Auth | Vercel CLI login | VERCEL_TOKEN env var |
| Output | Parses CLI stdout | Parses JSON response |
| Health check | HTTP 200 verify | Polls deployment state |

**Recommendation**: Use EHG App's API approach (more robust), add EHG_Engineer's health check.

### mock-mode (COMPLEMENTARY)

| Aspect | EHG_Engineer | EHG App |
|--------|--------------|---------|
| Purpose | Injection | Verification |
| When | Pre-deployment | Post-deployment |
| Files | `mock-mode.js`, `mock-mode-injector.js` | `mock-mode-verifier.js` |

**Recommendation**: Use together - inject then verify.

---

## Integration Points

### API Endpoint
```
EHG App: /src/pages/api/genesis/ratify.ts
- Creates venture at Stage 1 from simulation
- Validates simulation readiness
- Links PRD as official artifact
```

### Database Tables
```sql
-- All in shared Supabase database
simulation_sessions   -- Simulation lifecycle tracking
scaffold_patterns     -- Pattern library storage
soul_extractions      -- Stage 16 requirement extraction
genesis_deployments   -- Vercel deployment tracking
```

### Entry Points
```
CLI:  node /ehg/scripts/genesis/genesis-pipeline.js create "seed text"
API:  POST /api/genesis/ratify { simulationId: "..." }
UI:   NONE (not implemented)
```

---

## Current Gaps (As of 2026-01-01)

### Missing in EHG App
- [ ] Quality gates (port from EHG_Engineer)
- [ ] TTL cleanup (port from EHG_Engineer)
- [ ] Watermark middleware (port from EHG_Engineer)
- [ ] Comprehensive tests

### Missing in EHG_Engineer
- [ ] Pipeline orchestration
- [ ] Stage-specific logic
- [ ] Ratification mechanism

### Missing Overall
- [ ] `/api/genesis/create` endpoint (CLI only)
- [ ] Genesis dashboard UI
- [ ] Orchestrator → Stage 16/17 wiring

---

## Import Patterns

### From EHG_Engineer lib
```javascript
// These are infrastructure utilities
import { createSimulationBranch } from '@/lib/genesis/branch-lifecycle';
import { runAllGates } from '@/lib/genesis/quality-gates';
import { getPatterns } from '@/lib/genesis/pattern-library';
```

### From EHG App scripts
```javascript
// These are pipeline orchestrators (run as scripts, not imported)
// Execute via: node scripts/genesis/genesis-pipeline.js
```

### From EHG App lib
```javascript
// These are classes for orchestration
import { ScaffoldEngine } from '@/lib/genesis/ScaffoldEngine';
import { MockModeVerifier } from '@/lib/genesis/mock-mode-verifier';
```

---

## Validation Checklist

Before claiming Genesis feature is "complete":

- [ ] Code exists in correct codebase per this guide
- [ ] Entry point exists (API/CLI/UI)
- [ ] Integration with 25-stage workflow verified
- [ ] Tests pass in both codebases
- [ ] No duplicate functionality introduced

---

*Document created from ground-truth triangulation audit (2026-01-01)*
*Sources: OpenAI, Gemini, Claude Code codebase analysis*
