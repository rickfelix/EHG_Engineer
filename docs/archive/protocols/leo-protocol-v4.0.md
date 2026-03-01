---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# LEO Protocol v4.0 - Complete Implementation Guide


## Table of Contents

- [Executive Summary](#executive-summary)
  - [Key Improvements](#key-improvements)
- [Core Architecture](#core-architecture)
  - [Agent Hierarchy](#agent-hierarchy)
  - [Context Window Management](#context-window-management)
- [Agent Specifications](#agent-specifications)
  - [LEAD Agent](#lead-agent)
  - [PLAN Agent](#plan-agent)
  - [EXEC Agent](#exec-agent)
- [Sub-Agent Specifications](#sub-agent-specifications)
  - [Automatic Activation Triggers](#automatic-activation-triggers)
  - [Sub-Agent Capabilities](#sub-agent-capabilities)
- [Handoff Control System](#handoff-control-system)
  - [Mandatory Checkpoints](#mandatory-checkpoints)
  - [Exception Process](#exception-process)
  - [Handoff Automation](#handoff-automation)
- [Context Management System](#context-management-system)
  - [Monitoring Commands](#monitoring-commands)
  - [Context Thresholds](#context-thresholds)
  - [Optimization Strategies](#optimization-strategies)
  - [Emergency Recovery](#emergency-recovery)
- [CLAUDE.md Integration](#claudemd-integration)
  - [File Hierarchy](#file-hierarchy)
  - [Essential Commands](#essential-commands)
  - [Agent Templates](#agent-templates)
- [Implementation Workflow](#implementation-workflow)
  - [Complete SD Lifecycle](#complete-sd-lifecycle)
  - [Quality Gates](#quality-gates)
- [Success Metrics](#success-metrics)
  - [Target Performance](#target-performance)
  - [Monitoring Dashboard](#monitoring-dashboard)
- [Repository Structure](#repository-structure)
  - [LEO Protocol Framework](#leo-protocol-framework)
  - [Implementation Projects](#implementation-projects)
- [Common Issues and Solutions](#common-issues-and-solutions)
  - [Issue: Context Overflow](#issue-context-overflow)
  - [Issue: Boundary Violation](#issue-boundary-violation)
  - [Issue: Handoff Blocked](#issue-handoff-blocked)
  - [Issue: Sub-Agent Not Activated](#issue-sub-agent-not-activated)
- [Migration from v3.x](#migration-from-v3x)
  - [Breaking Changes](#breaking-changes)
  - [Migration Steps](#migration-steps)
- [Best Practices](#best-practices)
  - [DO's](#dos)
  - [DON'Ts](#donts)
- [Conclusion](#conclusion)

**Version**: 4.0.0
**Status**: Active
**Date**: 2025-08-31
**Previous Version**: 3.3.0

---

## Executive Summary

LEO Protocol v4.0 represents a major evolution, incorporating all lessons learned from real-world implementations. This version introduces mandatory handoff control points, strict boundary enforcement, sophisticated context management, and specialized sub-agent capabilities.

### Key Improvements
- **Mandatory Handoff Checklists**: Control points that enforce quality gates
- **Boundary Enforcement**: Strict scope control preventing agent overreach
- **Context Management**: Proactive token monitoring and optimization
- **Sub-Agent Specialization**: Dedicated experts for specific domains
- **CLAUDE.md Integration**: Leverages Claude Code's context system
- **Exception Process**: Human-in-the-loop for blocked handoffs

---

## Core Architecture

### Agent Hierarchy
```
LEAD Agent (Strategic)
    ↓ [Handoff Control Point]
PLAN Agent (Technical Planning)
    ↓ [Handoff Control Point]
EXEC Agent (Implementation)
    ├── Design Sub-Agent
    ├── Security Sub-Agent
    ├── Performance Sub-Agent
    ├── Testing Sub-Agent
    └── Database Sub-Agent
```

### Context Window Management
```yaml
Total Context: 200,000 tokens
Safety Margin: 20,000 tokens
Usable Context: 180,000 tokens

Token Budget:
  System Prompt: 5,000
  CLAUDE.md Files: 10,000
  Current SD: 5,000
  Current PRD: 10,000
  Code Context: 50,000
  Conversation: 100,000
```

---

## Agent Specifications

### LEAD Agent
**Role**: Strategic planning and directive creation

**Boundaries**:
- MUST stay within business objectives
- CANNOT make technical decisions
- Creative freedom in problem framing

**Required Outputs**:
1. Strategic Directive (SD-XXX)
2. Success criteria (measurable)
3. Resource assessment
4. Risk analysis
5. Feasibility confirmation

**Handoff Checklist** (9/9 required):
- [ ] SD created and saved
- [ ] Business objectives defined
- [ ] Success metrics measurable
- [ ] Constraints documented
- [ ] Risks identified
- [ ] Feasibility confirmed
- [ ] Environment health checked
- [ ] Context usage < 30%
- [ ] Summary created (500 tokens)

### PLAN Agent
**Role**: Technical planning and PRD creation

**Boundaries**:
- MUST follow SD objectives
- CANNOT change business requirements
- Creative freedom in technical approach

**Required Outputs**:
1. Product Requirements Document (PRD)
2. Technical specifications
3. Architecture approach
4. Test plan
5. Risk mitigation

**Handoff Checklist** (9/9 required):
- [ ] PRD created and saved
- [ ] SD requirements mapped
- [ ] Technical specs complete
- [ ] Prerequisites verified
- [ ] Test requirements defined
- [ ] Acceptance criteria clear
- [ ] Risk mitigation planned
- [ ] Context usage < 40%
- [ ] Summary created (500 tokens)

### EXEC Agent
**Role**: Implementation and deployment

**Boundaries** (CRITICAL):
- MUST stay within PRD specifications
- CANNOT add unrequested features
- Creative freedom in implementation details

**Boundary Check Protocol**:
Before implementing ANYTHING:
1. Is this in the PRD?
2. Is this in scope?
3. Is creative addition valuable?
If ANY answer is NO → STOP

**Required Outputs**:
1. Working implementation
2. Test coverage
3. Documentation
4. Clean CI/CD pipeline
5. Deployment verification

**Handoff Checklist** (9/9 required):
- [ ] PRD requirements met
- [ ] Tests passing
- [ ] Lint checks passing
- [ ] Type checks passing
- [ ] Build successful
- [ ] CI/CD green
- [ ] Documentation updated
- [ ] Context usage < 60%
- [ ] Summary created (500 tokens)

---

## Sub-Agent Specifications

### Automatic Activation Triggers
```yaml
triggers:
  security: [auth, sensitive data, payments]
  performance: [load time, scalability, optimization]
  design: [UI, UX, components, accessibility]
  database: [schema, migrations, queries]
  testing: [coverage, E2E, regression]
```

### Sub-Agent Capabilities

#### Design Sub-Agent
- UI/UX implementation
- Design system compliance
- Accessibility (WCAG 2.1 AA)
- Responsive design
- Animation performance

#### Security Sub-Agent
- OWASP compliance
- Authentication/authorization
- Input validation
- XSS/CSRF prevention
- Encryption implementation

#### Performance Sub-Agent
- Load time optimization
- Bundle size reduction
- Caching strategies
- Database optimization
- Memory profiling

#### Testing Sub-Agent
- Test strategy development
- Coverage analysis (>80%)
- E2E scenarios
- Regression prevention
- Performance testing

#### Database Sub-Agent
- Schema design (3NF)
- Migration scripts
- Query optimization
- Index management
- Data integrity

---

## Handoff Control System

### Mandatory Checkpoints
```markdown
HANDOFF BLOCKED if checklist incomplete
↓
REQUEST EXCEPTION
↓
HUMAN APPROVAL REQUIRED
↓
PROCEED only with approval
```

### Exception Process
```yaml
exception_request:
  blocker: [specific items]
  reason: [justification]
  impact: [consequences]
  solution: [alternative]
  
human_review:
  approve: [yes/no]
  conditions: [if any]
```

### Handoff Automation
```bash
# Perform handoff with validation
node scripts/handoff-controller.js handoff LEAD-to-PLAN

# Check handoff status
node scripts/handoff-controller.js status

# Archive completed work
node scripts/handoff-controller.js archive EXEC implementation-complete
```

---

## Context Management System

### Monitoring Commands
```bash
# Check current usage
node scripts/context-monitor.js check

# Continuous monitoring
node scripts/context-monitor.js monitor 60

# Generate handoff summary
node scripts/context-monitor.js handoff LEAD
```

### Context Thresholds
- **70% Warning**: Run /compact
- **90% Critical**: Immediate action required
- **100% Overflow**: Emergency recovery

### Optimization Strategies
1. **Summarization**: Long content → bullet points
2. **Externalization**: Code → file references
3. **Deduplication**: Remove repetition
4. **Prioritization**: Keep only active items

### Emergency Recovery
```markdown
1. Run: /compact focus: "critical task"
2. Archive completed work to files
3. Create checkpoint with state
4. If still over: /clear and reload
```

---

## CLAUDE.md Integration

### File Hierarchy
```
1. .claude/CLAUDE.local.md    (highest priority)
2. ./CLAUDE.md                 (project root)
3. ~/.claude/CLAUDE.md         (global)
4. templates/claude-md/        (agent-specific)
```

### Essential Commands
- `/context` - Check token usage
- `/compact` - Summarize conversation
- `/clear` - Reset (use carefully)
- `/init` - Generate CLAUDE.md
- `/cost` - Track consumption

### Agent Templates
```bash
templates/claude-md/
├── CLAUDE.md              # Master configuration
├── agents/
│   ├── CLAUDE-LEAD.md     # LEAD agent context
│   ├── CLAUDE-PLAN.md     # PLAN agent context
│   └── CLAUDE-EXEC.md     # EXEC agent context
└── sub-agents/
    ├── CLAUDE-DESIGN.md   # Design specialist
    ├── CLAUDE-SECURITY.md # Security specialist
    └── ...                # Other specialists
```

---

## Implementation Workflow

### Complete SD Lifecycle
```markdown
1. LEAD AGENT
   - Create Strategic Directive
   - Define success criteria
   - Complete checklist
   - Handoff to PLAN

2. PLAN AGENT
   - Create PRD from SD
   - Define technical approach
   - Complete checklist
   - Handoff to EXEC

3. EXEC AGENT
   - Check boundaries
   - Activate sub-agents
   - Implement PRD exactly
   - Complete checklist
   - Deploy

4. VERIFICATION
   - All checklists complete
   - Tests passing
   - CI/CD green
   - Documentation updated
```

### Quality Gates
Each handoff must pass:
1. Checklist validation (9/9 items)
2. Context check (<threshold)
3. Boundary compliance
4. Summary generation
5. Archive completion

---

## Success Metrics

### Target Performance
| Metric | Target | Previous |
|--------|--------|----------|
| Context Overflows | < 5% | 50% |
| Handoff Time | < 5 min | 15 min |
| First-time Success | > 90% | 60% |
| Scope Creep | < 10% | 200% |
| Information Loss | 0% | 20% |
| Boundary Violations | 0 | Many |

### Monitoring Dashboard
```bash
# Full system check
npm run leo:status

# Performance metrics
npm run leo:metrics

# Handoff history
npm run leo:history
```

---

## Repository Structure

### LEO Protocol Framework
```
/mnt/c/_EHG/EHG_Engineer/
├── docs/
│   └── 03_protocols_and_standards/
│       └── leo_protocol_v4.0.md
├── scripts/
│   ├── context-monitor.js
│   ├── handoff-controller.js
│   └── leo.js
└── templates/
    └── claude-md/
```

### Implementation Projects
```
[Project Directory]/
├── docs/
│   ├── strategic-directives/
│   └── prds/
├── archives/
│   ├── lead/
│   ├── plan/
│   └── exec/
└── CLAUDE.md
```

---

## Common Issues and Solutions

### Issue: Context Overflow
**Solution**: 
1. Run `/compact focus: "current task"`
2. Archive to `archives/` directory
3. Use file references

### Issue: Boundary Violation
**Solution**:
1. Check PRD requirements
2. Request clarification
3. Get human approval for additions

### Issue: Handoff Blocked
**Solution**:
1. Complete checklist items
2. Request exception if truly blocked
3. Document justification

### Issue: Sub-Agent Not Activated
**Solution**:
1. Check PRD for trigger keywords
2. Manually activate if needed
3. Update trigger configuration

---

## Migration from v3.x

### Breaking Changes
1. Handoff checklists now mandatory
2. Boundaries strictly enforced
3. Context monitoring required
4. Sub-agents auto-activated

### Migration Steps
1. Update CLAUDE.md templates
2. Install monitoring scripts
3. Configure handoff controller
4. Train on new boundaries
5. Test with mock SD

---

## Best Practices

### DO's
✅ Complete checklists before handoff
✅ Monitor context proactively
✅ Stay within boundaries
✅ Use sub-agents for specialization
✅ Archive completed work
✅ Generate summaries
✅ Request exceptions when blocked

### DON'Ts
❌ Skip checklist items
❌ Ignore context warnings
❌ Add unrequested features
❌ Mix agent responsibilities
❌ Lose information in handoffs
❌ Exceed token budgets
❌ Bypass control points

---

## Conclusion

LEO Protocol v4.0 provides a robust, controlled, and efficient framework for AI-assisted software development. By enforcing boundaries, managing context, and utilizing specialized expertise, it delivers predictable, high-quality results while preventing common pitfalls.

The combination of mandatory control points and human exception handling ensures both automation efficiency and human oversight where needed.

---

*LEO Protocol v4.0 - Precision, Control, Excellence*
*For support: Create issue in EHG_Engineer repository*