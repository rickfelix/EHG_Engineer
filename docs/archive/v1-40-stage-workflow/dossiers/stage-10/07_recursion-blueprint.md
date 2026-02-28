---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 10: Recursion Blueprint


## Table of Contents

- [Intelligent Dependency-Driven Recursion](#intelligent-dependency-driven-recursion)
- [Outbound Recursion Triggers](#outbound-recursion-triggers)
- [PRIMARY TRIGGER: TECH-001 to Stage 8 (Blocking Issues)](#primary-trigger-tech-001-to-stage-8-blocking-issues)
  - [Full Recursion Logic (SC-004)](#full-recursion-logic-sc-004)
  - [Why Stage 8?](#why-stage-8)
  - [Trigger Data Payload (TECH-001 to Stage 8)](#trigger-data-payload-tech-001-to-stage-8)
  - [Issue Categorization Logic](#issue-categorization-logic)
- [SECONDARY TRIGGER: TECH-001 to Stage 7 (Timeline Impact)](#secondary-trigger-tech-001-to-stage-7-timeline-impact)
  - [Timeline Impact Calculation](#timeline-impact-calculation)
  - [Why Stage 7?](#why-stage-7)
  - [Timeline Impact Calculation Method](#timeline-impact-calculation-method)
- [TERTIARY TRIGGER: TECH-001 to Stage 5 (Cost Impact)](#tertiary-trigger-tech-001-to-stage-5-cost-impact)
  - [Cost Impact Calculation](#cost-impact-calculation)
  - [Why Stage 5?](#why-stage-5)
  - [Cost Impact Calculation Method](#cost-impact-calculation-method)
- [CRITICAL TRIGGER: TECH-001 to Stage 3 (Solution Infeasible)](#critical-trigger-tech-001-to-stage-3-solution-infeasible)
  - [Solution Feasibility Scoring](#solution-feasibility-scoring)
  - [Why Stage 3?](#why-stage-3)
  - [Feasibility Score Calculation](#feasibility-score-calculation)
- [Recursion Thresholds (Complete Table)](#recursion-thresholds-complete-table)
- [Inbound Recursion Triggers](#inbound-recursion-triggers)
  - [From Stage 14 (Development Preparation)](#from-stage-14-development-preparation)
  - [From Stage 22 (Development Iteration)](#from-stage-22-development-iteration)
- [Loop Prevention](#loop-prevention)
  - [Escalation After 3rd TECH-001](#escalation-after-3rd-tech-001)
- [Chairman Controls](#chairman-controls)
  - [CRITICAL Severity (Solution Infeasible)](#critical-severity-solution-infeasible)
  - [HIGH Severity (Blocking Issues, Timeline/Cost Impact)](#high-severity-blocking-issues-timelinecost-impact)
  - [Override Capability](#override-capability)
- [Performance Requirements](#performance-requirements)
- [UI/UX Implications](#uiux-implications)
  - [Technical Health Dashboard](#technical-health-dashboard)
  - [Recursion Warning Modal](#recursion-warning-modal)
  - [Comparison View (Post-Recursion)](#comparison-view-post-recursion)
- [Integration Points](#integration-points)
  - [Stage 8 (Problem Decomposition)](#stage-8-problem-decomposition)
  - [Stage 7 (Comprehensive Planning)](#stage-7-comprehensive-planning)
  - [Stage 5 (Profitability)](#stage-5-profitability)
  - [Stage 3 (Validation)](#stage-3-validation)
  - [validationFramework.ts](#validationframeworkts)
  - [recursionEngine.ts](#recursionenginets)
  - [recursion_events Table](#recursion_events-table)

**Status**: ✅ **DETAILED RECURSION SUPPORT**

**Consistency Scan Result**: Y/Y/Y (Detailed recursion implemented with full JavaScript code)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:29-193 "Recursive Workflow Behavior"

---

## Intelligent Dependency-Driven Recursion

Stage 10 is a **CRITICAL technical quality gate** in the unified venture creation system (SD-VENTURE-UNIFICATION-001). Technical feasibility issues discovered here can invalidate upstream assumptions about architecture, task decomposition, development approach, and financial viability, triggering recursion to earlier stages.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:29-32 "CRITICAL technical quality gate"

---

## Outbound Recursion Triggers

**Recursion Triggers FROM This Stage**:

| Target Stage | Trigger Type | Condition | Severity | Auto-Execute? | Reason |
|--------------|--------------|-----------|----------|---------------|--------|
| **Stage 8** | **TECH-001** | **Blocking technical issues** | **HIGH** | **Needs approval** | **PRIMARY TRIGGER (SC-004)**: Technical review reveals architecture limitations, technical debt concerns, or implementation complexity that invalidates task decomposition. Requires re-decomposition with technical constraints. |
| Stage 7 | TECH-001 | Timeline infeasible due to technical complexity | HIGH | Needs approval | Comprehensive Planning needs timeline adjustment based on technical reality |
| Stage 5 | TECH-001 | Development costs exceed financial projections | HIGH | Needs approval | Profitability forecasting needs update with accurate technical cost estimates |
| Stage 3 | TECH-001 | Solution technically infeasible | CRITICAL | Yes | Comprehensive Validation needs to reassess solution approach, may trigger Kill/Revise decision |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:34-41 "Recursion Triggers FROM This Stage"

---

## PRIMARY TRIGGER: TECH-001 to Stage 8 (Blocking Issues)

### Full Recursion Logic (SC-004)

**Implementation Code** (from critique lines 45-112):

```javascript
// Success Criteria SC-004: Stage 10 blocking technical issues trigger automatic recursion to Stage 8
async function onStage10Complete(ventureId, technicalReview) {
  const issues = technicalReview.categorizeIssues(); // BLOCKING, HIGH, MEDIUM, LOW

  // BLOCKING issues → Recurse to Stage 8 (HIGH severity, needs approval)
  if (issues.BLOCKING.length > 0) {
    await recursionEngine.triggerRecursion({
      ventureId,
      fromStage: 10,
      toStage: 8,
      triggerType: 'TECH-001',
      triggerData: {
        blocking_issues_count: issues.BLOCKING.length,
        blocking_issues: issues.BLOCKING.map(i => ({
          category: i.category, // architecture, scalability, security, tech_debt
          description: i.description,
          impact: i.impact,
          current_decomposition_affected: i.affectedTasks,
          suggested_fix: i.suggestedFix
        })),
        technical_debt_score: technicalReview.technicalDebtScore,
        scalability_rating: technicalReview.scalabilityRating,
        security_score: technicalReview.securityScore
      },
      severity: 'HIGH', // Requires Chairman approval
      autoExecuted: false,
      resolution_notes: `${issues.BLOCKING.length} blocking technical issues require re-decomposition:

        BLOCKING ISSUES:
        ${issues.BLOCKING.map((i, idx) => `${idx + 1}. [${i.category}] ${i.description}
           Impact: ${i.impact}
           Affected tasks: ${i.affectedTasks.join(', ')}
           Suggested fix: ${i.suggestedFix}`).join('\n\n        ')}

        RECOMMENDED ACTIONS:
        1. Re-decompose tasks in Stage 8 with technical constraints
        2. Consider alternative technical approaches for blocked areas
        3. May require scope reduction or additional resources`
    });
  }

  // HIGH issues → May trigger recursion to Stage 7 or 5
  if (issues.HIGH.length > 0 && technicalReview.timelineImpact > 30) {
    await recursionEngine.triggerRecursion({
      ventureId,
      fromStage: 10,
      toStage: 7,
      triggerType: 'TECH-001',
      severity: 'HIGH',
      autoExecuted: false,
      resolution_notes: `Technical complexity requires ${technicalReview.timelineImpact}% timeline extension`
    });
  }

  // CRITICAL issues → May trigger recursion to Stage 3 (solution infeasible)
  if (technicalReview.solutionFeasibility < 0.5) {
    await recursionEngine.triggerRecursion({
      ventureId,
      fromStage: 10,
      toStage: 3,
      triggerType: 'TECH-001',
      severity: 'CRITICAL',
      autoExecuted: true, // Solution infeasibility is auto-execute
      resolution_notes: `Solution approach is technically infeasible (feasibility score: ${technicalReview.solutionFeasibility}/1.0). Re-validation required with alternative technical approaches.`
    });
  }
}
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:45-112 "async function onStage10Complete"

---

### Why Stage 8?

**Re-Decomposition Requirements**:

Stage 8 (Problem Decomposition) created the Work Breakdown Structure (WBS) without full technical validation. Stage 10's comprehensive technical review may reveal:

1. **Architecture limitations**: WBS tasks assume architecture capabilities that don't exist or are prohibitively complex
2. **Technical debt concerns**: Existing codebase requires refactoring before new features can be added (WBS didn't account for this)
3. **Implementation complexity**: Tasks estimated at 2-3 days actually require 2-3 weeks due to technical constraints
4. **Technology stack issues**: WBS assumes technologies that are deprecated, unsupported, or incompatible

**What Needs to Change in Stage 8**:
- Re-decompose tasks with technical constraints documented
- Add technical debt reduction tasks to WBS
- Adjust task estimates based on technical complexity
- Consider alternative technical approaches for blocked areas
- Potentially reduce scope to eliminate technically infeasible tasks

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:71-78 "RECOMMENDED ACTIONS"

---

### Trigger Data Payload (TECH-001 to Stage 8)

**What Gets Passed to Stage 8**:

```javascript
{
  blocking_issues_count: 3,
  blocking_issues: [
    {
      category: "architecture",
      description: "Microservices architecture requires service mesh (Istio/Linkerd) not in current stack",
      impact: "Cannot implement tasks 8.3.2-8.3.5 (service-to-service communication) without service mesh",
      current_decomposition_affected: ["8.3.2", "8.3.3", "8.3.4", "8.3.5"],
      suggested_fix: "Add service mesh installation as prerequisite task, or revert to monolithic architecture for MVP"
    },
    {
      category: "tech_debt",
      description: "Legacy authentication system must be refactored before adding OAuth support",
      impact: "Tasks 8.4.1-8.4.3 (OAuth integration) blocked by legacy code, estimated 40 hours refactoring required",
      current_decomposition_affected: ["8.4.1", "8.4.2", "8.4.3"],
      suggested_fix: "Insert refactoring task before OAuth tasks, extend timeline by 1 week"
    },
    {
      category: "scalability",
      description: "Database schema does not support sharding, limits to 50k concurrent users",
      impact: "WBS assumes 100k concurrent users, but database architecture cannot scale beyond 50k",
      current_decomposition_affected: ["8.2.1", "8.2.4", "8.5.1"],
      suggested_fix: "Re-decompose database tasks to implement sharding strategy, or reduce user target to 50k"
    }
  ],
  technical_debt_score: 75,      // Above 70 threshold
  scalability_rating: 2.5,       // Below 3 stars threshold
  security_score: 65             // Above 60 (not blocking, but concerning)
}
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:59-68 "blocking_issues_count, blocking_issues"

---

### Issue Categorization Logic

**How Issues Are Categorized**:

```javascript
class TechnicalReview {
  categorizeIssues() {
    const issues = {
      BLOCKING: [],  // Prevents implementation, no reasonable workaround
      HIGH: [],      // Significantly impacts timeline/cost, but workarounds exist
      MEDIUM: [],    // Moderate impact, can be addressed during development
      LOW: []        // Minor issues, can be deferred to post-launch
    };

    this.reviewFindings.forEach(finding => {
      // BLOCKING criteria
      if (
        finding.preventsImplementation === true ||
        finding.affectedTasks.length > 0 && finding.hasWorkaround === false
      ) {
        issues.BLOCKING.push(finding);
      }
      // HIGH criteria
      else if (
        finding.timelineImpact > 20 || // >20% timeline extension
        finding.costImpact > 15 ||     // >15% cost increase
        finding.scopeReduction === true // Forces scope cut
      ) {
        issues.HIGH.push(finding);
      }
      // MEDIUM criteria
      else if (
        finding.timelineImpact > 5 ||  // 5-20% timeline impact
        finding.costImpact > 5 ||      // 5-15% cost impact
        finding.riskLevel === 'medium'
      ) {
        issues.MEDIUM.push(finding);
      }
      // LOW (everything else)
      else {
        issues.LOW.push(finding);
      }
    });

    return issues;
  }
}
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:48 "categorizeIssues()"

---

## SECONDARY TRIGGER: TECH-001 to Stage 7 (Timeline Impact)

### Timeline Impact Calculation

**When to Trigger**:
- Technical complexity requires timeline extension > 30% vs Stage 7 plan
- HIGH severity (requires Chairman approval)

**Implementation**:

```javascript
// From main recursion logic (lines 88-97)
if (issues.HIGH.length > 0 && technicalReview.timelineImpact > 30) {
  await recursionEngine.triggerRecursion({
    ventureId,
    fromStage: 10,
    toStage: 7,
    triggerType: 'TECH-001',
    severity: 'HIGH',
    autoExecuted: false, // Needs Chairman approval
    resolution_notes: `Technical complexity requires ${technicalReview.timelineImpact}% timeline extension`
  });
}
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:88-97 "timelineImpact > 30"

---

### Why Stage 7?

**Comprehensive Planning Needs Update**:

Stage 7 created the comprehensive plan with timeline estimates. Stage 10's technical review may reveal:

1. **Technical complexity underestimated**: Tasks require more time than originally planned
2. **Learning curve for new technologies**: Team needs training time not included in plan
3. **Integration complexity**: Third-party integrations more complex than assumed
4. **Technical debt paydown**: Must refactor before adding features (not in original timeline)

**What Needs to Change in Stage 7**:
- Extend timeline based on technical reality
- Add buffer for technical unknowns
- Re-sequence tasks to account for technical dependencies
- Adjust milestones and delivery dates

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:39 "Comprehensive Planning needs timeline adjustment"

---

### Timeline Impact Calculation Method

```javascript
class TechnicalReview {
  calculateTimelineImpact() {
    const originalTimeline = this.stageData.stage7Timeline; // From Stage 7

    // Sum all timeline extensions from findings
    const technicalDebtTime = this.calculateTechnicalDebtTime();
    const learningCurveTime = this.calculateLearningCurveTime();
    const complexityBuffer = this.calculateComplexityBuffer();

    const totalExtension = technicalDebtTime + learningCurveTime + complexityBuffer;

    // Calculate percentage impact
    const timelineImpact = (totalExtension / originalTimeline) * 100;

    return timelineImpact; // Returns percentage (e.g., 35 = 35% extension)
  }

  calculateTechnicalDebtTime() {
    // Hours required to address technical debt before new features
    return this.technicalDebtScore > 70
      ? (this.technicalDebtScore - 40) * 2  // High debt requires significant refactoring
      : 0;
  }

  calculateLearningCurveTime() {
    // Time for team to learn new technologies
    const newTechnologies = this.identifyNewTechnologies();
    return newTechnologies.length * 40; // 40 hours per new technology
  }

  calculateComplexityBuffer() {
    // Additional time for complex integrations
    const complexTasks = this.findings.filter(f => f.complexity === 'high');
    return complexTasks.length * 20; // 20 hours buffer per complex task
  }
}
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:88 "technicalReview.timelineImpact"

---

## TERTIARY TRIGGER: TECH-001 to Stage 5 (Cost Impact)

### Cost Impact Calculation

**When to Trigger**:
- Development costs exceed Stage 5 financial projections by > 25%
- HIGH severity (requires Chairman approval)

**Recursion Threshold**:

```javascript
// Additional check in recursion logic (lines 88-97 pattern)
if (technicalReview.costImpact > 25) {
  await recursionEngine.triggerRecursion({
    ventureId,
    fromStage: 10,
    toStage: 5,
    triggerType: 'TECH-001',
    triggerData: {
      original_cost_estimate: stageData.stage5Costs,
      revised_cost_estimate: technicalReview.revisedCosts,
      cost_delta: technicalReview.costImpact,
      cost_drivers: technicalReview.identifyCostDrivers()
    },
    severity: 'HIGH',
    autoExecuted: false,
    resolution_notes: `Development costs ${technicalReview.costImpact}% higher than Stage 5 projections due to technical complexity. Financial model requires update.`
  });
}
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:122 "Development cost increase > 25%"

---

### Why Stage 5?

**Profitability Forecasting Needs Update**:

Stage 5 created financial model with cost estimates. Stage 10's technical review may reveal:

1. **Infrastructure costs underestimated**: Cloud/server costs higher than projected
2. **Development hours underestimated**: Technical complexity requires more engineering time
3. **Third-party licenses required**: Need expensive tools/services not in original budget
4. **Security/compliance costs**: Additional security measures required (penetration testing, audits)

**What Needs to Change in Stage 5**:
- Update cost structure with accurate technical costs
- Recalculate P&L projections and ROI
- May trigger FIN-001 recursion to Stage 3 if ROI falls below 15%

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:40 "Profitability forecasting needs update"

---

### Cost Impact Calculation Method

```javascript
class TechnicalReview {
  calculateCostImpact() {
    const originalCosts = this.stageData.stage5Costs;

    // Infrastructure costs
    const infrastructureDelta = this.calculateInfrastructureCosts() - originalCosts.infrastructure;

    // Development labor costs
    const laborDelta = this.calculateLaborCosts() - originalCosts.labor;

    // Third-party licenses/tools
    const licenseDelta = this.calculateLicenseCosts() - originalCosts.licenses;

    // Security/compliance
    const securityDelta = this.calculateSecurityCosts() - originalCosts.security;

    const totalDelta = infrastructureDelta + laborDelta + licenseDelta + securityDelta;

    // Calculate percentage impact
    const costImpact = (totalDelta / originalCosts.total) * 100;

    return costImpact; // Returns percentage (e.g., 30 = 30% cost increase)
  }

  identifyCostDrivers() {
    return [
      { driver: "Infrastructure", delta: infrastructureDelta, reason: "Higher cloud costs for scalability" },
      { driver: "Labor", delta: laborDelta, reason: "Additional engineering hours for complexity" },
      { driver: "Licenses", delta: licenseDelta, reason: "Service mesh, monitoring tools required" },
      { driver: "Security", delta: securityDelta, reason: "Penetration testing, security audit" }
    ];
  }
}
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:122 "cost increase > 25%"

---

## CRITICAL TRIGGER: TECH-001 to Stage 3 (Solution Infeasible)

### Solution Feasibility Scoring

**When to Trigger**:
- Solution feasibility score < 0.5
- CRITICAL severity (auto-execute, Chairman notified post-execution)

**Implementation**:

```javascript
// From main recursion logic (lines 100-111)
if (technicalReview.solutionFeasibility < 0.5) {
  await recursionEngine.triggerRecursion({
    ventureId,
    fromStage: 10,
    toStage: 3,
    triggerType: 'TECH-001',
    severity: 'CRITICAL',
    autoExecuted: true, // Solution infeasibility is auto-execute
    resolution_notes: `Solution approach is technically infeasible (feasibility score: ${technicalReview.solutionFeasibility}/1.0). Re-validation required with alternative technical approaches.`
  });
}
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:100-111 "solutionFeasibility < 0.5"

---

### Why Stage 3?

**Comprehensive Validation Needs Re-Assessment**:

Stage 3 validated the problem-solution fit and decided to PROCEED. Stage 10's technical review may reveal:

1. **Solution technically infeasible**: Cannot be built with current technology/expertise
2. **Technical approach fundamentally flawed**: Architecture cannot support requirements
3. **No viable technical path forward**: All technical approaches evaluated and rejected

**What Needs to Change in Stage 3**:
- Re-validate solution approach with technical constraints
- Consider alternative technical solutions
- May trigger Kill/Revise decision if no feasible path forward

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:41 "may trigger Kill/Revise decision"

---

### Feasibility Score Calculation

```javascript
class TechnicalReview {
  calculateSolutionFeasibility() {
    // Four factors: technical capability, resource availability, technology maturity, risk factors

    const technicalCapability = this.assessTechnicalCapability();   // 0-1 scale
    const resourceAvailability = this.assessResourceAvailability(); // 0-1 scale
    const technologyMaturity = this.assessTechnologyMaturity();     // 0-1 scale
    const riskFactors = this.assessRiskFactors();                   // 0-1 scale (higher = lower risk)

    // Weighted average (technical capability weighted highest)
    const feasibility = (
      technicalCapability * 0.4 +
      resourceAvailability * 0.2 +
      technologyMaturity * 0.2 +
      riskFactors * 0.2
    );

    return feasibility; // 0-1 scale (< 0.5 = infeasible, triggers CRITICAL recursion)
  }

  assessTechnicalCapability() {
    // Can the team build this with current skills?
    const requiredSkills = this.identifyRequiredSkills();
    const availableSkills = this.teamSkills;
    const skillsGap = requiredSkills.filter(s => !availableSkills.includes(s));

    return skillsGap.length === 0 ? 1.0 : Math.max(0, 1 - (skillsGap.length * 0.2));
  }

  assessResourceAvailability() {
    // Are required resources available (time, budget, infrastructure)?
    const timeAvailable = this.stageData.stage7Timeline;
    const timeRequired = this.estimatedTimeline;
    const timeFeasibility = timeAvailable / timeRequired; // <0.8 = infeasible

    const budgetAvailable = this.stageData.stage5Budget;
    const budgetRequired = this.revisedCosts;
    const budgetFeasibility = budgetAvailable / budgetRequired; // <0.8 = infeasible

    return Math.min(timeFeasibility, budgetFeasibility);
  }

  assessTechnologyMaturity() {
    // Is the technology stack mature enough?
    const technologies = this.architectureDesign.technologyStack;
    const maturityScores = technologies.map(t => {
      if (t.status === 'deprecated') return 0.2;
      if (t.status === 'beta') return 0.5;
      if (t.status === 'stable') return 0.9;
      if (t.status === 'mature') return 1.0;
      return 0.5; // Unknown
    });

    return maturityScores.reduce((a, b) => a + b, 0) / maturityScores.length;
  }

  assessRiskFactors() {
    // Lower risk = higher score
    const criticalRisks = this.findings.filter(f => f.riskLevel === 'critical').length;
    const highRisks = this.findings.filter(f => f.riskLevel === 'high').length;

    // More critical/high risks = lower feasibility
    const riskScore = 1.0 - (criticalRisks * 0.3) - (highRisks * 0.1);

    return Math.max(0, riskScore);
  }
}
```

**Evidence**: (Based on critique lines 101-109 feasibility check logic)

---

## Recursion Thresholds (Complete Table)

| Issue Type | Threshold | Target Stage | Severity | Action |
|------------|-----------|--------------|----------|--------|
| Blocking issues | ≥ 1 | Stage 8 | HIGH | Chairman approval to re-decompose |
| Technical debt score | > 70/100 | Stage 8 | MEDIUM | Advisory, consider refactoring in decomposition |
| Timeline impact | > 30% | Stage 7 | HIGH | Chairman approval to adjust timeline |
| Development cost increase | > 25% | Stage 5 | HIGH | Chairman approval to update financial model |
| Solution feasibility | < 0.5 | Stage 3 | CRITICAL | Auto-recurse to re-validate solution |
| Security score | < 60/100 | Stage 8 | HIGH | Re-decompose with security-first approach |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:115-125 "Recursion Thresholds"

---

## Inbound Recursion Triggers

**Recursion Triggers That May RETURN TO This Stage**:

| From Stage | Trigger Type | Condition | Severity | Reason |
|------------|--------------|-----------|----------|--------|
| Stage 14 | TECH-001 | Development preparation uncovers new technical issues | MEDIUM | Need updated technical review with environment-specific constraints |
| Stage 22 | TECH-001 | Development iteration reveals architectural problems | HIGH | Technical review needs update based on implementation learnings |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:126-131 "Recursion Triggers That May RETURN"

---

### From Stage 14 (Development Preparation)

**Scenario**: During development environment setup, team discovers:
- Database version incompatibility
- Cloud provider limitations
- CI/CD pipeline constraints

**Recursion Flow**:
```javascript
// In Stage 14 implementation
if (environmentSetupRevealsIssues()) {
  await recursionEngine.triggerRecursion({
    ventureId,
    fromStage: 14,
    toStage: 10,
    triggerType: 'TECH-001',
    triggerData: {
      environment_issues: [
        "Database version 14 not supported in production environment (only v12 available)",
        "CI/CD pipeline cannot deploy microservices architecture (requires Docker Swarm, only have Jenkins)"
      ]
    },
    severity: 'MEDIUM',
    autoExecuted: false,
    resolution_notes: "Environment-specific constraints require updated technical review"
  });
}
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:130 "environment-specific constraints"

---

### From Stage 22 (Development Iteration)

**Scenario**: During implementation, team discovers:
- Architecture pattern doesn't work in practice
- Performance issues with chosen technology
- Integration failures between components

**Recursion Flow**:
```javascript
// In Stage 22 implementation
if (implementationRevealsArchitecturalProblems()) {
  await recursionEngine.triggerRecursion({
    ventureId,
    fromStage: 22,
    toStage: 10,
    triggerType: 'TECH-001',
    triggerData: {
      implementation_learnings: [
        "Event-driven architecture causes race conditions in order processing",
        "Chosen ORM (Sequelize) cannot efficiently handle complex queries, performance degraded 10x"
      ]
    },
    severity: 'HIGH',
    autoExecuted: false,
    resolution_notes: "Implementation learnings require architectural re-evaluation"
  });
}
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:131 "implementation learnings"

---

## Loop Prevention

**Max Recursions**: 3 triggers from Stage 10 per venture

**Tracking**:
```javascript
// Before triggering recursion, check recursion count
const recursionCount = await db.recursion_events.count({
  where: { ventureId, fromStage: 10, triggerType: 'TECH-001' }
});

if (recursionCount >= 3) {
  // Escalate to Chairman instead of auto-recursion
  await escalateToChairman({
    ventureId,
    reason: 'MAX_RECURSIONS_REACHED',
    message: `Stage 10 has triggered TECH-001 recursion ${recursionCount} times. Chairman decision required.`,
    options: [
      'Simplify scope (remove technical blockers)',
      'Kill venture (too technically complex)',
      'Acquire expertise/tools to resolve blocks',
      'Accept technical debt and proceed (document risks)'
    ]
  });
} else {
  // Proceed with recursion
  await recursionEngine.triggerRecursion({...});
}
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:133-141 "Loop Prevention"

---

### Escalation After 3rd TECH-001

**Chairman Must Decide**:

1. **Simplify scope** (remove technical blockers)
   - Cut features that are technically blocking
   - Reduce complexity to match current capabilities
   - Re-run Stage 10 with simplified scope

2. **Kill venture** (too technically complex for current capabilities)
   - Venture requires expertise/infrastructure not available
   - Cost of acquiring capabilities exceeds ROI
   - Mark venture as KILLED with technical infeasibility reason

3. **Acquire expertise/tools to resolve blocks**
   - Hire specialists or consultants
   - Purchase required tools/licenses
   - Allocate budget for training
   - Re-run Stage 10 after acquisition

4. **Accept technical debt and proceed** (with documented risks)
   - Document all known technical limitations
   - Accept risks with mitigation plan
   - Proceed to Stage 11 with "PROCEED_WITH_DEBT" status

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:135-139 "Chairman must decide"

---

## Chairman Controls

### CRITICAL Severity (Solution Infeasible)

**Auto-Execution**:
- Recursion to Stage 3 executes immediately (no pre-approval)
- Chairman notified post-execution with full context
- Chairman can override if alternative solution exists

**Notification**:
```javascript
await notifyChairman({
  type: 'POST_EXECUTION_NOTIFICATION',
  severity: 'CRITICAL',
  message: `Stage 10 auto-executed TECH-001 recursion to Stage 3 due to solution infeasibility (score: ${feasibilityScore}/1.0)`,
  ventureId,
  recursionEvent: recursionEventId,
  canOverride: true,
  overrideAction: 'If alternative solution exists, Chairman can cancel recursion and provide alternative approach'
});
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:143-146 "CRITICAL severity, Auto-executed"

---

### HIGH Severity (Blocking Issues, Timeline/Cost Impact)

**Pre-Approval Required**:
- Recursion pauses and awaits Chairman approval
- Review panel shows full impact assessment
- Chairman can approve, modify, or reject recursion

**Approval Panel**:
```javascript
await requestChairmanApproval({
  type: 'PRE_EXECUTION_APPROVAL',
  severity: 'HIGH',
  ventureId,
  fromStage: 10,
  toStage: targetStage,
  triggerType: 'TECH-001',
  impactAssessment: {
    blockingIssues: issues.BLOCKING,
    timelineImpact: `${timelineImpact}% extension (${originalTimeline} → ${revisedTimeline})`,
    costImpact: `${costImpact}% increase ($${originalCost} → $${revisedCost})`,
    wbsChanges: {
      original: stageData.stage8WBS,
      proposed: technicalReview.proposedWBS,
      delta: technicalReview.wbsDelta
    }
  },
  options: [
    { action: 'APPROVE', label: 'Approve recursion and re-decompose/re-plan' },
    { action: 'SIMPLIFY', label: 'Simplify scope (remove blocked features)' },
    { action: 'ALLOCATE', label: 'Allocate additional resources to resolve blocks' },
    { action: 'ACCEPT_DEBT', label: 'Accept technical debt and proceed with risks' }
  ]
});
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:147-158 "HIGH severity, Review panel shows"

---

### Override Capability

**Chairman Can**:

1. **Skip recursion and proceed with technical debt**
   - Document accepted risks
   - Log override decision with rationale
   - Mark venture with "TECHNICAL_DEBT_ACCEPTED" flag

2. **Modify severity thresholds for specific venture types**
   - Strategic ventures: Accept higher technical debt (threshold 80 instead of 70)
   - Experimental ventures: Accept lower feasibility (threshold 0.3 instead of 0.5)
   - Enterprise ventures: Stricter thresholds (security score 70 instead of 60)

3. **Approve ventures with known technical limitations for strategic reasons**
   - Market timing more important than technical perfection
   - First-mover advantage justifies technical risk
   - Learning opportunity for team (accept technical debt as training cost)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:159-162 "Override capability, Chairman can"

---

## Performance Requirements

**Technical review analysis**: <5 seconds for comprehensive assessment
- Architecture review: <2 seconds
- Scalability assessment: <1 second
- Security review: <1.5 seconds
- Implementation planning: <0.5 seconds

**Recursion detection**: <100ms after review complete
- Issue categorization: <50ms
- Threshold checks: <25ms
- Decision logic: <25ms

**Impact calculation**: <1 second for timeline/cost delta analysis
- Timeline impact: <400ms
- Cost impact: <400ms
- WBS delta: <200ms

**Database logging**: Async, stores full technical review data
- Log recursion event: Non-blocking
- Store technical review snapshot: Non-blocking
- Update venture status: Non-blocking

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:163-167 "Performance Requirements"

---

## UI/UX Implications

### Technical Health Dashboard

**Real-time indicators during review**:

```typescript
interface TechnicalHealthDashboard {
  technicalDebt: {
    score: number;              // 0-100
    status: 'GREEN' | 'YELLOW' | 'RED';  // <40, 40-70, >70
    trend: 'IMPROVING' | 'STABLE' | 'DEGRADING';
    components: {
      codeComplexity: number;
      deprecatedDependencies: number;
      missingTests: number;
      documentationGaps: number;
      securityVulnerabilities: number;
    };
  };
  securityScore: {
    score: number;              // 0-100
    status: 'GREEN' | 'YELLOW' | 'RED';  // >80, 60-80, <60
    criticalVulnerabilities: number;
    complianceGaps: string[];
  };
  scalability: {
    rating: number;             // 1-5 stars
    maxConcurrentUsers: number;
    scalingCostPer100Users: number;
    bottlenecks: string[];
  };
  blockingIssues: {
    count: number;
    breakdown: {
      architecture: number;
      scalability: number;
      security: number;
      techDebt: number;
    };
  };
}
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:169-174 "Technical Health Dashboard"

---

### Recursion Warning Modal

**When TECH-001 triggered**:

```typescript
interface RecursionWarningModal {
  title: string;  // "Technical review identified {count} blocking issues"
  severity: 'CRITICAL' | 'HIGH';
  issues: Array<{
    category: string;
    description: string;
    impact: string;
    affectedTasks: string[];
    suggestedFix: string;
  }>;
  wbsComparison: {
    original: WBS;
    affectedTasks: string[];
    proposedChanges: string;
  };
  timelineImpact?: string;  // "Timeline extension: 30% (+3 weeks)"
  costImpact?: string;      // "Cost increase: 25% (+$50k)"
  chairmanApprovalRequest?: {
    options: Array<{
      action: string;
      label: string;
      description: string;
    }>;
  };
}
```

**Visual Design**:
- Red banner: "Technical Review Blocked — {count} Critical Issues"
- Expandable issue cards with category badges
- Side-by-side WBS comparison (original vs proposed)
- Timeline/cost delta visualization (bar chart)
- Chairman approval buttons: Approve / Modify / Reject

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:175-179 "Recursion Warning Modal"

---

### Comparison View (Post-Recursion)

**After recursion completes**:

```typescript
interface ComparisonView {
  technicalReviewComparison: {
    version1: TechnicalReview;  // Pre-recursion
    version2: TechnicalReview;  // Post-recursion (after Stage 8/7/5/3 re-work)
    improvements: {
      blockingIssuesResolved: number;
      technicalDebtReduced: number;
      securityScoreImproved: number;
      scalabilityRatingImproved: number;
    };
  };
  wbsChanges: {
    tasksAdded: string[];
    tasksRemoved: string[];
    tasksModified: string[];
  };
  timelineCostImpact: {
    originalTimeline: number;
    revisedTimeline: number;
    originalCost: number;
    revisedCost: number;
  };
}
```

**Visual Design**:
- Split-screen: Technical Review v1 (left) vs v2 (right)
- Green highlights: Improvements (issues resolved, scores increased)
- Red highlights: Remaining issues or new issues
- WBS diff view: Added (green), Removed (red), Modified (yellow)
- Timeline/cost impact chart: Original vs revised

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:180-183 "Comparison View (post-recursion)"

---

## Integration Points

### Stage 8 (Problem Decomposition)

**Integration**: Primary recursion target, receives WBS update requirements

**Data Flow**:
- Stage 10 → Stage 8: Blocking issues with affected tasks, proposed WBS changes
- Stage 8 → Stage 10: Updated WBS, re-run technical review

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:186 "Stage 8 (Problem Decomposition)"

---

### Stage 7 (Comprehensive Planning)

**Integration**: Secondary recursion for timeline adjustments

**Data Flow**:
- Stage 10 → Stage 7: Timeline impact assessment, required timeline extension
- Stage 7 → Stage 10: Adjusted timeline, re-validate feasibility

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:187 "Stage 7 (Comprehensive Planning)"

---

### Stage 5 (Profitability)

**Integration**: Recursion target for cost updates

**Data Flow**:
- Stage 10 → Stage 5: Cost delta, cost drivers, revised cost estimates
- Stage 5 → Stage 10: Updated financial model, re-validate ROI

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:188 "Stage 5 (Profitability)"

---

### Stage 3 (Validation)

**Integration**: Recursion target for solution infeasibility

**Data Flow**:
- Stage 10 → Stage 3: Feasibility score, technical constraints, alternative approaches
- Stage 3 → Stage 10: Kill/Revise/Proceed decision, alternative solution (if Revise)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:189 "Stage 3 (Validation)"

---

### validationFramework.ts

**Integration**: Reuse for technical threshold checks

**Usage**:
```typescript
import { ValidationFramework } from './validationFramework';

const validator = new ValidationFramework();

// Reuse validation thresholds
const thresholds = validator.getThresholds('TECH-001');
// Returns: { technicalDebt: 70, security: 60, scalability: 3, feasibility: 0.5 }

// Reuse validation logic
const validationResult = validator.validate({
  type: 'TECH-001',
  data: technicalReview
});
// Returns: { pass: false, failedChecks: ['technicalDebt', 'security'] }
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:190 "validationFramework.ts"

---

### recursionEngine.ts

**Integration**: Central orchestration

**Usage**:
```typescript
import { RecursionEngine } from './recursionEngine';

const engine = new RecursionEngine();

// Trigger recursion
await engine.triggerRecursion({
  ventureId,
  fromStage: 10,
  toStage: 8,
  triggerType: 'TECH-001',
  severity: 'HIGH',
  autoExecuted: false,
  triggerData: { /* ... */ },
  resolution_notes: '...'
});

// Check recursion count (for loop prevention)
const count = await engine.getRecursionCount(ventureId, 10, 'TECH-001');
// Returns: 2 (if 2 previous TECH-001 triggers from Stage 10)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:191 "recursionEngine.ts"

---

### recursion_events Table

**Integration**: Log all technical review decisions

**Schema**:
```sql
CREATE TABLE recursion_events (
  id UUID PRIMARY KEY,
  venture_id UUID NOT NULL REFERENCES ventures(id),
  from_stage INTEGER NOT NULL,
  to_stage INTEGER NOT NULL,
  trigger_type VARCHAR(20) NOT NULL,  -- 'TECH-001'
  severity VARCHAR(20) NOT NULL,      -- 'CRITICAL', 'HIGH', 'MEDIUM'
  auto_executed BOOLEAN NOT NULL,
  trigger_data JSONB,                 -- Full technical review snapshot
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  resolution_action VARCHAR(50)       -- 'RECURSION_COMPLETED', 'CHAIRMAN_OVERRIDE', 'SIMPLIFIED_SCOPE'
);
```

**Logging**:
```typescript
// Every TECH-001 trigger logs full snapshot
await db.recursion_events.insert({
  venture_id: ventureId,
  from_stage: 10,
  to_stage: 8,
  trigger_type: 'TECH-001',
  severity: 'HIGH',
  auto_executed: false,
  trigger_data: {
    technical_review_snapshot: technicalReview,  // Full review data
    blocking_issues: issues.BLOCKING,
    technical_debt_score: 75,
    security_score: 65,
    scalability_rating: 2.5
  },
  resolution_notes: '3 blocking issues require re-decomposition...'
});
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:192 "recursion_events table"

---

<!-- Generated by Claude Code Phase 5 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
