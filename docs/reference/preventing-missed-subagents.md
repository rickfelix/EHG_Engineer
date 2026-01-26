# Preventing Missed Sub-Agents: Comprehensive Guide


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, migration, schema

**Created**: 2025-10-01
**Purpose**: Prevent critical sub-agent activations from being missed during LEO Protocol execution
**Triggered by**: SD-UAT-021 retrospective feedback

---

## 🚨 What Went Wrong

During SD-UAT-021 execution, **two critical sub-agents were missed**:

1. **Continuous Improvement Coach** - Retrospective not triggered automatically on `SD_STATUS_COMPLETED`
2. **DevOps Platform Architect** - CI/CD verification not performed on `EXEC_IMPLEMENTATION_COMPLETE`

**Impact**:
- Learnings not captured until user asked
- Pipeline status unknown until explicit check
- Protocol compliance incomplete

---

## ✅ Solution: Automated Trigger System

### 1. Auto-Trigger Script

**Location**: `scripts/auto-trigger-subagents.js`

**Purpose**: Detects trigger keywords and generates required sub-agent checklist

**Usage**:
```bash
# Check what sub-agents are required for an event
node scripts/auto-trigger-subagents.js "SD_STATUS_COMPLETED" "SD-UAT-021"

# Check for implementation completion
node scripts/auto-trigger-subagents.js "EXEC_IMPLEMENTATION_COMPLETE"
```

**Features**:
- Maps all trigger keywords from CLAUDE.md
- Generates checklist of required sub-agents
- Can be integrated into workflow scripts

### 2. LEAD Approval Checklist

**Location**: `scripts/lead-approval-checklist.js`

**Purpose**: Comprehensive pre-approval verification to catch missing steps

**Usage**:
```bash
# Run checklist before LEAD approval
node scripts/lead-approval-checklist.js <SD_UUID>

# Example
node scripts/lead-approval-checklist.js ccf6484d-9182-4879-a36a-33c7bbb1796c
```

**Checks**:
1. ✅ SD exists and status is correct
2. ✅ Retrospective generated
3. ✅ Required sub-agents activated
4. ✅ DevOps verification (if applicable)
5. ✅ PRD exists
6. ✅ Handoffs recorded

**Exit Codes**:
- `0` = Ready for approval (may have warnings)
- `1` = Not ready (critical failures)

---

## 📋 Mandatory Checklist for LEAD

**Before marking any SD as complete**, LEAD MUST run:

```bash
node scripts/lead-approval-checklist.js <SD_UUID>
```

**If checklist shows warnings**:
- [ ] Review each warning
- [ ] Activate any missing sub-agents
- [ ] Generate retrospective if missing
- [ ] Verify CI/CD status if applicable
- [ ] Re-run checklist to confirm

**Only approve when**:
- ✅ Zero critical failures
- ✅ All required sub-agents activated
- ✅ Retrospective generated
- ✅ Warnings reviewed and acceptable

---

## 🎯 Sub-Agent Trigger Reference

### Continuous Improvement Coach
**Triggers**:
- `LEAD_APPROVAL_COMPLETE`
- `SD_STATUS_COMPLETED` ⚠️ **CRITICAL**
- `PHASE_COMPLETE`
- `EXEC_SPRINT_COMPLETE`
- `PLAN_VERIFICATION_COMPLETE`
- (14 total triggers, see CLAUDE.md)

**Required Actions**:
- Generate comprehensive retrospective
- Store in database
- Identify patterns and learnings
- Create action items

### DevOps Platform Architect
**Triggers**:
- `EXEC_IMPLEMENTATION_COMPLETE` ⚠️ **CRITICAL**
- `PLAN_VERIFICATION_PASS`
- `LEAD_APPROVAL_COMPLETE`
- `create pull request`
- `github status`
- (8 total triggers)

**Required Actions**:
- Check GitHub Actions status
- Verify build success
- Review test results
- Check for deployment blockers
- Document CI/CD status

### Design Sub-Agent
**Triggers** (keyword-based):
- `component`, `visual`, `UI`, `UX`
- `theme`, `dark mode`, `responsive`
- `accessibility`, `WCAG`, `ARIA`
- (30+ triggers)

**Required Actions**:
- UI/UX checklist verification
- Component specification review
- Accessibility compliance check
- Design system consistency

### QA Engineering Director
**Triggers**:
- `coverage`
- `test`
- `quality`

**Required Actions**:
- Code quality analysis
- Test coverage verification
- Testing gap identification

### Database Architect
**Triggers**:
- `schema`
- `migration`
- `database`

**Required Actions**:
- Schema impact assessment
- Migration requirements
- Performance considerations

### Systems Analyst
**Triggers**:
- `existing implementation`
- `duplicate`
- `conflict`
- `already implemented`

**Required Actions**:
- Duplicate detection
- Integration quality review
- Conflict resolution

---

## 🔄 Integration into Workflow

### PLAN Phase
```javascript
// When creating PRD
const requiredSubAgents = detectRequiredSubAgents('PLAN_PRD_GENERATION', prdContent);
console.log('Required sub-agents:', requiredSubAgents);
// Activate each one before proceeding to EXEC
```

### EXEC Phase
```javascript
// Before marking phase complete
const requiredSubAgents = detectRequiredSubAgents('EXEC_IMPLEMENTATION_COMPLETE');
// Must include DevOps if code changes
```

### LEAD Approval
```javascript
// MANDATORY before approval
const checklist = await runLeadApprovalChecklist(sdId);
if (!checklist.canApprove) {
  console.error('Cannot approve: critical issues found');
  return;
}
```

---

## 📊 Database Schema for Tracking

### Sub-Agent Executions Table
```sql
CREATE TABLE sub_agent_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sd_id UUID REFERENCES strategic_directives_v2(id),
  sub_agent_code TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  execution_result JSONB,
  activated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

### Recording Activations
```javascript
await recordSubAgentActivation(
  sdId,
  'CONTINUOUS_IMPROVEMENT_COACH',
  'SD_STATUS_COMPLETED',
  retrospectiveJSON
);
```

---

## 🎓 Lessons Learned

### From SD-UAT-021

**What Went Well**:
- User feedback caught the miss immediately
- Database-first architecture made fix easy
- Comprehensive retrospective still generated

**What Could Be Improved**:
- Automated trigger detection needed
- Checklist enforcement before approval
- Better protocol compliance tools

**Root Cause**:
- No explicit reminder system for triggers
- Keyword detection not automated
- Reliance on human memory

**Prevention**:
- Created auto-trigger script
- Created LEAD approval checklist
- Made checklist mandatory
- Updated protocol documentation

---

## 🚀 Next Steps

### Immediate
- [x] Create auto-trigger script
- [x] Create LEAD approval checklist
- [x] Generate DevOps verification for SD-UAT-021
- [x] Document prevention system

### Short-Term
- [ ] Integrate checklist into dashboard
- [ ] Add visual indicators for missing sub-agents
- [ ] Create sub-agent activation tracking UI

### Long-Term
- [ ] Automated trigger detection in CI/CD
- [ ] Dashboard alerts for missing activations
- [ ] Pattern analysis across multiple SDs
- [ ] Predictive sub-agent recommendations

---

## 📝 Quick Reference

**Before LEAD Approval**:
```bash
node scripts/lead-approval-checklist.js <SD_UUID>
```

**Check Required Sub-Agents**:
```bash
node scripts/auto-trigger-subagents.js "<EVENT>" "<SD_KEY>"
```

**Record Sub-Agent Activation**:
```javascript
import { recordSubAgentActivation } from './auto-trigger-subagents.js';
await recordSubAgentActivation(sdId, subAgentCode, event, result);
```

---

**Last Updated**: 2025-10-01
**Maintained By**: CONTINUOUS_IMPROVEMENT_COACH
**Source**: SD-UAT-021 Retrospective Action Item
