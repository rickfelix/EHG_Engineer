# LEO Protocol v4.3 - Sub-Agent Enforcement Amendment


## Metadata
- **Category**: Protocol
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-22
- **Tags**: database, api, testing, e2e

## Problem Statement
Sub-agents are defined but not enforced, leading to incomplete verification and missed quality checks.

## Solution: Mandatory Sub-Agent Checkpoints

### 1. Automated Trigger Detection

Each phase MUST check for sub-agent triggers BEFORE proceeding:

```javascript
// Required in all handoff validators
const checkSubAgentTriggers = (phase, context) => {
  const requiredSubAgents = [];
  
  // Testing Sub-Agent
  if (phase === 'PLAN_VERIFICATION' || 
      context.hasTests || 
      context.coverage > 80 || 
      context.hasE2E) {
    requiredSubAgents.push('Testing');
  }
  
  // Security Sub-Agent  
  if (context.hasAuth || 
      context.hasAPI || 
      context.mentionsSecurity) {
    requiredSubAgents.push('Security');
  }
  
  // Performance Sub-Agent
  if (context.hasMetrics || 
      context.hasLatencyRequirements) {
    requiredSubAgents.push('Performance');
  }
  
  // Database Sub-Agent
  if (context.hasSchemaChanges || 
      context.hasMigrations) {
    requiredSubAgents.push('Database');
  }
  
  return requiredSubAgents;
};
```

### 2. Enforcement in Handoff Validator

```javascript
// Add to handoff-validator.js
async validateHandoff(fromAgent, toAgent, sdId) {
  // ... existing validation ...
  
  // NEW: Check sub-agent usage
  const requiredSubAgents = await this.getRequiredSubAgents(fromAgent, sdId);
  const usedSubAgents = await this.getUsedSubAgents(sdId);
  
  const missingSubAgents = requiredSubAgents.filter(
    agent => !usedSubAgents.includes(agent)
  );
  
  if (missingSubAgents.length > 0) {
    return {
      valid: false,
      reason: `Missing required sub-agents: ${missingSubAgents.join(', ')}`,
      requirement: 'All required sub-agents must be activated before handoff'
    };
  }
}
```

### 3. Sub-Agent Trigger Matrix

| Phase | Context | Required Sub-Agent | Rationale |
|-------|---------|-------------------|-----------|
| PLAN → EXEC | Has UI requirements (2+) | Design | UI/UX validation |
| EXEC → PLAN | Has tests | Testing | Test verification |
| EXEC → PLAN | Has database changes | Database | Schema validation |
| Any | Mentions security/auth | Security | Security review |
| Any | Has performance metrics | Performance | Performance validation |
| PLAN Verification | Always | Testing | Acceptance testing |

### 4. Sub-Agent Usage Tracking

Each sub-agent activation MUST be logged:

```javascript
const activateSubAgent = async (agentType, context) => {
  // Log to database
  await supabase
    .from('subagent_activations')
    .insert({
      sd_id: context.sdId,
      phase: context.currentPhase,
      agent_type: agentType,
      triggered_by: context.triggeredBy,
      activation_time: new Date().toISOString(),
      context: context
    });
  
  // Execute sub-agent task
  const result = await Task({
    subagent_type: agentType,
    ...context
  });
  
  // Log completion
  await supabase
    .from('subagent_activations')
    .update({
      completion_time: new Date().toISOString(),
      result: result
    })
    .eq('sd_id', context.sdId)
    .eq('agent_type', agentType);
  
  return result;
};
```

### 5. Automatic Prompting

When a trigger condition is detected:

```
⚠️  SUB-AGENT REQUIRED
─────────────────────
Detected: Testing requirements
Action: Activating Testing sub-agent
Reason: E2E tests present in implementation

[Automatic activation in 5 seconds... Press Ctrl+C to cancel]
```

### 6. Override Mechanism

Allow explicit override with justification:

```javascript
const overrideSubAgent = (agentType, justification) => {
  if (!justification || justification.length < 50) {
    throw new Error('Override requires detailed justification (50+ chars)');
  }
  
  return {
    overridden: true,
    agent: agentType,
    justification,
    timestamp: new Date().toISOString(),
    risk: 'HIGH'
  };
};
```

### 7. Implementation Example

```javascript
// In PLAN verification script
async performVerification() {
  // Check what sub-agents are needed
  const triggers = await this.detectSubAgentTriggers();
  
  if (triggers.includes('Testing')) {
    console.log('🤖 Activating Testing Sub-Agent (required)...');
    const testResults = await this.activateTestingSubAgent();
    this.verificationResults.subAgentReports.testing = testResults;
  }
  
  if (triggers.includes('Security')) {
    console.log('🔐 Activating Security Sub-Agent (required)...');
    const securityResults = await this.activateSecuritySubAgent();
    this.verificationResults.subAgentReports.security = securityResults;
  }
  
  // Continue with verification...
}
```

### 8. Benefits

1. **No More Missed Checks**: Sub-agents automatically triggered
2. **Audit Trail**: Complete record of what was checked
3. **Quality Assurance**: Consistent verification across all projects
4. **Flexibility**: Can override with justification when needed
5. **Learning**: System can learn which triggers are most valuable

### 9. Rollout Plan

1. **Phase 1**: Add detection logic (non-blocking warnings)
2. **Phase 2**: Make Testing sub-agent mandatory for PLAN verification
3. **Phase 3**: Enforce all sub-agent triggers
4. **Phase 4**: Add ML-based trigger suggestions

### 10. Success Metrics

- 100% of required sub-agents activated
- 0 production issues that sub-agents would have caught
- <5% false positive triggers
- <10 seconds added to handoff validation time

---

## Immediate Implementation

Add to `handoff-validator.js`:

```javascript
// Check for Testing sub-agent in PLAN verification
if (fromAgent === 'PLAN' && toAgent === 'LEAD') {
  const hasTests = await this.checkForTests(sdId);
  if (hasTests && !this.subAgentUsed('Testing', sdId)) {
    console.warn('⚠️  WARNING: Testing sub-agent not used despite tests present');
    console.warn('   This will be mandatory in LEO Protocol v4.3');
    // In v4.3, this would return { valid: false }
  }
}
```

---

*Amendment Date: 2025-09-01*
*Version: 4.3 (Proposed)*
*Status: For Review*

---

## IMPLEMENTATION STATUS

**Status**: ✅ **IMPLEMENTED** (as of 2026-01-21)
**SD**: SD-LEO-INFRA-STOP-HOOK-SUB-001
**Implementation**: Claude Code Stop Hook with Auto-Remediation

### Implementation Details

The sub-agent enforcement concept has been implemented as a **Claude Code Stop Hook** that validates sub-agent execution when Claude sessions end.

**Location**: `scripts/hooks/stop-subagent-enforcement.js`
**Configuration**: `.claude/settings.json` (Stop hook, 120s timeout)

**Key Features**:
1. **SD Detection**: Extracts SD key from git branch using pattern `/SD-[A-Z]+-(?:[A-Z]+-)*[0-9]+/i`
2. **Matrix-Based Validation**: Determines required + recommended sub-agents based on SD type and category
3. **Phase Window Timing**: Validates sub-agents ran in correct phase windows (e.g., DESIGN before PLAN-TO-EXEC)
4. **Auto-Remediation**: Returns blocking JSON with commands to run missing sub-agents
5. **1-Hour Caching**: PASS verdicts cached to avoid redundant executions
6. **Bypass Mechanism**: Requires 50+ char explanation AND retrospective entry

**Sub-Agent Requirements Matrix**:

| SD Type | Required Sub-Agents | Recommended Sub-Agents |
|---------|---------------------|------------------------|
| feature | TESTING, DESIGN, STORIES | UAT, API |
| infrastructure | GITHUB, DOCMON | VALIDATION |
| database | DATABASE, SECURITY | REGRESSION |
| security | SECURITY, DATABASE | TESTING, RCA |
| bugfix | RCA, REGRESSION, TESTING | UAT |
| refactor | REGRESSION, VALIDATION | TESTING |
| performance | PERFORMANCE, TESTING | REGRESSION |

**Phase Window Timing Rules**:

| Sub-Agent | After Handoff | Before Handoff | Phase |
|-----------|---------------|----------------|-------|
| DESIGN | LEAD-TO-PLAN | PLAN-TO-EXEC | PLAN |
| TESTING | PLAN-TO-EXEC | LEAD-FINAL-APPROVAL | EXEC |
| UAT | EXEC-TO-PLAN | LEAD-FINAL-APPROVAL | VERIFICATION |
| RETRO | PLAN-TO-LEAD | (none) | COMPLETION |

**Bypass Process**:
1. Create `.stop-hook-bypass.json` with explanation (min 50 chars)
2. Run: `node scripts/generate-retrospective.js --bypass-entry`
3. Set `retrospective_committed: true` in bypass file
4. Bypass is logged to audit and file is deleted after use

**Auto-Remediation Output**:
```json
{
  "decision": "block",
  "reason": "SD SD-XXX-001 (feature) requires sub-agent validation",
  "remediation": {
    "auto_run": true,
    "agents_to_run": ["DESIGN", "TESTING"],
    "command": "node scripts/orchestrate-phase-subagents.js SD-XXX-001 --agents DESIGN,TESTING"
  }
}
```

---

## 5. Per-Handoff Sub-Agent Enforcement (v4.4.3)

**Added**: SD-LEO-HARDEN-VALIDATION-001
**Date**: 2026-01-21

### Problem

Stop hook enforcement only runs at **session END** (when user exits Claude Code):
- Missing sub-agents not detected until hours after handoff
- No early warning for EXEC-phase sub-agents before EXEC-TO-PLAN
- Developers discover missing sub-agents at end of session (friction)

**Evidence**: 14.6% of SDs completed EXEC-TO-PLAN without TESTING validation.

### Solution: Advisory Gate at EXEC-TO-PLAN Handoff

**New Gate**: `SUBAGENT_ENFORCEMENT_VALIDATION`

**Location**: `scripts/modules/handoff/executors/exec-to-plan/gates/subagent-enforcement-validation.js`

**Behavior**: Advisory (non-blocking) warnings for missing EXEC-phase sub-agents

#### Implementation

```javascript
// EXEC-phase sub-agents checked at EXEC-TO-PLAN handoff
const EXEC_PHASE_AGENTS = ['TESTING', 'REGRESSION', 'PERFORMANCE', 'GITHUB', 'API'];

// Requirements mirror stop-hook structure
const REQUIREMENTS = {
  byType: {
    feature: { required: ['TESTING', 'DESIGN', 'STORIES'], recommended: ['UAT', 'API'] },
    infrastructure: { required: ['GITHUB', 'DOCMON'], recommended: ['VALIDATION'] },
    database: { required: ['DATABASE', 'SECURITY'], recommended: ['REGRESSION'] },
    // ... (mirrors scripts/hooks/stop-subagent-enforcement.js)
  }
};
```

#### Gate Output Example

**ADVISORY Mode (warns but passes)**:

```
🔍 SUB-AGENT ENFORCEMENT VALIDATION (LEO v4.4.3)
--------------------------------------------------
   📋 SD Type: feature
   📋 Required for EXEC: TESTING
   📋 Recommended for EXEC: UAT, API
   ✅ Executed: TESTING
   ⚠️  Missing recommended: UAT, API

⚠️ GATE PASSED (90/100) - Advisory warnings issued
```

#### Differences from Stop Hook

| Feature | Stop Hook | Per-Handoff Gate |
|---------|-----------|------------------|
| **Timing** | Session END | EXEC-TO-PLAN handoff |
| **Scope** | All sub-agents | EXEC-phase only |
| **Blocking** | ❌ Blocks exit | ⚠️ Advisory warning |
| **Auto-remediation** | ✅ Yes | ❌ No (manual) |
| **Purpose** | Final validation | Early warning |

**Complementary Systems**: Stop hook remains authoritative. Per-handoff gate provides early warning.

#### Integration

Gate registered in `scripts/modules/handoff/executors/exec-to-plan/index.js`:

```javascript
gates.push(createSubAgentEnforcementValidationGate(this.supabase));
```

**Score Impact**:
- Missing required sub-agent: -10 points each
- Missing recommended sub-agent: -5 points each
- Minimum score: 50/100 (always passes)

---

**References**:
- Design Document: `docs/drafts/STOP-HOOK-SUBAGENT-ENFORCEMENT-DRAFT.md`
- Triangulation Synthesis: `docs/research/triangulation-stop-hook-synthesis.md`
- Operational Runbook: `docs/06_deployment/stop-hook-operations.md`
- Hook Reference: `docs/reference/claude-code-hooks.md`
- Per-Handoff Gate: `scripts/modules/handoff/executors/exec-to-plan/gates/subagent-enforcement-validation.js` (NEW)

**Deployment**:
- Stop hook: PR #458 merged to main on 2026-01-21
- Per-handoff gate: PR #462 merged to main on 2026-01-21 (SD-LEO-HARDEN-VALIDATION-001)