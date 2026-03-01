---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# LEO Protocol v4.1.2 - Database-First Enforcement Update


## Table of Contents

- [🟢 CURRENT ACTIVE VERSION](#-current-active-version)
- [CRITICAL: Database-First Policy](#critical-database-first-policy)
  - [Absolute Rules (NO EXCEPTIONS)](#absolute-rules-no-exceptions)
- [Mandatory Database Scripts](#mandatory-database-scripts)
  - [LEAD Agent Database Operations](#lead-agent-database-operations)
  - [PLAN Agent Database Operations](#plan-agent-database-operations)
  - [EXEC Agent Database Operations](#exec-agent-database-operations)
- [Sub-Agent Integration (Enhanced for v4.1.2)](#sub-agent-integration-enhanced-for-v412)
  - [GitHub Deployment Sub-Agent (NEW)](#github-deployment-sub-agent-new)
  - [Existing Sub-Agents](#existing-sub-agents)
- [Enhanced Verification Checkpoints](#enhanced-verification-checkpoints)
  - [Checkpoint 1: LEAD → PLAN Handoff](#checkpoint-1-lead-plan-handoff)
  - [Checkpoint 2: PLAN → EXEC Handoff](#checkpoint-2-plan-exec-handoff)
  - [Checkpoint 3: EXEC → PLAN Handback](#checkpoint-3-exec-plan-handback)
  - [Checkpoint 4: PLAN → LEAD Approval](#checkpoint-4-plan-lead-approval)
- [Database Schema References](#database-schema-references)
  - [Required Tables](#required-tables)
- [Enforcement Mechanisms](#enforcement-mechanisms)
  - [Automatic File Detection](#automatic-file-detection)
  - [Mandatory Audit Trail](#mandatory-audit-trail)
- [Agent Workflow with Database-First](#agent-workflow-with-database-first)
  - [LEAD Agent Workflow](#lead-agent-workflow)
  - [PLAN Agent Workflow](#plan-agent-workflow)
  - [EXEC Agent Workflow](#exec-agent-workflow)
- [Violations and Consequences](#violations-and-consequences)
  - [Level 1 Violations (Warning)](#level-1-violations-warning)
  - [Level 2 Violations (Work Suspension)](#level-2-violations-work-suspension)
  - [Level 3 Violations (Agent Termination)](#level-3-violations-agent-termination)
- [Migration from File-Based Workflow](#migration-from-file-based-workflow)
- [Quick Reference Card](#quick-reference-card)
  - [✅ ALLOWED](#-allowed)
  - [❌ FORBIDDEN](#-forbidden)
  - [📜 REQUIRED SCRIPTS](#-required-scripts)
- [Summary](#summary)

**Version**: 4.1.2  
**Status**: 🟢 CURRENT ACTIVE VERSION  
**Date**: 2025-09-01  
**Previous Version**: 4.1.1  
**Change Log**: Added mandatory database scripts, NO-FILE policy, and enhanced verification checkpoints

---
## 🟢 CURRENT ACTIVE VERSION

**This is the current active version of LEO Protocol.**

**All previous versions (v4.1.1, v4.1.0, v4.0.0, and all v3.x.x) have been superseded.**

**Use this version for all new implementations.**

---

## CRITICAL: Database-First Policy

### Absolute Rules (NO EXCEPTIONS)

1. **NO FILES MAY BE CREATED** in the filesystem for:
   - Strategic Directives
   - Product Requirements Documents
   - Execution Sequences
   - Handoffs
   
2. **ALL DOCUMENTS MUST EXIST IN DATABASE FIRST**

3. **Filesystem is for CODE ONLY** (implementation files)

---

## Mandatory Database Scripts

### LEAD Agent Database Operations

#### Creating Strategic Directive
```bash
# REQUIRED SCRIPT - DO NOT CREATE CUSTOM VERSIONS
node scripts/add-sd-to-database.js SD-YYYY-XXX

# This script:
# - Creates entry in strategic_directives_v2 table
# - Sets initial status to 'draft'
# - Returns database ID for reference
```

#### Updating SD Status
```bash
# Update to active when ready
node scripts/update-sd-status.js SD-YYYY-XXX active

# Update on completion
node scripts/update-sd-status.js SD-YYYY-XXX archived
```

### PLAN Agent Database Operations

#### Creating PRD
```bash
# REQUIRED SCRIPT - DO NOT CREATE CUSTOM VERSIONS
node scripts/add-prd-to-database.js PRD-YYYY-XXX

# This script:
# - Creates entry in product_requirements_v2 table
# - Links to SD via directive_id
# - Sets status to 'planning'
```

#### Creating EES Items
```bash
# REQUIRED SCRIPT - DO NOT CREATE CUSTOM VERSIONS
node scripts/add-ees-to-database.js PRD-YYYY-XXX

# This script:
# - Creates entries in execution_sequences table
# - Links to PRD via product_requirement_id
# - Sets all to 'pending' status
```

### EXEC Agent Database Operations

#### Updating EES Status
```bash
# Start work on EES
node scripts/update-ees-status.js EES-XXX in_progress

# Complete EES
node scripts/update-ees-status.js EES-XXX completed

# Failed EES
node scripts/update-ees-status.js EES-XXX failed
```

---

## Sub-Agent Integration (Enhanced for v4.1.2)

### GitHub Deployment Sub-Agent (NEW)

**Mandatory Activation**: When LEAD approval complete (Phase 5 = 100%)

**Activation Criteria**:
- Strategic Directive status = 'archived'  
- PRD status = 'approved'
- LEAD approval checklist = 7/7 complete
- Database progress = 100%

**Responsibilities**:
- Production GitHub deployments
- Release tag creation  
- GitHub release management
- Post-deployment monitoring
- Database deployment metadata updates

**Usage**:
```bash
# ONLY after LEAD approval
node scripts/github-deployment-subagent.js SD-YYYY-XXX
```

**Integration with LEO Protocol v4.1.2 Verification Cycle**:
```
EXEC Implementation (30%) → Development branches only
    ↓ (handback)
PLAN Verification (15%) → Code review, no deployment  
    ↓ (recommendation)
LEAD Approval (15%) → Strategic validation
    ↓ (authorization triggers GitHub sub-agent)
GitHub Deployment Sub-Agent → Production deployment
    ↓
DEPLOYMENT COMPLETE (100%)
```

### Existing Sub-Agents
- Security Sub-Agent: Authentication, data protection, OWASP compliance
- Performance Sub-Agent: Metrics, scalability, optimization  
- Testing Sub-Agent: Coverage, E2E testing, regression suites
- Database Sub-Agent: Schema changes, migrations, integrity
- Design Sub-Agent: UI/UX, accessibility, responsive design

---

## Enhanced Verification Checkpoints

### Checkpoint 1: LEAD → PLAN Handoff

```javascript
// MANDATORY VERIFICATION SCRIPT
node scripts/verify-handoff-lead-to-plan.js SD-YYYY-XXX

// This script checks:
// 1. SD exists in database with status='active'
// 2. NO files exist in /docs/strategic-directives/
// 3. All required fields populated
// 4. Audit log entry created
// 5. Progress set to 20%

// REJECTION CONDITIONS:
// - Any filesystem files found → REJECT
// - Database entry missing → REJECT
// - Wrong status → REJECT
```

### Checkpoint 2: PLAN → EXEC Handoff

```javascript
// MANDATORY VERIFICATION SCRIPT
node scripts/verify-handoff-plan-to-exec.js PRD-YYYY-XXX

// This script checks:
// 1. PRD exists in database with status='ready'
// 2. EES items exist with status='pending'
// 3. NO files in /docs/prds/ or /docs/ees/
// 4. All checklists stored in database
// 5. Progress set to 40%

// REJECTION CONDITIONS:
// - Any filesystem files found → REJECT
// - Missing EES items → REJECT
// - PRD not linked to SD → REJECT
```

### Checkpoint 3: EXEC → PLAN Handback

```javascript
// MANDATORY VERIFICATION SCRIPT
node scripts/verify-handback-exec-to-plan.js PRD-YYYY-XXX

// This script checks:
// 1. All EES items status='completed' or documented failure
// 2. Implementation code files exist (these ARE allowed)
// 3. Test results in database
// 4. NO documentation files created
// 5. Progress set to 70%
```

### Checkpoint 4: PLAN → LEAD Approval

```javascript
// MANDATORY VERIFICATION SCRIPT
node scripts/verify-handback-plan-to-lead.js SD-YYYY-XXX

// This script checks:
// 1. PRD status='tested'
// 2. Verification results in database
// 3. NO handoff files in filesystem
// 4. All data in database tables
// 5. Progress set to 85%
```

---

## Database Schema References

### Required Tables

```sql
-- These tables MUST exist for LEO Protocol to function
CREATE TABLE IF NOT EXISTS strategic_directives_v2 (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  -- ... other fields
);

CREATE TABLE IF NOT EXISTS product_requirements_v2 (
  id TEXT PRIMARY KEY,
  directive_id TEXT REFERENCES strategic_directives_v2(id),
  status TEXT NOT NULL,
  -- ... other fields
);

CREATE TABLE IF NOT EXISTS execution_sequences (
  id TEXT PRIMARY KEY,
  product_requirement_id TEXT REFERENCES product_requirements_v2(id),
  status TEXT NOT NULL,
  -- ... other fields
);

CREATE TABLE IF NOT EXISTS leo_audit_log (
  id SERIAL PRIMARY KEY,
  agent TEXT NOT NULL,
  action TEXT NOT NULL,
  document_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leo_handoffs (
  id TEXT PRIMARY KEY,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  document_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Enforcement Mechanisms

### Automatic File Detection

```javascript
// This runs before EVERY handoff
async function detectIllegalFiles() {
  const illegaPaths = [
    '/docs/strategic-directives/',
    '/docs/prds/',
    '/docs/ees/',
    '/handoffs/'
  ];
  
  for (const path of illegalPaths) {
    const files = await fs.readdir(path).catch(() => []);
    if (files.length > 0) {
      throw new Error(`VIOLATION: Files found in ${path}. Database-first policy violated.`);
    }
  }
}
```

### Mandatory Audit Trail

Every database operation MUST create an audit log entry:

```javascript
await supabase.from('leo_audit_log').insert({
  agent: currentAgent,
  action: actionType,
  document_id: documentId,
  phase: currentPhase,
  status: 'success',
  metadata: { /* details */ }
});
```

---

## Agent Workflow with Database-First

### LEAD Agent Workflow
```
1. Run: node scripts/add-sd-to-database.js SD-YYYY-XXX
2. Update SD fields in database (NO FILES)
3. Run: node scripts/update-sd-status.js SD-YYYY-XXX active
4. Run: node scripts/verify-handoff-lead-to-plan.js SD-YYYY-XXX
5. If verification passes → Handoff complete
```

### PLAN Agent Workflow
```
1. Receive SD-ID from LEAD
2. Run: node scripts/verify-handoff-lead-to-plan.js SD-YYYY-XXX
3. Run: node scripts/add-prd-to-database.js PRD-YYYY-XXX
4. Run: node scripts/add-ees-to-database.js PRD-YYYY-XXX
5. Update PRD/EES in database (NO FILES)
6. Run: node scripts/update-prd-status.js PRD-YYYY-XXX ready
7. Run: node scripts/verify-handoff-plan-to-exec.js PRD-YYYY-XXX
8. If verification passes → Handoff complete
```

### EXEC Agent Workflow
```
1. Receive PRD-ID from PLAN
2. Run: node scripts/verify-handoff-plan-to-exec.js PRD-YYYY-XXX
3. For each EES:
   - Run: node scripts/update-ees-status.js EES-XXX in_progress
   - Implement code (FILES ALLOWED HERE)
   - Run: node scripts/update-ees-status.js EES-XXX completed
4. Run: node scripts/verify-handback-exec-to-plan.js PRD-YYYY-XXX
5. If verification passes → Handback complete
```

---

## Violations and Consequences

### Level 1 Violations (Warning)
- Creating temporary files during work
- Not updating status promptly
- Missing audit log entries

### Level 2 Violations (Work Suspension)
- Creating SD/PRD/EES files in filesystem
- Proceeding without verification
- Accepting handoff with files present

### Level 3 Violations (Agent Termination)
- Bypassing database entirely
- Falsifying verification results
- Deleting audit trail

---

## Migration from File-Based Workflow

For existing projects with files:

```bash
# One-time migration script
node scripts/migrate-files-to-database.js

# This will:
# 1. Read all SD/PRD/EES files
# 2. Insert into database
# 3. Archive files to /archive/migrated/
# 4. Update all references
```

---

## Quick Reference Card

### ✅ ALLOWED
- Implementation code files in /src/
- Test files in /tests/
- Configuration files
- Scripts in /scripts/

### ❌ FORBIDDEN
- SD files in /docs/strategic-directives/
- PRD files in /docs/prds/
- EES files in /docs/ees/
- Handoff files in /handoffs/
- Any document that should be in database

### 📜 REQUIRED SCRIPTS
```bash
# LEAD
node scripts/add-sd-to-database.js
node scripts/update-sd-status.js

# PLAN
node scripts/add-prd-to-database.js
node scripts/add-ees-to-database.js
node scripts/update-prd-status.js

# EXEC
node scripts/update-ees-status.js

# VERIFICATION (ALL)
node scripts/verify-handoff-*.js
node scripts/verify-handback-*.js
```

---

## Summary

LEO Protocol v4.1.2 enforces strict database-first operations:

1. **NO document files** - Everything in database
2. **Use provided scripts** - No custom database scripts
3. **Verify at every checkpoint** - No work without verification
4. **Audit everything** - Complete trail required
5. **Implementation files only** - Code is the only filesystem output

This ensures consistency, traceability, and prevents file/database synchronization issues.

---

*LEO Protocol v4.1.2 - Database First, No Exceptions*  
*Effective immediately - All agents must comply*