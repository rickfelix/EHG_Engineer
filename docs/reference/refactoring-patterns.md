---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Multi-File Refactoring Patterns Guide



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Architecture](#architecture)
- [Phase Integration](#phase-integration)
  - [Phase 1/2: File Trees](#phase-12-file-trees)
  - [Phase 3: Overflow Prevention](#phase-3-overflow-prevention)
  - [Phase 4: Parallel Execution](#phase-4-parallel-execution)
- [Dependency Analyzer](#dependency-analyzer)
  - [Purpose](#purpose)
  - [Usage](#usage)
  - [Programmatic Usage](#programmatic-usage)
  - [Features](#features)
- [Context Packager](#context-packager)
  - [Purpose](#purpose)
  - [Usage](#usage)
  - [Programmatic Usage](#programmatic-usage)
  - [Package Structure](#package-structure)
  - [Overflow Prevention](#overflow-prevention)
- [Refactoring Executor](#refactoring-executor)
  - [Purpose](#purpose)
  - [Usage](#usage)
  - [Execution Modes](#execution-modes)
  - [Validation Features](#validation-features)
  - [Rollback System](#rollback-system)
  - [Results Structure](#results-structure)
- [Common Refactoring Patterns](#common-refactoring-patterns)
  - [Pattern 1: Rename Function Across Codebase](#pattern-1-rename-function-across-codebase)
  - [Pattern 2: Add TypeScript Types](#pattern-2-add-typescript-types)
  - [Pattern 3: Update Import Paths](#pattern-3-update-import-paths)
  - [Pattern 4: Add Error Handling](#pattern-4-add-error-handling)
  - [Pattern 5: Module Consolidation](#pattern-5-module-consolidation)
  - [Pattern 6: Domain Extraction with Re-Export Wrapper](#pattern-6-domain-extraction-with-re-export-wrapper)
- [Best Practices](#best-practices)
  - [1. Always Analyze First](#1-always-analyze-first)
  - [2. Use Related Files](#2-use-related-files)
  - [3. Start with Small Scopes](#3-start-with-small-scopes)
  - [4. Test Refactoring Function First](#4-test-refactoring-function-first)
  - [5. Enable All Validation](#5-enable-all-validation)
  - [6. Review Package Before Execution](#6-review-package-before-execution)
  - [7. Handle Large Refactorings](#7-handle-large-refactorings)
- [Troubleshooting](#troubleshooting)
  - [Issue: Circular Dependencies Detected](#issue-circular-dependencies-detected)
  - [Issue: Import Validation Failing](#issue-import-validation-failing)
  - [Issue: Syntax Errors After Refactoring](#issue-syntax-errors-after-refactoring)
  - [Issue: Package Too Large](#issue-package-too-large)
  - [Issue: Refactoring Takes Too Long](#issue-refactoring-takes-too-long)
- [Performance Tips](#performance-tips)
  - [1. Optimize Dependency Analysis](#1-optimize-dependency-analysis)
  - [2. Batch Related Refactorings](#2-batch-related-refactorings)
  - [3. Use Selective Validation](#3-use-selective-validation)
  - [4. Leverage Memory-First Strategy](#4-leverage-memory-first-strategy)
- [Integration with LEO Protocol](#integration-with-leo-protocol)
  - [LEAD Agent](#lead-agent)
  - [PLAN Agent](#plan-agent)
  - [EXEC Agent](#exec-agent)
- [Examples](#examples)
  - [Example 1: Analyze Project Structure](#example-1-analyze-project-structure)
  - [Example 2: Create Refactoring Package](#example-2-create-refactoring-package)
  - [Example 3: Execute Refactoring](#example-3-execute-refactoring)
- [CLI Quick Reference](#cli-quick-reference)
- [API Reference](#api-reference)
  - [DependencyAnalyzer](#dependencyanalyzer)
  - [ContextPackager](#contextpackager)
  - [RefactoringExecutor](#refactoringexecutor)
- [Conclusion](#conclusion)

## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, feature, guide

## Overview

Phase 5 of the Claude 4.5 Sonnet integration provides intelligent multi-file refactoring capabilities that leverage all previous phases for context-aware, validated code transformations.

**Success Rate**: Target 85% (up from 60%)

**Key Components**:
- Dependency Graph Analyzer
- Context Packager
- Refactoring Executor with Validation

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  Smart Refactor CLI                      │
│              (scripts/smart-refactor.js)                 │
└────────────────────┬─────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
┌────────────────┐      ┌────────────────┐
│   Dependency   │      │    Context     │
│    Analyzer    │─────▶│   Packager     │
│                │      │                │
└────────────────┘      └───────┬────────┘
                                │
                                ▼
                        ┌────────────────┐
                        │  Refactoring   │
                        │   Executor     │
                        │                │
                        └────────────────┘
                                │
                 ┌──────────────┼──────────────┐
                 │              │              │
                 ▼              ▼              ▼
         ┌──────────┐   ┌──────────┐   ┌──────────┐
         │  Syntax  │   │  Import  │   │ Rollback │
         │Validation│   │Validation│   │  System  │
         └──────────┘   └──────────┘   └──────────┘
```

## Phase Integration

### Phase 1/2: File Trees
- Path validation for all files in dependency graph
- Quick existence checks before refactoring

### Phase 3: Overflow Prevention
- Automatic token estimation for refactoring packages
- Memory-first strategy for large refactorings (>50K tokens)
- Selective approach for medium packages (30K-50K tokens)

### Phase 4: Parallel Execution
- Parallel validation checks (future enhancement)
- Concurrent syntax and import validation

## Dependency Analyzer

### Purpose
Builds a complete dependency graph of your codebase to understand file relationships.

### Usage

```bash
# Analyze a directory
node scripts/smart-refactor.js --analyze src/

# Output:
# 📊 Dependency Analysis
#
# Statistics:
#    Total files: 35
#    Total imports: 128
#    Average imports per file: 3.66
#    Module groups: 2
#
# Most depended files:
#    1. context-monitor.js (2 dependents)
#    2. memory-manager.js (2 dependents)
#
# ✅ No circular dependencies detected
```

### Programmatic Usage

```javascript
import DependencyAnalyzer from './lib/refactoring/dependency-analyzer.js';

const analyzer = new DependencyAnalyzer();
const analysis = await analyzer.analyzeDirectory('src/');

// Get statistics
const stats = analyzer.getStats();
console.log(`Total files: ${stats.totalFiles}`);
console.log(`Total imports: ${stats.totalImports}`);

// Find related files
const related = analyzer.findRelatedFiles('src/components/Button.jsx', 2);
console.log(`Found ${related.length} related files`);

// Detect circular dependencies
const cycles = analyzer.detectCircularDependencies();
if (cycles.length > 0) {
  console.log('⚠️ Circular dependencies found:', cycles);
}
```

### Features

**Import Detection**:
- ES6 imports: `import X from 'Y'`
- CommonJS: `require('X')`
- Dynamic imports: `import('X')`

**Export Detection**:
- Named exports: `export { X }`
- Default exports: `export default X`
- Direct exports: `export const X = ...`

**Graph Operations**:
- Find all dependents (who imports this file?)
- Find all dependencies (what does this file import?)
- Traverse related files with configurable depth
- Group files by module/feature

## Context Packager

### Purpose
Creates intelligent context packages that include all necessary files for a refactoring operation.

### Usage

```bash
# Create package for a single file
node scripts/smart-refactor.js --package src/components/Button.jsx

# Include related files (recommended)
node scripts/smart-refactor.js --package src/components/Button.jsx --related

# Control depth of related file discovery
node scripts/smart-refactor.js --package src/components/Button.jsx --related --depth 3

# Export package summary
node scripts/smart-refactor.js --package src/components/Button.jsx --related --output refactor-plan.json
```

### Programmatic Usage

```javascript
import ContextPackager from './lib/refactoring/context-packager.js';

const packager = new ContextPackager();

const contextPackage = await packager.createPackage(
  ['src/components/Button.jsx'],
  {
    includeRelated: true,
    maxRelatedDepth: 2,
    includeTests: false,
    enableOverflowPrevention: true
  }
);

// Validate package
const validation = packager.validatePackage(contextPackage);
if (!validation.valid) {
  console.log('⚠️ Package issues:', validation.issues);
}

// Export for review
await packager.exportPackage(contextPackage, 'refactor-plan.json');
```

### Package Structure

```javascript
{
  metadata: {
    created: "2025-09-29T...",
    targetFiles: ["src/components/Button.jsx"],
    totalFiles: 5,
    basePath: "/path/to/project",
    strategy: "full", // or "memory-first" or "selective"
    moduleGroups: 2
  },
  files: [
    {
      path: "src/components/Button.jsx",
      absolutePath: "/full/path/to/Button.jsx",
      content: "...",
      lines: 150,
      size: 4500,
      extension: ".jsx"
    },
    // ... more files
  ],
  grouped: {
    "components": ["src/components/Button.jsx", ...],
    "utils": ["src/utils/helpers.js", ...]
  },
  analysis: {
    graph: { /* dependency graph */ },
    stats: { /* statistics */ },
    circularDependencies: []
  },
  refactoringPlan: {
    steps: [
      {
        phase: "analyze",
        description: "Review dependency graph",
        files: [...],
        estimatedTime: "5 min"
      },
      {
        phase: "refactor",
        module: "components",
        description: "Refactor 3 files in components module",
        files: [...],
        estimatedTime: "6 min"
      },
      {
        phase: "validate",
        description: "Run syntax checks and tests",
        files: [],
        estimatedTime: "10 min"
      }
    ],
    totalSteps: 3,
    estimatedTotalTime: 21
  }
}
```

### Overflow Prevention

The packager automatically detects large refactorings and applies strategies:

**Thresholds**:
- **Full refactoring**: < 30,000 tokens
- **Selective approach**: 30,000 - 50,000 tokens
- **Memory-first**: > 50,000 tokens

**Memory-First Strategy**:
```javascript
// Large package detected
console.log('⚠️ Large refactoring detected - applying summarization');

// Full context saved to memory
await this.memoryManager.updateSection(
  'Refactoring Context Package',
  JSON.stringify(fileContents, null, 2)
);
```

## Refactoring Executor

### Purpose
Executes refactoring operations with step-by-step validation and rollback capabilities.

### Usage

```javascript
import RefactoringExecutor from './lib/refactoring/refactoring-executor.js';

const executor = new RefactoringExecutor({
  validateSyntax: true,      // Check syntax after each file
  validateImports: true,     // Verify imports exist
  enableRollback: true,      // Create backups
  backupDir: '.refactor-backup'
});

// Define your refactoring function
const refactorFunction = (content, fileData, contextPackage) => {
  // Example: Add JSDoc comments
  if (!content.match(/^\/\*\*/m)) {
    return `/**\n * @file ${fileData.path}\n */\n${content}`;
  }
  return content;
};

// Execute refactoring
const results = await executor.execute(contextPackage, refactorFunction, {
  stepByStep: true,
  validateAfterEachFile: true
});

console.log(`✅ ${results.filesSucceeded} files refactored successfully`);
```

### Execution Modes

**Step-by-Step (Recommended)**:
- Follows refactoring plan from context package
- Module-by-module execution
- Validation after each module
- Stops on first error

**All-at-Once**:
- Processes all files sequentially
- Continues on errors (unless rollback enabled)
- Final validation at end

### Validation Features

**Syntax Validation**:
```javascript
// Automatically checks JavaScript/TypeScript syntax
node --check "path/to/file.js"
```

**Import Validation**:
- Verifies relative imports exist
- Checks common extensions (.js, .jsx, .ts, .tsx)
- Checks index files (index.js, index.ts)

**Module Validation**:
- Validates all files in a module after refactoring
- Ensures imports between module files are valid

### Rollback System

**Automatic Backup**:
```bash
💾 Creating backup...
   ✅ Backup created at: .refactor-backup
```

**On Failure**:
```bash
❌ Refactoring failed: Validation failed: Syntax error at line 42

🔄 Rolling back changes...
✅ Rollback complete
```

**Manual Rollback**:
```javascript
await executor.rollback(contextPackage);
```

### Results Structure

```javascript
{
  startTime: 1704067200000,
  endTime: 1704067250000,
  duration: 50000,
  filesProcessed: 10,
  filesSucceeded: 9,
  filesFailed: 1,
  validationsPassed: 9,
  validationsFailed: 1,
  changes: [
    {
      file: "src/components/Button.jsx",
      sizeBefore: 4500,
      sizeAfter: 4650,
      linesBefore: 150,
      linesAfter: 155
    }
  ],
  errors: [
    {
      file: "src/utils/helper.js",
      error: "Syntax error: Unexpected token"
    }
  ],
  success: false
}
```

## Common Refactoring Patterns

### Pattern 1: Rename Function Across Codebase

```javascript
const renameFunctionRefactor = (content, fileData, contextPackage) => {
  const oldName = 'calculateTotal';
  const newName = 'computeTotal';

  return content.replace(
    new RegExp(`\\b${oldName}\\b`, 'g'),
    newName
  );
};

// Create package with all related files
const pkg = await packager.createPackage(['src/utils/math.js'], {
  includeRelated: true,
  maxRelatedDepth: 3
});

// Execute
await executor.execute(pkg, renameFunctionRefactor);
```

### Pattern 2: Add TypeScript Types

```javascript
const addTypesRefactor = (content, fileData) => {
  // Skip if already TypeScript
  if (fileData.extension === '.ts' || fileData.extension === '.tsx') {
    return content;
  }

  // Add basic type annotations
  return content
    .replace(/function (\w+)\((.*?)\)/g, 'function $1($2): void')
    .replace(/const (\w+) = /g, 'const $1: any = ');
};
```

### Pattern 3: Update Import Paths

```javascript
const updateImportsRefactor = (content) => {
  return content
    .replace(/from '\.\.\/utils'/g, "from '@/utils'")
    .replace(/from '\.\.\/components'/g, "from '@/components'");
};
```

### Pattern 4: Add Error Handling

```javascript
const addErrorHandlingRefactor = (content) => {
  // Find async functions without try-catch
  return content.replace(
    /(async function \w+\([^)]*\)\s*{)([^}]+)(})/g,
    (match, start, body, end) => {
      if (body.includes('try')) return match;
      return `${start}\n  try {${body}\n  } catch (error) {\n    console.error('Error:', error);\n    throw error;\n  }\n${end}`;
    }
  );
};
```

### Pattern 5: Module Consolidation

```javascript
// Step 1: Analyze dependencies
const analysis = await analyzer.analyzeDirectory('src/utils/');

// Step 2: Find files with similar purposes
const mathFiles = analysis.files.filter(f => f.includes('math'));

// Step 3: Create consolidated file
const consolidateContent = mathFiles.map(f => {
  const node = analysis.graph.get(f);
  return node.content;
}).join('\n\n');

// Step 4: Update imports in dependent files
const dependents = new Set();
mathFiles.forEach(f => {
  const node = analysis.graph.get(f);
  node.dependents.forEach(d => dependents.add(d));
});

// Step 5: Refactor dependents to use new consolidated module
```

### Pattern 6: Domain Extraction with Re-Export Wrapper

**Purpose**: Break down large monolithic files (>1000 LOC) into domain-focused modules while maintaining 100% backward compatibility.

**Use Case**: When a single file has grown too large and contains multiple distinct responsibilities, extract each domain into its own module and create a re-export wrapper.

**Applied In**: SD-LEO-REFACTOR-LARGE-FILES-003 (10 child SDs, 18,669 LOC refactored)

**Pattern Structure**:

```
original-file.js (1500 LOC monolith)
  ↓ Refactor
original-file/
  ├── domain-a.js (200 LOC)
  ├── domain-b.js (300 LOC)
  ├── domain-c.js (250 LOC)
  ├── shared-utilities.js (100 LOC)
  └── index.js (80 LOC - orchestrator)

original-file.js (60 LOC - re-export wrapper)
```

**Implementation Steps**:

```javascript
// Step 1: Identify domains in monolithic file
// Example from scripts/generate-workflow-docs.js (1393 LOC)
const domains = [
  'YAML loading and path constants',      // → data-loader.js
  'Stage diagram generation',             // → stage-cards.js
  'Phase diagram generation',             // → phase-diagrams.js
  'SOP generation',                       // → sops.js
  'Critique generation',                  // → critiques.js
  'PRD crosswalk generation',             // → prd-crosswalk.js
  'Backlog generation',                   // → backlog.js
  'Research pack generation',             // → research-packs.js
  'Validation script generation',         // → validation-script.js
  'README generation'                     // → readmes.js
];

// Step 2: Extract shared utilities first (shared kernel pattern)
// Create: original-file/shared-utilities.js
export function loadConfig() { /* ... */ }
export function ensureDir(path) { /* ... */ }
export function formatOutput(data) { /* ... */ }

// Step 3: Extract each domain into focused module
// Create: original-file/domain-a.js
import { loadConfig, ensureDir } from './shared-utilities.js';

export function generateDomainA() {
  // Domain-specific logic here
  // Max 500 LOC per module
}

// Step 4: Create orchestrator index
// Create: original-file/index.js
export { loadConfig, ensureDir, formatOutput } from './shared-utilities.js';
export { generateDomainA } from './domain-a.js';
export { generateDomainB } from './domain-b.js';
export { generateDomainC } from './domain-c.js';

// Main entry point
export async function generateAll() {
  generateDomainA();
  generateDomainB();
  generateDomainC();
}

// Step 5: Create re-export wrapper for backward compatibility
// Overwrite: original-file.js
export {
  loadConfig, ensureDir, formatOutput,
  generateDomainA, generateDomainB, generateDomainC,
  generateAll
} from './original-file/index.js';

// CLI execution (if applicable)
import { generateAll } from './original-file/index.js';
if (import.meta.url === `file://${process.argv[1]}`) {
  generateAll().catch(err => {
    console.error('Generation failed:', err.message);
    process.exit(1);
  });
}
```

**Success Criteria**:

```javascript
// ✅ All modules under 500 LOC
const modules = [
  { name: 'domain-a.js', loc: 200 },
  { name: 'domain-b.js', loc: 300 },
  { name: 'domain-c.js', loc: 250 }
];
console.assert(modules.every(m => m.loc < 500), 'All modules under 500 LOC');

// ✅ Zero breaking changes
import { generateDomainA } from './original-file.js'; // Still works
generateDomainA(); // Identical behavior

// ✅ No circular dependencies
const analysis = await analyzer.analyzeDirectory('./original-file/');
const cycles = analyzer.detectCircularDependencies();
console.assert(cycles.length === 0, 'No circular dependencies');

// ✅ Shared utilities centralized
// All modules import from shared-utilities.js, not from each other
```

**Real-World Example** (SD-LEO-REFACTOR-WORKFLOW-DOCS-001):

```javascript
// Before: scripts/generate-workflow-docs.js (1393 LOC)
function loadStages() { /* ... */ }
function generateStageCards() { /* ... */ }
function generatePhaseDiagrams() { /* ... */ }
function generateSOPs() { /* ... */ }
// ... 7 more generator functions

// After: Modular structure
scripts/
  └── workflow-docs-generator/
      ├── data-loader.js (75 LOC) - loadStages(), paths, helpers
      ├── stage-cards.js (61 LOC) - generateStageCards()
      ├── phase-diagrams.js (61 LOC) - generatePhaseDiagrams()
      ├── sops.js (132 LOC) - generateSOPs()
      ├── critiques.js (177 LOC) - generateCritiques()
      ├── prd-crosswalk.js (127 LOC) - generatePRDCrosswalk()
      ├── backlog.js (300 LOC) - generateBacklog()
      ├── research-packs.js (243 LOC) - generateResearchPacks()
      ├── validation-script.js (135 LOC) - generateValidationScript()
      ├── readmes.js (150 LOC) - generateREADMEs()
      └── index.js (64 LOC) - orchestrator + generateAll()

// Wrapper: scripts/generate-workflow-docs.js (55 LOC)
export * from './workflow-docs-generator/index.js';
```

**Performance Optimization** (YAML Caching):

```javascript
// data-loader.js - Shared kernel with caching
let _stagesCache = null;

export function loadStages() {
  if (_stagesCache) return _stagesCache;

  const stagesData = yaml.load(fs.readFileSync(stagesPath, 'utf8'));
  _stagesCache = stagesData.stages;
  return _stagesCache;
}

// Result: YAML parsed once, reused by all 10 generators (~10x speedup)
```

**Dependency Graph** (Flat Structure):

```
data-loader.js (shared kernel - no internal deps)
    ↑
    ├── stage-cards.js
    ├── phase-diagrams.js
    ├── sops.js
    ├── critiques.js
    ├── prd-crosswalk.js
    ├── backlog.js
    ├── research-packs.js
    ├── validation-script.js
    └── readmes.js
    ↑
    └── index.js (orchestrator)
        ↑
        └── generate-workflow-docs.js (wrapper)
```

**When to Use This Pattern**:

| Scenario | Use Domain Extraction? |
|----------|------------------------|
| File > 1000 LOC with multiple domains | ✅ YES |
| File has 3+ distinct responsibilities | ✅ YES |
| File is imported by many dependents | ✅ YES (wrapper ensures no breaking changes) |
| File is a script with generators | ✅ YES (extract each generator) |
| File has shared utilities used across domains | ✅ YES (shared kernel pattern) |
| File < 500 LOC and focused | ❌ NO (already optimal) |
| File is a simple utility | ❌ NO (unnecessary complexity) |

**Comparison with Pattern 5** (Module Consolidation):

| Aspect | Pattern 5: Consolidation | Pattern 6: Domain Extraction |
|--------|--------------------------|------------------------------|
| Direction | Many files → One file | One file → Many files |
| Use Case | Scattered functionality | Monolithic file |
| Goal | Reduce duplication | Improve maintainability |
| Breaking Changes | Likely (new import paths) | None (re-export wrapper) |

**Applied Successfully In**:

| SD | File Refactored | Original LOC | Modules Created | Largest Module |
|----|-----------------|--------------|-----------------|----------------|
| SD-LEO-REFACTOR-RETRO-001 | retro.js | 2836 | 13 | 452 LOC |
| SD-LEO-REFACTOR-SERVER-001 | server.js | 2707 | 11 | 380 LOC |
| SD-LEO-REFACTOR-DESIGN-SUB-001 | design.js | 2569 | 12 | 420 LOC |
| SD-LEO-REFACTOR-PRD-DB-002 | add-prd-to-database.js | 1771 | 10 | 350 LOC |
| SD-LEO-REFACTOR-VENTURE-CEO-001 | venture-ceo-runtime.js | 1602 | 9 | 380 LOC |
| SD-LEO-REFACTOR-VERIFY-L2P-001 | verify-handoff-lead-to-plan.js | 1512 | 8 | 350 LOC |
| SD-LEO-REFACTOR-DESIGN-AGENT-001 | design-sub-agent.js | 1442 | 9 | 370 LOC |
| SD-LEO-REFACTOR-ORCH-002 | leo-protocol-orchestrator.js | 1419 | 10 | 380 LOC |
| SD-LEO-REFACTOR-SUBAGENT-EXEC-001 | sub-agent-executor.js | 1417 | 11 | 370 LOC |
| SD-LEO-REFACTOR-WORKFLOW-DOCS-001 | generate-workflow-docs.js | 1394 | 11 | 300 LOC |

**Total Impact**: 18,669 LOC refactored across 10 files with 100% backward compatibility.

## Best Practices

### 1. Always Analyze First

```bash
# Before refactoring, analyze dependencies
node scripts/smart-refactor.js --analyze src/

# Check for circular dependencies
# Understand file relationships
# Identify high-impact files
```

### 2. Use Related Files

```bash
# Include related files in package
node scripts/smart-refactor.js --package src/file.js --related

# This ensures all files that import/export are included
```

### 3. Start with Small Scopes

```javascript
// Good: Start with one module
const pkg = await packager.createPackage(['src/utils/math.js'], {
  includeRelated: true,
  maxRelatedDepth: 1  // Only immediate dependencies
});

// Then expand if needed
```

### 4. Test Refactoring Function First

```javascript
// Test on a single file first
const testContent = await fs.readFile('test-file.js', 'utf8');
const result = refactorFunction(testContent, { path: 'test-file.js' }, {});

console.log('Before:', testContent.length);
console.log('After:', result.length);
console.log('Changed:', testContent !== result);
```

### 5. Enable All Validation

```javascript
const executor = new RefactoringExecutor({
  validateSyntax: true,     // Always enable
  validateImports: true,    // Always enable
  enableRollback: true      // Always enable for safety
});
```

### 6. Review Package Before Execution

```bash
# Export package for review
node scripts/smart-refactor.js --package src/file.js --related --output plan.json

# Review the plan:
# - Are all necessary files included?
# - Are there any unexpected files?
# - Is the estimated time reasonable?
```

### 7. Handle Large Refactorings

```javascript
// For large refactorings (>50K tokens)
const pkg = await packager.createPackage(files, {
  enableOverflowPrevention: true  // Automatic memory-first strategy
});

// Check strategy
if (pkg.metadata.strategy === 'memory-first') {
  console.log('Large refactoring - working in chunks');
  // Process module by module
}
```

## Troubleshooting

### Issue: Circular Dependencies Detected

```bash
⚠️ Found 2 circular dependencies:
   1. src/a.js → src/b.js → src/a.js
   2. src/utils/x.js → src/utils/y.js → src/utils/x.js
```

**Solution**:
1. Break circular dependencies before refactoring
2. Create interface/type files
3. Use dependency injection

### Issue: Import Validation Failing

```bash
❌ Import not found: ../utils/helper in src/components/Button.jsx
```

**Solutions**:
1. Check import path is correct
2. Verify file exists at expected location
3. Check file extensions
4. Update import to use absolute path

### Issue: Syntax Errors After Refactoring

```bash
❌ Validation failed: Syntax error: Unexpected token
```

**Solutions**:
1. Test refactoring function on single file first
2. Check regex patterns don't break syntax
3. Use AST-based refactoring for complex changes
4. Enable rollback to restore original files

### Issue: Package Too Large

```bash
⚠️ Large package size (523 KB) - consider breaking into smaller refactorings
```

**Solutions**:
1. Reduce `maxRelatedDepth` parameter
2. Refactor module by module
3. Use `--depth 1` for immediate dependencies only
4. Memory-first strategy will be applied automatically

### Issue: Refactoring Takes Too Long

**Solutions**:
1. Reduce number of files in package
2. Disable import validation for speed: `validateImports: false`
3. Use parallel validation (Phase 4 integration)
4. Process in smaller batches

## Performance Tips

### 1. Optimize Dependency Analysis

```javascript
// Cache analysis results
const analysis = await analyzer.analyzeDirectory('src/');
// Save to file
await fs.writeFile('dep-cache.json', JSON.stringify(analysis));

// Load from cache
const cached = JSON.parse(await fs.readFile('dep-cache.json'));
```

### 2. Batch Related Refactorings

```javascript
// Good: Group related refactorings
const pkg1 = await packager.createPackage(['src/utils/*.js'], ...);
await executor.execute(pkg1, refactorUtilsFunction);

const pkg2 = await packager.createPackage(['src/components/*.jsx'], ...);
await executor.execute(pkg2, refactorComponentsFunction);
```

### 3. Use Selective Validation

```javascript
// Skip validation for simple refactorings
const executor = new RefactoringExecutor({
  validateSyntax: false,    // Skip for performance
  validateImports: false,   // Skip for performance
  enableRollback: true      // Keep for safety
});
```

### 4. Leverage Memory-First Strategy

For very large refactorings, the system automatically saves context to memory and processes in chunks, preventing context overflow.

## Integration with LEO Protocol

### LEAD Agent

```javascript
// Strategic code modernization
const modernizationPkg = await packager.createPackage(
  ['src/legacy/**/*.js'],
  { includeRelated: true }
);

// Review package before approval
const validation = packager.validatePackage(modernizationPkg);
if (validation.valid) {
  console.log('✅ Modernization package approved');
}
```

### PLAN Agent

```javascript
// Technical debt reduction planning
const analysis = await analyzer.analyzeDirectory('src/');
const cycles = analyzer.detectCircularDependencies();

// Create refactoring plan in PRD
const prd = {
  title: 'Remove Circular Dependencies',
  technicalApproach: `
    Found ${cycles.length} circular dependencies.
    Refactoring plan:
    ${cycles.map((c, i) => `${i+1}. ${c.join(' → ')}`).join('\n')}
  `
};
```

### EXEC Agent

```javascript
// Execute refactoring from PRD
const pkg = await packager.createPackage(targetFiles, {
  includeRelated: true,
  enableOverflowPrevention: true
});

const results = await executor.execute(pkg, refactorFunction, {
  stepByStep: true,
  validateAfterEachFile: true
});

// Report results
console.log(`✅ Refactored ${results.filesSucceeded}/${results.filesProcessed} files`);
```

## Examples

### Example 1: Analyze Project Structure

```bash
$ node scripts/smart-refactor.js --analyze lib/agents/

📊 Dependency Analysis

Statistics:
   Total files: 35
   Total imports: 128
   Average imports per file: 3.66
   Module groups: 2

Most depended files:
   1. context-monitor.js (2 dependents)
   2. memory-manager.js (2 dependents)
   3. parallel-executor.js (1 dependents)

✅ No circular dependencies detected
```

### Example 2: Create Refactoring Package

```bash
$ node scripts/smart-refactor.js --package src/components/Button.jsx --related

📦 Creating Refactoring Context Package
   Target files: 1
   Base path: /path/to/project

🔍 Analyzing dependencies...
🔗 Finding related files...
   Found 4 additional related files

📄 Reading file contents...
🔍 Context check:
   Estimated tokens: 12,500
   ✅ Context healthy for full refactoring

✅ Package created:
   Total files: 5
   Module groups: 2
   Strategy: full

📋 Refactoring Plan:
   1. [analyze] Review dependency graph and identify impact scope
      Files: 5, Est. time: 5 min
   2. [refactor] Refactor 3 files in components module
      Files: 3, Est. time: 6 min
   3. [refactor] Refactor 2 files in utils module
      Files: 2, Est. time: 4 min
   4. [validate] Run syntax checks, import validation, and tests
      Files: 0, Est. time: 10 min

   Total estimated time: 25 minutes
```

### Example 3: Execute Refactoring

```javascript
// example-refactor.js
import ContextPackager from './lib/refactoring/context-packager.js';
import RefactoringExecutor from './lib/refactoring/refactoring-executor.js';

async function main() {
  // Create package
  const packager = new ContextPackager();
  const pkg = await packager.createPackage(['src/utils/math.js'], {
    includeRelated: true
  });

  // Define refactoring
  const addJSDoc = (content, fileData) => {
    if (content.startsWith('/**')) return content;
    return `/**\n * @file ${fileData.path}\n */\n${content}`;
  };

  // Execute
  const executor = new RefactoringExecutor();
  const results = await executor.execute(pkg, addJSDoc);

  console.log(results);
}

main();
```

## CLI Quick Reference

```bash
# Analyze dependencies
node scripts/smart-refactor.js --analyze <path>

# Create package
node scripts/smart-refactor.js --package <file> [--related] [--depth N]

# Export package
node scripts/smart-refactor.js --package <file> --output <output.json>

# Run example
node scripts/smart-refactor.js --example

# Help
node scripts/smart-refactor.js --help
```

## API Reference

### DependencyAnalyzer

```javascript
const analyzer = new DependencyAnalyzer();

// Analyze directory
await analyzer.analyzeDirectory(dirPath, {
  extensions: ['.js', '.jsx', '.ts', '.tsx'],
  excludePatterns: ['node_modules', 'dist']
});

// Find related files
analyzer.findRelatedFiles(filePath, maxDepth);

// Detect cycles
analyzer.detectCircularDependencies();

// Get statistics
analyzer.getStats();
```

### ContextPackager

```javascript
const packager = new ContextPackager();

// Create package
await packager.createPackage(targetFiles, {
  basePath: process.cwd(),
  includeRelated: true,
  maxRelatedDepth: 2,
  includeTests: false,
  enableOverflowPrevention: true
});

// Validate package
packager.validatePackage(contextPackage);

// Export package
await packager.exportPackage(contextPackage, outputPath);
```

### RefactoringExecutor

```javascript
const executor = new RefactoringExecutor({
  validateSyntax: true,
  validateImports: true,
  enableRollback: true,
  backupDir: '.refactor-backup'
});

// Execute refactoring
await executor.execute(contextPackage, refactorFunction, {
  stepByStep: true,
  validateAfterEachFile: true
});

// Manual rollback
await executor.rollback(contextPackage);
```

## Conclusion

Phase 5's multi-file refactoring system provides production-ready tools for complex codebase transformations with:
- ✅ 85% success rate target
- ✅ Automatic dependency analysis
- ✅ Smart context packaging
- ✅ Step-by-step validation
- ✅ Rollback capabilities
- ✅ Overflow prevention integration

Use these tools to safely refactor large codebases while maintaining code quality and preventing context overflow.