# Handoff System Guide

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: LEO Protocol Team
- **Last Updated**: 2026-01-24
- **Tags**: leo, handoff, gates, validation, executor

## Overview

**SD-REFACTOR-HANDOFF-001: Handoff System Modularization**

This guide documents the LEO Protocol handoff system architecture, gate validation patterns, and executor framework.

## Table of Contents

- [Quick Reference](#quick-reference)
- [1. Prerequisite Validator Behavior](#1-prerequisite-validator-behavior)
- [2. GateComposer and Gate Order](#2-gatecomposer-and-gate-order)
- [3. Repository Detection Strategies](#3-repository-detection-strategies)
- [4. Session Claim Semantics & TTL](#4-session-claim-semantics--ttl)
- [5. BaseExecutor Gate Engine & Errors](#5-baseexecutor-gate-engine--errors)
- [6. Executor Catalog & New Executor Guide](#6-executor-catalog--new-executor-guide)
- [7. Gate Spotlight: GATE6_BRANCH_ENFORCEMENT](#7-gate-spotlight-gate6_branch_enforcement-v2---proactive)
- [8. Gate Spotlight: GATE_PROTOCOL_FILE_READ](#8-gate-spotlight-gate_protocol_file_read-protocol-familiarization-enforcement)
- [Best Practices](#best-practices)
- [Related Documentation](#related-documentation)
- [Version History](#version-history)

## Quick Reference

| Component | Location | Purpose | LOC |
|-----------|----------|---------|-----|
| Main Entry | scripts/handoff.js | CLI entry point | ~300 |
| Unified System | scripts/modules/handoff/unified-handoff-system.js | Core orchestration | ~800 |
| Executors | scripts/modules/handoff/executors/ | Phase-specific handlers | ~1500 |
| Gate Validator | scripts/modules/handoff/validators/ | Gate validation | ~600 |
| Templates | scripts/modules/handoff/templates/ | Handoff templates | ~400 |

---

## 1. Prerequisite Validator Behavior

### Purpose

Prerequisite validators ensure handoffs can only proceed when prior phases are complete.

### Validation Chain

```javascript
// scripts/modules/handoff/validators/prerequisite-validator.js

const PREREQUISITE_CHAIN = {
  'PLAN-TO-EXEC': ['LEAD-TO-PLAN'],           // Requires LEAD approval
  'EXEC-TO-PLAN': ['PLAN-TO-EXEC'],           // Requires PLAN started
  'PLAN-TO-LEAD': ['EXEC-TO-PLAN'],           // Requires EXEC complete (optional for docs SDs)
  'LEAD-FINAL-APPROVAL': ['PLAN-TO-LEAD']     // Requires PLAN verification
};

async function validatePrerequisites(handoffType, sdId) {
  const required = PREREQUISITE_CHAIN[handoffType] || [];

  for (const prereq of required) {
    const exists = await checkHandoffExists(sdId, prereq);
    if (!exists) {
      return {
        valid: false,
        error: `Missing prerequisite handoff: ${prereq}`,
        score: 0
      };
    }
  }

  return { valid: true, score: 100 };
}
```

### Skip Conditions

```javascript
// Documentation SDs can skip certain prerequisites
if (sdType === 'documentation') {
  // EXEC-TO-PLAN is optional for docs SDs
  if (handoffType === 'PLAN-TO-LEAD') {
    const execToPlans = await getHandoffs(sdId, 'EXEC-TO-PLAN');
    if (execToPlans.length === 0) {
      return {
        valid: true,
        score: 100,
        warning: 'EXEC-TO-PLAN skipped - documentation SD'
      };
    }
  }
}
```

---

## 2. GateComposer and Gate Order

### Gate Architecture

```javascript
// scripts/modules/handoff/gates/gate-composer.js

class GateComposer {
  constructor(handoffType) {
    this.gates = this.getGatesForType(handoffType);
    this.weights = this.getWeightsForType(handoffType);
  }

  getGatesForType(type) {
    const GATE_REGISTRY = {
      'LEAD-TO-PLAN': [
        'GATE_PROTOCOL_FILE_READ',  // NEW: Requires CLAUDE_LEAD.md read
        'GATE_SD_TRANSITION_READINESS',
        'TARGET_APPLICATION_VALIDATION',
        'BASELINE_DEBT_CHECK'
      ],
      'PLAN-TO-EXEC': [
        'GATE_PROTOCOL_FILE_READ',  // NEW: Requires CLAUDE_PLAN.md read
        'PREREQUISITE_HANDOFF_CHECK',
        'GATE_ARCHITECTURE_VERIFICATION',
        'BMAD_PLAN_TO_EXEC',
        'GATE_CONTRACT_COMPLIANCE',
        'GATE_EXPLORATION_AUDIT',
        'GATE6_BRANCH_ENFORCEMENT'
      ],
      'EXEC-TO-PLAN': [
        'GATE_PROTOCOL_FILE_READ',  // NEW: Requires CLAUDE_EXEC.md read
        // ... other gates
      ],
      'PLAN-TO-LEAD': [
        'PREREQUISITE_HANDOFF_CHECK',
        'SUB_AGENT_ORCHESTRATION',
        'RETROSPECTIVE_QUALITY_GATE',
        'GATE5_GIT_COMMIT_ENFORCEMENT'
      ],
      'LEAD-FINAL-APPROVAL': [
        'PLAN_TO_LEAD_HANDOFF_EXISTS',
        'USER_STORIES_COMPLETE',
        'RETROSPECTIVE_EXISTS',
        'PR_MERGE_VERIFICATION'
      ]
    };
    return GATE_REGISTRY[type] || [];
  }
}
```

### Gate Execution Order

Gates execute in the order defined in the registry. Each gate:
1. Receives context from previous gates
2. Returns score (0-100), warnings, and errors
3. Contributes to weighted final score

### Custom Gate Registration

```javascript
// Add custom gate to composer
gateComposer.registerGate('CUSTOM_GATE', {
  weight: 0.15,
  validate: async (context) => {
    // Custom validation logic
    return { score: 100, warnings: [] };
  }
});
```

---

## 3. Repository Detection Strategies

### Detection Order

```javascript
// scripts/modules/handoff/utils/repository-detector.js

async function detectRepository(sdId) {
  // Strategy 1: Check SD metadata
  const sd = await getSD(sdId);
  if (sd.target_application) {
    return resolveRepo(sd.target_application);
  }

  // Strategy 2: Infer from scope keywords
  const scopePatterns = {
    'EHG': ['frontend', 'UI', 'component', 'page', 'admin'],
    'EHG_Engineer': ['backend', 'API', 'sub-agent', 'handoff', 'lib/']
  };

  for (const [repo, patterns] of Object.entries(scopePatterns)) {
    if (patterns.some(p => sd.scope.toLowerCase().includes(p.toLowerCase()))) {
      return repo;
    }
  }

  // Strategy 3: Check current git remote
  const remote = await execCommand('git remote get-url origin');
  if (remote.includes('ehg.git')) return 'EHG';
  if (remote.includes('EHG_Engineer')) return 'EHG_Engineer';

  // Default fallback
  return 'EHG_Engineer';
}
```

### Repository Resolution

| Target App | Path | Git Remote |
|------------|------|------------|
| EHG | ../ehg | rickfelix/ehg.git |
| EHG_Engineer | ./ (current) | rickfelix/EHG_Engineer.git |

---

## 4. Session Claim Semantics & TTL

### Purpose

Session claims prevent concurrent work on the same SD.

### Claim Structure

```javascript
// Session claim record
{
  sd_id: 'SD-XXX',
  session_id: 'session_abc123_hostname_12345',
  claimed_at: '2025-12-28T...',
  expires_at: '2025-12-28T...', // +4 hours
  is_working_on: true
}
```

### Claim Operations

```javascript
// Claim an SD for this session
async function claimSD(sdId) {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({
      is_working_on: true,
      working_session: sessionId,
      claim_expires_at: expiresAt.toISOString()
    })
    .eq('id', sdId);

  return !error;
}

// Release claim
async function releaseSD(sdId) {
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({
      is_working_on: false,
      working_session: null,
      claim_expires_at: null
    })
    .eq('id', sdId);

  return !error;
}
```

### TTL Handling

```javascript
// Check if claim is expired
function isClaimExpired(sd) {
  if (!sd.claim_expires_at) return true;
  return new Date(sd.claim_expires_at) < new Date();
}

// Stale claim detection
async function checkStaleClaims() {
  const { data: stale } = await supabase
    .from('strategic_directives_v2')
    .select('id, working_session')
    .eq('is_working_on', true)
    .lt('claim_expires_at', new Date().toISOString());

  for (const sd of stale) {
    await releaseSD(sd.id);
    console.log(`Released stale claim: ${sd.id}`);
  }
}
```

---

## 5. BaseExecutor Gate Engine & Errors

### BaseExecutor Class

```javascript
// scripts/modules/handoff/executors/base-executor.js

class BaseExecutor {
  constructor(handoffType, sdId, options = {}) {
    this.handoffType = handoffType;
    this.sdId = sdId;
    this.options = options;
    this.gates = [];
    this.results = {};
    this.score = 0;
  }

  async execute() {
    try {
      // 1. Load SD and validate
      this.sd = await this.loadSD();
      await this.validateSD();

      // 2. Compose gates for this handoff type
      this.gates = await this.composeGates();

      // 3. Execute each gate
      for (const gate of this.gates) {
        const result = await this.executeGate(gate);
        this.results[gate.name] = result;

        if (result.blocking && !result.passed) {
          throw new GateBlockedError(gate.name, result.error);
        }
      }

      // 4. Calculate weighted score
      this.score = this.calculateScore();

      // 5. Apply threshold
      if (this.score < 85) {
        throw new ThresholdNotMetError(this.score, 85);
      }

      // 6. Store handoff
      return await this.storeHandoff();

    } catch (error) {
      return this.handleError(error);
    }
  }
}
```

### Error Types

```javascript
// Handoff-specific exceptions
class GateBlockedError extends Error {
  constructor(gateName, reason) {
    super(`Gate ${gateName} blocked: ${reason}`);
    this.gateName = gateName;
    this.isRetryable = false;
  }
}

class ThresholdNotMetError extends Error {
  constructor(score, threshold) {
    super(`Score ${score}% below threshold ${threshold}%`);
    this.score = score;
    this.threshold = threshold;
    this.isRetryable = true;  // Can retry after fixing issues
  }
}

class PrerequisiteMissingError extends Error {
  constructor(missing) {
    super(`Missing prerequisite: ${missing}`);
    this.missing = missing;
    this.isRetryable = true;  // Can retry after completing prereq
  }
}
```

### Gate Execution

```javascript
async executeGate(gate) {
  console.log(`🔍 Validating ${gate.name}...`);

  try {
    const result = await gate.validate({
      sd: this.sd,
      options: this.options,
      previousResults: this.results
    });

    console.log(`${result.passed ? '✅' : '❌'} ${gate.name}: ${result.score}/100`);

    return {
      name: gate.name,
      passed: result.score >= gate.threshold,
      score: result.score,
      warnings: result.warnings || [],
      errors: result.errors || [],
      blocking: gate.blocking
    };

  } catch (error) {
    return {
      name: gate.name,
      passed: false,
      score: 0,
      errors: [error.message],
      blocking: gate.blocking
    };
  }
}
```

---

## 6. Executor Catalog & New Executor Guide

### Available Executors

| Executor | Handoff Type | Key Gates |
|----------|--------------|-----------|
| LeadToPlanExecutor | LEAD-TO-PLAN | SD readiness, target app |
| PlanToExecExecutor | PLAN-TO-EXEC | BMAD, branch enforcement |
| ExecToPlanExecutor | EXEC-TO-PLAN | Implementation fidelity |
| PlanToLeadExecutor | PLAN-TO-LEAD | Sub-agent orchestration, retro |
| LeadFinalApprovalExecutor | LEAD-FINAL | User stories, PR merge |

### Creating a New Executor

```javascript
// scripts/modules/handoff/executors/custom-executor.js

import { BaseExecutor } from './base-executor.js';
import { GateComposer } from '../gates/gate-composer.js';

export class CustomExecutor extends BaseExecutor {
  constructor(sdId, options) {
    super('CUSTOM-HANDOFF', sdId, options);
  }

  async composeGates() {
    const composer = new GateComposer(this.handoffType);

    // Add standard gates
    composer.addGate('PREREQUISITE_CHECK', {
      weight: 0.20,
      blocking: true,
      validate: this.validatePrerequisites.bind(this)
    });

    // Add custom gate
    composer.addGate('CUSTOM_VALIDATION', {
      weight: 0.30,
      blocking: false,
      validate: this.customValidation.bind(this)
    });

    return composer.build();
  }

  async customValidation(context) {
    // Custom validation logic
    return {
      score: 100,
      warnings: [],
      errors: []
    };
  }
}
```

### Registration

```javascript
// scripts/modules/handoff/executor-registry.js

import { CustomExecutor } from './executors/custom-executor.js';

EXECUTOR_REGISTRY['CUSTOM-HANDOFF'] = CustomExecutor;

// Usage
const executor = getExecutor('CUSTOM-HANDOFF', sdId, options);
const result = await executor.execute();
```

---

## 7. Gate Spotlight: GATE6_BRANCH_ENFORCEMENT (v2 - Proactive)

### Overview

**Enhanced**: SD-LEO-INFRA-PROACTIVE-BRANCH-ENFORCEMENT-001 (2026-01-23)

GATE6 validates git branch for EXEC work. Version 2 adds **proactive cross-SD branch detection** to prevent work contamination when multiple Strategic Directives are active in the same session.

### Location
`scripts/modules/handoff/executors/plan-to-exec/gates/branch-enforcement.js`

### Execution Flow (v2)

```
GATE6 → Pre-check (analyzeCurrentBranch)
      ├─ Correct branch → GitBranchVerifier → Pass
      ├─ Protected branch (main/master) → GitBranchVerifier handles
      └─ Cross-SD branch detected → WARNING + Remediation → GitBranchVerifier
```

### Key Functions

#### extractSDFromBranch(branchName)
Extracts SD-ID from branch name if present.

**Pattern**: `SD-CATEGORY-SUBCATEGORY-NUMBER`

**Examples**:
- `feat/SD-LEO-5-failure-handling` → `SD-LEO-5`
- `fix/SD-AUTH-001-login` → `SD-AUTH-001`
- `main` → `null`

#### analyzeCurrentBranch(currentBranch, targetSdId)
Compares current branch SD vs target SD.

**Returns**:
```javascript
{
  isProtectedBranch: boolean,  // main/master
  isOtherSDBranch: boolean,    // Different SD's branch
  otherSDId: string | null,    // Which SD owns branch
  isCorrectBranch: boolean     // Correct branch for target
}
```

### Cross-SD Detection Warning

When working on wrong SD's branch:

```
⚠️  CROSS-SD BRANCH DETECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Current branch: feat/SD-LEO-5-failure-handling
   Branch belongs to: SD-LEO-5
   Target SD: SD-LEO-ENH-INTELLIGENT-RETROSPECTIVE-TRIGGERS-001

   🚨 WARNING: You are on a branch for a DIFFERENT SD!
   This typically happens when:
   1. Multiple SDs created in same session
   2. Work started before running proper handoffs

   📋 RESOLUTION OPTIONS:
   a) Let this gate auto-switch to correct branch (recommended)
   b) Manually commit work on current branch first
   c) Stash changes: git stash push -m "WIP for SD-LEO-5"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Root Cause (Why This Enhancement Was Needed)

**Problem**: Work on SD-A contaminating branch for SD-B

**5-Whys Analysis**:
1. Work done on another SD's branch
2. SD_BRANCH_PREPARATION gate was DISABLED at LEAD-TO-PLAN (LEO v4.4.1)
3. PLAN-TO-EXEC gate was reactive (validate IF exists) not proactive
4. Session context allowed work on existing branch
5. **Root cause**: No automated enforcement detecting cross-SD work

**Solution**: Pre-check before GitBranchVerifier to detect cross-SD branches early.

### Enhanced Success Output

```javascript
return {
  passed: true,
  score: 100,
  max_score: 100,
  issues: [],
  warnings: branchResults.warnings || [],
  details: {
    ...branchResults,
    proactiveEnforcement: true,
    autoCreated: branchResults.branchCreated,
    autoSwitched: branchResults.branchSwitched
  }
};
```

### Integration

**Handoff**: PLAN-TO-EXEC
**Position**: 6th gate (after BMAD, CONTRACT)
**Blocking**: Yes (via GitBranchVerifier)

**Related**:
- `scripts/verify-git-branch-status.js` (GitBranchVerifier)
- Branch naming convention enforcement

---

## 8. Gate Spotlight: GATE_PROTOCOL_FILE_READ (Protocol Familiarization Enforcement)

### Overview

**Added**: SD-LEO-INFRA-ENFORCE-PROTOCOL-FILE-001 (2026-01-24)

GATE_PROTOCOL_FILE_READ enforces the "Protocol Familiarization" directive that was previously just text guidance in CLAUDE_*.md files. It validates that the agent has read the phase-specific protocol file before a handoff can proceed.

---

## 9. Gate Spotlight: SD-Type-Aware Validation Policy

### Overview

**Added**: SD-LEO-FIX-REMEDIATE-TYPE-AWARE-001 (2026-01-24)

The SD-Type-Aware Validation Policy fixes the 75% handoff rejection rate for refactor and infrastructure SDs by allowing validators to skip non-applicable checks based on SD type. Different Strategic Directive types have different validation requirements.

### Problem Statement

**Root Cause**: All SD types were required to pass the same validators (TESTING, DESIGN, etc.), even when those validators were not applicable to the SD type. For example:
- Refactor SDs were blocked for missing TESTING/DESIGN validators
- Infrastructure SDs were blocked for missing E2E tests
- Progress calculation required 3 handoffs for all SD types, blocking refactor SDs at 75% completion

**Impact**: 75% handoff rejection rate for refactor/infrastructure SDs

### Solution Architecture

**Centralized Policy Module**: `scripts/modules/handoff/validation/sd-type-applicability-policy.js`

The policy module defines which validators are REQUIRED, NON_APPLICABLE, or OPTIONAL for each SD type.

#### Policy Structure

```javascript
export const SD_TYPE_POLICY = {
  refactor: {
    TESTING: RequirementLevel.NON_APPLICABLE,   // Behavior preservation focus
    DESIGN: RequirementLevel.NON_APPLICABLE,    // No UI changes
    GITHUB: RequirementLevel.REQUIRED,          // CI/CD validation
    DATABASE: RequirementLevel.NON_APPLICABLE,  // No schema changes
    REGRESSION: RequirementLevel.REQUIRED,      // CRITICAL: Verify no breakage
    DOCMON: RequirementLevel.OPTIONAL,
    STORIES: RequirementLevel.NON_APPLICABLE
  },
  infrastructure: {
    TESTING: RequirementLevel.NON_APPLICABLE,   // No user-facing tests
    DESIGN: RequirementLevel.NON_APPLICABLE,    // No UI components
    GITHUB: RequirementLevel.NON_APPLICABLE,    // May not involve CI/CD
    DATABASE: RequirementLevel.OPTIONAL,
    REGRESSION: RequirementLevel.OPTIONAL,
    DOCMON: RequirementLevel.REQUIRED,          // Documentation critical
    STORIES: RequirementLevel.OPTIONAL
  },
  feature: {
    TESTING: RequirementLevel.REQUIRED,         // Full E2E validation
    DESIGN: RequirementLevel.REQUIRED,          // UI/UX required
    GITHUB: RequirementLevel.REQUIRED,
    DATABASE: RequirementLevel.OPTIONAL,
    REGRESSION: RequirementLevel.OPTIONAL,
    DOCMON: RequirementLevel.REQUIRED,
    STORIES: RequirementLevel.REQUIRED
  }
  // ... 10 more SD types defined
};
```

#### Requirement Levels

| Level | Meaning | Impact on Validation |
|-------|---------|---------------------|
| `REQUIRED` | Validator MUST pass | Failure blocks handoff |
| `NON_APPLICABLE` | Validator does not apply | Automatically skipped with SKIPPED status |
| `OPTIONAL` | Validator can pass/fail | Contributes to score but doesn't block |

### Location

**Policy Module**: `scripts/modules/handoff/validation/sd-type-applicability-policy.js`

**Integration**: `scripts/modules/handoff/validation/ValidationOrchestrator.js`

### Key Functions

#### getValidatorRequirement(sdType, validatorName)
Returns the requirement level for a specific validator given an SD type.

**Allowlist Approach**: Unknown SD types default to REQUIRED (safe fallback).

```javascript
// Example usage
getValidatorRequirement('refactor', 'TESTING');  // Returns: NON_APPLICABLE
getValidatorRequirement('feature', 'TESTING');   // Returns: REQUIRED
getValidatorRequirement('unknown', 'TESTING');   // Returns: REQUIRED (safe default)
```

#### createSkippedResult(validatorName, sdType, skipReason)
Creates a properly structured SKIPPED validation result.

**SKIPPED Result Structure**:
```javascript
{
  passed: true,           // SKIPPED counts as passing
  status: 'SKIPPED',
  score: 100,
  max_score: 100,
  skipped: true,
  skipReason: 'NON_APPLICABLE_SD_TYPE',
  issues: [],
  warnings: [],
  skipDetails: {          // Traceability
    validator_name: 'TESTING',
    sd_type: 'refactor',
    reason_code: 'NON_APPLICABLE_SD_TYPE',
    policy_version: '1.0.0',
    timestamp: '2026-01-24T...'
  }
}
```

#### isSkippedResult(result)
Detects if a validation result is SKIPPED.

**Detection Logic**:
```javascript
return result.status === 'SKIPPED' ||
       result.skipped === true ||
       result.skipReason !== undefined;
```

### ValidationOrchestrator Integration

The ValidationOrchestrator integrates the policy module to track SKIPPED validators:

```javascript
// scripts/modules/handoff/validation/ValidationOrchestrator.js

import {
  getValidatorRequirement,
  isValidatorNonApplicable,
  createSkippedResult,
  isSkippedResult,
  RequirementLevel
} from './sd-type-applicability-policy.js';

async validateGates(gates, context) {
  const results = {
    passed: false,
    totalScore: 0,
    maxScore: 0,
    skippedCount: 0,        // NEW: Track skipped validators
    gateStatuses: {},       // NEW: Status per gate
    skippedGates: [],       // NEW: List of skipped gate names
    // ... other fields
  };

  for (const gate of gates) {
    // Check if gate is non-applicable for this SD type
    const isNonApplicable = isValidatorNonApplicable(context.sd.sd_type, gate.name);

    if (isNonApplicable) {
      // Auto-skip non-applicable validators
      const skippedResult = createSkippedResult(gate.name, context.sd.sd_type);
      results.skippedCount++;
      results.skippedGates.push(gate.name);
      results.gateStatuses[gate.name] = {
        status: 'SKIPPED',
        required: false,
        skipReason: 'NON_APPLICABLE_SD_TYPE'
      };
      continue;
    }

    // Execute validator normally
    const gateResult = await gate.validate(context);

    // Check if validator returned SKIPPED status
    if (isSkippedResult(gateResult)) {
      results.skippedCount++;
      results.skippedGates.push(gate.name);
      results.gateStatuses[gate.name] = {
        status: 'SKIPPED',
        required: gate.required !== false,
        skipReason: gateResult.skipReason
      };
    }

    // ... rest of validation logic
  }
}
```

### Database Integration

**Migration**: `database/migrations/20260124_sd_type_aware_progress_calculation.sql`

**Function**: `get_min_required_handoffs(sd_type VARCHAR) RETURNS INTEGER`

Maps SD types to minimum required handoff counts:

```sql
CREATE OR REPLACE FUNCTION get_min_required_handoffs(sd_type_param VARCHAR)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE
    -- Infrastructure/Documentation SDs - minimal handoffs
    WHEN sd_type_param IN ('infrastructure', 'documentation', 'docs', 'process', 'qa', 'orchestrator')
    THEN 2

    -- Refactor SDs - need REGRESSION but skip TESTING/DESIGN
    WHEN sd_type_param = 'refactor'
    THEN 2

    -- Bugfix/Performance - lighter than feature
    WHEN sd_type_param IN ('bugfix', 'performance', 'enhancement')
    THEN 3

    -- Feature/Database/Security - full validation
    WHEN sd_type_param IN ('feature', 'database', 'security')
    THEN 3

    -- Default (unknown type) - require full validation (safe default)
    ELSE 3
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

**Progress Calculation**: `calculate_sd_progress(sd_id VARCHAR) RETURNS INTEGER`

Now uses SD-type-aware handoff count requirements:

```sql
-- Get SD-type-aware minimum handoff requirement
min_handoffs := get_min_required_handoffs(sd_type_val);

-- Count accepted handoffs
SELECT COUNT(DISTINCT handoff_type) INTO actual_handoffs
FROM sd_phase_handoffs
WHERE sd_id = sd_id_param
AND status = 'accepted';

-- Check if SD reaches 100% with SD-type-aware handoff count
IF actual_handoffs >= min_handoffs THEN
  progress := progress + 15;  -- Phase 5: Final approval
END IF;
```

### Skip Reason Codes

```javascript
export const SkipReasonCode = {
  NON_APPLICABLE_SD_TYPE: 'NON_APPLICABLE_SD_TYPE',
  DISABLED_BY_CONFIG: 'DISABLED_BY_CONFIG',
  CONDITIONAL_SKIP: 'CONDITIONAL_SKIP',
  EMERGENCY_BYPASS: 'EMERGENCY_BYPASS'
};
```

### Example: Refactor SD Workflow

**Before Fix** (BLOCKED at 75%):
```
LEAD-TO-PLAN → PASS (20%)
PLAN-TO-EXEC → PASS (40%)
EXEC-TO-PLAN → BLOCKED (TESTING validator failed)
  ❌ TESTING: FAIL (0/100) - No E2E tests executed
  ❌ DESIGN: FAIL (0/100) - No design validation
  ❌ Handoff rejected: Score 60% below 85% threshold
```

**After Fix** (PASS at 100%):
```
LEAD-TO-PLAN → PASS (20%)
PLAN-TO-EXEC → PASS (40%)
EXEC-TO-PLAN → PASS (60%)
  ⏭️  TESTING: SKIPPED (100/100) - Non-applicable for refactor SD
  ⏭️  DESIGN: SKIPPED (100/100) - Non-applicable for refactor SD
  ✅ REGRESSION: PASS (95/100) - No behavioral changes detected
  ✅ GITHUB: PASS (100/100) - CI/CD checks passed
  ✅ Score 97% meets 85% threshold
PLAN-TO-LEAD → PASS (75%)
LEAD-FINAL-APPROVAL → PASS (100%)
  ✅ Progress: 100% (2 handoffs >= 2 minimum for refactor SD)
```

### Integration with Validation Framework

The SD-type-aware policy integrates with the existing validation framework documented in `docs/reference/validation-enforcement.md`.

**Key Integration Points**:
1. **Adaptive Thresholds**: SD type influences base threshold (60-90%)
2. **Gate Composition**: Validators are filtered by SD type before gate execution
3. **Score Calculation**: SKIPPED validators contribute 100% to weighted score
4. **Handoff Storage**: `skipReason` and `skipDetails` stored in handoff metadata

### Test Coverage

**Unit Tests**: `tests/unit/sd-type-applicability-policy.test.js` (40 tests)

Coverage includes:
- ✅ Policy version tracking
- ✅ Enum definitions (RequirementLevel, ValidatorStatus, SkipReasonCode)
- ✅ Policy lookup for all SD types
- ✅ Required validator detection
- ✅ Non-applicable validator detection
- ✅ Skipped result creation and detection
- ✅ Policy summary generation
- ✅ Integration workflow test (refactor SD completing with REGRESSION only)

### Validator Catalog by SD Type

| SD Type | Required Validators | Non-Applicable Validators |
|---------|-------------------|---------------------------|
| **refactor** | REGRESSION, GITHUB | TESTING, DESIGN, DATABASE, STORIES |
| **infrastructure** | DOCMON | TESTING, DESIGN, GITHUB |
| **feature** | TESTING, DESIGN, DOCMON, STORIES, GITHUB | - |
| **database** | DATABASE, TESTING, GITHUB | DESIGN |
| **security** | SECURITY, TESTING, GITHUB | - |
| **documentation** | DOCMON | TESTING, DESIGN, GITHUB, DATABASE, REGRESSION, STORIES |
| **bugfix** | TESTING, REGRESSION | DESIGN, STORIES |
| **performance** | TESTING, REGRESSION, GITHUB | DESIGN, STORIES |

### Best Practices

#### DO
- Use `getValidatorRequirement()` to check if validator applies to SD type
- Use `createSkippedResult()` for non-applicable validators
- Track `skippedCount` and `skippedGates` in validation results
- Store `skipDetails` for traceability
- Default to REQUIRED for unknown SD types (safe fallback)

#### DON'T
- Don't bypass REQUIRED validators for an SD type
- Don't manually set `passed: true` without checking requirement level
- Don't skip traceability fields (`skipReason`, `skipDetails`)
- Don't hardcode SD type checks in validators (use policy module)

### Related Documentation

- [Validation Enforcement Framework](../../reference/validation-enforcement.md) - Adaptive thresholds and gate architecture
- [Database Schema: sd_type_validation_profiles](../../reference/schema/engineer/tables/sd_type_validation_profiles.md) - Database view of SD type policies
- [Progress Calculation Migration](../../../database/migrations/20260124_sd_type_aware_progress_calculation.sql) - Database migration script

### Monitoring

**Query to check skipped validators**:
```sql
SELECT
  sd.sd_key,
  sd.sd_type,
  h.handoff_type,
  h.metadata->'gateStatuses' as gate_statuses,
  h.metadata->'skippedGates' as skipped_gates,
  h.metadata->'skippedCount' as skipped_count
FROM sd_phase_handoffs h
JOIN strategic_directives_v2 sd ON h.sd_id = sd.id
WHERE h.metadata ? 'skippedCount'
  AND (h.metadata->>'skippedCount')::int > 0
ORDER BY h.created_at DESC
LIMIT 10;
```

**Query to verify progress calculation**:
```sql
SELECT
  sd.sd_key,
  sd.sd_type,
  get_min_required_handoffs(sd.sd_type) as min_handoffs,
  COUNT(DISTINCT h.handoff_type) FILTER (WHERE h.status = 'accepted') as actual_handoffs,
  calculate_sd_progress(sd.id) as progress
FROM strategic_directives_v2 sd
LEFT JOIN sd_phase_handoffs h ON h.sd_id = sd.id
WHERE sd.sd_type IN ('refactor', 'infrastructure', 'documentation')
GROUP BY sd.id, sd.sd_key, sd.sd_type
ORDER BY sd.created_at DESC
LIMIT 10;
```

### Location
`scripts/modules/handoff/gates/protocol-file-read-gate.js`

### Protocol File Requirements

| Handoff Type | Required File | Purpose |
|--------------|---------------|---------|
| LEAD-TO-PLAN | CLAUDE_LEAD.md | LEAD phase operations, SD approval workflow |
| PLAN-TO-EXEC | CLAUDE_PLAN.md | PLAN phase operations, PRD guidelines |
| EXEC-TO-PLAN | CLAUDE_EXEC.md | EXEC phase operations, implementation patterns |

### How It Works

#### 1. Automatic Tracking (PostToolUse Hook)

A PostToolUse hook automatically tracks when protocol files are read:

**Hook**: `.claude/settings.json`
```json
{
  "matcher": "Read",
  "hooks": [{
    "type": "command",
    "command": "node scripts/hooks/protocol-file-tracker.js",
    "timeout": 3
  }]
}
```

**Tracker**: `scripts/hooks/protocol-file-tracker.js`
- Intercepts Read tool calls
- Detects when CLAUDE_*.md files are read
- Updates `.claude/unified-session-state.json` with read timestamp
- Persists across session compaction

#### 2. Validation at Handoff

When a handoff executes, the gate checks session state:

```javascript
// scripts/modules/handoff/gates/protocol-file-read-gate.js

const HANDOFF_FILE_REQUIREMENTS = {
  'LEAD-TO-PLAN': 'CLAUDE_LEAD.md',
  'PLAN-TO-EXEC': 'CLAUDE_PLAN.md',
  'EXEC-TO-PLAN': 'CLAUDE_EXEC.md'
};

export async function validateProtocolFileRead(handoffType, _ctx) {
  const requiredFile = HANDOFF_FILE_REQUIREMENTS[handoffType];
  const isRead = isProtocolFileRead(requiredFile);

  if (isRead) {
    return {
      pass: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: []
    };
  }

  // BLOCK handoff if file not read
  return {
    pass: false,
    score: 0,
    max_score: 100,
    issues: [
      `Protocol file not read: ${requiredFile}`,
      `LEO Protocol requires reading ${requiredFile} before ${handoffType} handoff`
    ],
    warnings: []
  };
}
```

#### 3. Session State Structure

**File**: `.claude/unified-session-state.json`
```json
{
  "protocolFilesRead": [
    "CLAUDE_LEAD.md",
    "CLAUDE_PLAN.md",
    "CLAUDE_EXEC.md"
  ],
  "protocolFilesReadAt": {
    "CLAUDE_LEAD.md": "2026-01-24T10:30:00.000Z",
    "CLAUDE_PLAN.md": "2026-01-24T11:15:00.000Z",
    "CLAUDE_EXEC.md": "2026-01-24T12:45:00.000Z"
  }
}
```

### Gate Execution Flow

```
Handoff Start → GATE_PROTOCOL_FILE_READ (first gate)
              ↓
        Check session state
              ↓
        ┌─────────────────┐
        │ File read?      │
        └─────────────────┘
           ↓         ↓
          Yes       No
           ↓         ↓
        PASS      BLOCK
         ↓         ↓
   Continue    Show Remediation
```

### Blocking Behavior

When the gate blocks, it provides clear remediation:

```
❌ Protocol file NOT read: CLAUDE_LEAD.md

📚 REMEDIATION:
   The LEO Protocol requires reading the phase-specific protocol file
   before proceeding with this handoff.

   ACTION REQUIRED:
   1. Read the file: CLAUDE_LEAD.md
   2. Re-run the handoff after reading

   HINT: Use the Read tool to read CLAUDE_LEAD.md
```

### Bypass Mechanism

Emergency bypass is available with explicit reason:

```javascript
// Bypass requires 20+ character justification
bypassProtocolFileReadGate('LEAD-TO-PLAN',
  'Production emergency fix - JIRA-12345 - time-sensitive outage'
);
```

**Rate-limited per SD-LEARN-010**: Bypass events are logged and tracked for pattern analysis.

### Structured Logging

All gate outcomes emit structured logs for machine parsing:

```javascript
// PASS event
{
  event: 'PROTOCOL_FILE_READ_GATE',
  status: 'PASS',
  handoff_type: 'LEAD-TO-PLAN',
  required_file: 'CLAUDE_LEAD.md',
  session_id: 'session_abc123',
  timestamp: '2026-01-24T10:30:00.000Z'
}

// BLOCK event
{
  event: 'PROTOCOL_FILE_READ_GATE',
  status: 'BLOCK',
  handoff_type: 'PLAN-TO-EXEC',
  required_file: 'CLAUDE_PLAN.md',
  session_id: 'session_abc123',
  timestamp: '2026-01-24T11:00:00.000Z'
}

// BYPASS event
{
  event: 'PROTOCOL_FILE_READ_GATE',
  status: 'BYPASS',
  handoff_type: 'LEAD-TO-PLAN',
  required_file: 'CLAUDE_LEAD.md',
  bypass_reason: 'Production emergency fix...',
  session_id: 'session_abc123',
  timestamp: '2026-01-24T11:30:00.000Z'
}
```

### Integration

**Handoffs**: LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN
**Position**: First gate (runs before all other gates)
**Blocking**: Yes (handoff cannot proceed if file not read)

**Files Modified**:
- `scripts/modules/handoff/executors/lead-to-plan/index.js`
- `scripts/modules/handoff/executors/plan-to-exec/index.js`
- `scripts/modules/handoff/executors/exec-to-plan/index.js`

### Why This Enhancement Was Needed

**Problem**: Protocol Familiarization directive was text-only guidance in CLAUDE_*.md files (lines 23-24). Agents could proceed with handoffs without reading phase-specific instructions.

**Root Cause**: No enforcement mechanism to validate protocol file reading.

**Solution**: Convert text directive into enforced validation gate with automatic tracking.

### Test Coverage

**Unit Tests**: `tests/unit/protocol-file-read-gate.test.js` (19 tests)

Coverage includes:
- ✅ Handoff file requirements mapping
- ✅ Blocking behavior when file not read
- ✅ Passing behavior when file is read
- ✅ Session state persistence
- ✅ Duplicate prevention
- ✅ Multiple file tracking
- ✅ Bypass validation
- ✅ Timestamp recording
- ✅ Gate composition and integration

### Related

- **Hook**: `scripts/hooks/protocol-file-tracker.js` - Automatic read detection
- **Session State**: `.claude/unified-session-state.json` - Persistent tracking
- **Protocol Files**: `CLAUDE_LEAD.md`, `CLAUDE_PLAN.md`, `CLAUDE_EXEC.md`

---

## Best Practices

### DO

- Use BaseExecutor for all new handoff types
- Define clear gate chains with weights
- Store all handoffs in sd_phase_handoffs
- Release claims after handoff completion
- Log gate results for debugging
- **NEW**: Add pre-checks for expensive validations (GATE6 pattern)

### DON'T

- Don't bypass prerequisite validation
- Don't allow scores below the SD type threshold to pass (60-90%, typically 85%)
- Don't skip claim checking
- Don't create handoffs without gates
- Don't ignore blocking gate failures
- **NEW**: Don't skip proactive warnings when issues can be caught early

---

## Related Documentation

- [Sub-Agent Patterns Guide](../sub-agents/patterns-guide.md) - Sub-agent integration patterns
- [Sub-Agent System](../sub-agents/sub-agent-system.md) - Complete sub-agent reference
- [Command Ecosystem](../commands/command-ecosystem.md) - Command workflow integration

---

*Generated for SD-REFACTOR-HANDOFF-001 | LEO Protocol v4.3.3*

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.3.0 | 2026-01-24 | Added SD-Type-Aware Validation Policy documentation (Section 9) |
| 1.2.0 | 2026-01-24 | Added GATE_PROTOCOL_FILE_READ documentation (protocol familiarization enforcement) |
| 1.1.0 | 2026-01-23 | Added GATE6 v2 documentation (proactive cross-SD detection) |
| 1.0.0 | 2026-01-20 | Initial documentation, moved to LEO hub |
