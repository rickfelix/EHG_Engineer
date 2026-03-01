# Genesis Infrastructure Library (EHG_Engineer)

> **Location**: `/mnt/c/_EHG/EHG_Engineer/lib/genesis/`
> **Purpose**: Reusable infrastructure components for Genesis simulation system
> **Related**: See also `/mnt/c/_EHG/ehg/lib/genesis/` and `/mnt/c/_EHG/ehg/scripts/genesis/`

---

## Important: Genesis Spans Two Codebases

This directory contains **infrastructure components**. The **pipeline orchestration** is in the EHG app:

| Location | Contents |
|----------|----------|
| **Here** (EHG_Engineer/lib/genesis) | Database queries, quality gates, deployment utilities |
| EHG App (ehg/lib/genesis) | ScaffoldEngine, mock-mode verifier, repo creator |
| EHG App (ehg/scripts/genesis) | Pipeline scripts, stage-specific logic |

See: `/docs/architecture/genesis-implementation-guide.md` for full details.
See: `/docs/genesis/troubleshooting.md` for common issues and fixes.

---

## Module Overview

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `branch-lifecycle.js` | Simulation session CRUD and incineration | `createSimulationBranch()`, `incinerateBranch()` |
| `pattern-library.js` | Query `scaffold_patterns` table | `getPatterns()`, `getPatternByType()` |
| `pattern-assembler.js` | Slot-based template composition | `assemblePattern()`, `substituteSlots()` |
| `quality-gates.js` | Pre-deployment validation | `runAllGates()`, `runTypeScriptGate()` |
| `vercel-deploy.js` | CLI-based Vercel deployment | `deployToVercel()`, `verifyDeployment()` |
| `mock-mode.js` | Mock mode assertions | `assertMockMode()`, `isMockModeEnabled()` |
| `mock-mode-injector.js` | Inject mock mode into code | `injectMockMode()` |
| `watermark-middleware.js` | Visual simulation watermark | `watermarkMiddleware()` |
| `ttl-cleanup.js` | TTL expiration and cleanup | `runCleanup()`, `getExpiredDeployments()` |
| `prd-generator.js` | PRD generation from seed text (**STUB**) | `generatePRD()`, `getPRDGenerationStatus()` |

---

## Tiered Simulation System

Genesis supports two simulation tiers (SD-GENESIS-FIX-001):

| Tier | Name | Features | Default TTL |
|------|------|----------|-------------|
| **A** (default) | Lite Simulation | PRD generation, AI mockups, validation report | 7 days |
| **B** | Full Simulation | + Code scaffolding, GitHub repo, Vercel deployment | 30 days |

Use tier A for quick validation, tier B for comprehensive simulations.

```javascript
// Tier A (default) - quick validation
const lite = await createSimulationBranch('My idea');

// Tier B - full simulation with deployment
const full = await createSimulationBranch('Complex venture', { tier: 'B' });
```

---

## Usage Examples

### Create Simulation Session
```javascript
import { createSimulationBranch, incinerateBranch } from './branch-lifecycle.js';

const session = await createSimulationBranch('A marketplace for vintage synths', {
  ttlDays: 90,
  ventureId: 'optional-venture-uuid'
});
// Returns: { id, name, repoUrl, previewUrl, createdAt, ttlDays, status }

// Later: incinerate failed simulation
await incinerateBranch(session.id, { immediate: true });
```

### Run Quality Gates
```javascript
import { runAllGates } from './quality-gates.js';

const result = await runAllGates('/path/to/project', {
  skipTypeScript: false,
  skipESLint: false,
  skipBuild: false,
  skipSmokeTest: true
});
// Returns: { passed: boolean, results: GateResult[], summary: string }
```

### Query Pattern Library
```javascript
import { getPatterns, getPatternByType } from './pattern-library.js';

const allPatterns = await getPatterns();
const components = await getPatternByType('component');
```

---

## Tests

Unit tests are in `__tests__/`:
- `mock-mode.test.js`
- `mock-mode-injector.test.js`
- `pattern-library.test.js`
- `pattern-assembler.test.js`
- `watermark-middleware.test.js`
- `ttl-cleanup.test.js`

Run with: `npm test -- --grep genesis`

---

## Dependencies

- `@supabase/supabase-js` - Database access
- `dotenv` - Environment configuration
- `@octokit/rest` - GitHub API (optional, for repo operations)

---

## Adding New Modules

1. Create module in this directory
2. Add unit tests in `__tests__/`
3. Update this README
4. If orchestration needed, consider adding to EHG App instead
