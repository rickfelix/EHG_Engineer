# LEO Protocol Enforcement System Guide


## Metadata
- **Category**: Protocol
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, guide, protocol, leo

## 🛡️ Overview

The LEO Protocol Enforcement System ensures 100% compliance with all protocol requirements, preventing any skipped steps or violations.

## 🚀 Quick Start

### Run a Strategic Directive with Full Enforcement

```bash
# Primary command - enforces ALL steps
node scripts/leo-protocol-orchestrator.js SD-XXX

# Example
node scripts/leo-protocol-orchestrator.js SD-GOVERNANCE-UI-001
```

This single command will:
1. ✅ Enforce session prologue
2. ✅ Validate priority justification
3. ✅ Execute all 5 phases (LEAD → PLAN → EXEC → VERIFICATION → APPROVAL)
4. ✅ Enforce phase gates between transitions
5. ✅ Require human approval where needed
6. ✅ Enforce retrospective at completion
7. ✅ Generate compliance report

## 📋 Key Components

### 1. Master Orchestrator (`leo-protocol-orchestrator.js`)

The main enforcement engine that:
- Blocks progression without gate validation
- Enforces sequential phase execution
- Records all activities in database
- Generates compliance reports

### 2. EXEC Checklist Enforcer (`exec-checklist-enforcer.js`)

Mandatory pre-implementation verification:
```bash
# Run before ANY implementation
node scripts/exec-checklist-enforcer.js PRD-XXX
```

Validates:
- ✅ Correct application directory
- ✅ Git repository verification
- ✅ URL accessibility
- ✅ Component identification
- ✅ Screenshot capture
- ✅ Port verification
- ✅ Dependency checks

### 3. Human Approval System

Critical decisions require explicit approval:
```bash
# Check pending approvals
node scripts/lead-human-approval-system.js --check

# Request approval
node scripts/lead-human-approval-system.js --request SD-XXX
```

## 🚦 Phase Gates

Each phase has mandatory requirements that cannot be bypassed:

### LEAD Phase Gate
- ✅ Session prologue completed
- ✅ Priority justified
- ✅ Strategic objectives defined
- ✅ Handoff created in database
- ✅ No over-engineering check

### PLAN Phase Gate
- ✅ PRD created in database
- ✅ Acceptance criteria defined
- ✅ Sub-agents activated
- ✅ Test plan created
- ✅ Handoff from LEAD received

### EXEC Phase Gate
- ✅ Pre-implementation checklist
- ✅ Correct app verified
- ✅ Screenshots taken
- ✅ Implementation completed
- ✅ Git commit created
- ✅ GitHub push completed

### VERIFICATION Phase Gate
- ✅ All tests executed
- ✅ Acceptance criteria verified
- ✅ Sub-agent consensus
- ✅ Supervisor verification done
- ✅ Confidence score calculated

### APPROVAL Phase Gate
- ✅ Human approval requested
- ✅ Over-engineering rubric run
- ✅ Human decision received
- ✅ Status updated in database
- ✅ Retrospective completed

## 📊 Compliance Monitoring

### Check Compliance Status
```bash
# View compliance report for an SD
node scripts/compliance-report.js SD-XXX

# View all violations
node scripts/leo-violations.js --list

# Check session status
node scripts/leo-session-status.js SESSION-ID
```

### Database Tables Created

The system uses these database tables for tracking:
- `leo_execution_sessions` - Track each SD execution
- `leo_phase_completions` - Record phase completions
- `leo_approval_requests` - Human approval queue
- `leo_violations` - Protocol violations log
- `leo_compliance_reports` - Final compliance reports
- `leo_retrospectives` - Lessons learned storage
- `exec_checklist_results` - Checklist evidence
- `exec_screenshots` - Screenshot references

## 🔴 Common Violations and Fixes

### Violation: "EXEC pre-implementation checklist incomplete"
**Fix**: Run `exec-checklist-enforcer.js` before coding

### Violation: "LEAD gate validation failed"
**Fix**: Ensure all strategic objectives are defined and handoff is created

### Violation: "Human approval denied"
**Fix**: Address feedback and resubmit for approval

### Violation: "Retrospective not completed"
**Fix**: Cannot mark SD complete without retrospective

## 🎯 Best Practices

1. **Always start with the orchestrator**
   ```bash
   node scripts/leo-protocol-orchestrator.js SD-XXX
   ```

2. **Never bypass phase gates** - They exist to ensure quality

3. **Complete checklists honestly** - Evidence is tracked

4. **Document lessons learned** - Retrospectives improve the process

5. **Monitor compliance scores** - Aim for 100%

## 🚨 Emergency Override

In exceptional cases where override is needed:

```bash
# Requires human approval and creates violation record
node scripts/leo-protocol-orchestrator.js SD-XXX --force --reason "Emergency fix"
```

⚠️ **Warning**: Overrides are logged and require justification

## 📈 Metrics and Reporting

### Generate Compliance Dashboard
```bash
# Update dashboard with latest metrics
node scripts/update-compliance-dashboard.js

# View compliance trends
node scripts/compliance-trends.js --days 30
```

### Key Metrics Tracked
- Session compliance rate
- Phase completion times
- Violation frequency
- Human approval response times
- Retrospective quality scores

## 🔧 Troubleshooting

### Issue: "Cannot find module"
```bash
npm install chalk inquirer
```

### Issue: "Database connection failed"
Ensure `.env` has correct Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
```

### Issue: "Phase already complete"
Use `--force` flag to re-execute:
```bash
node scripts/leo-protocol-orchestrator.js SD-XXX --force
```

## 📝 Creating Database Tables

Run this SQL in Supabase to create required tables:

```sql
-- Execution sessions
CREATE TABLE leo_execution_sessions (
  id VARCHAR(100) PRIMARY KEY,
  sd_id VARCHAR(100),
  started_at TIMESTAMP,
  status VARCHAR(50),
  failed_at TIMESTAMP,
  error_message TEXT,
  failed_phase VARCHAR(50)
);

-- Phase completions
CREATE TABLE leo_phase_completions (
  sd_id VARCHAR(100),
  phase VARCHAR(50),
  completed_at TIMESTAMP,
  session_id VARCHAR(100),
  PRIMARY KEY (sd_id, phase)
);

-- Approval requests
CREATE TABLE leo_approval_requests (
  id VARCHAR(100) PRIMARY KEY,
  sd_id VARCHAR(100),
  requested_at TIMESTAMP,
  status VARCHAR(50),
  type VARCHAR(100),
  approved_at TIMESTAMP,
  approver VARCHAR(100)
);

-- Violations log
CREATE TABLE leo_violations (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(100),
  sd_id VARCHAR(100),
  phase VARCHAR(50),
  violation_type VARCHAR(100),
  details TEXT,
  timestamp TIMESTAMP
);

-- Compliance reports
CREATE TABLE leo_compliance_reports (
  id SERIAL PRIMARY KEY,
  sd_id VARCHAR(100),
  session_id VARCHAR(100),
  phases_completed INTEGER,
  violations INTEGER,
  skipped_steps INTEGER,
  duration INTEGER,
  compliance_score INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Retrospectives
CREATE TABLE leo_retrospectives (
  id SERIAL PRIMARY KEY,
  sd_id VARCHAR(100),
  session_id VARCHAR(100),
  completed_at TIMESTAMP,
  lessons_learned JSONB,
  improvements JSONB,
  successes JSONB
);

-- EXEC checklists
CREATE TABLE exec_checklist_results (
  id SERIAL PRIMARY KEY,
  prd_id VARCHAR(100),
  checklist_type VARCHAR(100),
  results JSONB,
  evidence JSONB,
  compliance_score INTEGER,
  executed_at TIMESTAMP
);

-- Screenshots
CREATE TABLE exec_screenshots (
  id SERIAL PRIMARY KEY,
  prd_id VARCHAR(100),
  type VARCHAR(50),
  path TEXT,
  timestamp TIMESTAMP
);
```

## 🎯 Summary

The LEO Protocol Enforcement System ensures:
- ✅ No skipped steps
- ✅ Full compliance tracking
- ✅ Human approval gates
- ✅ Evidence collection
- ✅ Continuous improvement through retrospectives

**Remember**: The system is designed to help, not hinder. Following the process ensures quality and prevents issues down the line.

---

*For questions or issues, check the violations log first:*
```bash
node scripts/leo-violations.js --recent
```