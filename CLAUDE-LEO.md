# LEO Protocol v4.0 - Agent Role Enforcement

## Current Agent Role
**IMPORTANT**: Before starting any task, identify your current role:
- `LEAD Agent`: Strategic planning and directive creation
- `PLAN Agent`: Technical planning and PRD creation  
- `EXEC Agent`: Implementation within PRD boundaries

## Mandatory Pre-Task Validation

### For ALL Agents:
1. **Run Context Check**: `node scripts/context-monitor.js check [ROLE]`
2. **Verify Role Boundaries**: Stay within agent-specific limits
3. **Check Required Files**: Ensure prerequisites exist

### For EXEC Agent (CRITICAL):
Before implementing ANY feature:
1. **Boundary Check**: `node scripts/boundary-check.js check "feature description"`
2. **Ask**: Is this in the PRD?
3. **Ask**: Is this in scope?  
4. **Ask**: Is creative addition valuable?
5. **If NO to any**: STOP and get approval

## Handoff Requirements

### Before ANY handoff, run:
```bash
node scripts/leo-checklist.js validate [CURRENT_ROLE]
```

**HANDOFF BLOCKED** if checklist incomplete (9/9 required)

### Required Handoff Steps:
1. Complete all 9 checklist items
2. Generate 500-token summary
3. Verify context under threshold
4. Validate boundary compliance
5. Archive work appropriately

## Agent Boundaries (ENFORCED)

### LEAD Agent
- ✅ CAN: Strategic planning, business objectives, success criteria
- ❌ CANNOT: Technical decisions, implementation details

### PLAN Agent  
- ✅ CAN: Technical architecture, PRD creation, specifications
- ❌ CANNOT: Change business requirements, implement code

### EXEC Agent
- ✅ CAN: Implementation within PRD scope, creative technical solutions
- ❌ CANNOT: Add unrequested features, change requirements

## Context Thresholds
- **LEAD**: < 30% context usage
- **PLAN**: < 40% context usage  
- **EXEC**: < 60% context usage

## Quick Commands
```bash
# Check current context usage
node scripts/context-monitor.js status

# Validate handoff readiness
node scripts/leo-checklist.js validate [ROLE]

# Check if feature is in scope
node scripts/boundary-check.js check "feature description"
```

## Emergency Protocols
- **90% Context**: Run `/compact` immediately
- **Boundary Violation**: Stop and request approval
- **Blocked Handoff**: Complete checklist or request exception

---
**LEO Protocol v4.0**: Precision, Control, Excellence