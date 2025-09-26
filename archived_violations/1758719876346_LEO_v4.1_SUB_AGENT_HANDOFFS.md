# LEO Protocol v4.1 - Sub-Agent Handoff System

**Version**: 4.1.1  
**Status**: Active  
**Date**: 2025-09-01  
**Enhancement**: Sub-Agent Handoff Automation and Communication Protocols

---

## Sub-Agent Activation & Handoff Matrix

### Mandatory Activation Triggers in PRD Analysis

When EXEC reads a PRD, it MUST scan for these trigger phrases and automatically activate corresponding sub-agents:

| Sub-Agent | Activation Triggers | Handoff Point | Required Actions |
|-----------|-------------------|---------------|------------------|
| **Testing Sub-Agent** | `coverage >80%`, `e2e testing`, `visual inspection`, `playwright`, `automated testing` | During EXEC Implementation | Full automated testing + report |
| **Security Sub-Agent** | `authentication`, `authorization`, `PII`, `encryption`, `security`, `OWASP`, `sensitive data` | Before EXEC starts | Security review + implementation |
| **Performance Sub-Agent** | `load time <Xs`, `>X users`, `performance metrics`, `optimization`, `bundle size`, `memory` | During EXEC Implementation | Performance validation + optimization |
| **Design Sub-Agent** | `UI/UX`, `responsive`, `accessibility`, `WCAG`, `design system`, `animation` | Before EXEC starts | Design validation + implementation |
| **Database Sub-Agent** | `schema`, `migration`, `database`, `query optimization`, `indexing`, `data integrity` | Before EXEC starts | Database design + implementation |

---

## Standard Sub-Agent Handoff Communication Protocol

### Universal Handoff Template Structure

Every sub-agent handoff MUST follow this exact 7-element structure:

#### Template: EXEC → SUB-AGENT Handoff

```markdown
SUB-AGENT ACTIVATION HANDOFF

From: EXEC Agent
To: [SUB-AGENT] Agent  
Date: [ISO Date]
PRD Reference: [PRD-ID]
Activation Trigger: [Specific trigger phrase from PRD]

1. EXECUTIVE SUMMARY (≤200 tokens)
Sub-Agent: [Testing/Security/Performance/Design/Database]
Activation Reason: [Specific PRD requirement triggering activation]
Scope: [Specific area of responsibility]
Priority: [Critical/High/Medium/Low]
Expected Deliverable: [What EXEC needs back]

2. SCOPE & REQUIREMENTS
Primary Objectives:
- [Objective 1 from PRD]
- [Objective 2 from PRD]
- [Objective 3 from PRD]

Success Criteria:
- [Measurable criterion 1]
- [Measurable criterion 2]
- [Measurable criterion 3]

Out of Scope:
- [What sub-agent should NOT do]

3. CONTEXT PACKAGE
PRD Requirements: [Relevant sections]
Technical Stack: [Languages/frameworks in use]
Existing Constraints: [Budget/time/technical limits]
Integration Points: [How sub-agent work fits with main implementation]

4. DELIVERABLES MANIFEST
Required Outputs:
- [Deliverable 1]: [Format/location expected]
- [Deliverable 2]: [Format/location expected]
- [Report/Analysis]: [Specific format needed]

Supporting Documentation:
- [Document type 1]
- [Document type 2]

5. SUCCESS CRITERIA & VALIDATION
Acceptance Criteria:
- [ ] [Specific measurable outcome 1]
- [ ] [Specific measurable outcome 2] 
- [ ] [Specific measurable outcome 3]

Quality Gates:
- Performance threshold: [If applicable]
- Security standard: [If applicable]  
- Test coverage: [If applicable]

6. RESOURCE ALLOCATION
Context Budget: [Token limit for sub-agent]
Time Constraint: [Deadline]
External Dependencies: [APIs, services, tools needed]
Escalation Path: [When to escalate back to EXEC]

7. HANDOFF REQUIREMENTS
Immediate Actions Required:
1. [Specific action with deadline]
2. [Specific action with deadline]
3. [Specific action with deadline]

Review Checkpoints:
- [ ] Initial approach confirmation (within 1 hour)
- [ ] Mid-point progress review (at 50% completion)
- [ ] Final deliverable handback (by deadline)

HANDOFF STATUS: Activated - Sub-agent may proceed
```

---

## Sub-Agent Specific Handoff Protocols

### Testing Sub-Agent Handoff

#### Activation Decision Tree
```
EXEC scans PRD for testing keywords
  ↓
Found: coverage >80% → MUST activate
  ↓
Found: e2e testing → MUST activate  
  ↓
Found: visual inspection → MUST activate
  ↓
Found: >10 test scenarios → MUST activate
  ↓
Any testing keyword → SHOULD activate
```

#### Testing Sub-Agent Handoff Template
```markdown
TESTING SUB-AGENT ACTIVATION

From: EXEC Agent
To: Testing Sub-Agent
Activation: [coverage >80% | e2e | visual | automated]

TESTING SCOPE:
□ Unit Testing (Coverage: [%])
□ Integration Testing  
□ E2E Testing
□ Visual Regression Testing
□ Performance Testing
□ Accessibility Testing

AUTOMATED EXECUTION REQUIRED:
✅ Full automation - no manual intervention
✅ Visual screenshots for all components
✅ Responsive design validation
✅ Error state capture
✅ Automated report generation

DELIVERABLES:
- Automated test execution report
- Visual inspection screenshots  
- Performance metrics
- Accessibility compliance report
- Test coverage analysis

INTEGRATION POINT:
Testing Sub-Agent completes → Reports to EXEC → EXEC integrates into main deliverable → PLAN receives comprehensive package
```

### Security Sub-Agent Handoff

#### Security Sub-Agent Handoff Template
```markdown
SECURITY SUB-AGENT ACTIVATION

From: EXEC Agent  
To: Security Sub-Agent
Activation: [authentication | PII | encryption | OWASP]

SECURITY SCOPE:
□ Authentication/Authorization implementation
□ Data encryption requirements
□ PII handling protocols
□ API security measures
□ OWASP compliance validation

CRITICAL REQUIREMENTS:
⚠️  No hardcoded secrets
⚠️  Proper encryption implementation
⚠️  Input validation and sanitization
⚠️  Secure session management

DELIVERABLES:
- Security implementation code
- Threat analysis report
- OWASP compliance checklist
- Penetration testing results
- Security documentation

INTEGRATION POINT:
Security Sub-Agent → Security-hardened code → EXEC → Main implementation
```

### Performance Sub-Agent Handoff

#### Performance Sub-Agent Handoff Template
```markdown
PERFORMANCE SUB-AGENT ACTIVATION

From: EXEC Agent
To: Performance Sub-Agent  
Activation: [load time | scalability | optimization]

PERFORMANCE TARGETS:
- Load time: [<X seconds]
- Concurrent users: [>X users]
- Bundle size: [<X MB]
- Memory usage: [<X MB]

OPTIMIZATION SCOPE:
□ Frontend performance optimization
□ Backend query optimization  
□ Resource loading optimization
□ Caching strategy implementation

DELIVERABLES:
- Performance-optimized code
- Benchmark test results
- Load testing report  
- Optimization recommendations
- Performance monitoring setup

INTEGRATION POINT:
Performance Sub-Agent → Optimized implementation → EXEC → Performance-validated deliverable
```

### Design Sub-Agent Handoff

#### Design Sub-Agent Handoff Template  
```markdown
DESIGN SUB-AGENT ACTIVATION

From: EXEC Agent
To: Design Sub-Agent
Activation: [UI/UX | responsive | accessibility | WCAG]

DESIGN REQUIREMENTS:
□ Responsive design (mobile-first)
□ Accessibility compliance (WCAG 2.1 AA)
□ Design system consistency
□ Animation/interaction design
□ Visual hierarchy optimization

TECHNICAL CONSTRAINTS:
- Framework: [React/Vue/Angular/etc]
- Design System: [Material/Bootstrap/Custom]
- Browser Support: [IE11+/Modern/etc]

DELIVERABLES:
- Component implementations
- Responsive design validation
- Accessibility audit report
- Design system documentation
- Visual regression tests

INTEGRATION POINT:
Design Sub-Agent → UI/UX implementation → EXEC → User-validated deliverable
```

### Database Sub-Agent Handoff

#### Database Sub-Agent Handoff Template
```markdown
DATABASE SUB-AGENT ACTIVATION

From: EXEC Agent
To: Database Sub-Agent  
Activation: [schema | migration | query optimization]

DATABASE SCOPE:
□ Schema design/modification
□ Migration script creation
□ Query optimization
□ Index management
□ Data integrity constraints

TECHNICAL CONTEXT:
- Database: [PostgreSQL/MySQL/MongoDB/etc]
- ORM: [Prisma/TypeORM/Sequelize/etc]
- Current Schema: [Location/description]

DELIVERABLES:
- Database schema updates
- Migration scripts
- Optimized queries
- Performance analysis
- Data integrity tests

INTEGRATION POINT:
Database Sub-Agent → Schema/queries → EXEC → Data-layer complete implementation
```

---

## Sub-Agent → EXEC Handback Protocol

### Universal Handback Template

```markdown
SUB-AGENT COMPLETION HANDBACK

From: [SUB-AGENT] Agent
To: EXEC Agent
Date: [ISO Date]
Original Handoff: [Reference ID]

1. COMPLETION SUMMARY (≤200 tokens)
Sub-Agent: [Type]
Status: [Complete/Partial/Blocked] 
Completion Rate: [%]
Key Achievement: [Primary accomplishment]
Integration Ready: [Yes/No]

2. DELIVERABLES PACKAGE
Primary Outputs:
✅ [Deliverable 1]: [path/location]
✅ [Deliverable 2]: [path/location]
✅ [Report/Analysis]: [path/location]

Verification Evidence:
✅ [Test results]: [location]
✅ [Performance metrics]: [location]
✅ [Compliance checklist]: [location]

3. INTEGRATION INSTRUCTIONS
Code Integration:
1. [Specific integration step 1]
2. [Specific integration step 2]
3. [Specific integration step 3]

Dependencies Added:
- [Package/library 1]
- [Package/library 2]

Configuration Changes:
- [Config file 1]: [changes made]
- [Config file 2]: [changes made]

4. QUALITY ASSURANCE
Validation Completed:
✅ Self-testing performed
✅ Edge cases covered  
✅ Error handling implemented
✅ Documentation updated

Known Limitations:
⚠️  [Limitation 1 + impact]
⚠️  [Limitation 2 + impact]

5. HANDBACK REQUIREMENTS
Immediate EXEC Actions:
1. [Integration task 1 - Priority: High]
2. [Integration task 2 - Priority: Medium]
3. [Validation task 3 - Priority: High]

Follow-up Required:
- [ ] [Ongoing monitoring needed]
- [ ] [Future enhancement planned]

HANDBACK STATUS: Complete - Ready for EXEC integration
```

---

## EXEC Sub-Agent Integration Workflow

### Integration Process

```
1. EXEC activates sub-agent (using handoff template)
   ↓
2. Sub-agent executes specialized work
   ↓
3. Sub-agent hands back (using handback template)
   ↓
4. EXEC validates sub-agent deliverables
   ↓
5. EXEC integrates into main implementation
   ↓
6. EXEC includes sub-agent results in handback to PLAN
```

### EXEC Integration Checklist

When receiving sub-agent handbacks, EXEC MUST:

- [ ] Validate all deliverables are accessible
- [ ] Test sub-agent integration locally
- [ ] Verify no conflicts with main implementation
- [ ] Include sub-agent results in overall testing
- [ ] Document sub-agent contributions in final deliverable
- [ ] Include sub-agent analysis in PLAN handback

---

## Automated Sub-Agent Activation Script

### Implementation: `scripts/activate-sub-agents.js`

```javascript
// Auto-scan PRD and activate required sub-agents
const activationTriggers = {
  testing: ['coverage >80%', 'e2e', 'visual inspection', 'playwright'],
  security: ['authentication', 'encryption', 'PII', 'OWASP'],
  performance: ['load time', 'scalability', 'optimization', 'performance'],
  design: ['UI/UX', 'responsive', 'accessibility', 'WCAG'],
  database: ['schema', 'migration', 'database', 'query optimization']
};

function scanPRDAndActivateSubAgents(prdContent) {
  const activatedAgents = [];
  
  for (const [agent, triggers] of Object.entries(activationTriggers)) {
    const shouldActivate = triggers.some(trigger => 
      prdContent.toLowerCase().includes(trigger.toLowerCase())
    );
    
    if (shouldActivate) {
      activatedAgents.push({
        agent,
        trigger: triggers.find(t => prdContent.toLowerCase().includes(t.toLowerCase())),
        handoffTemplate: `handoff-templates/${agent}-handoff.md`
      });
    }
  }
  
  return activatedAgents;
}
```

---

## Compliance Validation

### Sub-Agent Handoff Validation Script

```bash
# Validate handoff completeness
node scripts/validate-sub-agent-handoff.js [sub-agent-type] [handoff-file]

# Check handoff format compliance  
node scripts/check-handoff-format.js [handoff-file]

# Verify all sub-agents completed
node scripts/verify-sub-agent-completion.js [prd-id]
```

---

## Success Metrics for Sub-Agent System

| Metric | Target | Notes |
|--------|--------|-------|
| Auto-activation Accuracy | >95% | Correct trigger detection |
| Handoff Format Compliance | 100% | All 7 elements present |
| Sub-Agent Completion Rate | >90% | Successfully complete assigned work |
| Integration Success Rate | >95% | EXEC successfully integrates deliverables |
| Communication Clarity Score | >90% | Handoffs understood without clarification |

---

*LEO Protocol v4.1.1 - Complete Sub-Agent Automation*  
*Fully automated sub-agent activation, execution, and integration*