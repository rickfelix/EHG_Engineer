---
category: deployment
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [deployment, auto-generated]
---
# LEO 5.0 Task System - Operational Guide


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Quick Start](#quick-start)
  - [Prerequisites](#prerequisites)
  - [First-Time Setup](#first-time-setup)
  - [Basic SD Workflow](#basic-sd-workflow)
- [Command Reference](#command-reference)
  - [Standard Handoff Operations](#standard-handoff-operations)
  - [LEO 5.0 Wall Operations](#leo-50-wall-operations)
  - [LEO 5.0 Failure Operations](#leo-50-failure-operations)
  - [LEO 5.0 Correction Operations](#leo-50-correction-operations)
  - [LEO 5.0 Sub-Agent Operations](#leo-50-sub-agent-operations)
- [Operational Workflows](#operational-workflows)
  - [Workflow 1: Standard SD Execution (STANDARD Track)](#workflow-1-standard-sd-execution-standard-track)
  - [Workflow 2: Infrastructure SD (FULL Track)](#workflow-2-infrastructure-sd-full-track)
  - [Workflow 3: Hotfix (HOTFIX Track)](#workflow-3-hotfix-hotfix-track)
  - [Workflow 4: Handling Gate Failures](#workflow-4-handling-gate-failures)
  - [Workflow 5: Mid-Phase Correction](#workflow-5-mid-phase-correction)
- [Monitoring](#monitoring)
  - [Database Queries](#database-queries)
  - [Dashboard View](#dashboard-view)
- [Troubleshooting](#troubleshooting)
  - [Issue: Handoff Fails with "Gate Not Found"](#issue-handoff-fails-with-gate-not-found)
  - [Issue: Wall Stuck in "blocked" Status](#issue-wall-stuck-in-blocked-status)
  - [Issue: Sub-Agent Stuck in "running" Status](#issue-sub-agent-stuck-in-running-status)
  - [Issue: Kickback Loop (Infinite Retries)](#issue-kickback-loop-infinite-retries)
- [Common Scenarios](#common-scenarios)
  - [Scenario 1: Emergency Hotfix](#scenario-1-emergency-hotfix)
  - [Scenario 2: Large Feature with Sub-Agents](#scenario-2-large-feature-with-sub-agents)
  - [Scenario 3: Scope Change Mid-Execution](#scenario-3-scope-change-mid-execution)
- [Emergency Procedures](#emergency-procedures)
  - [Procedure 1: Bypass Wall (Emergency Override)](#procedure-1-bypass-wall-emergency-override)
  - [Procedure 2: Reset SD to Previous Phase](#procedure-2-reset-sd-to-previous-phase)
  - [Procedure 3: Force Sub-Agent Completion](#procedure-3-force-sub-agent-completion)
- [Related Documentation](#related-documentation)
- [Version History](#version-history)

## Metadata
- **Category**: Deployment
- **Status**: Approved
- **Version**: 5.0.0
- **Author**: LEO Protocol Team
- **Last Updated**: 2026-01-23
- **Tags**: leo-protocol, operations, runbook, task-system
- **Related SD**: 7ffc037e-a85a-4b31-afae-eb8a00517dd0

## Overview

This document provides operational procedures for the LEO 5.0 Task System, including command reference, troubleshooting, and monitoring.

**Target Audience**: Claude agents, operators, and developers working with LEO Protocol.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Command Reference](#command-reference)
3. [Operational Workflows](#operational-workflows)
4. [Monitoring](#monitoring)
5. [Troubleshooting](#troubleshooting)
6. [Common Scenarios](#common-scenarios)
7. [Emergency Procedures](#emergency-procedures)

## Quick Start

### Prerequisites

- Supabase database with LEO 5.0 schema applied
- Node.js environment with dependencies installed
- Environment variables configured (`.env` file)

### First-Time Setup

```bash
# 1. Apply database migration
node scripts/execute-subagent.js --code DATABASE --sd-id <SD_ID> \
  --prompt "Apply migration: database/migrations/20260123_add_leo5_wall_tables.sql"

# 2. Verify tables created
psql $DATABASE_URL -c "\dt sd_*"
# Should see: sd_wall_states, sd_execution_dashboard (view)

# 3. Verify indexes
psql $DATABASE_URL -c "\di sd_*"
# Should see 11 indexes

# 4. Test CLI commands
node scripts/handoff.js help
```

### Basic SD Workflow

```bash
# 1. Start with LEAD approval
node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001

# 2. View walls status
node scripts/handoff.js walls SD-XXX-001

# 3. Execute next handoff
node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001

# 4. Monitor sub-agents (FULL track only)
node scripts/handoff.js subagents SD-XXX-001 PLAN

# 5. View failures if any
node scripts/handoff.js failures SD-XXX-001
```

## Command Reference

### Standard Handoff Operations

#### Execute Handoff
Triggers phase transition and task hydration:

```bash
node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001
node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001
node scripts/handoff.js execute EXEC-TO-PLAN SD-XXX-001  # FULL track only
node scripts/handoff.js execute PLAN-TO-LEAD SD-XXX-001
node scripts/handoff.js execute LEAD-FINAL-APPROVAL SD-XXX-001
```

**Output**:
- Validates gates for current phase
- Hydrates tasks for next phase
- Records handoff in database
- Shows wall status

#### Precheck Handoff
Run all gate validations without executing:

```bash
node scripts/handoff.js precheck PLAN-TO-EXEC SD-XXX-001
```

**Output**:
- Lists all gates that would be validated
- Shows which gates would pass/fail
- Does NOT create tasks or execute handoff

#### List Handoffs
View handoff history for an SD:

```bash
node scripts/handoff.js list SD-XXX-001
```

**Output**:
```
Type            | SD ID                  | Status   | Score | Date
──────────────────────────────────────────────────────────────────
LEAD-TO-PLAN    | SD-XXX-001            | success  | 92%   | 2026-01-23
PLAN-TO-EXEC    | SD-XXX-001            | success  | 87%   | 2026-01-23
```

#### View Statistics
System-wide handoff statistics:

```bash
node scripts/handoff.js stats
```

**Output**:
- Total executions
- Success/failure rates
- Average scores by handoff type

### LEO 5.0 Wall Operations

#### View Walls Status
Show wall overview for an SD:

```bash
node scripts/handoff.js walls SD-XXX-001
```

**Output**:
```
═══════════════════════════════════════════════════════════
  SD WALL STATUS: SD-XXX-001
═══════════════════════════════════════════════════════════

  Track: FULL
  Progress: 2/5 walls passed

  ✅ LEAD-WALL         | passed
  ✅ PLAN-WALL         | passed
  ⏳ EXEC-WALL         | pending
  ⏳ VERIFY-WALL       | pending
  ⏳ FINAL-APPROVE     | pending
```

### LEO 5.0 Failure Operations

#### Retry Failed Gate
Retry a gate that failed:

```bash
node scripts/handoff.js retry-gate SD-XXX-001 GATE-PRD
```

**Output**:
- Re-runs gate validation
- Increments retry count
- Creates kickback if max retries exceeded

#### Create Manual Kickback
Force a kickback to previous phase:

```bash
node scripts/handoff.js kickback SD-XXX-001 --from EXEC --to PLAN \
  --reason "Implementation revealed PRD gaps"
```

**Output**:
- Creates kickback event
- Invalidates current wall
- Returns to specified phase

#### View Failure History
Show all kickbacks and corrections:

```bash
node scripts/handoff.js failures SD-XXX-001
```

**Output**:
```
═══════════════════════════════════════════════════════════
  FAILURE HISTORY: SD-XXX-001
═══════════════════════════════════════════════════════════

KICKBACKS:
  From EXEC → PLAN | Triggered: 2026-01-23 10:30
     Reason: Gate GATE-PRD failed after 3 attempts
     Status: resolved

CORRECTIONS:
  Wall: PLAN-WALL | Invalidated: 2026-01-23 11:00
     Reason: PRD scope change required
     New Version: PLAN-WALL-V2
     Status: resolved
```

### LEO 5.0 Correction Operations

#### Invalidate Wall
Create mid-phase correction:

```bash
node scripts/handoff.js invalidate PLAN-WALL SD-XXX-001 \
  --reason "PRD scope change required"
```

**Output**:
- Marks wall as invalidated
- Pauses dependent tasks
- Creates correction tasks
- Generates versioned wall (PLAN-WALL-V2)

#### Resume After Correction
Resume work after correction completes:

```bash
node scripts/handoff.js resume SD-XXX-001
```

**Output**:
- Unpauses tasks blocked by correction
- Validates new wall version
- Continues from where work was paused

### LEO 5.0 Sub-Agent Operations

#### View Sub-Agent Status
Check sub-agent execution status:

```bash
node scripts/handoff.js subagents SD-XXX-001 PLAN
```

**Output**:
```
═══════════════════════════════════════════════════════════
  SUB-AGENT STATUS: SD-XXX-001 (PLAN Phase)
═══════════════════════════════════════════════════════════

  SD Type: infrastructure
  Required: GITHUB, DOCMON
  Recommended: TESTING, VALIDATION

  Synthesis Ready: ⏳ NO
     Pending: GITHUB, DOCMON
     Completed: 0
     Failed: 0
```

## Operational Workflows

### Workflow 1: Standard SD Execution (STANDARD Track)

```bash
# 1. Start from LEAD approval
node scripts/handoff.js execute LEAD-TO-PLAN SD-FEATURE-001

# 2. Work through PLAN phase (PRD creation)
# ... (agent creates PRD)

# 3. Execute PLAN handoff
node scripts/handoff.js execute PLAN-TO-EXEC SD-FEATURE-001

# 4. Work through EXEC phase (implementation)
# ... (agent implements feature)

# 5. Execute EXEC handoff (merges into FINAL for STANDARD track)
node scripts/handoff.js execute EXEC-TO-FINAL SD-FEATURE-001

# 6. Final approval
node scripts/handoff.js execute LEAD-FINAL-APPROVAL SD-FEATURE-001
```

### Workflow 2: Infrastructure SD (FULL Track)

```bash
# 1. LEAD approval
node scripts/handoff.js execute LEAD-TO-PLAN SD-INFRA-001

# 2. PLAN phase with sub-agents
node scripts/handoff.js execute PLAN-TO-EXEC SD-INFRA-001

# 3. Monitor sub-agents
node scripts/handoff.js subagents SD-INFRA-001 PLAN
# Wait for synthesis ready

# 4. EXEC phase
node scripts/handoff.js execute EXEC-TO-PLAN SD-INFRA-001

# 5. VERIFY phase (dedicated phase in FULL track)
node scripts/handoff.js execute PLAN-TO-LEAD SD-INFRA-001

# 6. Final approval
node scripts/handoff.js execute LEAD-FINAL-APPROVAL SD-INFRA-001
```

### Workflow 3: Hotfix (HOTFIX Track)

```bash
# 1. Hotfix starts directly in EXEC (skips LEAD and PLAN)
node scripts/handoff.js execute HOTFIX-START SD-HOTFIX-001

# 2. Implement fix
# ... (agent makes emergency change)

# 3. SAFETY-WALL validation
node scripts/handoff.js execute EXEC-TO-SAFETY SD-HOTFIX-001
# This runs: BUILD_PASS, TESTS_PASS, LINT_PASS

# 4. Final approval if safety gates pass
node scripts/handoff.js execute LEAD-FINAL-APPROVAL SD-HOTFIX-001
```

### Workflow 4: Handling Gate Failures

```bash
# 1. Execute handoff
node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001
# ❌ Gate GATE-PRD failed (attempt 1/3)

# 2. Fix issue and retry
# ... (agent fixes PRD)
node scripts/handoff.js retry-gate SD-XXX-001 GATE-PRD
# ❌ Gate GATE-PRD failed (attempt 2/3)

# 3. Fix again and retry
# ... (agent fixes PRD again)
node scripts/handoff.js retry-gate SD-XXX-001 GATE-PRD
# ❌ Gate GATE-PRD failed (attempt 3/3)

# 4. System auto-creates kickback
# ⚠️ Kickback created: SD-XXX-001-KICKBACK-PLAN
# Wall PLAN-WALL invalidated
# Returned to PLAN phase

# 5. Resolve issue in PLAN phase
# ... (agent reworks PRD)

# 6. Retry handoff after fix
node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001
# ✅ Gate GATE-PRD passed
```

### Workflow 5: Mid-Phase Correction

```bash
# 1. Working in EXEC phase
# Realize PRD is wrong mid-implementation

# 2. Invalidate PLAN wall
node scripts/handoff.js invalidate PLAN-WALL SD-XXX-001 \
  --reason "Implementation revealed PRD gaps"

# ⚠️ PLAN-WALL invalidated
# EXEC tasks paused
# Correction tasks created:
#   - SD-XXX-001-CORRECTION-PRD
#   - SD-XXX-001-CORRECTION-SYNTHESIS
#   - SD-XXX-001-PLAN-WALL-V2

# 3. Fix PRD in correction tasks
# ... (agent updates PRD)

# 4. Complete correction tasks
# ... (agent marks correction tasks complete)

# 5. Resume EXEC work
node scripts/handoff.js resume SD-XXX-001
# ✅ PLAN-WALL-V2 passed
# EXEC tasks resumed from where they left off
```

## Monitoring

### Database Queries

#### Check Wall Status
```sql
SELECT
  wall_name,
  status,
  track,
  gates_required,
  gates_passed,
  passed_at
FROM sd_wall_states
WHERE sd_id = (SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-XXX-001');
```

#### Check Gate History
```sql
SELECT
  gate_name,
  wall_name,
  attempt_number,
  status,
  score,
  failure_reason,
  executed_at
FROM gate_execution_history
WHERE sd_id = (SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-XXX-001')
ORDER BY executed_at DESC;
```

#### Check Kickbacks
```sql
SELECT
  from_phase,
  to_phase,
  trigger_reason,
  failed_gate,
  retry_count,
  created_at,
  resolved_at
FROM kickback_events
WHERE sd_id = (SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-XXX-001')
ORDER BY created_at DESC;
```

#### Check Sub-Agent Executions
```sql
SELECT
  agent_code,
  phase,
  status,
  verdict,
  started_at,
  completed_at
FROM sub_agent_execution_results
WHERE sd_id = (SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-XXX-001')
ORDER BY started_at DESC;
```

### Dashboard View

```sql
SELECT * FROM sd_execution_dashboard
WHERE sd_id = (SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-XXX-001');
```

**Output columns**:
- `total_walls` - Total walls for this track
- `passed_walls` - Walls that have passed
- `total_gates` - Total gates executed
- `passed_gates` - Gates that passed
- `kickback_count` - Number of kickbacks
- `invalidation_count` - Number of wall invalidations
- `last_activity` - Last gate execution timestamp

## Troubleshooting

### Issue: Handoff Fails with "Gate Not Found"

**Symptom**: Error message "Gate GATE-PRD not found" when executing handoff.

**Diagnosis**:
```bash
# Check if tasks were hydrated
node scripts/handoff.js tasks SD-XXX-001 | grep GATE-PRD
```

**Resolution**:
1. Verify previous handoff completed successfully
2. Check task hydration log:
```sql
SELECT * FROM task_hydration_log WHERE sd_id = (SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-XXX-001') ORDER BY hydrated_at DESC;
```
3. If no hydration record, re-run previous handoff

### Issue: Wall Stuck in "blocked" Status

**Symptom**: Wall shows `status: 'blocked'` but all gates have passed.

**Diagnosis**:
```sql
SELECT
  w.wall_name,
  w.gates_required,
  w.gates_passed,
  (SELECT array_agg(gate_name) FROM gate_execution_history WHERE sd_id = w.sd_id AND status = 'passed') as actually_passed
FROM sd_wall_states w
WHERE w.sd_id = (SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-XXX-001')
  AND w.status = 'blocked';
```

**Resolution**:
1. Check for gate name mismatches between `gates_required` and `gate_execution_history`
2. Manually update wall status if gates genuinely passed:
```sql
UPDATE sd_wall_states
SET status = 'ready', gates_passed = gates_required
WHERE sd_id = (SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-XXX-001')
  AND wall_name = 'PLAN-WALL';
```

### Issue: Sub-Agent Stuck in "running" Status

**Symptom**: Sub-agent shows `status: 'running'` but hasn't updated in hours.

**Diagnosis**:
```sql
SELECT
  agent_code,
  phase,
  started_at,
  NOW() - started_at as duration
FROM sub_agent_execution_results
WHERE sd_id = (SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-XXX-001')
  AND status = 'running'
  AND started_at < NOW() - INTERVAL '1 hour';
```

**Resolution**:
1. Check agent output file (if run in background):
```bash
tail -f ~/.claude/tasks/SD-XXX-001/DESIGN-agent.log
```
2. If agent crashed, mark as failed:
```sql
UPDATE sub_agent_execution_results
SET status = 'timeout', verdict = 'FAIL', completed_at = NOW()
WHERE sd_id = (SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-XXX-001')
  AND agent_code = 'DESIGN'
  AND phase = 'PLAN';
```
3. Re-spawn sub-agent if needed:
```bash
node scripts/execute-subagent.js --code DESIGN --sd-id SD-XXX-001
```

### Issue: Kickback Loop (Infinite Retries)

**Symptom**: Gate fails → kickback → fix → gate fails again → kickback → repeat.

**Diagnosis**:
```sql
SELECT
  failed_gate,
  COUNT(*) as kickback_count,
  array_agg(trigger_reason ORDER BY created_at) as reasons
FROM kickback_events
WHERE sd_id = (SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-XXX-001')
  AND resolved_at IS NULL
GROUP BY failed_gate
HAVING COUNT(*) > 2;
```

**Resolution**:
1. Review kickback reasons to identify pattern
2. Consider escalating to different track:
```bash
# Force upgrade to FULL track for more governance
node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001 --track FULL
```
3. Or bypass with admin override (use sparingly):
```bash
node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001 \
  --bypass-validation \
  --bypass-reason "Manual review completed, gate logic incorrect"
```

## Common Scenarios

### Scenario 1: Emergency Hotfix

**Context**: Production is down, need to ship fix immediately.

**Steps**:
```bash
# 1. Create hotfix SD
node scripts/leo-create-sd.js --type hotfix --title "Fix login crash"

# 2. Start hotfix (skips LEAD and PLAN)
node scripts/handoff.js execute HOTFIX-START SD-HOTFIX-001

# 3. Implement fix
# ... (make 1-line fix)

# 4. SAFETY-WALL (compensating controls)
node scripts/handoff.js execute EXEC-TO-SAFETY SD-HOTFIX-001
# ✅ BUILD_PASS
# ✅ TESTS_PASS
# ✅ LINT_PASS

# 5. Ship immediately
node scripts/handoff.js execute LEAD-FINAL-APPROVAL SD-HOTFIX-001
```

**Duration**: Minutes

### Scenario 2: Large Feature with Sub-Agents

**Context**: Complex feature requiring design, database, and security review.

**Steps**:
```bash
# 1. Create feature SD
node scripts/leo-create-sd.js --type feature --title "User permissions system"

# 2. LEAD approval (STANDARD → FULL escalation due to security)
node scripts/handoff.js execute LEAD-TO-PLAN SD-FEATURE-001
# Track: FULL (escalated due to security_relevant flag)

# 3. PLAN phase (spawns sub-agents)
node scripts/handoff.js execute PLAN-TO-EXEC SD-FEATURE-001
# Sub-agents spawned: DESIGN, DATABASE, SECURITY

# 4. Monitor sub-agents
node scripts/handoff.js subagents SD-FEATURE-001 PLAN
# Wait for synthesis ready...

# 5. EXEC phase
node scripts/handoff.js execute EXEC-TO-PLAN SD-FEATURE-001

# 6. VERIFY phase (FULL track only)
node scripts/handoff.js execute PLAN-TO-LEAD SD-FEATURE-001

# 7. Final approval
node scripts/handoff.js execute LEAD-FINAL-APPROVAL SD-FEATURE-001
```

**Duration**: Days

### Scenario 3: Scope Change Mid-Execution

**Context**: Realized during EXEC that PRD is incomplete.

**Steps**:
```bash
# 1. Invalidate PLAN-WALL
node scripts/handoff.js invalidate PLAN-WALL SD-FEATURE-001 \
  --reason "Need to add rate limiting to API design"

# 2. Work on correction tasks
# ... (update PRD with rate limiting section)

# 3. Complete correction tasks
# (Tasks: CORRECTION-PRD, CORRECTION-SYNTHESIS automatically created)

# 4. Resume EXEC
node scripts/handoff.js resume SD-FEATURE-001
# ✅ PLAN-WALL-V2 passed
# EXEC work resumes
```

**Duration**: Hours

## Emergency Procedures

### Procedure 1: Bypass Wall (Emergency Override)

**When**: Wall is blocking progress, but manual review confirms work is complete.

**⚠️ WARNING**: Use only in emergencies. Breaks audit trail.

```bash
# Manual wall bypass (admin only)
psql $DATABASE_URL <<SQL
UPDATE sd_wall_states
SET status = 'passed',
    gates_passed = gates_required,
    passed_at = NOW()
WHERE sd_id = (SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-XXX-001')
  AND wall_name = 'PLAN-WALL';
SQL

# Record bypass reason
psql $DATABASE_URL <<SQL
INSERT INTO audit_log (action, reason, performed_by, sd_id)
VALUES (
  'EMERGENCY_WALL_BYPASS',
  'Manual review confirmed PRD complete, gate logic error',
  'admin',
  (SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-XXX-001')
);
SQL
```

### Procedure 2: Reset SD to Previous Phase

**When**: Need to restart from earlier phase due to major issue.

**⚠️ WARNING**: Destructive operation. Only use if kickback/invalidation insufficient.

```bash
# Reset to PLAN phase
psql $DATABASE_URL <<SQL
BEGIN;

-- Invalidate all walls after PLAN
UPDATE sd_wall_states
SET status = 'invalidated', invalidated_at = NOW()
WHERE sd_id = (SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-XXX-001')
  AND wall_name IN ('EXEC-WALL', 'VERIFY-WALL', 'FINAL-APPROVE');

-- Reset wall to PLAN
UPDATE sd_wall_states
SET status = 'passed'
WHERE sd_id = (SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-XXX-001')
  AND wall_name = 'PLAN-WALL';

-- Update SD phase
UPDATE strategic_directives_v2
SET current_phase = 'PLAN'
WHERE id = 'SD-XXX-001';

COMMIT;
SQL
```

### Procedure 3: Force Sub-Agent Completion

**When**: Sub-agent is stuck but output is available elsewhere.

```bash
# Mark sub-agent as completed with manual verdict
psql $DATABASE_URL <<SQL
UPDATE sub_agent_execution_results
SET
  status = 'completed',
  verdict = 'PASS',
  completed_at = NOW(),
  output_summary = 'Manually completed - output reviewed offline'
WHERE sd_id = (SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-XXX-001')
  AND agent_code = 'DESIGN'
  AND phase = 'PLAN';
SQL
```

## Related Documentation

- [LEO 5.0 Task System Architecture](../01_architecture/leo-5-task-system.md) - Technical architecture
- [Handoff System Documentation](../leo/handoffs/handoff-system-guide.md) - Handoff mechanics
- [Command Ecosystem](../leo/commands/command-ecosystem.md) - Inter-command workflows

## Version History

- **5.0.0** (2026-01-23): Initial LEO 5.0 operational guide
  - Standard handoff commands
  - LEO 5.0 CLI extensions (walls, failures, subagents, etc.)
  - Operational workflows for all 4 tracks
  - Monitoring queries and dashboard
  - Troubleshooting procedures
  - Emergency procedures
