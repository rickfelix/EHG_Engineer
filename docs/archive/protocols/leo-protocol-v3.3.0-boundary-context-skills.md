---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# LEO Protocol v3.3.0 - Boundary Enforcement, Context Management & Specialized Skills


## Table of Contents

- [Executive Summary](#executive-summary)
- [Part 1: Agent Boundary Enforcement](#part-1-agent-boundary-enforcement)
  - [The Problem](#the-problem)
  - [Boundary Definition Framework](#boundary-definition-framework)
  - [Boundary Enforcement Mechanism](#boundary-enforcement-mechanism)
- [EXEC Boundary Check Protocol](#exec-boundary-check-protocol)
- [Part 2: Context Window Management](#part-2-context-window-management)
  - [The Challenge](#the-challenge)
  - [Context Window Strategy](#context-window-strategy)
- [Context Window Management Rules](#context-window-management-rules)
  - [At Each Handoff:](#at-each-handoff)
  - [During Long Tasks:](#during-long-tasks)
  - [Context Budget:](#context-budget)
- [Compression Strategies](#compression-strategies)
- [Part 3: Specialized Sub-Agent Skills](#part-3-specialized-sub-agent-skills)
  - [Core Sub-Agent Types](#core-sub-agent-types)
  - [Sub-Agent Activation Protocol](#sub-agent-activation-protocol)
- [When to Activate Sub-Agents](#when-to-activate-sub-agents)
  - [Automatic Activation (based on PRD keywords):](#automatic-activation-based-on-prd-keywords)
  - [Manual Activation (EXEC decision):](#manual-activation-exec-decision)
  - [Sub-Agent Collaboration:](#sub-agent-collaboration)
- [Part 4: Integrated Workflow](#part-4-integrated-workflow)
  - [Enhanced EXEC Workflow with Boundaries & Sub-Agents](#enhanced-exec-workflow-with-boundaries-sub-agents)
- [EXEC Agent Enhanced Workflow](#exec-agent-enhanced-workflow)
  - [1. Receive Handoff from PLAN](#1-receive-handoff-from-plan)
  - [2. Boundary Verification](#2-boundary-verification)
  - [3. Sub-Agent Activation](#3-sub-agent-activation)
  - [4. Context Management](#4-context-management)
  - [5. Implementation (Within Boundaries)](#5-implementation-within-boundaries)
  - [6. Sub-Agent Integration](#6-sub-agent-integration)
  - [7. Boundary Final Check](#7-boundary-final-check)
  - [8. Context Handoff Preparation](#8-context-handoff-preparation)
- [Part 5: Enforcement and Monitoring](#part-5-enforcement-and-monitoring)
  - [Boundary Violation Detection](#boundary-violation-detection)
  - [Context Window Monitoring](#context-window-monitoring)
- [Part 6: Success Metrics](#part-6-success-metrics)
  - [Boundary Compliance Metrics](#boundary-compliance-metrics)
  - [Context Management Metrics](#context-management-metrics)
  - [Sub-Agent Effectiveness](#sub-agent-effectiveness)
- [Implementation Checklist](#implementation-checklist)
- [Conclusion](#conclusion)

**Status**: Critical Enhancement
**Date**: 2025-08-30
**Based On**: User Feedback on EXEC Agent Behavior

---

## Executive Summary

This enhancement addresses three critical issues:
1. **EXEC agents taking excessive liberties** outside SD/PRD boundaries
2. **Context window management** not being tracked or optimized
3. **Specialized sub-agent skills** not being utilized effectively

---

## Part 1: Agent Boundary Enforcement

### The Problem
EXEC agents sometimes interpret requirements creatively, going beyond the scope defined by LEAD (SD) and PLAN (PRD), which can lead to:
- Scope creep
- Unexpected implementations
- Wasted effort on out-of-scope features
- Confusion about deliverables

### Boundary Definition Framework

#### 1.1 LEAD Agent Boundaries
```yaml
lead_boundaries:
  must_stay_within:
    - Business objectives and constraints
    - Resource limitations (time, budget, people)
    - Strategic company direction
    - Compliance and regulatory requirements
    
  cannot_do:
    - Change fundamental business requirements
    - Ignore stakeholder constraints
    - Create technical specifications
    - Make implementation decisions
    
  creative_freedom:
    - How to frame the problem
    - Success metric definitions
    - Risk assessment approach
    - Prioritization of objectives
```

#### 1.2 PLAN Agent Boundaries
```yaml
plan_boundaries:
  must_stay_within:
    - Strategic Directive objectives
    - Technical feasibility constraints
    - Existing system architecture
    - Performance requirements
    
  cannot_do:
    - Change business objectives
    - Ignore SD requirements
    - Make business decisions
    - Implement code
    
  creative_freedom:
    - Technical approach selection
    - Architecture decisions (within constraints)
    - Tool and framework choices
    - Implementation sequencing
```

#### 1.3 EXEC Agent Boundaries (CRITICAL)
```yaml
exec_boundaries:
  must_stay_within:
    - PRD technical specifications
    - Defined acceptance criteria
    - Approved technology stack
    - Performance targets
    - Code style guidelines
    
  cannot_do:
    - Add features not in PRD
    - Change architecture decisions
    - Use unapproved technologies
    - Ignore test requirements
    - Skip defined steps
    
  creative_freedom:
    - Implementation details (algorithms, data structures)
    - Code organization (within architecture)
    - Error handling approaches
    - Optimization techniques
    - Testing strategies (meeting coverage requirements)
```

### Boundary Enforcement Mechanism

```markdown
## EXEC Boundary Check Protocol

Before implementing ANYTHING, EXEC must verify:

1. **Is this in the PRD?**
   - [ ] Feature explicitly mentioned
   - [ ] Requirement documented
   - [ ] Success criteria defined

2. **Is this in scope?**
   - [ ] Within technical specifications
   - [ ] Using approved technologies
   - [ ] Following defined architecture

3. **Is this creative addition valuable?**
   - [ ] Enhances PRD requirement (not replaces)
   - [ ] Doesn't add complexity
   - [ ] Doesn't increase timeline
   - [ ] Has clear value proposition

If ANY answer is NO → STOP and request clarification
```

---

## Part 2: Context Window Management

### The Challenge
LLM context windows are limited. Poor management leads to:
- Lost information from earlier in conversation
- Repeated work
- Inconsistent decisions
- Degraded performance

### Context Window Strategy

#### 2.1 Context Priority System
```yaml
context_priority:
  tier_1_critical: # Never drop these
    - Current Strategic Directive
    - Active PRD section
    - Current task checklist
    - Active error states
    - Handoff requirements
    
  tier_2_important: # Keep if possible
    - Recent decisions made
    - Test results
    - Configuration details
    - Dependencies list
    - Recent code changes
    
  tier_3_helpful: # Drop if needed
    - Historical conversation
    - Completed task details
    - Old error messages
    - Previous iterations
    - Example code
```

#### 2.2 Context Management Protocol
```markdown
## Context Window Management Rules

### At Each Handoff:
1. **Summarize completed work** (max 500 tokens)
2. **Extract key decisions** (bullet points)
3. **Drop verbose history** (keep only summaries)
4. **Preserve critical references** (file paths, IDs)

### During Long Tasks:
1. **Checkpoint every 30 minutes**
   - Save current state
   - Summarize progress
   - Clear old context
   
2. **Use external storage**
   - Write summaries to files
   - Reference instead of include
   - Use file paths not content

### Context Budget:
- Strategic Directive: 1,000 tokens max
- PRD: 2,000 tokens max  
- Current task: 1,000 tokens max
- Code context: 3,000 tokens max
- Conversation history: 2,000 tokens max
- Reserve: 1,000 tokens

Total Budget: ~10,000 tokens (safe margin)
```

#### 2.3 Context Compression Techniques
```markdown
## Compression Strategies

1. **Summarization**
   - Long explanations → bullet points
   - Verbose errors → key message only
   - Multiple attempts → final solution only

2. **Externalization**
   - Code → file references
   - Logs → summary + file path
   - Data → statistics not full sets

3. **Deduplication**
   - Remove repeated information
   - Consolidate similar items
   - Use references to earlier mentions

4. **Prioritization**
   - Keep only active/relevant items
   - Archive completed tasks
   - Remove outdated information
```

---

## Part 3: Specialized Sub-Agent Skills

### Core Sub-Agent Types

#### 3.1 Design Sub-Agent
```yaml
design_agent:
  responsibilities:
    - UI/UX design decisions
    - Component architecture
    - Design system compliance
    - Responsive design
    - Accessibility standards
    
  activation_triggers:
    - UI components in PRD
    - Design system mentioned
    - User experience requirements
    - Visual elements needed
    
  deliverables:
    - Component designs
    - Style specifications
    - Interaction patterns
    - Accessibility checklist
    
  boundaries:
    - Must follow design system
    - Cannot change business logic
    - Must meet accessibility standards
```

#### 3.2 Security Sub-Agent
```yaml
security_agent:
  responsibilities:
    - Security vulnerability assessment
    - Authentication/authorization implementation
    - Data encryption requirements
    - Compliance verification
    - Security best practices
    
  activation_triggers:
    - Auth mentioned in PRD
    - Sensitive data handling
    - External API integration
    - User data processing
    - Payment processing
    
  deliverables:
    - Security assessment report
    - Implementation guidelines
    - Compliance checklist
    - Vulnerability scan results
    
  boundaries:
    - Cannot compromise functionality
    - Must follow OWASP guidelines
    - Cannot ignore compliance requirements
```

#### 3.3 Performance Sub-Agent
```yaml
performance_agent:
  responsibilities:
    - Performance optimization
    - Load testing
    - Caching strategies
    - Database optimization
    - Bundle size optimization
    
  activation_triggers:
    - Performance requirements in PRD
    - Load time specifications
    - Scalability mentioned
    - High traffic expected
    
  deliverables:
    - Performance metrics
    - Optimization recommendations
    - Caching implementation
    - Load test results
    
  boundaries:
    - Cannot break functionality
    - Must maintain code readability
    - Cannot exceed complexity budget
```

#### 3.4 Testing Sub-Agent
```yaml
testing_agent:
  responsibilities:
    - Test strategy development
    - Test case creation
    - Coverage analysis
    - E2E test scenarios
    - Regression testing
    
  activation_triggers:
    - Test requirements in PRD
    - Coverage targets specified
    - Critical functionality
    - Complex business logic
    
  deliverables:
    - Test plans
    - Test cases
    - Coverage reports
    - Test automation scripts
    
  boundaries:
    - Must meet coverage requirements
    - Cannot skip critical paths
    - Must follow testing pyramid
```

#### 3.5 Database Sub-Agent
```yaml
database_agent:
  responsibilities:
    - Schema design
    - Query optimization
    - Migration scripts
    - Data integrity
    - Backup strategies
    
  activation_triggers:
    - Database changes needed
    - Performance issues
    - New data requirements
    - Schema migrations
    
  deliverables:
    - Schema designs
    - Migration scripts
    - Query optimizations
    - Index recommendations
    
  boundaries:
    - Cannot break existing data
    - Must maintain backwards compatibility
    - Cannot ignore ACID properties
```

### Sub-Agent Activation Protocol

```markdown
## When to Activate Sub-Agents

### Automatic Activation (based on PRD keywords):
- "security" → Security Sub-Agent
- "performance" → Performance Sub-Agent
- "design" or "UI" → Design Sub-Agent
- "database" or "schema" → Database Sub-Agent
- "test" or "coverage" → Testing Sub-Agent

### Manual Activation (EXEC decision):
IF task complexity > threshold THEN
  IF security_risk > low THEN activate Security Sub-Agent
  IF ui_complexity > medium THEN activate Design Sub-Agent
  IF data_complexity > medium THEN activate Database Sub-Agent
  IF performance_critical THEN activate Performance Sub-Agent
END IF

### Sub-Agent Collaboration:
- Sub-agents can work in parallel
- Results consolidated by main EXEC
- Conflicts resolved by PLAN agent
- Handoffs include sub-agent reports
```

---

## Part 4: Integrated Workflow

### Enhanced EXEC Workflow with Boundaries & Sub-Agents

```markdown
## EXEC Agent Enhanced Workflow

### 1. Receive Handoff from PLAN
- Review PRD requirements
- Identify boundaries
- Check context window usage

### 2. Boundary Verification
- [ ] All requirements from PRD listed
- [ ] No out-of-scope additions identified
- [ ] Creative additions documented and justified
- [ ] Boundaries clearly understood

### 3. Sub-Agent Activation
- [ ] Analyze task complexity
- [ ] Identify specialized needs
- [ ] Activate relevant sub-agents
- [ ] Define sub-agent deliverables

### 4. Context Management
- [ ] Current context size: _____ tokens
- [ ] Tier 1 items preserved
- [ ] Old context archived
- [ ] External storage utilized

### 5. Implementation (Within Boundaries)
- Follow PRD specifications exactly
- Apply creativity within defined limits
- Use sub-agent recommendations
- Track context usage

### 6. Sub-Agent Integration
- Collect sub-agent reports
- Integrate recommendations
- Resolve conflicts
- Document decisions

### 7. Boundary Final Check
- [ ] All PRD requirements met
- [ ] No unauthorized additions
- [ ] Creative additions documented
- [ ] Within technical specifications

### 8. Context Handoff Preparation
- Summarize implementation (500 tokens)
- Key decisions list
- Sub-agent reports attached
- Context window cleaned
```

---

## Part 5: Enforcement and Monitoring

### Boundary Violation Detection

```python
# Pseudo-code for boundary checking
def check_boundaries(implementation, prd, sd):
    violations = []
    
    # Check for out-of-scope features
    for feature in implementation.features:
        if feature not in prd.requirements:
            violations.append(f"Out of scope: {feature}")
    
    # Check for unauthorized technologies
    for tech in implementation.technologies:
        if tech not in prd.approved_stack:
            violations.append(f"Unauthorized tech: {tech}")
    
    # Check for changed architecture
    if implementation.architecture != prd.architecture:
        violations.append("Architecture deviation detected")
    
    return violations
```

### Context Window Monitoring

```yaml
context_monitor:
  check_frequency: every_10_messages
  warning_threshold: 8000_tokens
  critical_threshold: 9500_tokens
  
  actions_on_warning:
    - Summarize old context
    - Archive completed tasks
    - Compress verbose content
    
  actions_on_critical:
    - Force summarization
    - Drop tier 3 items
    - External storage mandatory
    - Checkpoint current state
```

---

## Part 6: Success Metrics

### Boundary Compliance Metrics
- Scope creep incidents: Target < 5%
- PRD compliance rate: Target > 95%
- Creative additions approved: Target > 80%
- Boundary violations: Target = 0

### Context Management Metrics
- Context overflow incidents: Target < 10%
- Information loss events: Target < 5%
- Successful handoffs: Target > 95%
- Context size average: Target < 8000 tokens

### Sub-Agent Effectiveness
- Activation accuracy: Target > 90%
- Quality improvement: Target > 20%
- Time saved: Target > 15%
- Defect reduction: Target > 30%

---

## Implementation Checklist

- [ ] Update EXEC agent instructions with boundary rules
- [ ] Implement context monitoring system
- [ ] Create sub-agent activation triggers
- [ ] Add boundary check to handoff protocol
- [ ] Create context summarization templates
- [ ] Define sub-agent interfaces
- [ ] Update PRD template with boundary section
- [ ] Add context budget to handoff checklist
- [ ] Create sub-agent skill registry
- [ ] Implement violation detection system

---

## Conclusion

These enhancements ensure:
1. **EXEC stays within boundaries** while maintaining creative problem-solving
2. **Context is actively managed** to prevent information loss
3. **Specialized skills are utilized** through sub-agents when needed

The result: More predictable, higher quality implementations that meet requirements without surprises.

---

*LEO Protocol v3.3.0 - Enhancing Precision and Capabilities*
*Created: 2025-08-30*