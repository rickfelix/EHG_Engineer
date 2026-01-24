# SD-Type Applicability Policy API Reference

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: LEO Protocol Team
- **Last Updated**: 2026-01-24
- **Tags**: validation, sd-type, policy, api, handoff

## Overview

The SD-Type Applicability Policy module provides a centralized policy system for determining which validators are REQUIRED, NON_APPLICABLE, or OPTIONAL for each Strategic Directive type.

**Module**: `scripts/modules/handoff/validation/sd-type-applicability-policy.js`

**Purpose**: Fix 75% handoff rejection rate by allowing validators to skip non-applicable checks based on SD type.

**Integration**: Used by `ValidationOrchestrator.js` during handoff validation.

---

## Table of Contents

- [Enums](#enums)
- [Core Functions](#core-functions)
- [Policy Structure](#policy-structure)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)
- [Related Documentation](#related-documentation)

---

## Enums

### RequirementLevel

Defines the applicability of a validator to an SD type.

```javascript
export const RequirementLevel = {
  REQUIRED: 'REQUIRED',             // Validator MUST pass
  NON_APPLICABLE: 'NON_APPLICABLE', // Validator does not apply (auto-skipped)
  OPTIONAL: 'OPTIONAL'              // Validator contributes to score but doesn't block
};
```

### ValidatorStatus

Validator execution status.

```javascript
export const ValidatorStatus = {
  PASS: 'PASS',         // Validator passed
  FAIL: 'FAIL',         // Validator failed
  SKIPPED: 'SKIPPED',   // Validator skipped (non-applicable)
  NOT_RUN: 'NOT_RUN'    // Validator not executed yet
};
```

### SkipReasonCode

Reason codes for skipped validators (for traceability).

```javascript
export const SkipReasonCode = {
  NON_APPLICABLE_SD_TYPE: 'NON_APPLICABLE_SD_TYPE', // Primary reason: SD type policy
  DISABLED_BY_CONFIG: 'DISABLED_BY_CONFIG',         // Disabled in configuration
  CONDITIONAL_SKIP: 'CONDITIONAL_SKIP',             // Conditional logic skipped
  EMERGENCY_BYPASS: 'EMERGENCY_BYPASS'              // Emergency bypass (logged)
};
```

---

## Core Functions

### getValidatorRequirement(sdType, validatorName)

Returns the requirement level for a specific validator given an SD type.

**Parameters**:
- `sdType` (string): SD type (e.g., 'refactor', 'feature', 'infrastructure')
- `validatorName` (string): Validator code (e.g., 'TESTING', 'DESIGN', 'REGRESSION')

**Returns**: `RequirementLevel` enum value

**Behavior**:
- Returns policy-defined requirement level if SD type is known
- **Allowlist approach**: Unknown SD types default to `REQUIRED` (safe fallback)

**Example**:
```javascript
import { getValidatorRequirement, RequirementLevel } from './sd-type-applicability-policy.js';

// Refactor SD
getValidatorRequirement('refactor', 'TESTING');    // Returns: NON_APPLICABLE
getValidatorRequirement('refactor', 'REGRESSION'); // Returns: REQUIRED

// Feature SD
getValidatorRequirement('feature', 'TESTING');     // Returns: REQUIRED
getValidatorRequirement('feature', 'DESIGN');      // Returns: REQUIRED

// Unknown SD type (safe default)
getValidatorRequirement('unknown_type', 'TESTING'); // Returns: REQUIRED
```

---

### isValidatorRequired(sdType, validatorName)

Checks if a validator is REQUIRED for an SD type.

**Parameters**:
- `sdType` (string): SD type
- `validatorName` (string): Validator code

**Returns**: `boolean` - `true` if validator is REQUIRED, `false` otherwise

**Example**:
```javascript
import { isValidatorRequired } from './sd-type-applicability-policy.js';

isValidatorRequired('refactor', 'REGRESSION'); // Returns: true
isValidatorRequired('refactor', 'TESTING');    // Returns: false
```

---

### isValidatorNonApplicable(sdType, validatorName)

Checks if a validator is NON_APPLICABLE for an SD type.

**Parameters**:
- `sdType` (string): SD type
- `validatorName` (string): Validator code

**Returns**: `boolean` - `true` if validator is NON_APPLICABLE, `false` otherwise

**Example**:
```javascript
import { isValidatorNonApplicable } from './sd-type-applicability-policy.js';

isValidatorNonApplicable('refactor', 'TESTING');    // Returns: true
isValidatorNonApplicable('refactor', 'REGRESSION'); // Returns: false
```

---

### createSkippedResult(validatorName, sdType, skipReason)

Creates a properly structured SKIPPED validation result with full traceability.

**Parameters**:
- `validatorName` (string): Validator code (e.g., 'TESTING')
- `sdType` (string): SD type (e.g., 'refactor')
- `skipReason` (string, optional): Skip reason code. Defaults to `SkipReasonCode.NON_APPLICABLE_SD_TYPE`

**Returns**: Object with SKIPPED validation result

**Result Structure**:
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
  skipDetails: {          // Traceability metadata
    validator_name: 'TESTING',
    sd_type: 'refactor',
    reason_code: 'NON_APPLICABLE_SD_TYPE',
    policy_version: '1.0.0',
    timestamp: '2026-01-24T12:34:56.789Z'
  }
}
```

**Example**:
```javascript
import { createSkippedResult, SkipReasonCode } from './sd-type-applicability-policy.js';

// Default skip reason (NON_APPLICABLE_SD_TYPE)
const result1 = createSkippedResult('TESTING', 'refactor');

// Custom skip reason
const result2 = createSkippedResult('DESIGN', 'infrastructure', SkipReasonCode.DISABLED_BY_CONFIG);
```

---

### isSkippedResult(result)

Detects if a validation result represents a SKIPPED validator.

**Parameters**:
- `result` (object): Validation result object

**Returns**: `boolean` - `true` if result is SKIPPED, `false` otherwise

**Detection Logic**:
```javascript
return result.status === 'SKIPPED' ||
       result.skipped === true ||
       result.skipReason !== undefined;
```

**Example**:
```javascript
import { isSkippedResult, createSkippedResult } from './sd-type-applicability-policy.js';

const skippedResult = createSkippedResult('TESTING', 'refactor');
isSkippedResult(skippedResult); // Returns: true

const passResult = { passed: true, status: 'PASS', score: 95 };
isSkippedResult(passResult); // Returns: false
```

---

### getRequiredValidators(sdType)

Returns array of REQUIRED validator names for an SD type.

**Parameters**:
- `sdType` (string): SD type

**Returns**: `string[]` - Array of validator names

**Example**:
```javascript
import { getRequiredValidators } from './sd-type-applicability-policy.js';

getRequiredValidators('refactor');
// Returns: ['REGRESSION', 'GITHUB']

getRequiredValidators('feature');
// Returns: ['TESTING', 'DESIGN', 'DOCMON', 'STORIES', 'GITHUB']
```

---

### getNonApplicableValidators(sdType)

Returns array of NON_APPLICABLE validator names for an SD type.

**Parameters**:
- `sdType` (string): SD type

**Returns**: `string[]` - Array of validator names

**Example**:
```javascript
import { getNonApplicableValidators } from './sd-type-applicability-policy.js';

getNonApplicableValidators('refactor');
// Returns: ['TESTING', 'DESIGN', 'DATABASE', 'STORIES']

getNonApplicableValidators('infrastructure');
// Returns: ['TESTING', 'DESIGN', 'GITHUB']
```

---

### getValidatorRequirements(sdType)

Returns complete requirements map for an SD type.

**Parameters**:
- `sdType` (string): SD type

**Returns**: `Map<validatorName, requirementLevel>`

**Example**:
```javascript
import { getValidatorRequirements } from './sd-type-applicability-policy.js';

const requirements = getValidatorRequirements('refactor');
// Returns Map:
// {
//   'TESTING': 'NON_APPLICABLE',
//   'DESIGN': 'NON_APPLICABLE',
//   'REGRESSION': 'REQUIRED',
//   'GITHUB': 'REQUIRED',
//   'DATABASE': 'NON_APPLICABLE',
//   'DOCMON': 'OPTIONAL',
//   'STORIES': 'NON_APPLICABLE'
// }
```

---

### getPolicySummary(sdType)

Returns a summary of validator requirements for an SD type.

**Parameters**:
- `sdType` (string): SD type

**Returns**: Object with summary statistics

**Summary Structure**:
```javascript
{
  sd_type: 'refactor',
  policy_version: '1.0.0',
  required: ['REGRESSION', 'GITHUB'],
  non_applicable: ['TESTING', 'DESIGN', 'DATABASE', 'STORIES'],
  optional: ['DOCMON'],
  total_validators: 7
}
```

**Example**:
```javascript
import { getPolicySummary } from './sd-type-applicability-policy.js';

const summary = getPolicySummary('infrastructure');
console.log(`Required: ${summary.required.length}`);
console.log(`Non-applicable: ${summary.non_applicable.length}`);
```

---

## Policy Structure

### SD_TYPE_POLICY Constant

The centralized policy definition mapping SD types to validator requirements.

**Structure**:
```javascript
export const SD_TYPE_POLICY = {
  [sdType]: {
    [validatorName]: RequirementLevel,
    ...
  },
  ...
};
```

### Supported SD Types

| SD Type | Description | Key Validators |
|---------|-------------|----------------|
| `feature` | New functionality | TESTING, DESIGN, DOCMON, STORIES, GITHUB (all REQUIRED) |
| `refactor` | Code restructuring | REGRESSION, GITHUB (REQUIRED); TESTING, DESIGN (NON_APPLICABLE) |
| `infrastructure` | Tooling, scripts, CI/CD | DOCMON (REQUIRED); TESTING, DESIGN, GITHUB (NON_APPLICABLE) |
| `database` | Schema changes | DATABASE, TESTING, GITHUB (REQUIRED); DESIGN (NON_APPLICABLE) |
| `security` | Security fixes | SECURITY, TESTING, GITHUB (REQUIRED) |
| `documentation` | Documentation only | DOCMON (REQUIRED); all others (NON_APPLICABLE) |
| `bugfix` | Bug fixes | TESTING, REGRESSION (REQUIRED); DESIGN, STORIES (NON_APPLICABLE) |
| `performance` | Performance optimization | TESTING, REGRESSION, GITHUB (REQUIRED); DESIGN, STORIES (NON_APPLICABLE) |
| `enhancement` | Small improvements | TESTING (REQUIRED); DESIGN, STORIES (NON_APPLICABLE) |
| `orchestrator` | Parent coordination SD | DOCMON (REQUIRED); STORIES (in children, NON_APPLICABLE for parent) |
| `discovery_spike` | Research/exploration | DOCMON (REQUIRED); TESTING, DESIGN, GITHUB (NON_APPLICABLE) |
| `ux_debt` | UI/UX improvements | DESIGN, TESTING (REQUIRED); DATABASE (NON_APPLICABLE) |
| `qa` | QA/testing infrastructure | TESTING (REQUIRED); DESIGN (NON_APPLICABLE) |

### Supported Validators

| Validator | Purpose |
|-----------|---------|
| `TESTING` | E2E tests, unit tests, QA validation |
| `DESIGN` | UI/UX design validation, component sizing, accessibility |
| `REGRESSION` | Backward compatibility, no behavior change verification |
| `GITHUB` | CI/CD pipeline validation, GitHub Actions checks |
| `DATABASE` | Schema validation, migration checks, RLS policies |
| `DOCMON` | Documentation quality, completeness |
| `SECURITY` | Security audit, vulnerability checks |
| `STORIES` | User story validation, acceptance criteria |

---

## Usage Examples

### Example 1: ValidationOrchestrator Integration

```javascript
import {
  getValidatorRequirement,
  isValidatorNonApplicable,
  createSkippedResult,
  isSkippedResult,
  RequirementLevel
} from './sd-type-applicability-policy.js';

export class ValidationOrchestrator {
  async validateGates(gates, context) {
    const results = {
      skippedCount: 0,
      skippedGates: [],
      gateStatuses: {}
    };

    for (const gate of gates) {
      // Check if gate is non-applicable for this SD type
      if (isValidatorNonApplicable(context.sd.sd_type, gate.name)) {
        const skippedResult = createSkippedResult(gate.name, context.sd.sd_type);
        results.skippedCount++;
        results.skippedGates.push(gate.name);
        results.gateStatuses[gate.name] = {
          status: 'SKIPPED',
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
      }
    }

    return results;
  }
}
```

### Example 2: Custom Validator Implementation

```javascript
import {
  getValidatorRequirement,
  createSkippedResult,
  RequirementLevel
} from './sd-type-applicability-policy.js';

export async function validateTesting(context) {
  const { sd } = context;

  // Check if TESTING validator applies to this SD type
  const requirement = getValidatorRequirement(sd.sd_type, 'TESTING');

  if (requirement === RequirementLevel.NON_APPLICABLE) {
    // Auto-skip for non-applicable SD types
    return createSkippedResult('TESTING', sd.sd_type);
  }

  // Execute TESTING validation normally
  const testResults = await runTests();

  if (requirement === RequirementLevel.REQUIRED && !testResults.passed) {
    // Block handoff if REQUIRED validator fails
    return {
      passed: false,
      status: 'FAIL',
      score: 0,
      issues: ['Required tests failed']
    };
  }

  return {
    passed: testResults.passed,
    status: 'PASS',
    score: testResults.score
  };
}
```

### Example 3: Pre-Handoff Validation Check

```javascript
import {
  getRequiredValidators,
  getNonApplicableValidators,
  getPolicySummary
} from './sd-type-applicability-policy.js';

export function displayHandoffRequirements(sdType) {
  const summary = getPolicySummary(sdType);

  console.log(`\n📋 Handoff Requirements for ${sdType} SD`);
  console.log(`════════════════════════════════════════\n`);

  console.log(`✅ REQUIRED Validators (${summary.required.length}):`);
  summary.required.forEach(v => console.log(`   - ${v}`));

  console.log(`\n⏭️  SKIPPED Validators (${summary.non_applicable.length}):`);
  summary.non_applicable.forEach(v => console.log(`   - ${v}`));

  if (summary.optional.length > 0) {
    console.log(`\n⚠️  OPTIONAL Validators (${summary.optional.length}):`);
    summary.optional.forEach(v => console.log(`   - ${v}`));
  }

  console.log(`\nPolicy Version: ${summary.policy_version}`);
}

// Usage
displayHandoffRequirements('refactor');
```

---

## Best Practices

### DO

✅ **Use policy functions for all validator applicability checks**
```javascript
if (isValidatorNonApplicable(sdType, validatorName)) {
  return createSkippedResult(validatorName, sdType);
}
```

✅ **Store skipDetails for traceability**
```javascript
const result = createSkippedResult('TESTING', 'refactor');
// Result includes skipDetails with policy_version, timestamp, reason_code
```

✅ **Default to REQUIRED for unknown SD types** (already handled by module)
```javascript
getValidatorRequirement('unknown_sd_type', 'TESTING'); // Returns: REQUIRED (safe)
```

✅ **Track skipped validators in validation results**
```javascript
results.skippedCount = 0;
results.skippedGates = [];
// Increment when validator is skipped
```

✅ **Use getPolicySummary() for debugging**
```javascript
const summary = getPolicySummary(sdType);
console.log('Required:', summary.required);
console.log('Non-applicable:', summary.non_applicable);
```

### DON'T

❌ **Don't bypass REQUIRED validators**
```javascript
// BAD: Manually skipping a REQUIRED validator
if (validatorName === 'REGRESSION' && sdType === 'refactor') {
  return { passed: true, skipped: true }; // WRONG!
}

// GOOD: Use policy module
const requirement = getValidatorRequirement(sdType, validatorName);
if (requirement === RequirementLevel.NON_APPLICABLE) {
  return createSkippedResult(validatorName, sdType);
}
```

❌ **Don't hardcode SD type checks in validators**
```javascript
// BAD: Hardcoded SD type logic in validator
if (sd.sd_type === 'refactor' || sd.sd_type === 'infrastructure') {
  return { passed: true, skipped: true };
}

// GOOD: Use policy module
if (isValidatorNonApplicable(sd.sd_type, 'TESTING')) {
  return createSkippedResult('TESTING', sd.sd_type);
}
```

❌ **Don't manually construct SKIPPED results**
```javascript
// BAD: Manual SKIPPED result
return {
  passed: true,
  status: 'SKIPPED',
  score: 100,
  // Missing: skipDetails, policy_version, timestamp
};

// GOOD: Use createSkippedResult()
return createSkippedResult(validatorName, sdType);
```

❌ **Don't skip traceability fields**
```javascript
// BAD: Missing skipReason and skipDetails
return { passed: true, skipped: true };

// GOOD: Full traceability via createSkippedResult()
return createSkippedResult(validatorName, sdType, skipReason);
```

---

## Related Documentation

- **[Handoff System Guide - Section 9](../leo/handoffs/handoff-system-guide.md#9-gate-spotlight-sd-type-aware-validation-policy)** - Complete SD-type-aware validation documentation
- **[Validation Enforcement Framework](./validation-enforcement.md)** - Adaptive thresholds and gate architecture
- **[Database Migration: SD-Type-Aware Progress Calculation](../../database/migrations/20260124_sd_type_aware_progress_calculation.sql)** - Database-side SD type handling
- **[Unit Tests](../../tests/unit/sd-type-applicability-policy.test.js)** - 40 unit tests covering all API functions

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-24 | Initial API reference documentation |

---

*Part of SD-LEO-FIX-REMEDIATE-TYPE-AWARE-001 | LEO Protocol v4.3.3*
