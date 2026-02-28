---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Triangulation: Stop Hook Sub-Agent Enforcement Design Review



## Table of Contents

- [Metadata](#metadata)
- [Context: LEO Protocol Overview](#context-leo-protocol-overview)
  - [Key Concepts](#key-concepts)
  - [Current State](#current-state)
  - [Problem Statement](#problem-statement)
- [Context: Claude Code Hooks](#context-claude-code-hooks)
  - [Hook Capabilities](#hook-capabilities)
  - [Current Hook Usage](#current-hook-usage)
- [Proposed Solution: Stop Hook Sub-Agent Enforcement](#proposed-solution-stop-hook-sub-agent-enforcement)
  - [Core Logic](#core-logic)
  - [Sub-Agent Enforcement Matrix](#sub-agent-enforcement-matrix)
  - [Timing Validation](#timing-validation)
  - [Example Output (Blocking)](#example-output-blocking)
- [Your Task: Pros/Cons Analysis](#your-task-proscons-analysis)
  - [1. Pros Analysis](#1-pros-analysis)
  - [2. Cons Analysis](#2-cons-analysis)
  - [3. Risk Assessment](#3-risk-assessment)
  - [4. Alternative Approaches](#4-alternative-approaches)
  - [5. Recommendations](#5-recommendations)
- [Output Format](#output-format)
- [Pros Analysis](#pros-analysis)
  - [Quality Improvement](#quality-improvement)
  - [Process Enforcement](#process-enforcement)
- [Cons Analysis](#cons-analysis)
  - [Complexity](#complexity)
- [Alternative Approaches](#alternative-approaches)
- [Recommendations](#recommendations)
- [Overall Assessment](#overall-assessment)
- [Additional Context (Reference Only)](#additional-context-reference-only)
  - [Evidence: Current Sub-Agent Usage](#evidence-current-sub-agent-usage)
  - [Evidence: Retrospective Gap](#evidence-retrospective-gap)
  - [Evidence: Validator Effectiveness](#evidence-validator-effectiveness)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, unit

**Date**: 2026-01-21
**Type**: Design Review (Pros/Cons Analysis)
**Target AIs**: OpenAI, Gemini

---

## Context: LEO Protocol Overview

LEO (Lead-Execute-Optimize) is a software development governance protocol that manages Strategic Directives (SDs) through a phased workflow:

```
LEAD → PLAN → EXEC → PLAN (verification) → LEAD (approval) → COMPLETED
```

### Key Concepts

1. **Strategic Directive (SD)**: A unit of work with a specific type and category
2. **SD Types**: feature, implementation, infrastructure, database, security, documentation, bugfix, refactor, performance, orchestrator
3. **SD Categories**: Quality Assurance, audit, security, bug_fix, ux_improvement, product_feature, database, etc.
4. **Handoffs**: Phase transitions that require validation (LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD)
5. **Sub-Agents**: Specialized validation modules (TESTING, DESIGN, DATABASE, SECURITY, REGRESSION, etc.)

### Current State

- **27 sub-agents** exist in the codebase
- **Only 3 are actively used** (DATABASE: 873 executions, API: 122, ARCHITECT: 5)
- Sub-agent execution is tracked in database with timestamps
- Each SD type has different validation requirements (e.g., `refactor` requires REGRESSION, `feature` requires TESTING)

### Problem Statement

Sub-agents that should be executed based on SD type are often skipped because:
1. There's no enforcement mechanism during development sessions
2. Validation only happens at handoff time (late in the workflow)
3. Developers/Claude may forget which sub-agents are required for each SD type

---

## Context: Claude Code Hooks

Claude Code (Anthropic's CLI tool) supports hooks that execute at specific lifecycle events:

| Hook Event | When It Fires | Can Block? |
|------------|---------------|------------|
| **PreToolUse** | Before tool calls | YES |
| **PostToolUse** | After tool completes | NO (feedback only) |
| **Stop** | When Claude finishes responding | YES |
| **UserPromptSubmit** | When user submits prompt | YES |

### Hook Capabilities

- Execute shell commands or scripts
- Return JSON to provide feedback to Claude
- Block actions with exit code 2
- Access to conversation context via stdin

### Current Hook Usage

The project currently uses 3 basic hooks for activity state tracking (running/idle indicator). No validation hooks are implemented.

---

## Proposed Solution: Stop Hook Sub-Agent Enforcement

We propose a **Stop hook** that validates sub-agent execution before allowing a session to end.

### Core Logic

1. Extract SD-ID from current git branch (e.g., `feat/SD-FEATURE-001-description`)
2. Query SD type and category from database
3. Determine required sub-agents based on type + category matrix
4. Query sub-agent execution history for this SD
5. Validate timing (did sub-agents run in correct phase?)
6. Block session end if critical sub-agents are missing, with actionable feedback

### Sub-Agent Enforcement Matrix

**By SD Type (Required):**

| SD Type | Required Sub-Agents | Timing |
|---------|---------------------|--------|
| `feature` | TESTING, DESIGN, STORIES | DESIGN/STORIES in PLAN, TESTING in EXEC |
| `implementation` | TESTING, API | API in PLAN, TESTING in EXEC |
| `infrastructure` | GITHUB, DOCMON | Before completion |
| `database` | DATABASE, SECURITY | Before EXEC-TO-PLAN |
| `security` | SECURITY, DATABASE | Before completion |
| `documentation` | DOCMON | Any phase |
| `bugfix` | RCA, REGRESSION, TESTING | RCA first, then others |
| `refactor` | REGRESSION, VALIDATION | REGRESSION in EXEC |
| `performance` | PERFORMANCE, TESTING | In EXEC with benchmarks |
| `orchestrator` | (none) | RETRO at completion |

**By Category (Additive):**

| Category | Additional Sub-Agents |
|----------|----------------------|
| Quality Assurance | +TESTING, +UAT, +VALIDATION |
| audit | +VALIDATION, +RCA |
| security | +SECURITY, +RISK |
| bug_fix | +RCA, +REGRESSION |
| ux_improvement | +DESIGN, +UAT |
| product_feature | +DESIGN, +STORIES, +API |
| database | +DATABASE, +SECURITY |

**Universal:** RETRO (retrospective) required on all SD completions

### Timing Validation

Sub-agents must run in the correct phase window:

```
PLAN phase:  DESIGN, STORIES, API (design), DATABASE (schema)
EXEC phase:  TESTING, REGRESSION, PERFORMANCE, SECURITY
Verification: UAT, VALIDATION
Completion:   RETRO
```

The hook cross-references:
- Handoff timestamps (when each phase transition occurred)
- Sub-agent execution timestamps
- Validates each required sub-agent ran within its phase window

### Example Output (Blocking)

```json
{
  "decision": "block",
  "reason": "SD SD-FEATURE-001 (feature) has sub-agent validation issues",
  "details": {
    "sd_key": "SD-FEATURE-001",
    "sd_type": "feature",
    "category": "product_feature",
    "current_phase": "EXEC",
    "missing_required": ["DESIGN"],
    "wrong_timing": [],
    "warnings": ["Recommended sub-agent UAT was not executed"]
  },
  "suggested_actions": [
    "Run missing sub-agents: DESIGN",
    "Use: node scripts/orchestrate-phase-subagents.js SD-FEATURE-001 --agents DESIGN"
  ]
}
```

---

## Your Task: Pros/Cons Analysis

Please provide a thorough analysis of this proposed Stop Hook design:

### 1. Pros Analysis

Identify benefits in these categories:
- **Quality Improvement**: How does this improve output quality?
- **Process Enforcement**: How does this ensure protocol compliance?
- **Developer Experience**: Impact on workflow and productivity
- **Error Prevention**: What issues does this catch early?
- **Scalability**: How does this scale with team/project growth?

### 2. Cons Analysis

Identify concerns in these categories:
- **Complexity**: Implementation and maintenance burden
- **Performance**: Impact on session responsiveness
- **False Positives**: Risk of blocking legitimate work
- **Rigidity**: Risk of over-constraining developers
- **Edge Cases**: Scenarios that might break or be poorly handled

### 3. Risk Assessment

For each concern, rate:
- **Likelihood**: How likely is this to occur? (Low/Medium/High)
- **Impact**: How severe if it occurs? (Low/Medium/High)
- **Mitigation**: Is there a reasonable mitigation?

### 4. Alternative Approaches

Suggest alternative or complementary approaches:
- Are there simpler ways to achieve the same goal?
- What would a phased rollout look like?
- Are there hybrid approaches worth considering?

### 5. Recommendations

Provide actionable recommendations:
- Should this be implemented as designed?
- What modifications would you suggest?
- What should be validated before implementation?
- What metrics should be tracked post-implementation?

---

## Output Format

Please structure your response as:

```markdown
## Pros Analysis
### Quality Improvement
- [Pro 1]
- [Pro 2]
...

### Process Enforcement
...

## Cons Analysis
### Complexity
- [Con 1]: [Likelihood] / [Impact] / [Mitigation]
...

## Alternative Approaches
1. [Alternative 1]: [Description]
...

## Recommendations
1. [Recommendation 1]
...

## Overall Assessment
[Summary paragraph with go/no-go recommendation and confidence level]
```

---

## Additional Context (Reference Only)

### Evidence: Current Sub-Agent Usage

From database query of last 1000 executions:
- DATABASE: 873 executions
- API: 122 executions
- ARCHITECT: 5 executions
- All other sub-agents: 0 executions

### Evidence: Retrospective Gap

From retrospective analysis (SD-QUALITY-LIFECYCLE-001):
> "Orchestrator retrospective was not created at completion - process gap"
> "Retrospectives should be mandatory before SD completion"

This directly validates the need for RETRO enforcement in the Stop hook.

### Evidence: Validator Effectiveness

Query of 100 retrospectives for validation-caused rework found:
- 0 instances of "had to redo work due to late validation"
- 0 instances of "caught too late" complaints

This suggests current late-validation (at handoff) is not causing pain, but the **missing validation** (sub-agents not running at all) is the actual gap.

---

*Triangulation Protocol v1.1 - Design Review Template*
