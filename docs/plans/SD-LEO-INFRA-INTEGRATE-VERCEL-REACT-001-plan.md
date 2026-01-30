# Implementation Plan: LEO Performance Enhancement with Vercel Patterns

**SD**: SD-LEO-INFRA-INTEGRATE-VERCEL-REACT-001
**Created**: 2026-01-29
**Status**: Approved for implementation

---

## RCA Findings Summary

### Heap Memory Error Status: NO ACTIVE ISSUES

**Finding**: The RCA found **no active JavaScript heap out of memory errors**. The system is stable with 11GB+ free memory.

| Past Issue | Root Cause | Status |
|------------|------------|--------|
| Orphaned setInterval calls | Rate limiter, learning cycles | FIXED (Jan 23, 2026) |
| Unhandled promise rejections | Fire-and-forget promises | FIXED (Jan 23, 2026) |
| False positive memory detection | Overly aggressive PERFORMANCE checks | FIXED (Dec 6, 2025) |

**Conclusion**: Heap errors were caused by **runtime memory leaks** (orphaned intervals), not barrel imports. However, barrel imports represent a **bundle size and tree-shaking risk** that should still be addressed.

---

### Barrel Import Analysis: WIDESPREAD ANTI-PATTERN

| Codebase | Barrel Files | `export *` Statements | Estimated Unused Code |
|----------|--------------|----------------------|----------------------|
| EHG Frontend | 57 | 16 | 10-20% |
| EHG_Engineer | 38 | 43 (CRITICAL) | 30-40% |

**Hotspots**:
- `lib/tasks/index.js` - 6 wildcard re-exports
- `lib/error-pattern-library/index.js` - 8 domain re-exports
- `src/components/stages/v2/index.ts` - 25 stage exports

---

### PERFORMANCE Agent Status: FUNCTIONAL (Not Hollow)

**Correction**: The 5 skills referenced in `performance-agent.md` are **implemented** in `lib/sub-agents/performance.js` (535 lines). They are phase descriptions, not external skill files.

| Phase | Current Implementation | Vercel Gap |
|-------|----------------------|------------|
| Phase 1: Bundle Analysis | Files >500KB detection | No barrel import detection |
| Phase 2: Load Time | 3s threshold simulation | No waterfall detection |
| Phase 3: Memory | useEffect cleanup check | No LRU cache patterns |
| Phase 4: Query | select(*) detection | Already implemented |
| Phase 5: Render | LOC >300 detection | No React.memo patterns |

---

## Implementation Plan

### Step 1: Create Barrel Import Remediation Protocol

**File**: `.claude/skills/barrel-remediation.md`

Create a remediation guideline that:
- Documents the anti-pattern with before/after examples
- Provides refactoring patterns for `export *` elimination
- Includes eslint rule configuration for prevention

**Verification**: Run `npm run lint` after adding eslint rule

---

### Step 2: Create Performance Index (AGENTS.md)

**File**: `.claude/context/PERFORMANCE-INDEX.md`

Transcribe the 57 Vercel heuristics into a LEO-owned "Passive Context" file organized by priority:

```
## CRITICAL Rules (Always Check)
- async-defer-await: Relocate await into needed branches
- async-parallel: Use Promise.all() for independent ops
- bundle-barrel-imports: Import directly, avoid barrel files
- bundle-dynamic-imports: Use next/dynamic for heavy components
...

## HIGH Rules (Check for Features)
- server-cache-react: Use React.cache() for deduplication
...
```

**Verification**: File loads in Claude Code context when PERFORMANCE agent invoked

---

### Step 3: Extend PERFORMANCE Sub-Agent Phases

**File**: `lib/sub-agents/performance.js`

Add new detection phases:

| New Phase | Detection | Vercel Rule |
|-----------|-----------|-------------|
| Phase 6: Waterfall Detection | Sequential await chains | async-defer-await |
| Phase 7: Barrel Import Audit | `export * from` patterns | bundle-barrel-imports |
| Phase 8: Server Cache Check | Missing React.cache() | server-cache-react |

**Verification**: `node scripts/execute-subagent.js --code PERFORMANCE --sd-id TEST-001`

---

### Step 4: Add Critical Violation Hard Block

**File**: `scripts/modules/handoff/executors/exec-to-plan/gates/performance-critical-gate.js`

Create new gate that:
- Runs after Sub-Agent Orchestration gate
- Checks PERFORMANCE verdict for CRITICAL violations
- Hard blocks if: barrel imports in new code OR waterfall chains detected

**Gate Position**: After Gate 3 (Sub-Agent Orchestration), before Gate 4 (Testing)

**Verification**: Create test SD with barrel import, verify handoff blocks

---

### Step 5: Register Gate in Handoff Executor

**File**: `scripts/modules/handoff/executors/exec-to-plan/index.js`

Add performance-critical-gate to `getRequiredGates()` for:
- `feature` type SDs
- `performance` type SDs
- `enhancement` type SDs (UI changes)

**Verification**: Run full EXEC-TO-PLAN handoff with performance SD

---

## Files to Modify/Create

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `.claude/skills/barrel-remediation.md` | Remediation guidelines |
| CREATE | `.claude/context/PERFORMANCE-INDEX.md` | Vercel heuristics (passive context) |
| MODIFY | `lib/sub-agents/performance.js` | Add phases 6-8 |
| CREATE | `scripts/modules/handoff/executors/exec-to-plan/gates/performance-critical-gate.js` | Hard block gate |
| MODIFY | `scripts/modules/handoff/executors/exec-to-plan/index.js` | Register new gate |
| MODIFY | `.claude/agents/performance-agent.md` | Reference new phases |

---

## Verification Plan

1. **Unit Test**: New phases in performance.js
   ```bash
   npm run test:unit -- --grep "performance"
   ```

2. **Integration Test**: Full handoff with barrel import violation
   ```bash
   node scripts/handoff.js execute EXEC-TO-PLAN SD-TEST-BARREL-001
   ```

3. **Manual Verification**: Create PR with `export * from` and verify CI blocks

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| False positives from barrel detection | Allowlist for intentional barrels (routes, configs) |
| Breaks existing workflows | Gate is ADVISORY for 2 weeks before REQUIRED |
| Performance overhead from new checks | Async execution, cached results for 24h |

---

## Decisions Made

| Decision | Answer |
|----------|--------|
| Implementation approach | Create separate SD (not implement now) |
| Gate enforcement mode | REQUIRED (hard block), SD-type intelligent |
| Legacy barrel imports | Grandfather existing, block new only |

---

## SD-Type Intelligent Gate Enforcement

The Performance Critical gate will enforce differently by SD type:

| SD Type | Barrel Import Check | Waterfall Check | Server Cache Check |
|---------|--------------------|-----------------|--------------------|
| `feature` | REQUIRED (block) | REQUIRED (block) | ADVISORY |
| `performance` | REQUIRED (block) | REQUIRED (block) | REQUIRED (block) |
| `enhancement` | REQUIRED (block) | ADVISORY | ADVISORY |
| `refactor` | REQUIRED (block) | ADVISORY | ADVISORY |
| `fix` | ADVISORY | ADVISORY | SKIP |
| `infrastructure` | SKIP | SKIP | SKIP |
| `documentation` | SKIP | SKIP | SKIP |

**Rationale**: Feature and performance SDs introduce new code that must meet standards. Bug fixes and infrastructure changes have lower impact on bundle size.

---

## Grandfathering Strategy

**Implementation**: Create baseline snapshot of existing barrel imports before gate activation.

**Files to create**:
- `config/barrel-baseline-2026-01-29.json` - Snapshot of existing barrel patterns
- Gate logic: Only flag files NOT in baseline

**Detection logic**:
```javascript
// In performance-critical-gate.js
const baseline = require('../../../config/barrel-baseline-2026-01-29.json');
const newBarrels = detectedBarrels.filter(b => !baseline.includes(b.file));
if (newBarrels.length > 0) {
  return { pass: false, reason: 'New barrel imports detected' };
}
```

---

## Vercel Source Reference

- **Repository**: [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)
- **Skill**: react-best-practices
- **Rules**: 57 across 8 categories
- **AGENTS.md**: [Direct link](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/AGENTS.md)

---

## Next Steps (After Plan Approval)

1. **Capture Baseline**: Run barrel detection and save to config/
2. **Implement in sequence**: Steps 1-5 as defined above
3. **Validate**: Full handoff test with test SD containing new barrel import
