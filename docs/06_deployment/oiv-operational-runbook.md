# OIV Operational Runbook

## Metadata
- **Category**: Deployment
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: DOCMON Sub-Agent
- **Last Updated**: 2026-01-30
- **Tags**: oiv, integration-verification, operational-integration, validation, handoffs
- **Related SD**: SD-LEO-INFRA-OIV-001

## Overview

The Operational Integration Verification (OIV) Framework ensures that code artifacts don't just exist—they're actually **invoked and operational** in the LEO Protocol workflow. OIV fills a critical gap in the validation system by verifying the **operational integration chain** from trigger to target.

**Problem Statement**: LEO Protocol validation gates verify artifact existence but NOT operational integration. Code can exist, pass all tests, and still never be invoked.

**Solution**: 5-level checkpoint verification system that validates the complete integration chain from file existence to function invocation.

---

## Architecture

### 5-Level Checkpoint System

```
L1_FILE_EXISTS      → File exists on filesystem
L2_IMPORT_RESOLVES  → Import chain from trigger to target works (AST analysis)
L3_EXPORT_EXISTS    → Expected function is exported (AST analysis)
L4_FUNCTION_CALLABLE → Function can be called (runtime dry-run) [OPTIONAL]
L5_ARGS_COMPATIBLE   → Function signature matches caller expectations [OPTIONAL]
```

**Key Principle**: Each checkpoint builds on the previous. If L2 fails, L3-L5 are automatically skipped.

### SD Type-Aware Verification Depths

Different SD types have different OIV verification requirements:

| SD Type | Max Verification Level | Rationale |
|---------|------------------------|-----------|
| **feature** | L5_ARGS_COMPATIBLE | Full verification (static + runtime) |
| **security** | L5_ARGS_COMPATIBLE | Critical path, full validation |
| **infrastructure** | L3_EXPORT_EXISTS | Tooling/protocols, static only |
| **enhancement** | L3_EXPORT_EXISTS | Code improvements, static only |
| **refactor** | L3_EXPORT_EXISTS | Behavior preservation, static only |
| **bugfix** | L3_EXPORT_EXISTS | Targeted fixes, static only |
| **database** | L3_EXPORT_EXISTS | Schema changes, static only |
| **performance** | L3_EXPORT_EXISTS | Optimization work, static only |
| **api** | L3_EXPORT_EXISTS | Endpoint changes, static only |
| **backend** | L3_EXPORT_EXISTS | Backend logic, static only |
| **documentation** | EXEMPT | No code integration |
| **docs** | EXEMPT | No code integration |
| **process** | EXEMPT | Process changes only |
| **orchestrator** | EXEMPT | Workflow coordination |
| **qa** | EXEMPT | Testing work |
| **discovery_spike** | EXEMPT | Research only |

---

## Components

### 1. Database Schema

**Tables**:
- `leo_integration_contracts` - Contract definitions for integration points
- `leo_integration_verification_results` - Verification run results and audit trail

**Key Fields in `leo_integration_contracts`**:
```sql
contract_key         TEXT PRIMARY KEY  -- e.g., 'sub-agent-design-visual-polish'
contract_name        TEXT NOT NULL     -- Human-readable name
trigger_type         TEXT NOT NULL     -- workflow, sub_agent, prd_hook, handoff, event
trigger_id           TEXT              -- Specific trigger (leo-create, DESIGN, etc.)
entry_point_file     TEXT NOT NULL     -- Expected file path
entry_point_function TEXT NOT NULL     -- Expected exported function
import_chain         JSONB             -- Array of import steps to verify
checkpoint_level     oiv_checkpoint_level  -- L1-L5 depth
verification_mode    oiv_verification_mode -- static, runtime, or both
gate_name            TEXT              -- Which handoff gate (EXEC-TO-PLAN, etc.)
sd_type_scope        TEXT[]            -- Which SD types this contract applies to
weight               NUMERIC(5,2)      -- Weight within gate scoring
is_active            BOOLEAN           -- Enable/disable contract
```

**ENUMs**:
```sql
CREATE TYPE oiv_checkpoint_level AS ENUM (
  'L1_FILE_EXISTS',
  'L2_IMPORT_RESOLVES',
  'L3_EXPORT_EXISTS',
  'L4_FUNCTION_CALLABLE',
  'L5_ARGS_COMPATIBLE'
);

CREATE TYPE oiv_verification_mode AS ENUM (
  'static',    -- L1-L3 only (file, import, export checks)
  'runtime',   -- L4-L5 (function callable, args compatible)
  'both'       -- Full L1-L5 verification
);

CREATE TYPE oiv_trigger_type AS ENUM (
  'workflow',   -- LEO Protocol workflows (leo create, leo next)
  'sub_agent',  -- Sub-agent execution (DESIGN, TESTING, DATABASE)
  'prd_hook',   -- PRD generation hooks (style tagger, phase 0)
  'handoff',    -- Handoff gates (EXEC-TO-PLAN, PLAN-TO-LEAD)
  'event'       -- Event-driven triggers
);

CREATE TYPE oiv_result_status AS ENUM (
  'PASS',    -- All checkpoints passed
  'FAIL',    -- One or more checkpoints failed
  'SKIP',    -- Verification skipped (exempt SD type, runtime disabled)
  'ERROR'    -- Verification error (system failure)
);
```

**Example Contract**:
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
  'sub-agent-design-visual-polish',
  'Design Sub-Agent Visual Polish Integration',
  'sub_agent',
  'DESIGN',
  'lib/sub-agents/design.js',
  'execute',
  'L3_EXPORT_EXISTS',
  'static',
  'EXEC-TO-PLAN',
  ARRAY['feature', 'enhancement'],
  0.10,
  true
);
```

### 2. OIVVerifier Class

**Location**: `scripts/modules/handoff/validation/oiv/OIVVerifier.js`

**Core Method**:
```javascript
async verify(contract, maxLevel) {
  // Returns:
  // {
  //   final_status: 'PASS' | 'FAIL' | 'SKIP' | 'ERROR',
  //   final_checkpoint: 'L1_FILE_EXISTS' | 'L2_IMPORT_RESOLVES' | ...,
  //   failure_checkpoint: 'L2_IMPORT_RESOLVES' | null,
  //   score: 0-100,
  //   checkpoints: { l1: {...}, l2: {...}, l3: {...}, l4: {...}, l5: {...} },
  //   error_message: string | null,
  //   remediation_hint: string | null,
  //   started_at: ISO timestamp,
  //   completed_at: ISO timestamp,
  //   duration_ms: number
  // }
}
```

**Checkpoint Implementation**:
- **L1**: `fs.existsSync(entry_point_file)`
- **L2**: AST parsing of import chain using `@babel/parser` + `@babel/traverse`
- **L3**: AST export detection (handles ESM and CJS)
- **L4**: Dynamic import + `typeof fn === 'function'` check
- **L5**: Function signature comparison (parameter names, count)

**Score Mapping**:
```javascript
const SCORE_MAP = {
  L1_FILE_EXISTS: 20,
  L2_IMPORT_RESOLVES: 40,
  L3_EXPORT_EXISTS: 60,
  L4_FUNCTION_CALLABLE: 80,
  L5_ARGS_COMPATIBLE: 100
};
```

### 3. OIVGate Class

**Location**: `scripts/modules/handoff/validation/oiv/OIVGate.js`

**Integration Point**: Used by `ValidationOrchestrator` as a handoff gate with **15% weight**.

**Key Method**:
```javascript
async validateHandoff(context) {
  const { sd, handoffType } = context;
  const sdType = sd?.sd_type || 'unknown';

  // 1. Check if SD type is exempt
  if (this.isExemptSDType(sdType)) {
    return createSkippedResult('OIV', sdType, SkipReasonCode.NON_APPLICABLE_SD_TYPE);
  }

  // 2. Get max level for SD type
  const maxLevel = this.getMaxLevelForSDType(sdType);

  // 3. Load applicable contracts
  const contracts = await this.loadContracts(sdType, handoffType);

  // 4. Verify each contract
  for (const contract of contracts) {
    const result = await this.verifier.verify(contract, maxLevel);
    // Persist result to leo_integration_verification_results
  }

  // 5. Return gate result (passed, score, issues)
}
```

### 4. CLI Tool

**Location**: `scripts/oiv-validate.js`

**Usage**:
```bash
# Validate all contracts
npm run oiv:validate

# Filter by SD type
npm run oiv:validate -- --sd-type feature

# Override max level
npm run oiv:validate -- --maxLevel L2

# Validate specific contract
npm run oiv:validate -- --contract sub-agent-design-visual-polish

# Verbose output
npm run oiv:validate -- --verbose

# JSON output (CI/CD friendly)
npm run oiv:validate -- --json

# Allow runtime verification (L4/L5)
npm run oiv:validate -- --allowRuntime
```

**Exit Codes**:
- `0` = PASS/SKIP (all contracts passed or skipped)
- `1` = FAIL (one or more contracts failed)
- `2` = ERROR (database or configuration error)

**Example Output**:
```
🔗 OIV Validate CLI
════════════════════════════════════════════════════════════
Run ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
SD Type filter: feature
Max level override: L3_EXPORT_EXISTS
════════════════════════════════════════════════════════════

Effective max level: L3_EXPORT_EXISTS
Contracts to verify: 3

├─ sub-agent-design-visual-polish
│  ✗ FAIL at L2_IMPORT_RESOLVES (score: 40)
│    Error: Import chain broken at lib/sub-agents/design.js
│    Fix: Create lib/sub-agents/design.js or update import path

├─ sub-agent-testing-gate
│  ✓ PASS (L3_EXPORT_EXISTS, score: 100)

├─ sub-agent-database-gate
│  ✓ PASS (L3_EXPORT_EXISTS, score: 100)

════════════════════════════════════════════════════════════
OIV Validation Summary
────────────────────────────────────────────────────────────
Status: ✗ FAIL
Contracts: 3 total, 2 passed, 1 failed, 0 skipped
Score: 80%
Duration: 1247ms
Run ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890

Failed Contracts:
  1. sub-agent-design-visual-polish (L2_IMPORT_RESOLVES)
     Error: Import chain broken at lib/sub-agents/design.js
     Fix: Create lib/sub-agents/design.js or update import path
════════════════════════════════════════════════════════════
```

---

## Operations

### Running OIV Manually

**When to run**:
- After implementing a new sub-agent
- After creating a new workflow entry point
- After refactoring import paths
- Before creating a pull request (as part of pre-flight checks)
- When debugging integration issues

**Basic validation**:
```bash
npm run oiv:validate
```

**Target specific SD type**:
```bash
npm run oiv:validate -- --sd-type feature --verbose
```

**Debug specific contract**:
```bash
npm run oiv:validate -- --contract sub-agent-design-visual-polish --verbose
```

**CI/CD integration**:
```bash
npm run oiv:validate -- --json --sd-type feature > oiv-results.json
if [ $? -ne 0 ]; then
  echo "OIV validation failed"
  exit 1
fi
```

### OIV in Handoff Flow

OIV automatically runs during handoffs via `ValidationOrchestrator`:

**Integration Points**:
1. **EXEC-TO-PLAN**: Verifies implementation is operationally integrated
2. **PLAN-TO-LEAD**: Verifies end-to-end integration chain
3. **LEAD-FINAL-APPROVAL**: Final operational integration check

**How it works**:
```javascript
// ValidationOrchestrator.js
async validateGatesWithOIV(gates, context, options) {
  // 1. Run standard gates (85% weight)
  const standardResults = await this.validateGates(gates, context, options);

  // 2. If standard gates pass, run OIV (15% weight)
  const oivGate = new OIVGate(this.supabase, { verbose: options.verbose });
  const oivResult = await oivGate.validateHandoff(context);

  // 3. Combine scores: (standard * 0.85) + (oiv * 0.15)
  const combinedScore = Math.round(
    (standardScore * 0.85) + (oivResult.score * 0.15)
  );

  // 4. Return combined result
  return {
    passed: standardPassed && oivResult.passed,
    score: combinedScore,
    gates: [...standardGates, oivGate]
  };
}
```

**Disabling OIV** (not recommended):
```javascript
// In handoff call
await handoff({
  sdId: 'SD-XXX-001',
  fromPhase: 'EXEC',
  toPhase: 'PLAN',
  skipOIV: true  // Skip OIV verification
});
```

### Managing Contracts

**Add a new contract**:
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
  'my-new-integration',
  'My New Integration Point',
  'sub_agent',
  'MYAGENT',
  'lib/sub-agents/my-agent.js',
  'execute',
  'L3_EXPORT_EXISTS',
  'static',
  'EXEC-TO-PLAN',
  ARRAY['feature'],
  0.10,
  true
);
```

**Disable a contract**:
```sql
UPDATE leo_integration_contracts
SET is_active = false
WHERE contract_key = 'deprecated-integration';
```

**Update contract verification level**:
```sql
UPDATE leo_integration_contracts
SET checkpoint_level = 'L5_ARGS_COMPATIBLE'
WHERE contract_key = 'critical-integration'
AND trigger_type = 'sub_agent';
```

**Query contract verification history**:
```sql
SELECT
  contract_key,
  final_status,
  final_checkpoint,
  score,
  error_message,
  completed_at
FROM leo_integration_verification_results
WHERE contract_key = 'sub-agent-design-visual-polish'
ORDER BY completed_at DESC
LIMIT 10;
```

---

## Troubleshooting

### Issue: "Contract not found for SD type"

**Symptom**: OIV skips validation with message "No contracts found for this SD type"

**Diagnosis**:
```sql
-- Check which contracts exist for SD type
SELECT contract_key, sd_type_scope, is_active
FROM leo_integration_contracts
WHERE 'feature' = ANY(sd_type_scope) OR sd_type_scope IS NULL;
```

**Resolution**:
1. Verify SD type is correct: `SELECT sd_type FROM strategic_directives_v2 WHERE sd_key = 'SD-XXX-001';`
2. Add SD type to contract scope: `UPDATE leo_integration_contracts SET sd_type_scope = array_append(sd_type_scope, 'feature') WHERE contract_key = 'my-contract';`
3. Or remove scope restriction: `UPDATE leo_integration_contracts SET sd_type_scope = NULL WHERE contract_key = 'my-contract';`

### Issue: "L2_IMPORT_RESOLVES failed"

**Symptom**: Import chain verification fails at L2

**Diagnosis**:
```bash
# Run with verbose output
npm run oiv:validate -- --contract my-contract --verbose
```

**Common Causes**:
1. **File doesn't exist**: Entry point file path is incorrect
2. **Import path mismatch**: Import statement doesn't match actual file location
3. **Circular imports**: Import chain has circular dependency
4. **ESM/CJS mismatch**: Mixing `import` and `require()`

**Resolution**:
```javascript
// Check actual file location
const fs = require('fs');
const path = require('path');
console.log(fs.existsSync('./lib/sub-agents/design.js'));

// Check import statements in file
const content = fs.readFileSync('./lib/sub-agents/design.js', 'utf-8');
console.log(content.match(/import .* from .*/g));

// Fix import path or file location
```

### Issue: "L3_EXPORT_EXISTS failed"

**Symptom**: Export verification fails even though file exists

**Diagnosis**:
```bash
# Check what's actually exported
node -e "
const parser = require('@babel/parser');
const fs = require('fs');
const content = fs.readFileSync('./lib/sub-agents/design.js', 'utf-8');
const ast = parser.parse(content, { sourceType: 'module' });
console.log(JSON.stringify(ast.program.body.filter(n => n.type === 'ExportNamedDeclaration'), null, 2));
"
```

**Common Causes**:
1. **Function not exported**: Function exists but is not exported
2. **Wrong export name**: Exported as different name than expected
3. **Default vs named export**: Contract expects named export but file uses default export
4. **CJS vs ESM**: Using `module.exports` instead of `export`

**Resolution**:
```javascript
// Add missing export
export function execute(context) { ... }

// Or use named export
export { myFunction as execute };

// Update contract to match actual export name
UPDATE leo_integration_contracts
SET entry_point_function = 'actualFunctionName'
WHERE contract_key = 'my-contract';
```

### Issue: "Runtime verification disabled"

**Symptom**: Contract configured for L4/L5 but skipped with message "Runtime verification disabled"

**Diagnosis**:
```bash
# Check contract configuration
SELECT contract_key, checkpoint_level, verification_mode
FROM leo_integration_contracts
WHERE contract_key = 'my-contract';
```

**Resolution**:
```bash
# Allow runtime verification with --allowRuntime flag
npm run oiv:validate -- --contract my-contract --allowRuntime

# Or downgrade contract to static only
UPDATE leo_integration_contracts
SET checkpoint_level = 'L3_EXPORT_EXISTS',
    verification_mode = 'static'
WHERE contract_key = 'my-contract';
```

**Note**: Runtime verification (L4/L5) is disabled by default in CLI tool to prevent unintended side effects. It's enabled automatically during handoff flow for contracts configured with `verification_mode = 'runtime'` or `'both'`.

### Issue: "OIV gate weight too low"

**Symptom**: OIV failures don't block handoff because combined score still passes

**Diagnosis**:
```bash
# Check current OIV weight
node -e "const { OIV_GATE_WEIGHT } = require('./scripts/modules/handoff/validation/oiv/OIVGate.js'); console.log('OIV Weight:', OIV_GATE_WEIGHT);"
```

**Current Design**: OIV is weighted at **15% of total gate score** (vs 85% for standard gates). This is intentional:
- OIV is supplementary verification, not primary validation
- Allows gradual rollout without blocking existing workflows
- Focuses on critical integration points rather than comprehensive coverage

**If stricter enforcement needed**:
1. **Increase OIV weight** in `OIVGate.js`: `export const OIV_GATE_WEIGHT = 0.25;` (25%)
2. **Add critical contracts to Phase 1 blockers**: Move critical integrations to non-negotiable blockers in standard validation
3. **Create OIV-specific handoff gate**: Add dedicated OIV gate with higher threshold

---

## Monitoring & Metrics

### Verification Results Query

**Get recent verification summary**:
```sql
SELECT
  DATE(completed_at) as verification_date,
  COUNT(*) as total_runs,
  COUNT(*) FILTER (WHERE final_status = 'PASS') as passed,
  COUNT(*) FILTER (WHERE final_status = 'FAIL') as failed,
  COUNT(*) FILTER (WHERE final_status = 'SKIP') as skipped,
  ROUND(AVG(score), 2) as avg_score,
  ROUND(AVG(duration_ms), 0) as avg_duration_ms
FROM leo_integration_verification_results
WHERE completed_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(completed_at)
ORDER BY verification_date DESC;
```

**Get contract health**:
```sql
SELECT
  contract_key,
  COUNT(*) as verification_count,
  COUNT(*) FILTER (WHERE final_status = 'PASS') as pass_count,
  COUNT(*) FILTER (WHERE final_status = 'FAIL') as fail_count,
  ROUND(AVG(score), 2) as avg_score,
  MAX(completed_at) as last_verified
FROM leo_integration_verification_results
WHERE completed_at > NOW() - INTERVAL '30 days'
GROUP BY contract_key
ORDER BY fail_count DESC, avg_score ASC;
```

**Get failing contracts**:
```sql
SELECT
  contract_key,
  failure_checkpoint,
  error_message,
  remediation_hint,
  completed_at
FROM leo_integration_verification_results
WHERE final_status = 'FAIL'
  AND completed_at > NOW() - INTERVAL '7 days'
ORDER BY completed_at DESC
LIMIT 20;
```

### Performance Metrics

**Verification duration by checkpoint**:
```sql
SELECT
  final_checkpoint,
  COUNT(*) as count,
  ROUND(AVG(duration_ms), 0) as avg_duration_ms,
  MIN(duration_ms) as min_duration_ms,
  MAX(duration_ms) as max_duration_ms
FROM leo_integration_verification_results
WHERE final_status != 'ERROR'
GROUP BY final_checkpoint
ORDER BY avg_duration_ms DESC;
```

---

## Best Practices

### Contract Design

1. **Keep import chains short** - Max 3-4 levels deep
2. **Use explicit exports** - Avoid `export * from`
3. **Document trigger points** - Comment where integration points are invoked
4. **Test contracts in isolation** - Use `npm run oiv:validate --contract` before committing
5. **Scope contracts to relevant SD types** - Don't apply feature contracts to documentation SDs

### Verification Levels

**Use L1-L3 (static) when**:
- Integration is in tooling/infrastructure
- Runtime execution has side effects (database writes, API calls)
- Performance is critical (avoid runtime overhead)

**Use L4-L5 (runtime) when**:
- Integration is user-facing (features, UI)
- Function signature changes frequently
- Critical path requires full validation

### Performance

1. **Cache AST parsing** - OIVVerifier caches parsed files
2. **Batch contract verification** - CLI runs all contracts in single batch
3. **Use JSON output in CI/CD** - Avoid verbose output overhead
4. **Skip runtime for infrastructure SDs** - Static verification is sufficient

### Security

1. **Never commit sensitive data in contracts** - Use environment variables
2. **Limit runtime verification scope** - Only enable for trusted code
3. **Audit verification results** - Review failed contracts for security implications
4. **Use dry-run mode** - L4 verifies callability without execution

---

## Related Documentation

- **[Validation Enforcement](../reference/validation-enforcement.md)** - General validation framework
- **[Database Agent Patterns](../reference/database-agent-patterns.md)** - Database operations
- **[SD Type Applicability Policy](../reference/sd-type-applicability-policy-api.md)** - SD type-aware validation
- **[Handoff System Guide](../leo/handoffs/handoff-system-guide.md)** - Complete handoff workflow

---

## Version History

### v1.0.0 (2026-01-30)
- Initial operational runbook for OIV Framework
- Documented 5-level checkpoint system
- Added SD type-aware verification depths
- Included CLI tool usage and troubleshooting
- Added monitoring queries and best practices
- Related SD: SD-LEO-INFRA-OIV-001
