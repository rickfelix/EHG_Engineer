# Utility Library Guide

**SD-REFACTOR-UTILS-001: Utility Library Consolidation**

This document provides the canonical reference for all utility modules in the EHG_Engineer codebase.

## Quick Reference

| Module | Location | Purpose | LOC |
|--------|----------|---------|-----|
| test-intelligence | lib/utils/test-intelligence.js | Test selector validation, navigation flow | 657 |
| batch-db-operations | lib/utils/batch-db-operations.js | Batch Supabase queries, RPC calls | 438 |
| validation-automation | lib/utils/validation-automation.js | Semantic code search, gap analysis | 441 |
| sd-type-detection | lib/utils/sd-type-detection.js | SD type detection (DEPRECATED - use sd-type-guard) | 213 |
| sd-type-validation | lib/utils/sd-type-validation.js | SD validation requirements | 390 |
| sd-type-guard | lib/utils/sd-type-guard.js | Pre-update SD type validation with AI | 264 |
| on-demand-loader | lib/utils/on-demand-loader.js | Sub-agent catalog loading | 399 |
| contract-helpers | lib/utils/contract-helpers.js | Artifact storage/retrieval | 186 |

## US-001: test-intelligence.js

### Purpose
Provides test selector validation and navigation flow analysis for E2E tests.

### Key Exports
```javascript
import {
  validateTestSelector,
  analyzeNavigationFlow,
  detectErrorPatterns
} from '../lib/utils/test-intelligence.js';
```

### Usage
```javascript
const result = await validateTestSelector('#submit-btn', { strict: true });
// Returns: { valid: boolean, issues: string[], suggestions: string[] }
```

## US-002: Supabase Client Pool

### Pattern
Use `batch-db-operations.js` for all database operations requiring batch processing or connection pooling.

### Key Exports
```javascript
import {
  batchQuery,
  batchRpc,
  batchInsert,
  batchUpdate
} from '../lib/utils/batch-db-operations.js';
```

### Best Practice
- Never create raw Supabase clients in module scope
- Use `lib/factories/client-factory.js` for singleton clients
- Use batch operations for bulk inserts/updates

## US-003: text-analysis Utilities

Located in: `lib/utils/validation-automation.js`

### Key Functions
- `semanticCodeSearch(query, options)` - AI-powered code search
- `analyzeBacklogGaps(items)` - Gap analysis for backlog items
- Pattern matching for text validation

## US-004: file-scanner Contract

### Default Behavior
- Scans from project root unless path specified
- Ignores node_modules, .git, dist by default
- Returns relative paths

### Override Defaults
```javascript
import { scanFiles } from '../lib/utils/file-scanner.js';

const files = await scanFiles({
  root: '/custom/path',
  ignore: ['*.test.js'],
  extensions: ['.js', '.ts']
});
```

## US-005: SD Classifier API

### CRITICAL: Migration Notice
The following modules have overlapping functionality:
- `lib/utils/sd-type-detection.js` (DEPRECATED)
- `lib/utils/sd-type-validation.js` (current)
- `lib/utils/sd-type-guard.js` (preferred)

### Canonical Import
```javascript
// PREFERRED: Use sd-type-guard for all SD type operations
import { SDTypeGuard, validateSDType } from '../lib/utils/sd-type-guard.js';

// For validation requirements only
import { getValidationRequirements } from '../lib/utils/sd-type-validation.js';
```

### Migration Path
1. Replace `sd-type-detection.js` imports with `sd-type-guard.js`
2. Update callers to use new API
3. Remove deprecated imports

## US-006: SpecialistBase & Quickfix Lifecycle

Located in: `lib/utils/quickfix-specialists.js`

### Lifecycle
1. Issue detected (via bypass-evaluation.js)
2. Specialist selected (via quickfix-specialists.js)
3. RCA integration (via quickfix-rca-integration.js)
4. Evidence capture (via quickfix-evidence-capture.js)
5. Resolution applied

### Extending SpecialistBase
```javascript
import { SpecialistBase } from '../lib/utils/quickfix-specialists.js';

class CustomSpecialist extends SpecialistBase {
  async analyze(issue) {
    // Custom analysis logic
  }
}
```

## US-007: CI Guardrails

### ESLint Rules
- `no-duplicate-imports`: Prevent duplicate utility imports
- `import/no-cycle`: Prevent circular dependencies in utils

### Pre-commit Checks
- Utility functions must have JSDoc
- New utils must be added to this guide
- Duplicate function names flagged

### Adding New Utilities
1. Check this guide for existing functionality
2. If new, add to appropriate module or create new
3. Update this guide with usage examples
4. Add unit tests

---

## Consolidation Opportunities (Identified)

### Priority 1: SD Type Handling
- **Issue**: `getValidationRequirements()` defined in 2 locations
- **Files**: sd-type-detection.js, sd-type-validation.js
- **Action**: Use sd-type-guard.js as single source

### Priority 2: Boilerplate Patterns
- **Issue**: Repeated pattern arrays in validation modules
- **Action**: Consider extracting to `lib/utils/boilerplate-patterns.js`

### Priority 3: Validation Result Formatting
- **Issue**: 18 validation modules with different result structures
- **Action**: Create `lib/utils/validation-result-builder.js`

---

*Generated by SD-REFACTOR-UTILS-001*
*Last Updated: 2025-12-27*
