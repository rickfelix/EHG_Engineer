# Retrospective Patterns Skill

**Skill Type**: Documentation and Process Improvement
**Target Audience**: Claude Code Models (LEAD, PLAN, EXEC agents)
**Storage**: `leo_skills` table (skill_key: 'retrospective-patterns')
**Last Updated**: 2025-12-10

---

## Skill Purpose

Guide Claude Code models in creating high-quality retrospectives that feed the LEO Protocol Self-Improvement System. This skill teaches when to create retrospectives, what to focus on for different handoff types, and how to ensure learnings translate into actionable protocol improvements.

---

## When to Create Handoff Retrospectives

### MANDATORY Retrospectives

**1. EXEC→PLAN Handoff** (Implementation Complete)
- **Trigger**: After all implementation work complete, before handoff to PLAN for review
- **Timing**: Immediately after last code commit, before handoff script execution
- **Required Fields**: protocol_improvements[], testing_learnings[], pain_points[]

**2. PLAN→LEAD Handoff** (Planning Complete)
- **Trigger**: After PRD validation, user story creation, before handoff to LEAD for approval
- **Timing**: After PRD marked ready for review
- **Required Fields**: protocol_improvements[], process_improvements[], scope_learnings[]

**3. SD Completion** (Final Retrospective)
- **Trigger**: When SD status changes to 'completed'
- **Timing**: After all phases complete, before archiving SD
- **Required Fields**: All fields (comprehensive retrospective)

### OPTIONAL Retrospectives (Recommended)

**1. LEAD→PLAN Handoff** (Approval Complete)
- **When**: For complex SDs with significant scope evolution
- **Focus**: Simplicity checklist effectiveness, scope definition clarity

**2. Mid-Phase Checkpoints**
- **When**: Phase extends beyond 3 days or encounters blocking issues
- **Focus**: Process adjustments, risk mitigation, course corrections

---

## Focus Areas by Handoff Type

### LEAD→PLAN Retrospective

**Primary Questions**:
1. Was the SD sufficiently simplified? (80/20 rule applied?)
2. Did the simplicity checklist identify scope creep?
3. Were dependencies clearly documented?
4. Was scope well-defined for PLAN phase?

**Key Sections to Complete**:
- **success_stories**: What worked in scope definition
- **pain_points**: Scope creep, unclear requirements, missing context
- **process_improvements**: Simplicity checklist enhancements, dependency detection
- **protocol_improvements**: Focus on LEAD phase patterns

**Example protocol_improvements**:
```json
[
  {
    "category": "scope",
    "improvement": "Add backlog review to simplicity checklist",
    "evidence": "SD-XXX: Backlog items revealed 3x scope initially estimated",
    "impact": "Prevents under-scoping, saves rework",
    "affected_phase": "LEAD"
  }
]
```

---

### PLAN→EXEC Retrospective

**Primary Questions**:
1. Were all user stories INVEST-compliant?
2. Did PRD validation catch schema issues before implementation?
3. Was database design complete and approved?
4. Were acceptance criteria clear and testable?

**Key Sections to Complete**:
- **success_stories**: What worked in planning and validation
- **pain_points**: User story quality, PRD validation gaps, database issues
- **process_improvements**: PRD validation enhancements, user story templates
- **protocol_improvements**: Focus on PLAN phase patterns

**Example protocol_improvements**:
```json
[
  {
    "category": "validation",
    "improvement": "Enforce database schema review before PLAN→EXEC handoff",
    "evidence": "SD-XXX: Missing RLS policies discovered during implementation",
    "impact": "Prevents security gaps, saves 1-2 hours of rework",
    "affected_phase": "PLAN"
  }
]
```

---

### EXEC→PLAN Retrospective (MOST CRITICAL)

**Primary Questions**:
1. Were BOTH unit and E2E tests executed and passed?
2. Was every user story validated with ≥1 E2E test?
3. Were all QA sub-agent recommendations addressed?
4. Did implementation match PRD specifications?

**Key Sections to Complete** (ALL MANDATORY):
- **testing_learnings**: Unit test coverage, E2E test results, QA findings
- **pain_points**: Testing gaps, implementation challenges, integration issues
- **process_improvements**: Testing workflow, sub-agent orchestration
- **protocol_improvements**: Focus on EXEC phase patterns (testing, validation, handoff)

**Example protocol_improvements**:
```json
[
  {
    "category": "testing",
    "improvement": "Add pre-commit hook to run unit tests before push",
    "evidence": "SD-XXX: Tests passed locally but failed in CI 3 times",
    "impact": "Prevents CI failures, saves 10 minutes per failed push",
    "affected_phase": "EXEC"
  },
  {
    "category": "sub_agent",
    "improvement": "Auto-trigger QA Director when E2E test file created",
    "evidence": "SD-XXX: QA Director run manually after 2-day delay",
    "impact": "Faster feedback, reduces validation lag",
    "affected_phase": "EXEC"
  }
]
```

**CRITICAL**: EXEC→PLAN retrospectives feed most protocol improvements (testing, validation, quality gates)

---

## How to Ensure Retrospectives Feed Improvement Pipeline

### 1. Set learning_category Correctly

**PROCESS_IMPROVEMENT**: Use when protocol changes are recommended
```javascript
{
  learning_category: 'PROCESS_IMPROVEMENT',
  protocol_improvements: [ /* MANDATORY */ ]
}
```

**TECHNICAL_LEARNING**: Use for technology-specific learnings (not protocol)
```javascript
{
  learning_category: 'TECHNICAL_LEARNING',
  protocol_improvements: [] // Optional
}
```

**SUCCESS_PATTERN**: Use when documenting repeatable success
```javascript
{
  learning_category: 'SUCCESS_PATTERN',
  success_stories: [ /* MANDATORY */ ],
  protocol_improvements: [] // Optional - codify pattern
}
```

**PAIN_POINT**: Use for recurring issues needing attention
```javascript
{
  learning_category: 'PAIN_POINT',
  pain_points: [ /* MANDATORY */ ],
  protocol_improvements: [ /* MANDATORY - how to prevent */ ]
}
```

---

### 2. Structure protocol_improvements for Auto-Extraction

**Good Example** (clear, actionable, evidence-based):
```json
{
  "category": "testing",
  "improvement": "Enforce 100% user story coverage for E2E tests before EXEC→PLAN handoff",
  "evidence": "SD-EVA-MEETING-001: User stories created retroactively, couldn't validate requirements met",
  "impact": "Saves 1-2 hours of retroactive work per SD, ensures all requirements validated",
  "affected_phase": "EXEC"
}
```

**Bad Example** (vague, no evidence, no impact):
```json
{
  "category": "general",
  "improvement": "Testing should be better",
  "evidence": "Tests sometimes fail",
  "impact": "Would help",
  "affected_phase": null
}
```

**Key Attributes**:
- **category**: Use standard values (testing, validation, sub_agent, handoff, scope, documentation)
- **improvement**: Start with action verb (Enforce, Add, Update, Remove)
- **evidence**: Cite specific SD-XXX and what went wrong
- **impact**: Quantify benefit (time saved, quality improvement, incidents prevented)
- **affected_phase**: Specify LEAD, PLAN, or EXEC (helps target updates)

---

### 3. Document Pain Points with Context

**Good Example**:
```json
{
  "description": "E2E tests written before user stories created",
  "category": "PROCESS_VIOLATION",
  "severity": "high",
  "impact": "Couldn't verify if tests matched requirements",
  "resolution": "Created user stories retroactively, added 1.5 hours to timeline",
  "prevention": "Enforce user story creation during PLAN phase, before EXEC handoff"
}
```

**Bad Example**:
```json
{
  "description": "Tests were confusing",
  "category": "OTHER",
  "severity": "low",
  "impact": "Took longer",
  "resolution": "Fixed it",
  "prevention": "Do better next time"
}
```

---

### 4. Capture Success Stories with Patterns

**Good Example**:
```json
{
  "pattern": "Database-first design with migration files before implementation",
  "description": "Created migration files during PLAN phase, reviewed by ARCHITECT sub-agent, zero schema changes during EXEC",
  "impact": "Saved 2 hours of implementation rework, prevented RLS gaps",
  "repeatability": "High - applies to all database-touching SDs",
  "evidence": "SD-XXX: Zero database issues during implementation"
}
```

**Pattern Attributes**:
- **pattern**: Concise name for success pattern
- **description**: What was done differently
- **impact**: Measurable benefit
- **repeatability**: High/Medium/Low (can others replicate?)
- **evidence**: Specific SD proof

---

### 5. Link Testing Learnings to Protocol

**Testing Learning Example**:
```json
{
  "test_type": "E2E",
  "what_worked": "Playwright test with explicit wait-for-selector reduced flakiness",
  "what_failed": "Using generic page.click() without waiting caused intermittent failures",
  "recommendation": "Add to EXEC phase: Always use page.waitForSelector() before interactions",
  "repeatability": "High - applies to all Playwright E2E tests"
}
```

**Link to protocol_improvements**:
```json
{
  "category": "testing",
  "improvement": "Add E2E test pattern: Always wait for selectors before interactions",
  "evidence": "SD-XXX: Generic clicks caused 30% flaky test rate, explicit waits reduced to 0%",
  "impact": "Prevents flaky tests, improves CI reliability",
  "affected_phase": "EXEC"
}
```

---

## Anti-Patterns (Avoid These)

### 1. Empty Retrospectives
```json
{
  "protocol_improvements": [],
  "pain_points": [],
  "success_stories": []
}
```
**Problem**: No learnings captured, system can't improve
**Fix**: Always document at least 1 pain point or 1 success story

---

### 2. Generic Improvements
```json
{
  "category": "general",
  "improvement": "Make things better",
  "evidence": "Things could be improved",
  "impact": "Would be good"
}
```
**Problem**: Can't be acted upon, no clear target
**Fix**: Be specific about what to change and why

---

### 3. Missing Evidence
```json
{
  "improvement": "Add more testing",
  "evidence": "",
  "impact": "Better quality"
}
```
**Problem**: No proof of need, can't prioritize
**Fix**: Cite specific SD where lack of testing caused issues

---

### 4. No Affected Phase
```json
{
  "improvement": "Fix the process",
  "affected_phase": null
}
```
**Problem**: Can't route improvement to correct protocol file
**Fix**: Specify LEAD, PLAN, or EXEC (or ALL if cross-cutting)

---

### 5. Improvements Without Pain Points
```json
{
  "protocol_improvements": [
    { "improvement": "Add new validation step" }
  ],
  "pain_points": []
}
```
**Problem**: Why is this needed? What problem does it solve?
**Fix**: Document pain point first, then improvement

---

## Quality Checklist

Before saving retrospective, verify:

- [ ] **learning_category** set correctly (PROCESS_IMPROVEMENT if protocol changes needed)
- [ ] **protocol_improvements[]** array has ≥1 object (if learning_category = PROCESS_IMPROVEMENT)
- [ ] Each improvement has: category, improvement, evidence, impact, affected_phase
- [ ] **evidence** field cites specific SD-XXX and what went wrong
- [ ] **impact** field quantifies benefit (time, quality, incidents)
- [ ] **pain_points[]** array documents what didn't work
- [ ] **success_stories[]** array documents what did work
- [ ] **testing_learnings[]** array completed (for EXEC→PLAN handoffs)
- [ ] **quality_score** will be ≥70 (validates retrospective quality)

---

## Integration with Self-Improvement System

### Automatic Analysis

**Monthly or After 5-10 SDs**:
```bash
node scripts/analyze-retrospectives-for-protocol-improvements.mjs
```

**Output**: Patterns detected, recurring pain points, high-impact improvements

---

### Threshold-Based Application

**Auto-Apply** (≥3 mentions or critical severity):
- Protocol sections updated automatically
- CLAUDE.md regenerated
- Effectiveness tracking begins

**Review Required** (2 mentions or medium impact):
- Queued for LEAD approval
- If approved → applied
- If rejected → archived with reason

---

### Effectiveness Measurement

**After 3-5 SDs**:
- Pain point frequency tracked
- Quality score trends analyzed
- Success pattern adoption measured

**Validation**:
- Did pain point recur? (Goal: ≥50% reduction)
- Did quality scores improve? (Goal: ≥5 point increase)
- Zero recurrence of critical incidents? (Goal: 100%)

---

## Real-World Examples (Evidence-Based)

### Example 1: Testing Enforcement (SD-EXPORT-001)

**Pain Point**:
```json
{
  "description": "Tests existed but weren't executed before marking SD complete",
  "category": "PROCESS_VIOLATION",
  "severity": "high",
  "impact": "30-minute gap between 'complete' and discovering test failures",
  "resolution": "Ran tests retroactively, found issues, fixed, re-marked complete",
  "prevention": "Enforce dual test execution (unit + E2E) before EXEC→PLAN handoff"
}
```

**Protocol Improvement**:
```json
{
  "category": "testing",
  "improvement": "MANDATORY dual test execution before EXEC→PLAN handoff - cannot create handoff without passing test evidence",
  "evidence": "SD-EXPORT-001: 30-minute validation gap, tests not run before completion claim",
  "impact": "Prevents validation gaps, saves 30 minutes per SD",
  "affected_phase": "EXEC"
}
```

**Result**: Zero testing gaps in next 8 SDs (100% compliance)

---

### Example 2: User Story Validation (SD-EVA-MEETING-001)

**Pain Point**:
```json
{
  "description": "User stories created retroactively after implementation complete",
  "category": "PLANNING_GAP",
  "severity": "high",
  "impact": "Couldn't verify if requirements were actually met, 1.5 hours of retroactive work",
  "resolution": "Created user stories post-implementation, mapped to E2E tests",
  "prevention": "Enforce user story creation during PLAN phase, before EXEC handoff"
}
```

**Protocol Improvement**:
```json
{
  "category": "validation",
  "improvement": "100% E2E test coverage with US-XXX mapping - QA Director blocks handoff if coverage < 100%",
  "evidence": "SD-EVA-MEETING-001: User stories created retroactively, added 1.5 hours to timeline",
  "impact": "Saves 1-2 hours per SD, ensures all requirements validated",
  "affected_phase": "EXEC"
}
```

**Result**: Zero retroactive user story creation in next 6 SDs (100% compliance)

---

### Example 3: Sub-Agent Orchestration (SD-EXPORT-001)

**Pain Point**:
```json
{
  "description": "QA Engineering Director sub-agent never triggered during initial implementation",
  "category": "AUTOMATION_GAP",
  "severity": "high",
  "impact": "Manual intervention required, 30-minute delay in validation",
  "resolution": "Manually triggered QA Director, tests failed, fixed issues",
  "prevention": "Auto-trigger QA Director on EXEC_IMPLEMENTATION_COMPLETE event"
}
```

**Protocol Improvement**:
```json
{
  "category": "sub_agent",
  "improvement": "Handoff scripts verify QA execution before allowing handoff creation - blocks with error if QA not run",
  "evidence": "SD-EXPORT-001: QA Director never triggered, manual intervention required",
  "impact": "Zero 'forgot to run QA' incidents, 100% automated validation",
  "affected_phase": "EXEC"
}
```

**Result**: Zero manual QA trigger incidents in next 5 SDs (100% automation)

---

## Reference Documentation

**Full System Documentation**: `docs/leo/operational/self-improvement.md`

**Topics Covered**:
- Architecture flow diagram
- Database schema (protocol_improvements column, views, functions)
- Extraction and analysis process
- Improvement types and target tables
- Evidence-based thresholds (auto-apply vs review)
- Effectiveness tracking metrics
- Commands reference
- Database-first enforcement
- Success patterns with evidence

**Quick Links**:
- Analysis script: `scripts/analyze-retrospectives-for-protocol-improvements.mjs`
- Application script: `scripts/add-protocol-improvements-from-retrospectives.mjs`
- Migration: `database/migrations/20251204_add_protocol_improvements_to_retrospectives.sql`

---

## Summary: Creating Improvement-Ready Retrospectives

**1. Choose Correct Category**:
- PROCESS_IMPROVEMENT → protocol changes needed (requires protocol_improvements[])
- TECHNICAL_LEARNING → tech-specific learnings
- SUCCESS_PATTERN → repeatable success
- PAIN_POINT → recurring issues

**2. Complete All Relevant Sections**:
- protocol_improvements[] (MANDATORY for PROCESS_IMPROVEMENT)
- pain_points[] (what went wrong, why, how to prevent)
- success_stories[] (what worked, why, how to repeat)
- testing_learnings[] (MANDATORY for EXEC→PLAN)

**3. Structure for Auto-Extraction**:
- Clear category (testing, validation, sub_agent, handoff)
- Specific improvement (action verb + what + where)
- Evidence (SD-XXX + what happened)
- Impact (quantified benefit)
- Affected phase (LEAD, PLAN, or EXEC)

**4. Quality Validation**:
- quality_score ≥70 (validates completeness)
- Evidence-based (cites specific SDs)
- Actionable (clear what to change)
- Measurable (can track effectiveness)

---

**Remember**: Every retrospective is an opportunity to make the protocol better. The more specific and evidence-based your learnings, the more impactful the improvements.

**Goal**: Zero recurring issues, continuous quality improvement, automated learning loop.

---

**Skill Version**: 1.0
**Evidence Base**: 74+ retrospectives analyzed
**System Status**: Active since 2025-12-04
**Related**: SD-LEO-LEARN-001 (Proactive Learning Integration)
