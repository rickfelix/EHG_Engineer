# LEO Protocol v4.3 - Sub-Agent Enforcement Amendment

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