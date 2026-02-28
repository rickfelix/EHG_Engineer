---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Governance Library Guide


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, unit, migration, feature

**SD-REFACTOR-GOVERNANCE-001: Governance Library Unification**

This document provides the canonical reference for the governance subsystem in the EHG_Engineer codebase.

## Quick Reference

| Module | Location | Purpose | LOC |
|--------|----------|---------|-----|
| hard-halt-protocol | lib/governance/hard-halt-protocol.js | Emergency halt system | 280 |
| four-oaths-enforcement | lib/governance/four-oaths-enforcement.js | Oath validation | 320 |
| crew-governance-wrapper | lib/governance/crew-governance-wrapper.js | Agent governance | 250 |
| manifesto-mode | lib/governance/manifesto-mode.js | Manifesto enforcement | 180 |
| budget-guardrails | lib/governance/budget-guardrails.js | Budget controls | 200 |

## US-001: Exception Hierarchy

### Current State
Exception classes are defined inline in multiple files:
- `HardHaltException` in hard-halt-protocol.js
- `OathViolationException` in four-oaths-enforcement.js
- `BudgetExhaustedException` in venture-ceo-runtime.js AND base-sub-agent.js (DUPLICATE)
- `GovernanceException` in crew-governance-wrapper.js

### Target Architecture
```
lib/exceptions/
├── index.js                    # Barrel export
├── budget-exceptions.js        # Budget-related exceptions
├── governance-exceptions.js    # Governance/halt exceptions
├── validation-exceptions.js    # Validation exceptions
└── state-exceptions.js         # State machine exceptions
```

### Migration Pattern
```javascript
// BEFORE (inline definition)
class BudgetExhaustedException extends Error {
  constructor(message, context) {
    super(message);
    this.context = context;
  }
}

// AFTER (centralized import)
import { BudgetExhaustedException } from '../exceptions/index.js';
```

## US-002: GovernanceModule Base Class

### Purpose
Provides common functionality for all governance modules.

### Interface
```javascript
class GovernanceModule {
  constructor(config) {
    this.config = config;
    this.logger = createLogger(this.constructor.name);
  }

  async initialize() { /* Lifecycle hook */ }
  async shutdown() { /* Cleanup hook */ }

  log(level, message, context) {
    this.logger[level](message, context);
  }
}
```

### Usage
```javascript
import { GovernanceModule } from '../lib/governance/base.js';

class HardHaltProtocol extends GovernanceModule {
  async initialize() {
    await super.initialize();
    // Custom initialization
  }
}
```

## US-003: GovernanceConfig

### Purpose
Centralize environment configuration for governance modules.

### Configuration Sources
1. Environment variables (highest priority)
2. Database configuration (sd_configuration table)
3. Default values (lowest priority)

### Key Configuration
```javascript
const GovernanceConfig = {
  // Halt Protocol
  HALT_THRESHOLD: process.env.HALT_THRESHOLD || 3,
  HALT_COOLDOWN_MS: process.env.HALT_COOLDOWN_MS || 60000,

  // Budget Controls
  MAX_BUDGET_OVERRUN_PERCENT: 10,
  BUDGET_WARNING_THRESHOLD: 80,

  // Oaths
  OATH_VALIDATION_STRICT: true,
  OATH_BYPASS_ALLOWED: false
};
```

## US-004: GovernanceRepository

### Purpose
Supabase data access layer for governance data.

### Methods
```javascript
class GovernanceRepository {
  async getHaltStatus(sdId) { }
  async recordHalt(sdId, reason, context) { }
  async getOathViolations(sdId) { }
  async recordOathViolation(sdId, oathId, details) { }
  async getBudgetStatus(sdId) { }
  async updateBudgetUsage(sdId, amount, category) { }
}
```

### Usage Pattern
```javascript
const repo = new GovernanceRepository(supabase);
const haltStatus = await repo.getHaltStatus('SD-FEATURE-001');
```

## US-005: Structured Logging

### Logger Factory
```javascript
import { createLogger } from '../lib/utils/logger.js';

const logger = createLogger('HardHaltProtocol');
logger.info('Halt triggered', { sdId, reason });
logger.error('Halt failed', { error: err.message });
```

### Log Levels
- `debug` - Development only
- `info` - Normal operation
- `warn` - Non-critical issues
- `error` - Errors requiring attention
- `fatal` - System-stopping errors

## US-006: Backward Compatibility

### Adapter Pattern
```javascript
// Legacy interface maintained
export function legacyHaltCheck(sdId) {
  const protocol = new HardHaltProtocol(config);
  return protocol.checkHaltStatus(sdId);
}

// New interface
export const HardHaltProtocol = GovernanceModernProtocol;
```

### Migration Strategy
1. Create new centralized modules
2. Export legacy functions that delegate to new implementation
3. Update callers incrementally
4. Remove legacy exports after full migration

## Consolidation Opportunities

### Priority 1: Exception Deduplication
- **Issue**: `BudgetExhaustedException` defined in 2 locations
- **Files**: venture-ceo-runtime.js, base-sub-agent.js
- **Action**: Extract to lib/exceptions/budget-exceptions.js

### Priority 2: Configuration Centralization
- **Issue**: Environment variables read in multiple places
- **Action**: Create GovernanceConfig singleton

### Priority 3: Repository Pattern
- **Issue**: Direct Supabase calls scattered across modules
- **Action**: Create GovernanceRepository for data access

---

*Generated by SD-REFACTOR-GOVERNANCE-001*
*Last Updated: 2025-12-27*
