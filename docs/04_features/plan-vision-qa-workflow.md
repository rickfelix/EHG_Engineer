---
category: feature
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [feature, auto-generated]
---
# PLAN Agent Workflow with Vision QA Integration


## Table of Contents

- [Metadata](#metadata)
- [LEO Protocol v3.1.5.9](#leo-protocol-v3159)
  - [Step 1: Receive Strategic Directive with Vision QA Status](#step-1-receive-strategic-directive-with-vision-qa-status)
  - [Step 2: Task Decomposition with Vision QA](#step-2-task-decomposition-with-vision-qa)
  - [Step 3: Vision QA Task Planning](#step-3-vision-qa-task-planning)
  - [Step 4: Verification Enhancement with Vision QA](#step-4-verification-enhancement-with-vision-qa)
  - [Step 5: Vision QA Result Assessment](#step-5-vision-qa-result-assessment)
  - [Step 6: Quality Score Calculation with Vision QA](#step-6-quality-score-calculation-with-vision-qa)
  - [Decision Helper Usage](#decision-helper-usage)
  - [Common Vision QA Configurations](#common-vision-qa-configurations)
  - [Troubleshooting Vision QA Issues](#troubleshooting-vision-qa-issues)

## Metadata
- **Category**: Feature
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: testing, feature, protocol, leo

## LEO Protocol v3.1.5.9

### Step 1: Receive Strategic Directive with Vision QA Status

Upon receiving SD from LEAD, verify Vision QA requirements:

```markdown
**Checklist:**
- [ ] Vision QA Status identified (MANDATORY/REQUIRED/RECOMMENDED/OPTIONAL/NOT_APPLICABLE)
- [ ] Budget allocation confirmed
- [ ] Test priorities understood
- [ ] Success criteria includes Vision QA metrics
```

### Step 2: Task Decomposition with Vision QA

When breaking down tasks, identify Vision QA points:

```markdown
**For each task/EES:**
1. Does this task create/modify UI? → Vision QA needed
2. Is this a backend-only task? → Vision QA not needed
3. Does this fix UI bugs? → Vision QA for regression
4. Does this affect user workflows? → Vision QA recommended
```

### Step 3: Vision QA Task Planning

For tasks requiring Vision QA, include in handoff:

```markdown
**To:** EXEC Agent
**From:** PLAN Agent
**Protocol:** LEO Protocol v3.1.5.9 (Vision QA Integration)
**Task:** [EES-ID]: [Task Description]
**Vision QA Status:** [Required/Recommended/Optional]

**Vision QA Test Goals:**
1. [Specific goal 1]
2. [Specific goal 2]
3. [Specific goal 3]

**Vision QA Configuration:**
```json
{
  "appId": "[APP-ID]",
  "maxIterations": 30,
  "costLimit": 2.00,
  "consensusRuns": 1,
  "bugDetectionSensitivity": "medium",
  "viewports": ["desktop", "mobile"]
}
```

**Success Criteria:**
- All Vision QA test goals achieved
- No critical or high severity bugs
- Accessibility score ≥ 90% (if applicable)
- Cost within allocated budget

**Post-Implementation:**
- Run Vision QA before marking complete
- Include test results in completion evidence
- Document any detected bugs
```

### Step 4: Verification Enhancement with Vision QA

During PLAN verification (Tier 2 - Risk Adaptive):

```markdown
**High-Risk UI Components - Enhanced Verification:**
1. Review Vision QA test report
2. Verify all test goals achieved
3. Assess bug severity and impact
4. Check accessibility compliance
5. Validate screenshots across viewports
6. Confirm consensus agreement (if applicable)

**Standard-Risk - Streamlined Verification:**
1. Confirm Vision QA executed
2. Check pass rate ≥ 80%
3. Verify no critical bugs
4. Review cost efficiency
```

### Step 5: Vision QA Result Assessment

When receiving EXEC completion with Vision QA:

```markdown
**Evaluation Criteria:**
┌─────────────────────┬─────────────┬──────────────┐
│ Metric              │ Threshold   │ Action       │
├─────────────────────┼─────────────┼──────────────┤
│ Pass Rate           │ ≥ 80%       │ Accept       │
│                     │ < 80%       │ Reject       │
├─────────────────────┼─────────────┼──────────────┤
│ Critical Bugs       │ 0           │ Accept       │
│                     │ > 0         │ Reject       │
├─────────────────────┼─────────────┼──────────────┤
│ High Bugs           │ ≤ 2         │ Conditional  │
│                     │ > 2         │ Reject       │
├─────────────────────┼─────────────┼──────────────┤
│ Accessibility       │ ≥ 90%       │ Accept       │
│                     │ < 90%       │ Conditional  │
└─────────────────────┴─────────────┴──────────────┘
```

### Step 6: Quality Score Calculation with Vision QA

```markdown
**Quality Score Components (100 points total):**
- Base Implementation: 40 points
- Vision QA Pass Rate: 10 points
  - 100% = 10 points
  - 90-99% = 8 points
  - 80-89% = 6 points
  - <80% = 0 points (FAILS)
- Visual Bug Score: 10 points
  - No bugs = 10 points
  - Low severity only = 7 points
  - Medium severity = 5 points
  - High/Critical = 0 points (FAILS)
- Other criteria: 40 points

**Minimum to pass: 85 points**
```

### Decision Helper Usage

```bash
# Analyze task for Vision QA requirements
node scripts/vision-qa-decision.js

# Follow interactive prompts:
# 1. Select "PLAN Agent"
# 2. Choose "Task/EES"
# 3. Paste task description
# → Receive recommendation and config
```

### Common Vision QA Configurations

**Critical Path (Payment/Auth):**
```json
{
  "maxIterations": 50,
  "costLimit": 5.00,
  "consensusRuns": 3,
  "model": "gpt-5"
}
```

**Standard UI Feature:**
```json
{
  "maxIterations": 30,
  "costLimit": 2.00,
  "consensusRuns": 1,
  "model": "auto"
}
```

**Accessibility Focus:**
```json
{
  "maxIterations": 40,
  "costLimit": 3.00,
  "checkAccessibility": true,
  "model": "claude-sonnet-3.7"
}
```

**Quick Smoke Test:**
```json
{
  "maxIterations": 15,
  "costLimit": 1.00,
  "model": "gpt-5-nano"
}
```

### Troubleshooting Vision QA Issues

**Issue: Low Pass Rate**
- Review test goals for clarity
- Check if UI has proper labels/IDs
- Consider increasing iterations
- Verify application state

**Issue: High Costs**
- Reduce consensus runs
- Use cheaper models for non-critical
- Optimize test goals
- Limit viewport testing

**Issue: Inconsistent Results**
- Add explicit waits in UI
- Fix timing-dependent features
- Use consensus testing
- Review element selectors