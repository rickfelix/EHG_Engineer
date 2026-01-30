# Barrel Import Remediation Protocol

## Overview

Barrel exports (`export * from`) are an anti-pattern that negatively impacts bundle size and tree-shaking. This skill provides guidelines for identifying and remediating barrel imports.

## The Anti-Pattern

### What is a Barrel File?

A barrel file re-exports multiple modules from a single index file:

```javascript
// ❌ BAD: lib/utils/index.js (barrel file)
export * from './string-helpers.js';
export * from './date-helpers.js';
export * from './math-helpers.js';
export * from './validation.js';
```

### Why It's Problematic

1. **Bundle Size**: Importing ONE function imports ALL functions
2. **Tree-Shaking Failure**: Bundlers can't eliminate unused exports
3. **Circular Dependencies**: Barrel files create dependency cycles
4. **Build Time**: Larger dependency graphs slow builds

### Example Impact

```javascript
// You want ONE function
import { formatDate } from './lib/utils';

// But you GET all 47 utility functions bundled
// Because the bundler can't tree-shake barrel exports
```

## Remediation Patterns

### Pattern 1: Direct Import (Preferred)

```javascript
// ✅ GOOD: Direct import from source file
import { formatDate } from './lib/utils/date-helpers.js';
import { validateEmail } from './lib/utils/validation.js';
```

### Pattern 2: Named Re-exports (Acceptable)

```javascript
// ✅ ACCEPTABLE: Named re-exports (explicit tree-shaking)
// lib/utils/index.js
export { formatDate, parseDate } from './date-helpers.js';
export { validateEmail } from './validation.js';
// Only exports what's explicitly named
```

### Pattern 3: Async Import for Heavy Modules

```javascript
// ✅ GOOD: Dynamic import for heavy modules
const { heavyAnalyzer } = await import('./lib/heavy-analyzer.js');
```

## ESLint Configuration

Add to `.eslintrc.cjs`:

```javascript
module.exports = {
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'ExportAllDeclaration',
        message: 'Avoid barrel exports (export *). Use named exports for tree-shaking.'
      }
    ]
  }
};
```

## Detection Script

```bash
# Find all barrel exports in codebase
grep -r "export \* from" --include="*.js" --include="*.ts" . | grep -v node_modules
```

## Grandfathering Policy

Existing barrel files are grandfathered in the baseline:
- `config/barrel-baseline-2026-01-29.json`

Only NEW files will trigger the performance-critical-gate.

## Refactoring Checklist

When remediating a barrel file:

- [ ] List all exports from the barrel file
- [ ] Update all import sites to use direct imports
- [ ] Test that all imports resolve correctly
- [ ] Remove the barrel file or convert to named re-exports
- [ ] Run `npm run lint` to verify
- [ ] Run `npm run test` to verify no regressions

## Common Mistakes

### Don't: Create New Barrel Files

```javascript
// ❌ DON'T create new barrel files
// lib/new-feature/index.js
export * from './component-a.js';
export * from './component-b.js';
```

### Do: Export Directly

```javascript
// ✅ DO export from source files directly
// Import from specific files
import { ComponentA } from './lib/new-feature/component-a.js';
import { ComponentB } from './lib/new-feature/component-b.js';
```

## References

- [Vercel React Best Practices: bundle-barrel-imports](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/AGENTS.md)
- [Node.js ESM: Named Exports](https://nodejs.org/api/esm.html#esm_named_exports)
- SD: SD-LEO-INFRA-INTEGRATE-VERCEL-REACT-001
