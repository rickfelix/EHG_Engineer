---
category: protocol
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [protocol, auto-generated]
---
# Design Sub-Agent Guide



## Table of Contents

- [Metadata](#metadata)
- [Quick Reference](#quick-reference)
- [1. Module Map for Design Sub-Agent](#1-module-map-for-design-sub-agent)
  - [Core Architecture](#core-architecture)
  - [DESIGN Sub-Agent Triggers](#design-sub-agent-triggers)
- [2. Config-Driven UI/UX Checklist](#2-config-driven-uiux-checklist)
  - [Database-Driven Validation](#database-driven-validation)
  - [Standard Validation Categories](#standard-validation-categories)
  - [Adding New Rules](#adding-new-rules)
- [3. Component Sizing Patterns (300-600 LOC)](#3-component-sizing-patterns-300-600-loc)
  - [Target Ranges](#target-ranges)
  - [Detection Logic](#detection-logic)
  - [Split Indicators](#split-indicators)
- [4. Canonical Entrypoint & Legacy Adapter](#4-canonical-entrypoint-legacy-adapter)
  - [Entrypoint Pattern](#entrypoint-pattern)
  - [Legacy Adapter](#legacy-adapter)
- [5. Validator Result Contract](#5-validator-result-contract)
  - [Standard Output Format](#standard-output-format)
  - [Verdict Determination](#verdict-determination)
- [6. Runbooks: design:lint & LOC Gates](#6-runbooks-designlint-loc-gates)
  - [design:lint Command](#designlint-command)
  - [LOC Gate Pre-Commit Hook](#loc-gate-pre-commit-hook)
- [Best Practices](#best-practices)
  - [DO](#do)
  - [DON'T](#dont)
- [Related Documentation](#related-documentation)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-20
- **Tags**: database, feature, guide, protocol

**SD-REFACTOR-DESIGN-001: Design Sub-Agent Modularization**

This guide documents the DESIGN sub-agent architecture, component sizing patterns, and UI/UX validation best practices.

## Quick Reference

| Component | Location | Purpose | LOC |
|-----------|----------|---------|-----|
| DESIGN Sub-Agent | lib/sub-agents/design.js | UI/UX analysis and validation | ~450 |
| Design Agent Base | lib/agents/design-agent.js | Base design agent class | ~320 |
| Component Analyzer | lib/design/component-analyzer.js | Component size detection | ~200 |
| Selector Integration | lib/context-aware-sub-agent-selector.js | DESIGN trigger keywords | ~540 |

---

## 1. Module Map for Design Sub-Agent

### Core Architecture

```
lib/sub-agents/design.js         # Main DESIGN sub-agent entry point
  ├── analyzeComponents()         # Component structure analysis
  ├── validateAccessibility()     # WCAG 2.1 AA compliance
  ├── checkComponentSizing()      # LOC target validation
  └── generateRecommendations()   # Improvement suggestions

lib/agents/design-agent.js        # Base class for design operations
  ├── DesignAgent class           # Extends BaseSubAgent
  ├── analyzeUIPatterns()         # Pattern detection
  └── validateDesignSystem()      # Design system compliance
```

### DESIGN Sub-Agent Triggers

The DESIGN sub-agent is triggered by these keywords in SD scope:

```javascript
// From lib/context-aware-sub-agent-selector.js
DESIGN_KEYWORDS: [
  'component', 'ui', 'ux', 'design', 'layout', 'styling',
  'accessibility', 'a11y', 'responsive', 'mobile', 'interface',
  'shadcn', 'tailwind', 'css', 'theme', 'dark mode'
]
```

---

## 2. Config-Driven UI/UX Checklist

### Database-Driven Validation

The DESIGN sub-agent uses checklists stored in the database for validation:

```sql
-- Table: design_validation_rules
CREATE TABLE design_validation_rules (
  id UUID PRIMARY KEY,
  rule_name TEXT NOT NULL,
  category TEXT NOT NULL,  -- 'accessibility', 'sizing', 'pattern', 'structure'
  severity TEXT NOT NULL,  -- 'critical', 'high', 'medium', 'low'
  check_function TEXT,     -- JS function reference
  enabled BOOLEAN DEFAULT true,
  metadata JSONB
);
```

### Standard Validation Categories

| Category | Description | Example Rules |
|----------|-------------|---------------|
| accessibility | WCAG 2.1 AA compliance | Color contrast, focus indicators |
| sizing | Component LOC validation | 300-600 LOC target |
| pattern | Design system adherence | Shadcn primitives usage |
| structure | File organization | Component/page separation |

### Adding New Rules

```javascript
// Example: Adding a new validation rule
const newRule = {
  rule_name: 'form-validation-pattern',
  category: 'pattern',
  severity: 'medium',
  check_function: 'validateFormPattern',
  metadata: {
    description: 'Forms should use React Hook Form with Zod',
    patterns: ['useForm', 'zodResolver']
  }
};

await supabase
  .from('design_validation_rules')
  .insert(newRule);
```

---

## 3. Component Sizing Patterns (300-600 LOC)

### Target Ranges

| Component Type | Target LOC | Max LOC | Notes |
|----------------|------------|---------|-------|
| Page | 150-300 | 400 | Should compose smaller components |
| Feature Component | 200-400 | 600 | Self-contained feature |
| UI Component | 50-150 | 200 | Reusable UI primitive |
| Hook | 50-100 | 150 | Single responsibility |
| Utility | 20-50 | 100 | Pure functions |

### Detection Logic

```javascript
// Component size analysis
async function analyzeComponentSize(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n').length;

  const findings = [];

  if (lines > 600) {
    findings.push({
      type: 'COMPONENT_TOO_LARGE',
      severity: 'high',
      file: filePath,
      line: 1,
      confidence: 0.9,
      description: `Component exceeds 600 LOC target (${lines} lines)`,
      recommendation: 'Split into smaller, focused components'
    });
  } else if (lines > 400) {
    findings.push({
      type: 'COMPONENT_APPROACHING_LIMIT',
      severity: 'medium',
      file: filePath,
      line: 1,
      confidence: 0.8,
      description: `Component approaching 600 LOC limit (${lines} lines)`,
      recommendation: 'Consider splitting before adding more features'
    });
  }

  return findings;
}
```

### Split Indicators

When to split a component:
- Multiple unrelated state slices
- Mixed concerns (data fetching + presentation)
- Repeated conditional rendering patterns
- Component handles multiple user flows

---

## 4. Canonical Entrypoint & Legacy Adapter

### Entrypoint Pattern

```javascript
// lib/sub-agents/design.js - Canonical entrypoint
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n🎨 ${subAgent.name} analyzing SD: ${options.sdKey || sdId}`);

  const agent = await BaseSubAgent.create('DESIGN', '🎨', {
    ventureId: options.ventureId || sdId,
    agentId: `DESIGN-${Date.now()}`
  });

  try {
    // Core analysis pipeline
    const componentAnalysis = await analyzeComponents(options);
    const accessibilityCheck = await validateAccessibility(options);
    const sizingValidation = await checkComponentSizing(options);

    // Aggregate findings
    for (const finding of [...componentAnalysis, ...accessibilityCheck, ...sizingValidation]) {
      agent.addFinding(finding);
    }

    const score = agent.calculateScore();
    return agent.generateStandardOutput(score);

  } catch (error) {
    return agent.handleError(error);
  }
}
```

### Legacy Adapter

For backward compatibility with older scripts:

```javascript
// Legacy interface (deprecated)
export async function runDesignAnalysis(sdId, options) {
  console.warn('DEPRECATED: Use execute() instead of runDesignAnalysis()');
  return execute(sdId, { name: 'DESIGN', code: 'DESIGN' }, options);
}

// Legacy export compatibility
export { execute as analyze };
export { execute as run };
```

---

## 5. Validator Result Contract

### Standard Output Format

All DESIGN validations return:

```javascript
{
  agent: 'DESIGN',
  score: 85,
  status: 'GOOD',  // EXCELLENT|GOOD|ACCEPTABLE|POOR|CRITICAL
  summary: 'Minor accessibility issues detected',
  findings: [{
    id: 'abc123',
    agent: 'DESIGN',
    type: 'ACCESSIBILITY_ISSUE',
    severity: 'medium',
    confidence: 0.85,
    location: {
      file: 'src/components/Button.tsx',
      line: 42,
      column: 5,
      snippet: '<button onClick={...}>'
    },
    description: 'Button missing aria-label',
    recommendation: 'Add aria-label for screen readers',
    metadata: {
      wcag: '1.1.1',
      technique: 'ARIA6'
    }
  }],
  findingsBySeverity: {
    critical: [],
    high: [],
    medium: [/* findings */],
    low: [],
    info: []
  },
  metrics: {
    components_analyzed: 42,
    accessibility_score: 88,
    sizing_compliance: 95
  },
  recommendations: [{
    title: 'Improve accessibility',
    description: 'Add aria-labels to interactive elements',
    impact: 'MEDIUM',
    effort: 'SMALL'
  }]
}
```

### Verdict Determination

```javascript
function determineVerdict(score, findings) {
  const hasCritical = findings.some(f => f.severity === 'critical');
  const hasHigh = findings.some(f => f.severity === 'high');

  if (hasCritical) return 'FAIL';
  if (score >= 85 && !hasHigh) return 'PASS';
  if (score >= 70) return 'CONDITIONAL_PASS';
  return 'FAIL';
}
```

---

## 6. Runbooks: design:lint & LOC Gates

### design:lint Command

```bash
# Run design linting on entire codebase
npm run design:lint

# Run on specific directory
npm run design:lint -- --path src/components

# Run with strict mode (fail on warnings)
npm run design:lint -- --strict
```

Implementation:

```javascript
// scripts/design-lint.js
#!/usr/bin/env node

import { executeSubAgent } from '../lib/sub-agent-executor.js';

async function runDesignLint() {
  const options = parseArgs(process.argv.slice(2));

  const result = await executeSubAgent('DESIGN', 'design-lint-run', {
    targetPath: options.path || 'src',
    strict: options.strict || false
  });

  if (result.verdict !== 'PASS') {
    console.error('Design lint failed');
    process.exit(1);
  }

  console.log('Design lint passed');
}

runDesignLint();
```

### LOC Gate Pre-Commit Hook

```bash
# .husky/pre-commit
npm run design:loc-check
```

```javascript
// scripts/loc-check.js
#!/usr/bin/env node

import { glob } from 'glob';
import fs from 'fs/promises';

const MAX_LOC = 600;
const WARNING_LOC = 400;

async function checkLOC() {
  const files = await glob('src/**/*.{tsx,jsx,ts,js}');
  const violations = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8');
    const lines = content.split('\n').length;

    if (lines > MAX_LOC) {
      violations.push({ file, lines, type: 'error' });
    } else if (lines > WARNING_LOC) {
      violations.push({ file, lines, type: 'warning' });
    }
  }

  if (violations.some(v => v.type === 'error')) {
    console.error('LOC check failed:');
    violations.forEach(v => console.error(`  ${v.file}: ${v.lines} lines`));
    process.exit(1);
  }

  if (violations.length > 0) {
    console.warn('LOC warnings:');
    violations.forEach(v => console.warn(`  ${v.file}: ${v.lines} lines`));
  }

  console.log('LOC check passed');
}

checkLOC();
```

---

## Best Practices

### DO

- Use Shadcn/Tailwind primitives for consistent styling
- Keep components focused on single responsibility
- Add aria-labels to all interactive elements
- Use semantic HTML elements
- Test with keyboard navigation

### DON'T

- Don't exceed 600 LOC per component
- Don't use inline styles (use Tailwind classes)
- Don't ignore accessibility warnings
- Don't mix data fetching with presentation
- Don't create deeply nested component hierarchies

---

## Related Documentation

- [Sub-Agent Patterns Guide](../../reference/agent-patterns-guide.md) - Base sub-agent patterns
- [Governance Library Guide](../../reference/governance-library-guide.md) - Exception handling
- Utility Library Guide - Shared utilities

---

*Generated for SD-REFACTOR-DESIGN-001 | LEO Protocol v4.3.3*
