# Handoff System Guide

**SD-REFACTOR-HANDOFF-001: Handoff System Modularization**

This guide documents the LEO Protocol handoff system architecture, gate validation patterns, and executor framework.

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
        'GATE_SD_TRANSITION_READINESS',
        'TARGET_APPLICATION_VALIDATION',
        'BASELINE_DEBT_CHECK'
      ],
      'PLAN-TO-EXEC': [
        'PREREQUISITE_HANDOFF_CHECK',
        'GATE_ARCHITECTURE_VERIFICATION',
        'BMAD_PLAN_TO_EXEC',
        'GATE_CONTRACT_COMPLIANCE',
        'GATE_EXPLORATION_AUDIT',
        'GATE6_BRANCH_ENFORCEMENT'
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
| EHG | /mnt/c/_EHG/EHG/ | rickfelix/ehg.git |
| EHG_Engineer | /mnt/c/_EHG/EHG_Engineer/ | rickfelix/EHG_Engineer.git |

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

## Best Practices

### DO

- Use BaseExecutor for all new handoff types
- Define clear gate chains with weights
- Store all handoffs in sd_phase_handoffs
- Release claims after handoff completion
- Log gate results for debugging

### DON'T

- Don't bypass prerequisite validation
- Don't allow scores below the SD type threshold to pass (60-90%, typically 85%)
- Don't skip claim checking
- Don't create handoffs without gates
- Don't ignore blocking gate failures

---

## Related Documentation

- [Sub-Agent Patterns Guide](./sub-agent-patterns-guide.md) - Sub-agent integration
- [Governance Library Guide](./governance-library-guide.md) - Exception handling
- [Agent Patterns Guide](./agent-patterns-guide.md) - Agent architecture

---

*Generated for SD-REFACTOR-HANDOFF-001 | LEO Protocol v4.3.3*
