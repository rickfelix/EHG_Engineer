---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Agent Patterns Guide



## Table of Contents

- [Metadata](#metadata)
- [Quick Reference](#quick-reference)
- [1. Agent Modular Structure & Public API](#1-agent-modular-structure-public-api)
  - [Base Class Hierarchy](#base-class-hierarchy)
  - [Public API](#public-api)
- [2. FileScanner Usage & Behavior](#2-filescanner-usage-behavior)
  - [Purpose](#purpose)
  - [Default Extensions](#default-extensions)
  - [Usage in Agents](#usage-in-agents)
- [3. Circuit Breaker Pattern & Keys](#3-circuit-breaker-pattern-keys)
  - [Purpose](#purpose)
  - [Circuit Breaker Keys](#circuit-breaker-keys)
- [4. CacheManager Namespaces, TTL & Metrics](#4-cachemanager-namespaces-ttl-metrics)
  - [Cache Configuration](#cache-configuration)
  - [Usage](#usage)
  - [Metrics](#metrics)
- [5. Analyzer Strategy & Registry](#5-analyzer-strategy-registry)
  - [Analyzer Registry](#analyzer-registry)
  - [Analyzer Contract](#analyzer-contract)
  - [Registration Pattern](#registration-pattern)
- [6. Agent Lifecycle Hooks](#6-agent-lifecycle-hooks)
  - [Lifecycle Phases](#lifecycle-phases)
  - [Hook Implementation](#hook-implementation)
- [7. CI Documentation Checks](#7-ci-documentation-checks)
  - [Automated Validation](#automated-validation)
  - [Validation Rules](#validation-rules)
- [Best Practices](#best-practices)
  - [DO](#do)
  - [DON'T](#dont)
- [Related Documentation](#related-documentation)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, api, testing, security

**SD-REFACTOR-AGENTS-001: Agent Base Class & Pattern Extraction**

This guide documents the LEO Protocol agent architecture, base class patterns, and state machine integration.

## Quick Reference

| Component | Location | Purpose | LOC |
|-----------|----------|---------|-----|
| BaseSubAgent | lib/agents/base-sub-agent.js | Factory pattern, budget enforcement | ~630 |
| VentureCEORuntime | lib/agents/venture-ceo-runtime.js | Venture orchestration | ~800 |
| VentureStateMachine | lib/agents/venture-state-machine.js | State management | ~450 |
| SubAgentExecutor | lib/sub-agent-executor.js | Execution framework | ~1315 |

---

## 1. Agent Modular Structure & Public API

### Base Class Hierarchy

```
BaseSubAgent (lib/agents/base-sub-agent.js)
├── create() - Factory method with budget enforcement
├── execute() - Standard execution lifecycle
├── analyze() - Abstract method for subclasses
├── addFinding() - Standard finding addition
├── calculateScore() - Score calculation
└── generateStandardOutput() - Output formatting

VentureCEORuntime (lib/agents/venture-ceo-runtime.js)
├── createVenture() - Venture lifecycle start
├── executePhase() - Phase execution
├── transitionState() - State management
└── recordBudgetUsage() - Budget tracking

VentureStateMachine (lib/agents/venture-state-machine.js)
├── states - Defined states
├── transitions - Valid transitions
├── guards - Transition conditions
└── actions - Side effects
```

### Public API

```javascript
// BaseSubAgent.create() - Factory method
const agent = await BaseSubAgent.create('AgentName', '🤖', {
  ventureId: 'required-venture-uuid',
  agentId: 'optional-custom-id'
});

// BaseSubAgent.execute() - Run agent
const result = await agent.execute({
  sdId: 'SD-XXX',
  options: { /* custom options */ }
});

// Result structure
{
  agent: 'AgentName',
  score: 85,
  status: 'GOOD',
  findings: [/* findings */],
  findingsBySeverity: { /* grouped */ },
  metrics: { /* metrics */ },
  metadata: { /* timestamps, version */ },
  recommendations: [/* recs */]
}
```

---

## 2. FileScanner Usage & Behavior

### Purpose

FileScanner provides efficient file system traversal for agent analysis:

```javascript
// lib/utils/file-scanner.js
export async function getSourceFiles(basePath, extensions) {
  const files = [];

  async function scan(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip node_modules and hidden directories
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }

  await scan(basePath);
  return files;
}
```

### Default Extensions

```javascript
const DEFAULT_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
```

### Usage in Agents

```javascript
// In agent analyze() method
const files = await this.getSourceFiles('src', ['.tsx', '.jsx']);
for (const file of files) {
  const content = await fs.readFile(file, 'utf-8');
  // Analyze content
}
```

---

## 3. Circuit Breaker Pattern & Keys

### Purpose

Circuit breakers prevent cascading failures in agent execution:

```javascript
// lib/utils/circuit-breaker.js
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.state = 'CLOSED';  // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.lastFailure = null;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new CircuitOpenError('Circuit is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}
```

### Circuit Breaker Keys

```javascript
const CIRCUIT_BREAKERS = {
  supabase: new CircuitBreaker({ failureThreshold: 3, resetTimeout: 30000 }),
  openai: new CircuitBreaker({ failureThreshold: 2, resetTimeout: 60000 }),
  github: new CircuitBreaker({ failureThreshold: 5, resetTimeout: 120000 })
};
```

---

## 4. CacheManager Namespaces, TTL & Metrics

### Cache Configuration

```javascript
// lib/utils/cache-manager.js
const CACHE_CONFIG = {
  namespaces: {
    agent_instructions: { ttl: 3600000, maxSize: 100 },  // 1 hour
    file_content: { ttl: 300000, maxSize: 1000 },         // 5 minutes
    db_queries: { ttl: 60000, maxSize: 500 },             // 1 minute
    patterns: { ttl: 1800000, maxSize: 200 }              // 30 minutes
  }
};
```

### Usage

```javascript
const cache = new CacheManager('agent_instructions');

// Set with TTL
cache.set('DESIGN', instructions, { ttl: 3600000 });

// Get with fallback
const result = await cache.getOrSet('DESIGN', async () => {
  return await loadFromDatabase('DESIGN');
});

// Invalidate
cache.delete('DESIGN');
cache.clear(); // Clear namespace
```

### Metrics

```javascript
// Cache metrics exposed
{
  hits: 1234,
  misses: 56,
  hitRate: 0.956,
  evictions: 10,
  size: 85
}
```

---

## 5. Analyzer Strategy & Registry

### Analyzer Registry

```javascript
// lib/analyzers/registry.js
const ANALYZER_REGISTRY = {
  security: SecurityAnalyzer,
  performance: PerformanceAnalyzer,
  design: DesignAnalyzer,
  database: DatabaseAnalyzer,
  testing: TestingAnalyzer
};

export function getAnalyzer(type) {
  const Analyzer = ANALYZER_REGISTRY[type];
  if (!Analyzer) {
    throw new Error(`Unknown analyzer type: ${type}`);
  }
  return new Analyzer();
}
```

### Analyzer Contract

```javascript
// All analyzers implement this interface
interface Analyzer {
  name: string;
  analyze(context: AnalysisContext): Promise<AnalysisResult>;
  getFindings(): Finding[];
  calculateScore(): number;
}
```

### Registration Pattern

```javascript
// Register new analyzer
import { registerAnalyzer } from '../analyzers/registry.js';

class CustomAnalyzer {
  name = 'custom';

  async analyze(context) {
    // Custom analysis logic
  }
}

registerAnalyzer('custom', CustomAnalyzer);
```

---

## 6. Agent Lifecycle Hooks

### Lifecycle Phases

```
1. Instantiation (create)
   - Budget validation
   - Venture ID verification
   - Logging

2. Pre-execution (before execute)
   - Context setup
   - Cache warming

3. Execution (analyze)
   - Core analysis
   - Finding collection

4. Post-execution (after analyze)
   - Score calculation
   - Output formatting

5. Storage (store results)
   - Database persistence
   - PRD linkage

6. Cleanup
   - Cache cleanup
   - Resource release
```

### Hook Implementation

```javascript
class CustomAgent extends BaseSubAgent {
  async beforeExecute(context) {
    // Pre-execution setup
    await this.warmCache();
  }

  async analyze(context) {
    // Core analysis
  }

  async afterExecute(result) {
    // Post-execution cleanup
    await this.cleanup();
  }
}
```

---

## 7. CI Documentation Checks

### Automated Validation

```yaml
# .github/workflows/docs-check.yml
name: Documentation Check
on: [push, pull_request]
jobs:
  validate-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check headings
        run: npx markdownlint docs/**/*.md
      - name: Check internal links
        run: node scripts/check-doc-links.js
      - name: Validate code snippets
        run: node scripts/validate-doc-snippets.js
```

### Validation Rules

| Check | Description | Severity |
|-------|-------------|----------|
| Heading hierarchy | H1 -> H2 -> H3 order | Error |
| Internal links | All links resolve | Error |
| Code snippets | Syntax valid | Warning |
| TOC matches | Table of contents current | Warning |

---

## Best Practices

### DO

- Use `BaseSubAgent.create()` factory method
- Implement `analyze()` in subclasses
- Use circuit breakers for external calls
- Cache expensive operations
- Log lifecycle events

### DON'T

- Don't bypass budget validation
- Don't instantiate directly
- Don't ignore circuit breaker states
- Don't cache indefinitely
- Don't skip result storage

---

## Related Documentation

- [Sub-Agent Patterns Guide](agent-patterns-guide.md) - Sub-agent patterns
- [Governance Library Guide](./governance-library-guide.md) - Exception handling
- [Design Sub-Agent Guide](../leo/sub-agents/design-sub-agent-guide.md) - DESIGN patterns
- [Retro Sub-Agent Guide](../leo/sub-agents/retro-sub-agent-guide.md) - RETRO patterns

---

*Generated for SD-REFACTOR-AGENTS-001 | LEO Protocol v4.3.3*
