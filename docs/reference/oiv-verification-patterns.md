# OIV Verification Patterns

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: DOCMON Sub-Agent
- **Last Updated**: 2026-01-30
- **Tags**: oiv, patterns, integration-verification, code-examples, best-practices
- **Related SD**: SD-LEO-INFRA-OIV-001

## Overview

This document provides code patterns, examples, and best practices for working with the Operational Integration Verification (OIV) Framework. Use these patterns when creating new integration contracts, implementing integration points, or debugging OIV failures.

---

## Contract Patterns

### Pattern 1: Sub-Agent Integration Contract

**Use Case**: Verify that a sub-agent module is properly integrated into the sub-agent executor.

```sql
INSERT INTO leo_integration_contracts (
  contract_key,
  contract_name,
  trigger_type,
  trigger_id,
  entry_point_file,
  entry_point_function,
  checkpoint_level,
  verification_mode,
  gate_name,
  sd_type_scope,
  weight,
  is_active
) VALUES (
  'sub-agent-{AGENT_CODE}-integration',
  '{Agent Name} Sub-Agent Integration',
  'sub_agent',
  '{AGENT_CODE}',  -- e.g., 'DESIGN', 'TESTING', 'DATABASE'
  'lib/sub-agents/{agent-name}.js',
  'execute',       -- Standard sub-agent entry point
  'L3_EXPORT_EXISTS',
  'static',
  'EXEC-TO-PLAN',  -- Verify after implementation
  ARRAY['feature', 'enhancement', 'refactor'],
  0.10,
  true
);
```

**Key Points**:
- `trigger_type`: Always `'sub_agent'` for sub-agent contracts
- `trigger_id`: Must match sub-agent code in `leo_sub_agents` table
- `entry_point_function`: Typically `'execute'` for sub-agents
- `checkpoint_level`: `'L3_EXPORT_EXISTS'` is sufficient for static verification
- `gate_name`: `'EXEC-TO-PLAN'` verifies implementation is complete

### Pattern 2: Workflow Entry Point Contract

**Use Case**: Verify that a workflow command entry point is operational.

```sql
INSERT INTO leo_integration_contracts (
  contract_key,
  contract_name,
  trigger_type,
  trigger_id,
  entry_point_file,
  entry_point_function,
  checkpoint_level,
  verification_mode,
  gate_name,
  sd_type_scope,
  weight,
  is_active
) VALUES (
  'workflow-leo-{COMMAND}-entry',
  'LEO {Command} Workflow Entry Point',
  'workflow',
  'leo-{command}',  -- e.g., 'leo-create', 'leo-next'
  'scripts/leo-{command}.js',
  'main',           -- Common entry point for workflow scripts
  'L3_EXPORT_EXISTS',
  'static',
  'PLAN-TO-LEAD',   -- Verify before approval
  NULL,             -- Applies to all SD types
  0.15,
  true
);
```

**Key Points**:
- `trigger_type`: Use `'workflow'` for CLI commands
- `trigger_id`: Matches command name (e.g., `'leo-create'`)
- `sd_type_scope`: Set to `NULL` for universal contracts
- `weight`: Higher weight (0.15-0.20) for critical workflow entry points

### Pattern 3: PRD Hook Contract

**Use Case**: Verify that a PRD generation hook is invoked during PRD creation.

```sql
INSERT INTO leo_integration_contracts (
  contract_key,
  contract_name,
  trigger_type,
  trigger_id,
  entry_point_file,
  entry_point_function,
  checkpoint_level,
  verification_mode,
  gate_name,
  sd_type_scope,
  weight,
  is_active
) VALUES (
  'prd-hook-{HOOK_NAME}',
  '{Hook Name} PRD Generation Hook',
  'prd_hook',
  'add-prd-to-database',
  'scripts/modules/prd/{hook-file}.js',
  '{hookFunction}',
  'L3_EXPORT_EXISTS',
  'static',
  'LEAD-TO-PLAN',   -- Verify during planning phase
  ARRAY['feature'],  -- Only for feature SDs
  0.05,
  true
);
```

**Key Points**:
- `trigger_type`: Use `'prd_hook'` for PRD generation hooks
- `trigger_id`: Typically `'add-prd-to-database'`
- `weight`: Lower weight (0.05-0.10) for optional hooks
- `sd_type_scope`: Narrow scope to relevant SD types

### Pattern 4: Handoff Gate Contract

**Use Case**: Verify that a custom validation gate is properly integrated.

```sql
INSERT INTO leo_integration_contracts (
  contract_key,
  contract_name,
  trigger_type,
  trigger_id,
  entry_point_file,
  entry_point_function,
  checkpoint_level,
  verification_mode,
  gate_name,
  sd_type_scope,
  weight,
  is_active
) VALUES (
  'handoff-gate-{GATE_NAME}',
  '{Gate Name} Validation Gate',
  'handoff',
  '{HANDOFF_TYPE}',  -- e.g., 'EXEC-TO-PLAN'
  'scripts/modules/handoff/validation/{gate-file}.js',
  'validateHandoff',
  'L4_FUNCTION_CALLABLE',  -- Verify function is callable
  'runtime',
  '{HANDOFF_TYPE}',
  ARRAY['feature', 'security'],  -- Critical SD types only
  0.20,
  true
);
```

**Key Points**:
- `trigger_type`: Use `'handoff'` for validation gates
- `checkpoint_level`: `'L4_FUNCTION_CALLABLE'` ensures function can be invoked
- `verification_mode`: `'runtime'` for gates that must be callable
- `weight`: Higher weight (0.20-0.25) for critical validation gates

### Pattern 5: Event-Driven Integration

**Use Case**: Verify that an event handler is properly registered and operational.

```sql
INSERT INTO leo_integration_contracts (
  contract_key,
  contract_name,
  trigger_type,
  trigger_id,
  entry_point_file,
  entry_point_function,
  checkpoint_level,
  verification_mode,
  gate_name,
  sd_type_scope,
  weight,
  is_active
) VALUES (
  'event-handler-{EVENT_NAME}',
  '{Event Name} Event Handler',
  'event',
  '{EVENT_TYPE}',  -- e.g., 'sd-created', 'handoff-completed'
  'lib/events/handlers/{handler-file}.js',
  'handleEvent',
  'L3_EXPORT_EXISTS',
  'static',
  'EXEC-TO-PLAN',
  NULL,  -- Applies to all SD types
  0.10,
  true
);
```

**Key Points**:
- `trigger_type`: Use `'event'` for event-driven integrations
- `trigger_id`: Event type that triggers the handler
- `entry_point_function`: Typically `'handleEvent'` or `'onEvent'`

---

## Implementation Patterns

### Pattern 6: Designing for L2 Success (Import Chain)

**Problem**: Import chain verification fails because file structure doesn't match import statements.

**Solution**: Design file structure to match import conventions.

```javascript
// ✅ GOOD: File structure matches import chain
// File: lib/sub-agents/design.js
export function execute(context) {
  // Implementation
}

// File: lib/sub-agent-executor/executor.js
import { execute as designExecute } from '../sub-agents/design.js';

// Contract import_chain would verify:
// [
//   { "from": "lib/sub-agent-executor/executor.js", "line": 5 },
//   { "from": "../sub-agents/design.js", "exports": ["execute"] }
// ]
```

```javascript
// ❌ BAD: File exists but import path mismatch
// File: lib/agents/design-sub-agent/index.js
export function execute(context) { ... }

// File: lib/sub-agent-executor/executor.js
import { execute as designExecute } from '../sub-agents/design.js';
// Import resolves to wrong location!
// OIV L2 checkpoint would FAIL
```

### Pattern 7: Designing for L3 Success (Export Exists)

**Problem**: Function exists in file but is not exported, or exported with wrong name.

**Solution**: Use explicit named exports matching contract expectations.

```javascript
// ✅ GOOD: Explicit named export
export function execute(context) {
  return validateImplementation(context);
}

// ✅ GOOD: Export alias
function validateImplementation(context) {
  // Implementation
}
export { validateImplementation as execute };

// ✅ GOOD: Multiple exports (contract verifies one)
export function execute(context) { ... }
export function check(context) { ... }
export function validate(context) { ... }
```

```javascript
// ❌ BAD: No export
function execute(context) {
  // Function exists but not exported
}

// ❌ BAD: Default export when named expected
export default function execute(context) { ... }
// Contract expects: entry_point_function = 'execute'
// But this is default export, not named export

// ❌ BAD: Wrong export name
export function run(context) { ... }
// Contract expects: entry_point_function = 'execute'
// But function is exported as 'run'
```

### Pattern 8: Designing for L4 Success (Function Callable)

**Problem**: Function is exported but cannot be invoked (syntax errors, missing dependencies).

**Solution**: Ensure function can be dynamically imported and typeof checked.

```javascript
// ✅ GOOD: Clean function signature, no side effects on import
export async function execute(context) {
  // Validate inputs
  if (!context) {
    throw new Error('Context is required');
  }

  // Pure function logic
  const result = await processContext(context);
  return result;
}

// Helper functions (not exported, safe to have side effects)
function processContext(context) {
  // Implementation
}
```

```javascript
// ❌ BAD: Side effects on import
import { connectDatabase } from './db.js';
const db = await connectDatabase();  // ⚠️ Side effect!

export async function execute(context) {
  return db.query('SELECT * FROM table');
}
// OIV L4 would trigger database connection on import

// ❌ BAD: Syntax error
export async function execute(context {  // Missing )
  return validateImplementation(context);
}
// OIV L4 would fail on parse error
```

### Pattern 9: Designing for L5 Success (Args Compatible)

**Problem**: Function signature doesn't match caller expectations.

**Solution**: Match parameter names and count with expected signature.

```javascript
// ✅ GOOD: Matches expected signature
// Contract expects: execute(context)
export async function execute(context) {
  const { sd, handoffType } = context;
  // Implementation
}

// ✅ GOOD: Compatible with destructuring
// Contract expects: execute({ sd, handoffType })
export async function execute({ sd, handoffType }) {
  // Implementation
}

// ✅ GOOD: Flexible parameters
// Contract expects: execute(context, options)
export async function execute(context, options = {}) {
  // Implementation
}
```

```javascript
// ❌ BAD: Parameter count mismatch
// Contract expects: execute(context)
export async function execute(context, required Second Param) {
  // OIV L5 would fail: expected 1 param, found 2 required

// ❌ BAD: Parameter name mismatch (if contract validates names)
// Contract expects: execute(context)
export async function execute(ctx) {
  // OIV L5 might flag parameter name mismatch
}
```

---

## Querying Patterns

### Pattern 10: Finding Contracts for SD Type

```sql
-- Get all contracts applicable to a specific SD type
SELECT
  contract_key,
  contract_name,
  checkpoint_level,
  gate_name,
  weight
FROM leo_integration_contracts
WHERE
  ('feature' = ANY(sd_type_scope) OR sd_type_scope IS NULL)
  AND is_active = true
ORDER BY gate_name, weight DESC;
```

### Pattern 11: Analyzing Verification History

```sql
-- Get verification trend for a contract over time
SELECT
  DATE(completed_at) as verification_date,
  COUNT(*) as total_runs,
  COUNT(*) FILTER (WHERE final_status = 'PASS') as passed,
  COUNT(*) FILTER (WHERE final_status = 'FAIL') as failed,
  ROUND(AVG(score), 2) as avg_score
FROM leo_integration_verification_results
WHERE contract_key = 'sub-agent-design-visual-polish'
  AND completed_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(completed_at)
ORDER BY verification_date ASC;
```

### Pattern 12: Identifying Failing Integration Points

```sql
-- Find contracts with consistent failures
SELECT
  contract_key,
  failure_checkpoint,
  COUNT(*) as failure_count,
  ARRAY_AGG(DISTINCT error_message) as error_messages,
  MAX(completed_at) as last_failure
FROM leo_integration_verification_results
WHERE
  final_status = 'FAIL'
  AND completed_at > NOW() - INTERVAL '7 days'
GROUP BY contract_key, failure_checkpoint
HAVING COUNT(*) >= 3  -- Failed at least 3 times
ORDER BY failure_count DESC;
```

### Pattern 13: Monitoring OIV Performance

```sql
-- Get average verification duration by checkpoint level
SELECT
  final_checkpoint,
  COUNT(*) as verification_count,
  ROUND(AVG(duration_ms), 0) as avg_duration_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) as median_duration_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_duration_ms
FROM leo_integration_verification_results
WHERE completed_at > NOW() - INTERVAL '30 days'
  AND final_status != 'ERROR'
GROUP BY final_checkpoint
ORDER BY
  CASE final_checkpoint
    WHEN 'L1_FILE_EXISTS' THEN 1
    WHEN 'L2_IMPORT_RESOLVES' THEN 2
    WHEN 'L3_EXPORT_EXISTS' THEN 3
    WHEN 'L4_FUNCTION_CALLABLE' THEN 4
    WHEN 'L5_ARGS_COMPATIBLE' THEN 5
  END;
```

---

## Debugging Patterns

### Pattern 14: Debugging L2 Import Chain Failures

**Symptom**: Contract fails at L2_IMPORT_RESOLVES

**Debug Script**:
```javascript
// debug-import-chain.js
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const fs = require('fs');
const path = require('path');

function debugImportChain(entryFile, targetFile) {
  console.log(`Debugging import chain from ${entryFile} to ${targetFile}`);

  // Read and parse entry file
  const content = fs.readFileSync(entryFile, 'utf-8');
  const ast = parser.parse(content, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx']
  });

  // Find import statements
  const imports = [];
  traverse(ast, {
    ImportDeclaration(path) {
      imports.push({
        source: path.node.source.value,
        specifiers: path.node.specifiers.map(s => ({
          type: s.type,
          imported: s.imported?.name,
          local: s.local.name
        }))
      });
    }
  });

  console.log('Found imports:', JSON.stringify(imports, null, 2));

  // Check if target file is imported
  const targetImport = imports.find(imp => {
    const resolvedPath = path.resolve(path.dirname(entryFile), imp.source);
    return resolvedPath.includes(targetFile) || imp.source.includes(targetFile);
  });

  if (targetImport) {
    console.log('✓ Target file IS imported:', targetImport);
  } else {
    console.log('✗ Target file NOT imported');
    console.log('Expected import path:', targetFile);
    console.log('Available imports:', imports.map(i => i.source));
  }
}

// Usage
debugImportChain(
  './lib/sub-agent-executor/executor.js',
  'sub-agents/design.js'
);
```

### Pattern 15: Debugging L3 Export Failures

**Symptom**: Contract fails at L3_EXPORT_EXISTS

**Debug Script**:
```javascript
// debug-exports.js
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const fs = require('fs');

function debugExports(filePath, expectedExport) {
  console.log(`Debugging exports in ${filePath}`);
  console.log(`Looking for export: ${expectedExport}`);

  const content = fs.readFileSync(filePath, 'utf-8');
  const ast = parser.parse(content, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx']
  });

  const exports = {
    named: [],
    default: null
  };

  traverse(ast, {
    ExportNamedDeclaration(path) {
      if (path.node.declaration) {
        // export function foo() {}
        if (path.node.declaration.id) {
          exports.named.push(path.node.declaration.id.name);
        }
      }
      if (path.node.specifiers) {
        // export { foo, bar }
        path.node.specifiers.forEach(spec => {
          exports.named.push(spec.exported.name);
        });
      }
    },
    ExportDefaultDeclaration(path) {
      if (path.node.declaration.name) {
        exports.default = path.node.declaration.name;
      } else {
        exports.default = '<anonymous>';
      }
    }
  });

  console.log('Found exports:');
  console.log('  Named exports:', exports.named);
  console.log('  Default export:', exports.default);

  if (exports.named.includes(expectedExport)) {
    console.log(`✓ Export '${expectedExport}' found in named exports`);
  } else if (exports.default === expectedExport) {
    console.log(`⚠️  Export '${expectedExport}' is default export (contract may expect named)`);
  } else {
    console.log(`✗ Export '${expectedExport}' NOT found`);
    console.log(`  Suggestion: Add 'export function ${expectedExport}() { ... }'`);
  }
}

// Usage
debugExports('./lib/sub-agents/design.js', 'execute');
```

### Pattern 16: Testing Contract Locally

**Before committing a new contract, test it locally**:

```bash
# 1. Add contract to database (dev environment)
psql $DATABASE_URL -c "
INSERT INTO leo_integration_contracts (
  contract_key, contract_name, trigger_type, trigger_id,
  entry_point_file, entry_point_function, checkpoint_level,
  verification_mode, gate_name, sd_type_scope, weight, is_active
) VALUES (
  'test-contract', 'Test Contract', 'sub_agent', 'TEST',
  'lib/sub-agents/test.js', 'execute', 'L3_EXPORT_EXISTS',
  'static', 'EXEC-TO-PLAN', ARRAY['feature'], 0.10, true
);
"

# 2. Run OIV validation for the contract
npm run oiv:validate -- --contract test-contract --verbose

# 3. Check result
# - PASS: Contract is valid, ready to commit
# - FAIL: Fix integration issue, repeat test
# - ERROR: Fix contract configuration, repeat test

# 4. Clean up test contract (if not keeping)
psql $DATABASE_URL -c "
DELETE FROM leo_integration_contracts WHERE contract_key = 'test-contract';
"
```

---

## Anti-Patterns

### Anti-Pattern 1: Over-Verification

**Bad**:
```sql
-- Creating contracts for every single function
INSERT INTO leo_integration_contracts (...)
VALUES ('util-function-formatDate', ...);
INSERT INTO leo_integration_contracts (...)
VALUES ('util-function-parseJSON', ...);
-- 100+ contracts for utility functions
```

**Good**:
```sql
-- Create contracts for integration points only
INSERT INTO leo_integration_contracts (...)
VALUES ('sub-agent-design-integration', ...);
INSERT INTO leo_integration_contracts (...)
VALUES ('workflow-leo-create-entry', ...);
-- 10-20 contracts for critical integration points
```

**Why**: OIV is for verifying operational integration, not code coverage. Focus on entry points that connect major components.

### Anti-Pattern 2: Runtime Verification Without Side Effect Protection

**Bad**:
```javascript
// File with side effects on import
import { db } from './database.js';
db.connect();  // ⚠️ Side effect!

export async function execute(context) {
  return db.query('SELECT * FROM users');
}

// Contract with L4 verification would trigger database connection
```

**Good**:
```javascript
// Lazy initialization, no side effects on import
let db = null;

async function getDB() {
  if (!db) {
    const { createClient } = await import('./database.js');
    db = await createClient();
  }
  return db;
}

export async function execute(context) {
  const database = await getDB();
  return database.query('SELECT * FROM users');
}

// Contract with L4 verification is safe (no connection on import)
```

### Anti-Pattern 3: Ignoring SD Type Scope

**Bad**:
```sql
-- Applying feature-specific contract to all SD types
INSERT INTO leo_integration_contracts (...)
VALUES (
  'ui-component-integration',
  ...,
  NULL  -- Applies to ALL SD types, including documentation
);
```

**Good**:
```sql
-- Scoping contract to relevant SD types
INSERT INTO leo_integration_contracts (...)
VALUES (
  'ui-component-integration',
  ...,
  ARRAY['feature', 'enhancement', 'ux_debt']  -- Only UI-related SDs
);
```

### Anti-Pattern 4: Brittle Import Chain Specifications

**Bad**:
```sql
-- Hardcoding exact line numbers
UPDATE leo_integration_contracts
SET import_chain = '[
  {"from": "lib/executor.js", "line": 42},
  {"from": "../sub-agents/design.js", "line": 1}
]'::jsonb
WHERE contract_key = 'sub-agent-design';
-- Breaks on every code refactor
```

**Good**:
```sql
-- Using import detection without line numbers
UPDATE leo_integration_contracts
SET import_chain = '[
  {"from": "lib/executor.js", "imports": ["design"]},
  {"from": "../sub-agents/design.js", "exports": ["execute"]}
]'::jsonb
WHERE contract_key = 'sub-agent-design';
-- Resilient to code changes
```

---

## Integration with Validation Orchestrator

### Pattern 17: Adding OIV to Custom Handoff

```javascript
// Custom handoff implementation
import { ValidationOrchestrator } from './validation/ValidationOrchestrator.js';
import { OIVGate } from './validation/oiv/OIVGate.js';

async function customHandoff(context) {
  const orchestrator = new ValidationOrchestrator(supabase, {
    verbose: true
  });

  // Define standard gates
  const gates = [
    { name: 'TESTING', weight: 0.30 },
    { name: 'DESIGN', weight: 0.25 },
    { name: 'DATABASE', weight: 0.20 }
  ];

  // Run validation with OIV
  const result = await orchestrator.validateGatesWithOIV(gates, context, {
    threshold: 85,
    skipOIV: false  // Include OIV verification
  });

  if (!result.passed) {
    console.log('Handoff failed:', result.issues);
    return { success: false, issues: result.issues };
  }

  return { success: true, score: result.score };
}
```

### Pattern 18: Disabling OIV for Specific Handoffs

```javascript
// When OIV should be skipped (e.g., documentation-only changes)
const result = await orchestrator.validateGatesWithOIV(gates, context, {
  threshold: 85,
  skipOIV: true  // Skip OIV verification
});
```

---

## Best Practices Summary

1. **Contract Creation**:
   - Create contracts for integration points, not individual functions
   - Use static verification (L1-L3) by default
   - Scope contracts to relevant SD types
   - Test contracts locally before committing

2. **Implementation**:
   - Design file structure to match import chains
   - Use explicit named exports
   - Avoid side effects on module import
   - Keep import chains short (<4 levels)

3. **Debugging**:
   - Use `--verbose` flag for detailed output
   - Run contracts individually with `--contract` flag
   - Query verification history to identify patterns
   - Use debug scripts to analyze AST

4. **Monitoring**:
   - Track verification success rates
   - Monitor average duration by checkpoint level
   - Identify consistently failing contracts
   - Review remediation hints

5. **Performance**:
   - Use JSON output in CI/CD
   - Cache AST parsing results
   - Batch contract verification
   - Skip runtime verification for infrastructure SDs

---

## Related Documentation

- **[OIV Operational Runbook](../06_deployment/oiv-operational-runbook.md)** - Operations guide
- **[Validation Enforcement](./validation-enforcement.md)** - General validation framework
- **[Database Agent Patterns](./database-agent-patterns.md)** - Database operations
- **[SD Type Applicability Policy](./sd-type-applicability-policy-api.md)** - SD type-aware validation

---

## Version History

### v1.0.0 (2026-01-30)
- Initial verification patterns reference
- Added contract patterns for sub-agents, workflows, PRD hooks, handoffs, events
- Added implementation patterns for L2-L5 checkpoints
- Added debugging patterns and scripts
- Added anti-patterns and best practices
- Related SD: SD-LEO-INFRA-OIV-001
