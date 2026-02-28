---
category: api
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [api, auto-generated]
---
# LEO Protocol Enhancement Specification

## Table of Contents

- [Claude Code 2.1.0 Integration](#claude-code-210-integration)
- [1. Executive Summary](#1-executive-summary)
  - [Key Claude Code 2.1.0 Features Leveraged](#key-claude-code-210-features-leveraged)
- [2. Agreed Enhancements](#2-agreed-enhancements)
  - [2.1 Context Fork (Selective Use)](#21-context-fork-selective-use)
  - [2.2 Hooks in Agent Frontmatter](#22-hooks-in-agent-frontmatter)
  - [2.3 Once:True Hooks for Session Initialization](#23-oncetrue-hooks-for-session-initialization)
  - [2.4 Hot-Reload Migration (Agents to Skills)](#24-hot-reload-migration-agents-to-skills)
  - [2.5 Wildcard Bash Permissions](#25-wildcard-bash-permissions)
  - [2.6 Improved Subagent Resilience](#26-improved-subagent-resilience)
  - [2.7 YAML-Style Frontmatter](#27-yaml-style-frontmatter)
  - [2.8 Phase Transition Enforcement via Hooks](#28-phase-transition-enforcement-via-hooks)
  - [2.9 /escalate Enhancement with Agent Field](#29-escalate-enhancement-with-agent-field)
  - [2.10 /leo-continuous Skill](#210-leo-continuous-skill)
- [3. Dropped Items](#3-dropped-items)
- [4. Hook Catalog](#4-hook-catalog)
  - [4.1 Universal Hooks (All Agents)](#41-universal-hooks-all-agents)
  - [4.2 Agent-Specific Hooks](#42-agent-specific-hooks)
  - [4.3 Phase Transition Hooks](#43-phase-transition-hooks)
  - [4.4 Anti-Pattern Detection Hooks](#44-anti-pattern-detection-hooks)
- [5. Handoff-Based Phase Detection](#5-handoff-based-phase-detection)
  - [5.1 Problem Statement](#51-problem-statement)
  - [5.2 Handoff Types (Database Constraint)](#52-handoff-types-database-constraint)
  - [5.3 Phase Detection Logic](#53-phase-detection-logic)
  - [5.4 Implementation](#54-implementation)
  - [5.5 Track-Specific Context](#55-track-specific-context)
- [6. Baseline-Aware Continuous Execution System](#6-baseline-aware-continuous-execution-system)
  - [6.1 System Overview](#61-system-overview)
  - [6.2 Database Tables Used](#62-database-tables-used)
  - [6.3 Hook Chain Architecture](#63-hook-chain-architecture)
  - [6.4 Baseline Test State Capture](#64-baseline-test-state-capture)
  - [6.5 Session Recovery System](#65-session-recovery-system)
  - [6.6 Leo Continuous Skill](#66-leo-continuous-skill)
- [Operating Rules](#operating-rules)
- [Escalation Protocol (Auto-Triggered)](#escalation-protocol-auto-triggered)
- [Checkpoints](#checkpoints)
- [Recovery](#recovery)
- [Continue Until](#continue-until)
- [Commands](#commands)
  - [6.7 Issue Auto-Detection Script](#67-issue-auto-detection-script)
  - [6.8 Health Metrics Update](#68-health-metrics-update)
- [7. Agent to Skills Migration](#7-agent-to-skills-migration)
  - [7.1 Current State](#71-current-state)
  - [7.2 Migration Strategy: Dual-Path Support](#72-migration-strategy-dual-path-support)
  - [7.3 Migration Order](#73-migration-order)
  - [7.4 Agent Frontmatter Updates](#74-agent-frontmatter-updates)
- [8. Implementation Roadmap](#8-implementation-roadmap)
  - [Phase 1: Foundation (Week 1)](#phase-1-foundation-week-1)
  - [Phase 2: Hook Infrastructure (Week 2)](#phase-2-hook-infrastructure-week-2)
  - [Phase 3: Baseline Integration (Week 3)](#phase-3-baseline-integration-week-3)
  - [Phase 4: Agent Migration (Week 4)](#phase-4-agent-migration-week-4)
  - [Phase 5: Validation & Cleanup (Week 5)](#phase-5-validation-cleanup-week-5)
- [9. Script Specifications](#9-script-specifications)
  - [9.1 Directory Structure](#91-directory-structure)
  - [9.2 Environment Variables](#92-environment-variables)
  - [9.3 Script Template](#93-script-template)
- [Appendix A: Complete Hook Reference](#appendix-a-complete-hook-reference)
  - [A.1 PreToolUse Hooks](#a1-pretooluse-hooks)
  - [A.2 PostToolUse Hooks](#a2-posttooluse-hooks)
  - [A.3 Stop Hooks](#a3-stop-hooks)
- [Appendix B: Approval Checklist](#appendix-b-approval-checklist)

## Claude Code 2.1.0 Integration

**Version**: 1.0.0
**Status**: DRAFT - Pending Approval
**Created**: 2026-01-08
**Author**: LEO Protocol Team

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Agreed Enhancements](#2-agreed-enhancements)
3. [Dropped Items](#3-dropped-items)
4. [Hook Catalog](#4-hook-catalog)
5. [Handoff-Based Phase Detection](#5-handoff-based-phase-detection)
6. [Baseline-Aware Continuous Execution System](#6-baseline-aware-continuous-execution-system)
7. [Agent to Skills Migration](#7-agent-to-skills-migration)
8. [Implementation Roadmap](#8-implementation-roadmap)
9. [Script Specifications](#9-script-specifications)

---

## 1. Executive Summary

This specification documents the integration of Claude Code 2.1.0 features into the LEO Protocol. The primary goals are:

1. **Deterministic Phase Detection** - Replace trigger keywords with handoff-based detection
2. **Automatic Context Management** - Load only relevant documents per phase and track
3. **Baseline-Aware Execution** - Integrate test baselines, health tracking, and crash recovery
4. **Hook-Based Automation** - Eliminate manual steps through PreToolUse/PostToolUse/Stop hooks
5. **Hot-Reload Capability** - Enable agent updates without session restart

### Key Claude Code 2.1.0 Features Leveraged

| Feature | Application |
|---------|-------------|
| `context: fork` | Isolated sub-agent execution (selective use) |
| `hooks` in frontmatter | Automated pre/post validation and logging |
| `once: true` hooks | Session initialization (one-time setup) |
| Automatic skill hot-reload | Agent updates without restart |
| `agent` field in skills | Explicit skill-to-agent binding |
| Wildcard Bash permissions | Pre-approved LEO script execution |
| Improved subagent resilience | Better error recovery |
| YAML-style `allowed-tools` | Cleaner frontmatter |

---

## 2. Agreed Enhancements

### 2.1 Context Fork (Selective Use)

**Decision**: Use `context: fork` ONLY for agents that don't need shared context.

**Agents that SHOULD fork** (isolated work):
- `retro-agent` - Generates retrospectives independently
- `docmon-agent` - Documentation monitoring
- `performance-agent` - Performance analysis

**Agents that SHOULD NOT fork** (need shared context):
- `database-agent` - Works with security-agent on RLS
- `security-agent` - Works with database-agent
- `testing-agent` - Needs implementation context
- `validation-agent` - Needs full SD context

### 2.2 Hooks in Agent Frontmatter

**Decision**: Implement hooks for all agents with the following patterns.

**Universal Hooks (All Agents)**:
```yaml
hooks:
  PreToolUse:
    - match: "*"
      once: true
      run: "node scripts/hooks/model-tracking.js --agent $AGENT_NAME"
      message: "Logging model usage"
    - match: "*"
      once: true
      run: "node scripts/hooks/search-prior-issues.js --category $AGENT_CATEGORY"
      message: "Checking known patterns"
```

### 2.3 Once:True Hooks for Session Initialization

**Decision**: Use for one-time session setup.

**Implementation**:
```yaml
hooks:
  PreToolUse:
    - match: "*"
      once: true
      run: "node scripts/hooks/session-init.js"
      message: "Initializing LEO session"
```

### 2.4 Hot-Reload Migration (Agents to Skills)

**Decision**: Implement with dual-path support to avoid breaking changes.

See [Section 7: Agent to Skills Migration](#7-agent-to-skills-migration).

### 2.5 Wildcard Bash Permissions

**Decision**: Add wildcard permissions for LEO scripts.

**Recommended settings.json additions**:
```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Bash(node scripts/*.js *)",
      "Bash(node scripts/hooks/*.js *)",
      "Bash(git checkout -b *)",
      "Bash(gh pr create *)"
    ]
  }
}
```

### 2.6 Improved Subagent Resilience

**Decision**: Leverage automatic behavior - no code changes needed.

Claude Code 2.1.0 automatically allows subagents to try alternative approaches after permission denial.

### 2.7 YAML-Style Frontmatter

**Decision**: Update agent definitions to use cleaner YAML lists.

**Before**:
```yaml
tools: Bash, Read, Write
```

**After**:
```yaml
tools:
  - Bash
  - Read
  - Write
  - Task(database-agent)
```

### 2.8 Phase Transition Enforcement via Hooks

**Decision**: Load ONLY relevant documents per phase.

See [Section 5: Handoff-Based Phase Detection](#5-handoff-based-phase-detection).

### 2.9 /escalate Enhancement with Agent Field

**Decision**: Add `agent: Explore` to escalate skill.

**Updated frontmatter**:
```yaml
---
description: Progressive Failure Escalation with 5-Whys
argument-hint: [describe the failure]
context: fork
agent: Explore
hooks:
  Stop:
    - run: "node scripts/hooks/log-escalation-result.js --sd-id $SD_ID"
---
```

### 2.10 /leo-continuous Skill

**Decision**: Create native skill to replace copy-paste prompt.

**New file**: `.claude/skills/leo-continuous.md`

See [Section 6.6: Leo Continuous Skill](#66-leo-continuous-skill).

---

## 3. Dropped Items

The following items were evaluated but NOT included:

| Item | Reason |
|------|--------|
| Skills progress display | Not needed - user doesn't require visibility |
| Token visibility during continuous mode | Not needed |
| Contextual agent disabling | Low value vs complexity |
| Converting leo:prompt to skill with fork | User OK with copy-paste |
| /leo-test command | Not actually used |

---

## 4. Hook Catalog

### 4.1 Universal Hooks (All Agents)

| Hook | Type | Trigger | Script | Purpose |
|------|------|---------|--------|---------|
| Model Tracking | PreToolUse (once) | `*` | `model-tracking.js` | Eliminates manual "FIRST STEP" |
| Issue Pattern Query | PreToolUse (once) | `*` | `search-prior-issues.js` | Proactive learning |
| Session Context | PreToolUse (once) | `*` | `session-init.js` | Load SD context at start |

### 4.2 Agent-Specific Hooks

#### database-agent
```yaml
hooks:
  PreToolUse:
    - match: "*"
      once: true
      run: "node scripts/hooks/model-tracking.js --agent DATABASE"
    - match: "*"
      once: true
      run: "node scripts/hooks/search-prior-issues.js --category database"
  PostToolUse:
    - match: "Bash"
      run: "node scripts/hooks/detect-db-errors.js --last-output"
      message: "Checking for database errors"
  Stop:
    - run: "node scripts/hooks/log-subagent-completion.js --code DATABASE"
```

#### security-agent
```yaml
hooks:
  PreToolUse:
    - match: "*"
      once: true
      run: "node scripts/hooks/model-tracking.js --agent SECURITY"
    - match: "*"
      once: true
      run: "node scripts/hooks/search-prior-issues.js --category security"
  PostToolUse:
    - match: "Bash"
      run: "node scripts/hooks/detect-security-issues.js"
  Stop:
    - run: "node scripts/hooks/generate-security-assessment.js"
```

#### validation-agent
```yaml
hooks:
  PreToolUse:
    - match: "Bash(node scripts/handoff.js execute*)"
      run: "node scripts/hooks/validate-gates.js --sd-id $SD_ID"
      message: "Validating gates before handoff"
  Stop:
    - run: "node scripts/hooks/log-validation-summary.js"
```

#### retro-agent
```yaml
context: fork  # Isolated execution
hooks:
  PostToolUse:
    - match: "Bash"
      run: "node scripts/hooks/check-retro-quality.js"
  Stop:
    - run: "node scripts/hooks/warn-if-process-improvement-missing.js"
```

#### testing-agent
```yaml
hooks:
  PreToolUse:
    - match: "*"
      once: true
      run: "node scripts/hooks/capture-baseline-test-state.js --sd-id $SD_ID"
      message: "Capturing baseline test state"
  PostToolUse:
    - match: "Bash(npm run test*)"
      run: "node scripts/hooks/capture-test-results.js"
  Stop:
    - run: "node scripts/hooks/compare-test-baseline.js"
```

#### docmon-agent
```yaml
context: fork  # Isolated execution
hooks:
  PostToolUse:
    - match: "Write(*.md)"
      run: "node scripts/hooks/flag-markdown-creation.js"
      message: "Warning: Markdown file creation detected"
```

#### design-agent
```yaml
hooks:
  PreToolUse:
    - match: "*"
      once: true
      run: "node scripts/hooks/search-prior-issues.js --category design"
  Stop:
    - run: "node scripts/hooks/log-subagent-completion.js --code DESIGN"
```

### 4.3 Phase Transition Hooks

| Transition | Hook | Script |
|------------|------|--------|
| Any handoff | PostToolUse | `load-phase-context.js` |
| LEAD-TO-PLAN | PostToolUse | `load-plan-context.js` |
| PLAN-TO-EXEC | PostToolUse | `load-exec-context.js` |
| EXEC-TO-PLAN | PostToolUse | `load-plan-verify-context.js` |
| PLAN-TO-LEAD | PostToolUse | `load-lead-final-context.js` |

### 4.4 Anti-Pattern Detection Hooks

| Pattern | Trigger | Detection | Action |
|---------|---------|-----------|--------|
| Markdown creation | `Write(*.md)` | File path | Warn: "Use database" |
| Direct SQL bypass | `Bash` with `SERVICE_ROLE_KEY` | Content | Block: "Security violation" |
| Skipping tests | `Bash(git commit*)` | Last test run | Warn: "Run tests first" |

---

## 5. Handoff-Based Phase Detection

### 5.1 Problem Statement

Trigger keywords are unreliable for phase detection. The handoff system provides deterministic phase information.

### 5.2 Handoff Types (Database Constraint)

```sql
CHECK (handoff_type IN (
  'LEAD-TO-PLAN',    -- Entering PLAN phase
  'PLAN-TO-EXEC',    -- Entering EXEC phase
  'EXEC-TO-PLAN',    -- Entering PLAN (verification) phase
  'PLAN-TO-LEAD'     -- Entering LEAD (final approval) phase
))
```

### 5.3 Phase Detection Logic

| Handoff Executed | Next Phase | Document to Load |
|------------------|------------|------------------|
| `LEAD-TO-PLAN` | PLAN | CLAUDE_PLAN.md (PRD creation section) |
| `PLAN-TO-EXEC` | EXEC | CLAUDE_EXEC.md (implementation section) |
| `EXEC-TO-PLAN` | PLAN (verify) | CLAUDE_PLAN.md (verification section) |
| `PLAN-TO-LEAD` | LEAD (final) | CLAUDE_LEAD.md (approval section) |

### 5.4 Implementation

**Hook Definition**:
```yaml
hooks:
  PostToolUse:
    - match: "Bash(node scripts/handoff.js execute*)"
      run: "node scripts/hooks/load-phase-context.js --from-last-handoff"
      message: "Loading phase-specific context"
```

**Script**: `scripts/hooks/load-phase-context.js`

```javascript
#!/usr/bin/env node
/**
 * Load phase-specific context based on last handoff
 *
 * Queries sd_phase_handoffs to determine current phase,
 * then outputs ONLY the relevant section of CLAUDE_*.md
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Phase to document mapping
const PHASE_DOCS = {
  'PLAN': {
    file: 'CLAUDE_PLAN.md',
    sections: {
      'LEAD-TO-PLAN': ['PRD Creation', 'Story Writing', 'Risk Assessment'],
      'EXEC-TO-PLAN': ['Verification', 'Gate Validation', 'Quality Assessment']
    }
  },
  'EXEC': {
    file: 'CLAUDE_EXEC.md',
    sections: ['Implementation', 'Testing', 'Code Quality']
  },
  'LEAD': {
    file: 'CLAUDE_LEAD.md',
    sections: ['Final Approval', 'Completion Checklist']
  }
};

async function main() {
  const sdId = process.env.SD_ID || process.argv[2];

  if (!sdId) {
    console.log('No SD_ID provided, skipping context load');
    return;
  }

  // Get most recent accepted handoff
  const { data: handoff } = await supabase
    .from('sd_phase_handoffs')
    .select('to_phase, handoff_type')
    .eq('sd_id', sdId)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!handoff) {
    console.log('No accepted handoff found, defaulting to LEAD context');
    return;
  }

  const phase = handoff.to_phase;
  const handoffType = handoff.handoff_type;
  const docConfig = PHASE_DOCS[phase];

  if (!docConfig) {
    console.log(`Unknown phase: ${phase}`);
    return;
  }

  // Determine which sections to load
  let sectionsToLoad;
  if (typeof docConfig.sections === 'object' && !Array.isArray(docConfig.sections)) {
    // Phase has sub-variants based on handoff type
    sectionsToLoad = docConfig.sections[handoffType] || Object.values(docConfig.sections).flat();
  } else {
    sectionsToLoad = docConfig.sections;
  }

  console.log(`Phase: ${phase} (from ${handoffType})`);
  console.log(`Loading sections: ${sectionsToLoad.join(', ')}`);
  console.log(`Document: ${docConfig.file}`);

  // In practice, this would extract specific sections from the markdown file
  // and output them for Claude to read
}

main().catch(console.error);
```

### 5.5 Track-Specific Context

In addition to phase context, load track-specific patterns:

| Track | Additional Context Files |
|-------|-------------------------|
| A (Infrastructure) | `docs/reference/database-agent-patterns.md`, `docs/reference/migration-safety.md` |
| B (Features) | `docs/reference/component-architecture.md`, `docs/reference/state-management.md` |
| C (Quality) | `docs/reference/e2e-patterns.md`, `docs/reference/test-fixtures.md` |

---

## 6. Baseline-Aware Continuous Execution System

### 6.1 System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    BASELINE-AWARE EXECUTION                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   BASELINE   │    │   HANDOFFS   │    │   ACTUALS    │       │
│  │   (Plan)     │───▶│   (Events)   │───▶│   (Runtime)  │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   │                   │                │
│         ▼                   ▼                   ▼                │
│  ┌──────────────────────────────────────────────────────┐       │
│  │                    HOOK SYSTEM                        │       │
│  │  PreToolUse (once) │ PostToolUse │ Stop              │       │
│  └──────────────────────────────────────────────────────┘       │
│         │                   │                   │                │
│         ▼                   ▼                   ▼                │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  INIT STATE  │    │  CHECKPOINTS │    │   SUMMARY    │       │
│  │  - Test base │    │  - Phase     │    │  - Results   │       │
│  │  - Context   │    │  - Health    │    │  - Issues    │       │
│  │  - Recovery  │    │  - Issues    │    │  - Actuals   │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Database Tables Used

| Table | Purpose |
|-------|---------|
| `sd_execution_baselines` | Execution plan (sequence, tracks) |
| `sd_baseline_items` | Individual SD entries with is_ready flag |
| `sd_baseline_rationale` | Documented reasoning for sequence |
| `sd_execution_actuals` | Runtime tracking vs plan |
| `sd_baseline_issues` | Technical debt registry |
| `sd_phase_handoffs` | Phase transitions |
| `continuous_execution_log` | Audit trail |
| `claude_sessions` | Session state for recovery |

### 6.3 Hook Chain Architecture

```
Session Start
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ PreToolUse (once: true) - INITIALIZATION                     │
│                                                              │
│  1. recover-session-state.js                                 │
│     └─ Check claude_sessions for crash recovery              │
│     └─ Load last checkpoint from continuous_execution_log    │
│                                                              │
│  2. capture-baseline-test-state.js                           │
│     └─ Run tests, capture passing/failing counts             │
│     └─ Store in sd_execution_actuals.metadata.test_baseline  │
│                                                              │
│  3. load-context-from-baseline.js                            │
│     └─ Query sd_baseline_items for track                     │
│     └─ Query sd_phase_handoffs for phase                     │
│     └─ Output track + phase specific context                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ PostToolUse - ON HANDOFF EXECUTION                           │
│ Trigger: Bash(node scripts/handoff.js execute*)              │
│                                                              │
│  1. auto-checkpoint.js                                       │
│     └─ Insert to continuous_execution_log                    │
│     └─ Update claude_sessions heartbeat                      │
│                                                              │
│  2. load-phase-context.js                                    │
│     └─ Query sd_phase_handoffs.to_phase                      │
│     └─ Load ONLY relevant CLAUDE_*.md section                │
│                                                              │
│  3. update-baseline-health.js                                │
│     └─ Update sd_execution_actuals.health_metrics            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ PostToolUse - ON ANY BASH COMMAND                            │
│ Trigger: Bash                                                │
│                                                              │
│  1. detect-and-log-issues.js                                 │
│     └─ Parse output for error patterns                       │
│     └─ Check hash_signature for duplicates                   │
│     └─ Insert/update sd_baseline_issues                      │
│                                                              │
│  2. persist-session-state.js                                 │
│     └─ Update claude_sessions with current state             │
│     └─ Enables crash recovery                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ PostToolUse - ON GIT COMMIT                                  │
│ Trigger: Bash(git commit*)                                   │
│                                                              │
│  1. auto-checkpoint.js --event commit                        │
│     └─ Record commit milestone                               │
│     └─ Extract commit hash for traceability                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Stop - SESSION END                                           │
│                                                              │
│  1. continuous-session-summary.js                            │
│     └─ Generate execution summary                            │
│     └─ Calculate SDs completed/skipped/failed                │
│     └─ Log total duration                                    │
│                                                              │
│  2. update-execution-actuals.js                              │
│     └─ Mark SD status in sd_execution_actuals                │
│     └─ Record actual_end timestamp                           │
│                                                              │
│  3. compare-test-baseline.js                                 │
│     └─ Compare final test state to baseline                  │
│     └─ Report new failures vs pre-existing                   │
└─────────────────────────────────────────────────────────────┘
```

### 6.4 Baseline Test State Capture

**Purpose**: Distinguish pre-existing test failures from new failures.

**Script**: `scripts/hooks/capture-baseline-test-state.js`

```javascript
#!/usr/bin/env node
/**
 * Capture baseline test state BEFORE any work starts
 *
 * Runs the test suite and records:
 * - Number of passing tests
 * - Number of failing tests (PRE-EXISTING)
 * - Test coverage percentage
 * - IDs of failing tests
 *
 * Stores in sd_execution_actuals.metadata.test_baseline
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function captureBaseline(sdId) {
  console.log(`Capturing baseline test state for ${sdId}...`);

  let testResults;
  try {
    // Run tests with JSON reporter
    const output = execSync('npm run test -- --reporter=json 2>/dev/null || true', {
      encoding: 'utf-8',
      timeout: 300000 // 5 minute timeout
    });

    testResults = JSON.parse(output);
  } catch (err) {
    console.log('Test run failed or timed out, recording empty baseline');
    testResults = { numPassedTests: 0, numFailedTests: 0, testResults: [] };
  }

  const baseline = {
    captured_at: new Date().toISOString(),
    passing_tests: testResults.numPassedTests || 0,
    failing_tests: testResults.numFailedTests || 0,
    coverage: testResults.coverageMap?.total?.lines?.pct || null,
    failing_test_ids: (testResults.testResults || [])
      .filter(t => t.status === 'failed')
      .map(t => t.name)
  };

  console.log(`Baseline: ${baseline.passing_tests} passing, ${baseline.failing_tests} failing`);

  // Store in sd_execution_actuals
  const { error } = await supabase
    .from('sd_execution_actuals')
    .update({
      metadata: supabase.sql`
        jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{test_baseline}',
          '${JSON.stringify(baseline)}'::jsonb
        )
      `
    })
    .eq('sd_id', sdId);

  if (error) {
    console.error('Failed to store baseline:', error.message);
  } else {
    console.log('Baseline stored successfully');
  }

  return baseline;
}

const sdId = process.env.SD_ID || process.argv[2];
if (sdId) {
  captureBaseline(sdId).catch(console.error);
} else {
  console.log('No SD_ID provided, skipping baseline capture');
}
```

### 6.5 Session Recovery System

**Purpose**: Resume execution after crash or interruption.

**Script**: `scripts/hooks/recover-session-state.js`

```javascript
#!/usr/bin/env node
/**
 * Recover session state from database
 *
 * Checks claude_sessions and continuous_execution_log
 * to determine where to resume from.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function recoverSession(sessionId) {
  console.log(`Checking for recoverable state for session ${sessionId}...`);

  // Check for existing session
  const { data: session } = await supabase
    .from('claude_sessions')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  if (!session) {
    console.log('No existing session found, starting fresh');
    return null;
  }

  // Check if session was in continuous mode
  if (!session.is_continuous_mode) {
    console.log('Session was not in continuous mode');
    return null;
  }

  // Get last execution log entry
  const { data: lastLog } = await supabase
    .from('continuous_execution_log')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!lastLog) {
    console.log('No execution log found');
    return null;
  }

  // Determine recovery point
  const recoveryInfo = {
    session_id: sessionId,
    last_sd_id: lastLog.child_sd_id,
    last_phase: lastLog.phase,
    last_status: lastLog.status,
    last_timestamp: lastLog.created_at,
    should_retry: lastLog.status === 'started' || lastLog.status === 'in_progress'
  };

  console.log('Recovery info:');
  console.log(`  Last SD: ${recoveryInfo.last_sd_id}`);
  console.log(`  Last Phase: ${recoveryInfo.last_phase}`);
  console.log(`  Last Status: ${recoveryInfo.last_status}`);
  console.log(`  Should Retry: ${recoveryInfo.should_retry}`);

  return recoveryInfo;
}

const sessionId = process.env.SESSION_ID || process.env.CONTINUOUS_SESSION_ID;
if (sessionId) {
  recoverSession(sessionId).catch(console.error);
} else {
  console.log('No SESSION_ID provided, skipping recovery check');
}
```

### 6.6 Leo Continuous Skill

**File**: `.claude/skills/leo-continuous.md`

```yaml
---
description: Enable LEO Continuous Execution Mode for autonomous SD processing
argument-hint: [optional: SD-ID to start with]
user-invocable: true
hooks:
  PreToolUse:
    - match: "*"
      once: true
      run: "node scripts/hooks/recover-session-state.js"
      message: "Checking for recoverable session state"
    - match: "*"
      once: true
      run: "node scripts/hooks/capture-baseline-test-state.js --sd-id $SD_ID"
      message: "Capturing baseline test state"
    - match: "*"
      once: true
      run: "node scripts/hooks/load-context-from-baseline.js --sd-id $SD_ID"
      message: "Loading baseline context"
  PostToolUse:
    - match: "Bash(node scripts/handoff.js execute*)"
      run: "node scripts/hooks/auto-checkpoint.js --event handoff"
      message: "Recording handoff checkpoint"
    - match: "Bash(node scripts/handoff.js execute*)"
      run: "node scripts/hooks/load-phase-context.js --from-last-handoff"
      message: "Loading phase context"
    - match: "Bash(git commit*)"
      run: "node scripts/hooks/auto-checkpoint.js --event commit"
      message: "Recording commit checkpoint"
    - match: "Bash"
      run: "node scripts/hooks/detect-and-log-issues.js"
      message: "Scanning for issues"
    - match: "Bash"
      run: "node scripts/hooks/persist-session-state.js"
  Stop:
    - run: "node scripts/hooks/continuous-session-summary.js"
      message: "Generating session summary"
    - run: "node scripts/hooks/compare-test-baseline.js"
      message: "Comparing test results to baseline"
---

# LEO Continuous Execution Mode

You are now in **continuous execution mode**.

**Start SD**: $ARGUMENTS (or run `npm run sd:next` to select)

## Operating Rules

1. **After completing any SD**: Run `npm run sd:next` and proceed immediately
2. **Follow LEO Protocol**: LEAD → PLAN → EXEC for each SD
3. **On failure**: Escalation automatically triggers via /escalate

## Escalation Protocol (Auto-Triggered)

| Level | Condition | Action | Budget |
|-------|-----------|--------|--------|
| 1 | First failure | Log and retry | Immediate |
| 2 | Second failure | 5-Whys diagnosis | 3 min |
| 3 | Root cause found | Targeted fix attempt | 10 min |
| 4 | Fix failed | Deeper 5-Whys | 3 min |
| 5 | Unresolvable | Intelligent skip (log + backlog + proceed) | - |

## Checkpoints

Checkpoints are automatically recorded at:
- Each handoff execution
- Each git commit
- Each phase transition

## Recovery

If session crashes, run `/leo-continuous` again. The system will:
1. Detect the previous session
2. Find the last checkpoint
3. Resume from that point

## Continue Until

- No more READY SDs in baseline
- User says "stop" or "pause"
- Critical unresolvable error

## Commands

- `npm run sd:next` - Show SD queue
- `npm run sd:claim <SD-ID>` - Claim a specific SD
- `npm run sd:release` - Release current SD
- `/escalate <failure>` - Manual escalation

**Start now** by running `npm run sd:next` or working on the specified SD.
```

### 6.7 Issue Auto-Detection Script

**Script**: `scripts/hooks/detect-and-log-issues.js`

```javascript
#!/usr/bin/env node
/**
 * Detect and log issues from command output
 *
 * Scans output for known error patterns and logs
 * to sd_baseline_issues with deduplication.
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Error patterns by category
const ERROR_PATTERNS = {
  security: [
    { pattern: /RLS policy (missing|not found)/i, severity: 'critical' },
    { pattern: /unprotected route/i, severity: 'critical' },
    { pattern: /authentication (failed|bypass)/i, severity: 'critical' },
    { pattern: /SECURITY_DEFINER.*without/i, severity: 'high' }
  ],
  testing: [
    { pattern: /coverage below (\d+)%/i, severity: 'high' },
    { pattern: /flaky test/i, severity: 'medium' },
    { pattern: /test timeout/i, severity: 'medium' }
  ],
  database: [
    { pattern: /missing index on/i, severity: 'medium' },
    { pattern: /N\+1 query detected/i, severity: 'high' },
    { pattern: /query timeout/i, severity: 'high' }
  ],
  performance: [
    { pattern: /response time > (\d+)ms/i, severity: 'high' },
    { pattern: /memory leak/i, severity: 'critical' },
    { pattern: /bundle size exceeded/i, severity: 'medium' }
  ]
};

async function detectAndLogIssues(output, context = {}) {
  const { sdId, agentCode, filePath, lineNumber } = context;
  const issuesFound = [];

  for (const [category, patterns] of Object.entries(ERROR_PATTERNS)) {
    for (const { pattern, severity } of patterns) {
      const match = output.match(pattern);
      if (match) {
        const description = match[0];

        // Generate hash for deduplication
        const hashInput = `${filePath || ''}|${lineNumber || ''}|${description}`;
        const hashSignature = crypto.createHash('md5').update(hashInput).digest('hex');

        // Check if issue exists
        const { data: existing } = await supabase
          .from('sd_baseline_issues')
          .select('id, occurrence_count, affected_sd_ids')
          .eq('hash_signature', hashSignature)
          .single();

        if (existing) {
          // Update existing issue
          const affectedSds = existing.affected_sd_ids || [];
          if (sdId && !affectedSds.includes(sdId)) {
            affectedSds.push(sdId);
          }

          await supabase
            .from('sd_baseline_issues')
            .update({
              occurrence_count: existing.occurrence_count + 1,
              last_seen_at: new Date().toISOString(),
              last_seen_sd_id: sdId,
              affected_sd_ids: affectedSds
            })
            .eq('id', existing.id);

          console.log(`Updated existing issue: ${description}`);
        } else {
          // Create new issue
          const issueKey = `BL-${category.substring(0, 3).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

          await supabase
            .from('sd_baseline_issues')
            .insert({
              issue_key: issueKey,
              hash_signature: hashSignature,
              category,
              sub_agent_code: agentCode || category.toUpperCase(),
              severity,
              file_path: filePath,
              line_number: lineNumber,
              description,
              discovered_by_sd_id: sdId,
              affected_sd_ids: sdId ? [sdId] : []
            });

          console.log(`Created new issue: ${issueKey} - ${description}`);
        }

        issuesFound.push({ category, severity, description });
      }
    }
  }

  return issuesFound;
}

// Read from stdin or environment
const output = process.env.LAST_OUTPUT || '';
const sdId = process.env.SD_ID;
const agentCode = process.env.AGENT_CODE;

if (output) {
  detectAndLogIssues(output, { sdId, agentCode }).catch(console.error);
}
```

### 6.8 Health Metrics Update

**Script**: `scripts/hooks/update-baseline-health.js`

```javascript
#!/usr/bin/env node
/**
 * Update baseline health metrics in real-time
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updateHealth(sdId) {
  // Get current SD state
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('current_phase, progress_percentage, status')
    .eq('legacy_id', sdId)
    .single();

  if (!sd) return;

  // Get sub-agent results (if any)
  const { data: subagentLogs } = await supabase
    .from('subagent_activations')
    .select('sub_agent_code, result_summary, quality_score')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: false })
    .limit(10);

  const healthMetrics = {
    updated_at: new Date().toISOString(),
    phase: sd.current_phase,
    progress: sd.progress_percentage,
    status: sd.status,
    sub_agent_outputs: {}
  };

  for (const log of (subagentLogs || [])) {
    healthMetrics.sub_agent_outputs[log.sub_agent_code] = {
      passed: log.quality_score >= 70,
      score: log.quality_score
    };
  }

  // Update actuals
  await supabase
    .from('sd_execution_actuals')
    .update({
      status: sd.status === 'completed' ? 'completed' : 'in_progress',
      metadata: supabase.sql`
        jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{health_metrics}',
          '${JSON.stringify(healthMetrics)}'::jsonb
        )
      `
    })
    .eq('sd_id', sdId);

  console.log(`Health updated for ${sdId}: ${sd.current_phase} @ ${sd.progress_percentage}%`);
}

const sdId = process.env.SD_ID || process.argv[2];
if (sdId) {
  updateHealth(sdId).catch(console.error);
}
```

---

## 7. Agent to Skills Migration

### 7.1 Current State

Agents are in `.claude/agents/` with hardcoded path in `lib/agents/registry.cjs`:

```javascript
// Line 271
_getMarkdownPath(code) {
  const filename = codeToFilename[code] || `${code.toLowerCase()}-agent.md`;
  return `/mnt/c/_EHG/EHG_Engineer/.claude/agents/${filename}`;  // HARDCODED
}
```

### 7.2 Migration Strategy: Dual-Path Support

**Approach**: Update `registry.cjs` to check both locations.

**Updated `_getMarkdownPath`**:

```javascript
const fs = require('fs');

_getMarkdownPath(code) {
  const filename = codeToFilename[code] || `${code.toLowerCase()}-agent.md`;

  // Check skills first (new location), fallback to agents (legacy)
  const skillsPath = `/mnt/c/_EHG/EHG_Engineer/.claude/skills/${filename}`;
  const agentsPath = `/mnt/c/_EHG/EHG_Engineer/.claude/agents/${filename}`;

  if (fs.existsSync(skillsPath)) {
    return skillsPath;
  }
  return agentsPath;
}
```

### 7.3 Migration Order

1. **Phase 1**: Update `registry.cjs` with dual-path support
2. **Phase 2**: Migrate one agent (testing-agent) as pilot
3. **Phase 3**: Validate hot-reload works
4. **Phase 4**: Migrate remaining agents incrementally
5. **Phase 5**: Remove `.claude/agents/_archived/` system

### 7.4 Agent Frontmatter Updates

When migrating, update frontmatter to new format:

**Before** (`.claude/agents/testing-agent.md`):
```yaml
---
name: testing-agent
description: "QA Engineering Director"
tools: Bash, Read, Write
model: sonnet
---
```

**After** (`.claude/skills/testing-agent.md`):
```yaml
---
name: testing-agent
description: "QA Engineering Director - E2E testing, coverage validation, QA workflows"
user-invocable: false
tools:
  - Bash
  - Read
  - Write
  - Task(database-agent)
model: sonnet
hooks:
  PreToolUse:
    - match: "*"
      once: true
      run: "node scripts/hooks/model-tracking.js --agent TESTING"
      message: "Logging model usage"
    - match: "*"
      once: true
      run: "node scripts/hooks/capture-baseline-test-state.js --sd-id $SD_ID"
      message: "Capturing baseline test state"
  PostToolUse:
    - match: "Bash(npm run test*)"
      run: "node scripts/hooks/capture-test-results.js"
      message: "Capturing test results"
  Stop:
    - run: "node scripts/hooks/compare-test-baseline.js"
      message: "Comparing to baseline"
---
```

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Week 1)

| Task | Priority | Effort |
|------|----------|--------|
| Create `scripts/hooks/` directory | P0 | 1 hr |
| Implement `model-tracking.js` | P0 | 2 hr |
| Implement `session-init.js` | P0 | 2 hr |
| Update `registry.cjs` with dual-path | P0 | 1 hr |
| Add wildcard permissions to settings.json | P0 | 30 min |

### Phase 2: Hook Infrastructure (Week 2)

| Task | Priority | Effort |
|------|----------|--------|
| Implement `load-phase-context.js` | P0 | 4 hr |
| Implement `auto-checkpoint.js` | P0 | 2 hr |
| Implement `persist-session-state.js` | P1 | 2 hr |
| Implement `recover-session-state.js` | P1 | 3 hr |
| Update `/escalate` skill with hooks | P1 | 1 hr |

### Phase 3: Baseline Integration (Week 3)

| Task | Priority | Effort |
|------|----------|--------|
| Implement `capture-baseline-test-state.js` | P0 | 4 hr |
| Implement `compare-test-baseline.js` | P0 | 3 hr |
| Implement `detect-and-log-issues.js` | P1 | 4 hr |
| Implement `update-baseline-health.js` | P1 | 2 hr |
| Create `/leo-continuous` skill | P0 | 2 hr |

### Phase 4: Agent Migration (Week 4)

| Task | Priority | Effort |
|------|----------|--------|
| Migrate testing-agent (pilot) | P0 | 2 hr |
| Validate hot-reload | P0 | 1 hr |
| Migrate database-agent | P1 | 1 hr |
| Migrate security-agent | P1 | 1 hr |
| Migrate remaining agents | P2 | 4 hr |
| Update documentation | P1 | 2 hr |

### Phase 5: Validation & Cleanup (Week 5)

| Task | Priority | Effort |
|------|----------|--------|
| End-to-end testing | P0 | 4 hr |
| Remove AGENT-MANIFEST archival system | P2 | 1 hr |
| Update CLAUDE.md router | P1 | 1 hr |
| Create migration guide | P1 | 2 hr |

---

## 9. Script Specifications

### 9.1 Directory Structure

```
scripts/
├── hooks/
│   ├── model-tracking.js
│   ├── session-init.js
│   ├── search-prior-issues.js
│   ├── load-phase-context.js
│   ├── load-context-from-baseline.js
│   ├── auto-checkpoint.js
│   ├── persist-session-state.js
│   ├── recover-session-state.js
│   ├── capture-baseline-test-state.js
│   ├── compare-test-baseline.js
│   ├── detect-and-log-issues.js
│   ├── update-baseline-health.js
│   ├── log-subagent-completion.js
│   ├── log-escalation-result.js
│   ├── detect-db-errors.js
│   ├── detect-security-issues.js
│   ├── check-retro-quality.js
│   ├── warn-if-process-improvement-missing.js
│   ├── flag-markdown-creation.js
│   ├── validate-gates.js
│   ├── generate-security-assessment.js
│   ├── log-validation-summary.js
│   └── continuous-session-summary.js
└── ...
```

### 9.2 Environment Variables

All hook scripts should support these environment variables:

| Variable | Source | Description |
|----------|--------|-------------|
| `SD_ID` | Session context | Current SD being worked on |
| `SESSION_ID` | Claude Code | Current session identifier |
| `AGENT_CODE` | Agent frontmatter | Sub-agent code (TESTING, etc.) |
| `AGENT_NAME` | Agent frontmatter | Sub-agent name |
| `LAST_OUTPUT` | PostToolUse | Output from last command |
| `TOOL_NAME` | PostToolUse | Name of tool that was used |
| `PHASE` | Session context | Current LEO phase |

### 9.3 Script Template

```javascript
#!/usr/bin/env node
/**
 * [Script Name]
 *
 * [Description of what this hook does]
 *
 * Hook Type: [PreToolUse|PostToolUse|Stop]
 * Trigger: [match pattern]
 * Once: [true|false]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const sdId = process.env.SD_ID;
  const sessionId = process.env.SESSION_ID;

  // Implementation here

  console.log('[Hook Output]');
}

main().catch(err => {
  console.error(`Hook error: ${err.message}`);
  process.exit(1);
});
```

---

## Appendix A: Complete Hook Reference

### A.1 PreToolUse Hooks

| Script | Match | Once | Purpose |
|--------|-------|------|---------|
| `model-tracking.js` | `*` | Yes | Log model usage |
| `session-init.js` | `*` | Yes | Initialize session |
| `search-prior-issues.js` | `*` | Yes | Load known patterns |
| `recover-session-state.js` | `*` | Yes | Crash recovery |
| `capture-baseline-test-state.js` | `*` | Yes | Test baseline |
| `load-context-from-baseline.js` | `*` | Yes | Track/phase context |
| `validate-gates.js` | `Bash(node scripts/handoff.js*)` | No | Gate validation |

### A.2 PostToolUse Hooks

| Script | Match | Purpose |
|--------|-------|---------|
| `auto-checkpoint.js` | `Bash(node scripts/handoff.js*)` | Record checkpoint |
| `auto-checkpoint.js` | `Bash(git commit*)` | Record commit |
| `load-phase-context.js` | `Bash(node scripts/handoff.js*)` | Load phase docs |
| `detect-and-log-issues.js` | `Bash` | Issue detection |
| `persist-session-state.js` | `Bash` | State persistence |
| `update-baseline-health.js` | `Bash` | Health metrics |
| `detect-db-errors.js` | `Bash` | DB error detection |
| `detect-security-issues.js` | `Bash` | Security detection |
| `capture-test-results.js` | `Bash(npm run test*)` | Test capture |
| `check-retro-quality.js` | `Bash` | Retro validation |
| `flag-markdown-creation.js` | `Write(*.md)` | Anti-pattern |

### A.3 Stop Hooks

| Script | Purpose |
|--------|---------|
| `continuous-session-summary.js` | Session summary |
| `compare-test-baseline.js` | Test comparison |
| `log-subagent-completion.js` | Agent completion |
| `log-validation-summary.js` | Validation summary |
| `generate-security-assessment.js` | Security summary |
| `warn-if-process-improvement-missing.js` | Retro check |

---

## Appendix B: Approval Checklist

- [ ] Executive Summary approved
- [ ] Agreed Enhancements confirmed
- [ ] Dropped Items acknowledged
- [ ] Hook Catalog reviewed
- [ ] Handoff-Based Phase Detection approved
- [ ] Baseline-Aware System architecture approved
- [ ] Migration Strategy approved
- [ ] Implementation Roadmap resources allocated
- [ ] Script Specifications reviewed

---

**Document End**

*This specification is part of LEO Protocol v4.3.3 and requires LEAD approval before implementation.*
