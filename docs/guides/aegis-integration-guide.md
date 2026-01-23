# AEGIS Integration Guide

## Metadata
- **Category**: Guide
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: DOCMON Sub-Agent
- **Last Updated**: 2026-01-24
- **Tags**: aegis, integration, migration, adapters, patterns
- **SD**: SD-AEGIS-GOVERNANCE-001
- **Related Docs**:
  - [AEGIS Architecture Overview](../01_architecture/aegis-system-overview.md)
  - [AEGIS API Documentation](../02_api/aegis-endpoints.md)
  - [AEGIS CLI Guide](../reference/aegis-cli-guide.md)
  - [AEGIS Database Schema](../database/aegis-schema.md)

## Overview

This guide provides patterns and best practices for integrating AEGIS into existing systems. Whether you're migrating legacy governance systems or building new features with AEGIS-native validation, this guide covers common scenarios and implementation strategies.

**Target Audience**: Developers integrating AEGIS into applications

**Prerequisites**:
- Understanding of AEGIS architecture
- Access to Supabase database
- Node.js/TypeScript knowledge

## Table of Contents

- [Integration Strategies](#integration-strategies)
- [Migration Path](#migration-path)
- [Adapter Pattern](#adapter-pattern)
- [Direct Integration](#direct-integration)
- [Testing Strategies](#testing-strategies)
- [Feature Flag Rollout](#feature-flag-rollout)
- [Common Patterns](#common-patterns)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Integration Strategies

AEGIS supports three integration approaches, each with different trade-offs:

### 1. Adapter Pattern (Recommended for Migration)

**Use When**:
- Migrating existing governance systems
- Need zero downtime
- Legacy code cannot be modified immediately

**Pros**:
- No code changes to callers
- Gradual rollout via feature flags
- Can toggle back to legacy if issues arise

**Cons**:
- Maintains legacy API surface
- Slight performance overhead
- Temporary technical debt

**Example**: `ConstitutionAdapter` maintains `ConstitutionValidator` API while routing to AEGIS.

### 2. Direct Integration (Recommended for New Code)

**Use When**:
- Building new features
- Full control over code
- Want best performance and features

**Pros**:
- Clean, modern API
- Full AEGIS feature access
- Best performance

**Cons**:
- Requires code changes
- More upfront work

**Example**: Importing `getAegisEnforcer()` directly.

### 3. Hybrid Approach (Best of Both)

**Use When**:
- Large codebase with mixed legacy/new code
- Gradual migration over months
- Need both backward compatibility and modern features

**Pattern**:
- Legacy code uses adapters
- New code uses direct integration
- Shared AEGIS backend ensures consistency

---

## Migration Path

### Phase 1: Deployment (Week 1)

**Goal**: Deploy AEGIS alongside legacy systems without breaking changes.

**Steps**:

1. **Run Database Migrations**:

```bash
# Foundation migration
psql $DATABASE_URL < database/migrations/20260124_aegis_governance_foundation.sql

# Phase 4 migration (Hard Halt, Manifesto, Doctrine)
psql $DATABASE_URL < database/migrations/20260124_aegis_phase4_rules.sql

# Phase 5 migration (Crew, Compliance)
psql $DATABASE_URL < database/migrations/20260124_aegis_phase5_rules.sql
```

2. **Verify Database**:

```bash
node scripts/governance.js constitutions
# Should show 7 constitutions

node scripts/governance.js list
# Should show 45+ rules
```

3. **Deploy Adapters**:

No code changes needed. Adapters are already in place at `lib/governance/aegis/adapters/`.

4. **Enable Feature Flag (Test Environment)**:

```bash
# .env.test
USE_AEGIS=true
USE_AEGIS_PROTOCOL=true
# ... enable all constitutions
```

5. **Smoke Test**:

```javascript
import { ConstitutionAdapter } from '@/lib/governance/aegis/adapters';

const adapter = new ConstitutionAdapter(supabase);
const result = await adapter.validate({
  risk_tier: 'GOVERNED',
  auto_applicable: true
}, {});

console.log('Validation result:', result);
// Should fail with CONST-001 violation
```

### Phase 2: Observation (Weeks 2-4)

**Goal**: Monitor adapter performance and compare with legacy.

**Steps**:

1. **Enable Logging**:

```javascript
// Add to AegisEnforcer
console.log('[AEGIS] Validation result:', {
  constitution: constitutionCode,
  passed: result.passed,
  violations: result.violations.length,
  duration: Date.now() - startTime
});
```

2. **Compare Results**:

```javascript
// Dual validation (test only)
const legacyResult = await legacyValidator.validate(improvement);
const aegisResult = await adapter.validate(improvement);

if (legacyResult.passed !== aegisResult.passed) {
  console.error('MISMATCH:', { legacy: legacyResult, aegis: aegisResult });
}
```

3. **Monitor Violations**:

```bash
# Daily check
node scripts/governance.js violations --status=open

# Stats
node scripts/governance.js stats --period=7
```

4. **Tune Rules** (if needed):

```sql
-- If rule is too strict
UPDATE aegis_rules
SET enforcement_action = 'WARN_AND_LOG'
WHERE rule_code = 'PROBLEMATIC-RULE';

-- If rule has false positives
UPDATE aegis_rules
SET is_active = false
WHERE rule_code = 'FALSE-POSITIVE-RULE';
```

### Phase 3: Rollout (Weeks 5-8)

**Goal**: Enable AEGIS in production, phase by phase.

**Week 5**: Enable in staging
```bash
# .env.staging
USE_AEGIS=true
```

**Week 6**: Enable for specific constitutions in production
```bash
# .env.production
USE_AEGIS=true
USE_AEGIS_PROTOCOL=true  # Start with most critical
USE_AEGIS_DOCTRINE=true
```

**Week 7**: Enable remaining constitutions
```bash
# .env.production
USE_AEGIS_FOUR_OATHS=true
USE_AEGIS_HARD_HALT=true
USE_AEGIS_MANIFESTO=true
USE_AEGIS_CREW=true
USE_AEGIS_COMPLIANCE=true
```

**Week 8**: Monitor and stabilize

### Phase 4: Direct Integration (Months 3-6)

**Goal**: Migrate high-value code to direct integration.

**Prioritization**:
1. New features (always use direct integration)
2. Frequently modified code
3. Performance-critical paths
4. Legacy code (last, or never if stable)

**Pattern**:

```javascript
// OLD (adapter)
import { ConstitutionValidator } from '@/lib/governance/protocol-constitution';
const validator = new ConstitutionValidator(supabase);
await validator.validate(improvement);

// NEW (direct)
import { getAegisEnforcer } from '@/lib/governance/aegis';
const enforcer = getAegisEnforcer({ supabase });
await enforcer.enforce('PROTOCOL', context);
```

### Phase 5: Deprecation (Months 6-12)

**Goal**: Remove legacy governance code.

**Steps**:

1. **Identify remaining legacy calls**:

```bash
# Search for old imports
grep -r "protocol-constitution" --include="*.ts" --include="*.js"
grep -r "four-oaths-validator" --include="*.ts" --include="*.js"
```

2. **Plan migration sprints**

3. **Remove legacy validators**:

```bash
# After all migrations complete
rm lib/governance/protocol-constitution/ConstitutionValidator.js
rm lib/governance/four-oaths/FourOathsValidator.js
# ... etc
```

4. **Remove adapters** (optional):

Adapters can stay as thin wrappers if beneficial.

---

## Adapter Pattern

### Using Existing Adapters

**Protocol Constitution Example**:

```javascript
import { ConstitutionAdapter } from '@/lib/governance/aegis/adapters';

// Initialize with Supabase client
const adapter = new ConstitutionAdapter(supabase);

// Validate (same API as legacy ConstitutionValidator)
const result = await adapter.validate(improvement, context);

if (!result.passed) {
  console.error('Validation failed:', result.violations);
  // Handle violations
}

// Check if AEGIS is being used
console.log('AEGIS enabled:', result.aegis_enabled);
```

**Four Oaths Example**:

```javascript
import { FourOathsAdapter } from '@/lib/governance/aegis/adapters';

const adapter = new FourOathsAdapter(supabase);

// Same API as legacy OathsValidator
const result = await adapter.validate({
  input: 'User request',
  reasoning: 'My analysis',
  output: 'My response',
  confidence: 0.85
});

if (!result.passed) {
  // Handle oath violations
}
```

**Doctrine Example**:

```javascript
import { DoctrineAdapter } from '@/lib/governance/aegis/adapters';

const adapter = new DoctrineAdapter(supabase);

// Validate EXEC constraints
const canProceed = await adapter.canExecCreateSD('EXEC');
// Returns false - EXEC cannot create SDs

const canProceed2 = await adapter.canExecCreateSD('LEAD');
// Returns true - LEAD can create SDs
```

### Creating Custom Adapters

**Template**:

```javascript
/**
 * CustomAdapter - Wraps legacy CustomValidator with AEGIS
 */
import { getAegisEnforcer } from '../aegis/AegisEnforcer.js';

export class CustomAdapter {
  constructor(supabase = null) {
    this.enforcer = getAegisEnforcer({ supabase });
    this.constitutionCode = 'YOUR_CONSTITUTION_CODE';
  }

  /**
   * Maintain legacy method signature
   */
  async validate(data) {
    // Transform data to AEGIS context
    const context = this._transformToAegisContext(data);

    // Validate via AEGIS
    const result = await this.enforcer.validate(
      this.constitutionCode,
      context,
      { recordViolations: true }
    );

    // Transform result back to legacy format
    return this._transformToLegacyResult(result);
  }

  /**
   * Transform legacy data to AEGIS context
   */
  _transformToAegisContext(data) {
    return {
      // Map legacy fields to AEGIS context
      field1: data.legacy_field1,
      field2: data.legacy_field2,
      // ... etc
    };
  }

  /**
   * Transform AEGIS result to legacy format
   */
  _transformToLegacyResult(aegisResult) {
    return {
      passed: aegisResult.passed,
      violations: aegisResult.violations.map(v => ({
        code: v.rule_code,
        message: v.message,
        severity: v.severity
      })),
      // Legacy format fields
      requires_human_review: aegisResult.violations.some(v =>
        v.severity === 'HIGH' || v.severity === 'MEDIUM'
      ),
      // AEGIS metadata
      aegis_enabled: true
    };
  }
}
```

### Feature Flag Toggle

**Runtime Toggle**:

```javascript
const adapter = new ConstitutionAdapter(supabase);

// Temporarily disable AEGIS (fallback to legacy)
adapter.setAegisMode(false);
const result1 = await adapter.validate(data);  // Uses legacy

// Re-enable AEGIS
adapter.setAegisMode(true);
const result2 = await adapter.validate(data);  // Uses AEGIS
```

**Environment-Based Toggle**:

```javascript
const useAegis = process.env.USE_AEGIS === 'true';

if (useAegis) {
  const enforcer = getAegisEnforcer();
  await enforcer.enforce('PROTOCOL', context);
} else {
  const validator = new LegacyValidator();
  await validator.validate(data);
}
```

---

## Direct Integration

### Basic Validation

**Import and Initialize**:

```javascript
import { getAegisEnforcer } from '@/lib/governance/aegis';

// Get singleton instance
const enforcer = getAegisEnforcer({ supabase });
```

**Simple Validation**:

```javascript
// Validate without throwing (returns result object)
const result = await enforcer.validate('PROTOCOL', {
  risk_tier: 'AUTO',
  target_table: 'protocol_improvement_queue',
  auto_applicable: true
});

if (!result.passed) {
  console.error('Violations:', result.violations);
  // Handle violations
} else {
  console.log('Validation passed!');
}
```

**Enforcing Validation** (throws on violation):

```javascript
try {
  await enforcer.enforce('PROTOCOL', context);
  // Proceed with operation
} catch (error) {
  if (error instanceof AegisViolationError) {
    console.error('Governance violation:', error.violations);
    // Show user-friendly error
  } else {
    throw error;  // Other error
  }
}
```

### Advanced Validation

**Multiple Constitutions**:

```javascript
// Validate against all enabled constitutions
const result = await enforcer.validateAll({
  actor_role: 'EXEC',
  target_table: 'strategic_directives_v2',
  operation_type: 'INSERT',
  venture_id: 'uuid',
  budget_remaining: 1000
});

console.log(`Checked ${result.constitutionsChecked} constitutions`);
console.log(`Total violations: ${result.totalViolations}`);

// Check specific constitution results
if (!result.results.DOCTRINE.passed) {
  console.error('Doctrine violation:', result.results.DOCTRINE.violations);
}
```

**Override with Justification**:

```javascript
try {
  await enforcer.enforce('PROTOCOL', context);
} catch (error) {
  if (error instanceof AegisViolationError) {
    // Check if overridable
    if (enforcer.canOverride(error.violations)) {
      // Prompt user for justification
      const justification = await promptUserForJustification();

      // Override violations
      await enforcer.overrideViolations(
        error.violations.map(v => v.id),
        justification,
        currentUser.id
      );

      // Proceed with operation
      console.log('Override approved, proceeding...');
    } else {
      // Cannot override, block operation
      throw new Error('Operation blocked by governance rules');
    }
  }
}
```

**Dry Run (No Recording)**:

```javascript
// Validate without recording violations to audit log
const result = await enforcer.validate('PROTOCOL', context, {
  recordViolations: false,
  incrementStats: false
});

// Useful for testing or "what-if" scenarios
```

### TypeScript Integration

**Type-Safe Context**:

```typescript
interface ProtocolContext {
  risk_tier: 'AUTO' | 'GOVERNED';
  target_table: string;
  target_operation?: 'INSERT' | 'UPDATE' | 'DELETE';
  auto_applicable: boolean;
  payload?: Record<string, any>;
}

async function validateProtocolChange(context: ProtocolContext) {
  const enforcer = getAegisEnforcer();

  try {
    await enforcer.enforce('PROTOCOL', context);
    return { success: true };
  } catch (error) {
    if (error instanceof AegisViolationError) {
      return {
        success: false,
        violations: error.violations
      };
    }
    throw error;
  }
}
```

**Type-Safe Result**:

```typescript
import { AegisViolationError } from '@/lib/governance/aegis';

interface ValidationResult {
  passed: boolean;
  violations: Array<{
    rule_code: string;
    rule_name: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'ADVISORY';
    message: string;
  }>;
  rulesChecked: number;
}

async function validate(context: any): Promise<ValidationResult> {
  const enforcer = getAegisEnforcer();
  return await enforcer.validate('PROTOCOL', context);
}
```

### React Integration

**Validation Hook**:

```typescript
import { useState, useCallback } from 'react';
import { getAegisEnforcer } from '@/lib/governance/aegis';

export function useAegisValidation(constitutionCode: string) {
  const [validating, setValidating] = useState(false);
  const [violations, setViolations] = useState([]);

  const validate = useCallback(async (context: any) => {
    setValidating(true);
    setViolations([]);

    try {
      const enforcer = getAegisEnforcer();
      const result = await enforcer.validate(constitutionCode, context);

      if (!result.passed) {
        setViolations(result.violations);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Validation error:', error);
      throw error;
    } finally {
      setValidating(false);
    }
  }, [constitutionCode]);

  return { validate, validating, violations };
}
```

**Usage in Component**:

```tsx
function ProtocolImprovementForm() {
  const { validate, validating, violations } = useAegisValidation('PROTOCOL');

  const handleSubmit = async (formData) => {
    const context = {
      risk_tier: formData.riskTier,
      auto_applicable: formData.autoApplicable,
      target_table: 'protocol_improvement_queue'
    };

    const isValid = await validate(context);

    if (!isValid) {
      // Show violations to user
      return;
    }

    // Proceed with submission
    await submitImprovement(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}

      {violations.length > 0 && (
        <div className="violations">
          <h3>Governance Violations</h3>
          {violations.map(v => (
            <div key={v.rule_code} className={`violation-${v.severity}`}>
              <strong>{v.rule_code}</strong>: {v.message}
            </div>
          ))}
        </div>
      )}

      <button type="submit" disabled={validating}>
        {validating ? 'Validating...' : 'Submit'}
      </button>
    </form>
  );
}
```

---

## Testing Strategies

### Unit Testing

**Mock AEGIS Enforcer**:

```javascript
import { jest } from '@jest/globals';

// Mock the module
jest.mock('@/lib/governance/aegis', () => ({
  getAegisEnforcer: jest.fn(() => ({
    validate: jest.fn(async () => ({
      passed: true,
      violations: [],
      rulesChecked: 9
    })),
    enforce: jest.fn(async () => ({
      passed: true
    }))
  }))
}));

// Test
describe('My feature', () => {
  it('should validate before proceeding', async () => {
    const { getAegisEnforcer } = require('@/lib/governance/aegis');
    const enforcer = getAegisEnforcer();

    await myFeature();

    expect(enforcer.validate).toHaveBeenCalledWith('PROTOCOL', expect.any(Object));
  });
});
```

**Test Violation Handling**:

```javascript
it('should handle violations gracefully', async () => {
  const enforcer = getAegisEnforcer();

  // Mock a violation
  enforcer.validate.mockResolvedValueOnce({
    passed: false,
    violations: [{
      rule_code: 'CONST-001',
      severity: 'CRITICAL',
      message: 'Test violation'
    }]
  });

  const result = await myFeature();

  expect(result.success).toBe(false);
  expect(result.error).toContain('governance');
});
```

### Integration Testing

**Real Database Validation**:

```javascript
import { createClient } from '@supabase/supabase-js';
import { getAegisEnforcer } from '@/lib/governance/aegis';

describe('AEGIS Integration', () => {
  let supabase;
  let enforcer;

  beforeAll(() => {
    supabase = createClient(
      process.env.TEST_SUPABASE_URL,
      process.env.TEST_SUPABASE_KEY
    );
    enforcer = getAegisEnforcer({ supabase });
  });

  it('should block GOVERNED auto-apply', async () => {
    const result = await enforcer.validate('PROTOCOL', {
      risk_tier: 'GOVERNED',
      auto_applicable: true
    });

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].rule_code).toBe('CONST-001');
  });

  it('should allow AUTO auto-apply', async () => {
    const result = await enforcer.validate('PROTOCOL', {
      risk_tier: 'AUTO',
      auto_applicable: true,
      target_table: 'protocol_improvement_queue'
    });

    expect(result.passed).toBe(true);
  });
});
```

### E2E Testing

**Playwright Test**:

```javascript
import { test, expect } from '@playwright/test';

test('governance blocks invalid submission', async ({ page }) => {
  await page.goto('/protocol/improvements/new');

  // Fill form with invalid data
  await page.selectOption('#risk-tier', 'GOVERNED');
  await page.check('#auto-applicable');

  // Attempt submit
  await page.click('button[type="submit"]');

  // Should show governance violation
  await expect(page.locator('.violation')).toContainText('CONST-001');
  await expect(page.locator('.violation')).toContainText('human approval');
});
```

---

## Feature Flag Rollout

### Environment-Based

**Configuration**:

```bash
# .env.local (development)
USE_AEGIS=true

# .env.staging
USE_AEGIS=true

# .env.production
USE_AEGIS=false  # Start disabled

# Gradual rollout
USE_AEGIS_PROTOCOL=true  # Enable one at a time
USE_AEGIS_DOCTRINE=true
```

**Code**:

```javascript
const useAegis = process.env.USE_AEGIS === 'true';
const useProtocol = process.env.USE_AEGIS_PROTOCOL === 'true';

if (useAegis && useProtocol) {
  // Use AEGIS for Protocol
} else {
  // Use legacy
}
```

### Percentage-Based Rollout

**Using LaunchDarkly or similar**:

```javascript
import { initLaunchDarkly } from './launch-darkly';

const ld = await initLaunchDarkly();
const useAegis = await ld.variation('use-aegis', false);

if (useAegis) {
  // AEGIS path
} else {
  // Legacy path
}
```

**Manual Percentage**:

```javascript
// 10% rollout
const useAegis = Math.random() < 0.1;

// User-based (consistent per user)
const useAegis = hashUserId(user.id) % 100 < 10;  // 10%
```

### Canary Deployment

**Target specific users/environments**:

```javascript
const aegisUsers = ['user-123', 'user-456'];  // Beta users
const useAegis = aegisUsers.includes(currentUser.id);

// Or by role
const useAegis = currentUser.role === 'admin';
```

---

## Common Patterns

### Pattern 1: Pre-Operation Validation

**Use Case**: Validate before expensive operation

```javascript
async function createStrategicDirective(data) {
  // Validate FIRST
  const enforcer = getAegisEnforcer();
  await enforcer.enforce('DOCTRINE', {
    actor_role: currentUser.role,
    target_table: 'strategic_directives_v2',
    operation_type: 'INSERT'
  });

  // If we get here, validation passed
  const sd = await db.insert('strategic_directives_v2', data);
  return sd;
}
```

### Pattern 2: Post-Operation Audit

**Use Case**: Log operation for audit without blocking

```javascript
async function executeCrewTask(task) {
  // Execute first
  const result = await runTask(task);

  // Audit after (non-blocking)
  const enforcer = getAegisEnforcer();
  await enforcer.validate('CREW_GOVERNANCE', {
    venture_id: task.venture_id,
    prd_id: task.prd_id,
    budget_consumed: result.cost
  }, {
    recordViolations: true  // Log to audit
  }).catch(err => {
    // Log but don't throw
    console.error('Post-operation audit violation:', err);
  });

  return result;
}
```

### Pattern 3: Multi-Stage Validation

**Use Case**: Validate multiple aspects

```javascript
async function approveImprovement(improvement) {
  const enforcer = getAegisEnforcer();

  // Stage 1: Protocol validation
  await enforcer.enforce('PROTOCOL', {
    risk_tier: improvement.risk_tier,
    auto_applicable: improvement.auto_applicable
  });

  // Stage 2: Four Oaths validation
  await enforcer.enforce('FOUR_OATHS', {
    input: improvement.input,
    reasoning: improvement.reasoning,
    output: improvement.output,
    confidence: improvement.confidence
  });

  // Both passed, proceed
  await applyImprovement(improvement);
}
```

### Pattern 4: Conditional Validation

**Use Case**: Validate only when needed

```javascript
async function modifyProtocol(change) {
  const enforcer = getAegisEnforcer();

  // Only validate if AUTO tier
  if (change.risk_tier === 'AUTO') {
    await enforcer.enforce('PROTOCOL', change);
  }

  // GOVERNED tier handled separately (human review flow)
  await applyChange(change);
}
```

### Pattern 5: Batch Validation

**Use Case**: Validate multiple operations

```javascript
async function batchOperations(operations) {
  const enforcer = getAegisEnforcer();
  const results = [];

  for (const op of operations) {
    const result = await enforcer.validate('PROTOCOL', op, {
      recordViolations: false  // Don't record during batch
    });

    results.push({
      operation: op,
      valid: result.passed,
      violations: result.violations
    });
  }

  // Filter to valid operations only
  const validOps = results.filter(r => r.valid).map(r => r.operation);

  // Execute valid operations
  return await executeOperations(validOps);
}
```

---

## Best Practices

### 1. Fail Fast

**✅ Do**: Validate before expensive operations

```javascript
// Good: Validate first
await enforcer.enforce('PROTOCOL', context);
await expensiveDatabaseOperation();
```

**❌ Don't**: Validate after the fact

```javascript
// Bad: Too late if it fails
await expensiveDatabaseOperation();
await enforcer.enforce('PROTOCOL', context);
```

### 2. Provide Context

**✅ Do**: Include rich context for debugging

```javascript
await enforcer.validate('PROTOCOL', {
  // Operation details
  risk_tier: 'AUTO',
  target_table: 'protocol_improvement_queue',
  target_operation: 'INSERT',

  // Actor details
  actor_role: currentUser.role,
  actor_id: currentUser.id,

  // Business context
  venture_id: ventureId,
  prd_id: prdId,

  // Full payload for audit
  payload: fullRequestData
});
```

**❌ Don't**: Minimal context

```javascript
// Bad: Hard to debug violations
await enforcer.validate('PROTOCOL', {
  risk_tier: 'AUTO'
});
```

### 3. Handle Violations Gracefully

**✅ Do**: User-friendly error messages

```javascript
try {
  await enforcer.enforce('PROTOCOL', context);
} catch (error) {
  if (error instanceof AegisViolationError) {
    // Show user-friendly message
    throw new UserError(
      'This operation violates governance rules. Please contact your administrator.',
      error.violations
    );
  }
  throw error;
}
```

**❌ Don't**: Expose internal errors

```javascript
// Bad: Confusing for users
await enforcer.enforce('PROTOCOL', context);
// Unhandled exception bubbles up
```

### 4. Use Appropriate Enforcement Actions

**BLOCK**: Critical safety rules
```javascript
// CONST-007: Max 3 AUTO changes per 24h
enforcement_action: 'BLOCK'
```

**WARN_AND_LOG**: Advisory rules
```javascript
// CONST-006: Complexity conservation
enforcement_action: 'WARN_AND_LOG'
```

**AUDIT_ONLY**: Observability
```javascript
// Track usage patterns
enforcement_action: 'AUDIT_ONLY'
```

### 5. Monitor Rule Effectiveness

**Regularly review stats**:

```bash
# Weekly review
node scripts/governance.js stats --period=7

# Check rule effectiveness
node scripts/governance.js list | \
  sort -k5 -n  # Sort by times_triggered
```

**Tune rules based on data**:
- High `times_triggered`, low `times_blocked`: Rule may be too lenient
- Low `times_triggered`: Rule may be unnecessary
- High false positive rate: Rule needs refinement

---

## Troubleshooting

### Issue: "Constitution not found"

**Error**: `Constitution PROTOCOL not found`

**Cause**: Database not migrated or constitution disabled

**Solution**:

```bash
# Check constitutions
node scripts/governance.js constitutions

# If missing, run migrations
psql $DATABASE_URL < database/migrations/20260124_aegis_governance_foundation.sql
```

### Issue: "Rule not triggering"

**Symptom**: Expecting violation, but validation passes

**Debug**:

```javascript
// Add logging
const result = await enforcer.validate('PROTOCOL', context, {
  recordViolations: false
});

console.log('Validation result:', {
  passed: result.passed,
  rulesChecked: result.rulesChecked,
  violations: result.violations,
  context: context
});
```

**Check**:
1. Is rule active? `is_active = true`
2. Is constitution enforced? `enforcement_mode = 'enforced'`
3. Does context match validation_config?

### Issue: Performance

**Symptom**: Validation is slow (>500ms)

**Solutions**:

1. **Cache enforcer instance**:

```javascript
// ✅ Good: Singleton
const enforcer = getAegisEnforcer();

// ❌ Bad: New instance every time
function validate() {
  const enforcer = getAegisEnforcer();  // Don't recreate
}
```

2. **Validate specific constitution**:

```javascript
// ✅ Fast: Specific constitution (9 rules)
await enforcer.validate('PROTOCOL', context);

// ❌ Slow: All constitutions (45 rules)
await enforcer.validateAll(context);
```

3. **Disable recording in high-volume paths**:

```javascript
await enforcer.validate('PROTOCOL', context, {
  recordViolations: false,  // Skip audit log write
  incrementStats: false     // Skip stats update
});
```

### Issue: Violation not recorded

**Symptom**: Validation fails but no entry in `aegis_violations` table

**Check**:

1. **recordViolations enabled?**

```javascript
// Ensure recordViolations: true
await enforcer.validate('PROTOCOL', context, {
  recordViolations: true  // Must be true
});
```

2. **RLS policies?**

```sql
-- Check if RLS is blocking inserts
SELECT * FROM pg_policies WHERE tablename = 'aegis_violations';
```

3. **Database permissions?**

```sql
-- Check user has INSERT permission
SELECT has_table_privilege('aegis_violations', 'INSERT');
```

---

## Related Documentation

- **[AEGIS Architecture Overview](../01_architecture/aegis-system-overview.md)** - System design and components
- **[AEGIS API Documentation](../02_api/aegis-endpoints.md)** - REST API endpoints
- **[AEGIS CLI Guide](../reference/aegis-cli-guide.md)** - CLI tool usage
- **[AEGIS Database Schema](../database/aegis-schema.md)** - Database schema reference

## Version History

- **v1.0.0** (2026-01-24) - Initial integration guide for SD-AEGIS-GOVERNANCE-001
  - Migration path documented
  - Adapter and direct integration patterns
  - Testing strategies
  - Feature flag rollout guide
  - Common patterns and best practices
  - Troubleshooting guide
