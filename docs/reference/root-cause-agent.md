# Root Cause Agent (RCA) - Operator Guide

**Strategic Directive**: SD-RCA-001
**Version**: 2.0
**Last Updated**: 2026-01-25

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: LEO Protocol Team
- **Last Updated**: 2026-01-25
- **Tags**: rca, root-cause-analysis, quality-gates, forensics, sub-agent

## Overview

The Root Cause Agent (RCA) is LEO Protocol's corrective intelligence system that automatically detects failures, performs forensic analysis, and ensures proper remediation before allowing work to proceed. RCA operates as a quality gate enforcer and learning capture mechanism.

**🆕 NEW in v2.0**: Proactive learning integration, error-triggered invocation patterns, workaround refusal protocols

### Core Responsibilities

1. **Automatic Failure Detection**: Monitors 4 channels (sub-agents, tests, quality gates, handoffs) via realtime triggers
2. **Forensic Investigation**: Creates Root Cause Reports (RCRs) with evidence, impact assessment, and confidence scoring
3. **Gate Enforcement**: Blocks EXEC→PLAN handoffs when P0/P1 RCRs exist without verified CAPAs
4. **Learning Capture**: Feeds resolved RCRs into EVA preference model for continuous improvement
5. **CAPA Management**: Tracks Corrective and Preventive Actions through verification lifecycle
6. **🆕 Proactive Pattern Consultation**: Queries issue_patterns BEFORE investigation to leverage prior solutions
7. **🆕 Error-Triggered Auto-Invocation**: Automatically invoked on recurring issues, test regressions, and pattern detection

### Key Principles

- **RCA investigates, it does NOT implement fixes**: RCA's role is forensic analysis, not code changes
- **RCA does NOT edit PRDs**: Findings feed into retrospectives, not direct PRD modifications
- **Database-first**: All state in Supabase (root_cause_reports, remediation_manifests, rca_learning_records)
- **4-tier trigger system**: T1 (Critical) → T4 (Manual) with automatic priority assignment
- **Non-blocking on error**: RCA failures never block legitimate handoffs
- **🆕 RCA is a FIRST RESPONDER, not a LAST RESORT**: Invoke on FIRST occurrence, not after multiple failures
- **🆕 Refuse workarounds**: No quick fixes without root cause understanding

---

## 🔍 Proactive Learning Integration (NEW in v2.0)

### Before Starting ANY RCA Work

**MANDATORY**: Query issue_patterns table for proven solutions BEFORE deep investigation:

```bash
# Check for known issue patterns matching this symptom
node scripts/search-prior-issues.js "<symptom description>"

# Query issue_patterns table for proven solutions
node -e "
import { createDatabaseClient } from './lib/supabase-connection.js';
(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });
  const result = await client.query(\`
    SELECT pattern_id, issue_summary, proven_solutions, prevention_checklist, category
    FROM issue_patterns
    WHERE status = 'active'
    ORDER BY occurrence_count DESC
    LIMIT 10
  \`);
  console.log('Known Issue Patterns:');
  result.rows.forEach(p => {
    console.log(\`\n\${p.pattern_id} [\${p.category}]: \${p.issue_summary}\`);
    if (p.proven_solutions) console.log('Solutions:', JSON.stringify(p.proven_solutions, null, 2));
    if (p.prevention_checklist) console.log('Prevention:', JSON.stringify(p.prevention_checklist, null, 2));
  });
  await client.end();
})();
"
```

**Why**: Consulting lessons BEFORE investigation prevents duplicate analysis of known issues and saves 2-4 hours of rework.

---

## ⚡ Error-Triggered Auto-Invocation (NEW in v2.0)

**When ANY of these patterns occur**, the RCA agent MUST be invoked immediately:

### Auto-Trigger Patterns

| Pattern | Action |
|---------|--------|
| `recurring issue` detected (same error 2+ times) | STOP, invoke RCA agent |
| `pattern detected` in logs | STOP, invoke RCA agent |
| `test failure after fix` (regression) | STOP, invoke RCA agent |
| `sub_agent_blocked` status | STOP, invoke RCA agent |
| `quality_gate_critical` failure | STOP, invoke RCA agent |
| `handoff_rejection` event | STOP, invoke RCA agent |
| CI/CD pipeline failures | STOP, invoke RCA agent |
| ANY issue that "keeps happening" | STOP, invoke RCA agent |

### Invocation Protocol

1. Detect recurring or complex issue
2. STOP current approach (no trial-and-error fixes)
3. Invoke: `node scripts/execute-subagent.js --code RCA --sd-id <SD-ID>`
4. Wait for RCA diagnosis
5. Implement solution from RCA agent CAPA

---

## 🚫 Workaround Anti-Patterns (NEW in v2.0)

**If you see these patterns, REFUSE and perform proper RCA instead**:

| Anti-Pattern | Why It's Wrong |
|--------------|----------------|
| **Quick fixes without understanding cause** | Masks symptoms, doesn't prevent recurrence |
| **Suppressing errors** instead of fixing | Hides root causes, leads to larger failures |
| **Adding try/catch** without understanding failures | Creates technical debt, prevents learning |
| **Disabling validation** to make tests pass | Removes safety nets, introduces vulnerabilities |
| **Blaming external factors** without evidence | Stops investigation, prevents real fixes |
| **Proceeding despite recurring failures** | Wastes time on repeated rework |
| **Adding workarounds** instead of fixing root cause | Accumulates complexity, degrades maintainability |

### Response Template for Workaround Requests

```
I've detected a recurring issue that requires root cause analysis.

Symptom: [exact error/behavior]
Occurrences: [how many times this has happened]

I'm performing 5-Whys analysis to identify the true root cause:
[5-Whys analysis]

[Wait for complete diagnosis before proposing fix]
```

---

## Automatic Trigger Flow (T1-T4)

### Tier 1 (Critical) - Auto-creates P0 RCRs

| Trigger Condition | Monitored Channel | Example |
|-------------------|-------------------|---------|
| Quality score drops below 70 | `retrospectives` UPDATE events | Score 72 → 68 triggers P0 RCR |
| Sub-agent verdict = BLOCKED with confidence ≥90 | `sub_agent_execution_results` INSERT | SECURITY agent blocks with 95% confidence |
| CI/CD pipeline fails 2+ consecutive times | GitHub Actions workflow completion | Playwright E2E fails 3 runs in a row |

**Automatic Actions**:
- RCR created with status=OPEN, severity_priority=P0
- EXEC→PLAN handoffs BLOCKED until CAPA verified
- Notification posted to PR (if applicable)

### Tier 2 (High) - Auto-creates P1 RCRs

| Trigger Condition | Monitored Channel | Example |
|-------------------|-------------------|---------|
| Test regression (was passing within 24h) | `test_failures` INSERT + `playwright_test_scenarios` | Login test passed 12h ago, now failing |
| Handoff rejected 2nd time (same type) | `sd_phase_handoffs` UPDATE (status=rejected) | EXEC→PLAN rejected twice for same SD |
| Sub-agent verdict = FAIL with confidence ≥80 | `sub_agent_execution_results` INSERT | DATABASE agent fails with 85% confidence |

**Automatic Actions**:
- RCR created with status=OPEN, severity_priority=P1
- EXEC→PLAN handoffs BLOCKED until CAPA verified
- Investigation recommended within 24 hours

### Tier 3 (Medium) - Auto-creates P2 RCRs

| Trigger Condition | Monitored Channel | Example |
|-------------------|-------------------|---------|
| Quality score drops by 15+ points | `retrospectives` UPDATE | Score 88 → 72 (16-point drop) |
| Pattern recurrence ≥3 times | `issue_patterns` occurrence_count | Same error signature seen 3 times |
| Performance regression >50% | `performance_benchmarks` (future) | API latency increases from 100ms → 180ms |

**Automatic Actions**:
- RCR created with status=OPEN, severity_priority=P2
- Handoffs NOT blocked (P2 is informational)
- Investigation recommended within 1 week

### Tier 4 (Manual) - Operator-initiated

**Use Cases**:
- Chairman command: "diagnose defect in login flow"
- Post-mortem after production incident
- Exploratory analysis of suspicious patterns

**Manual Trigger**:
```bash
node scripts/root-cause-agent.js trigger \
  --sd-id "SD-AUTH-001" \
  --problem-statement "Intermittent authentication failures in production" \
  --context "Observed 12 failures over 3 days, no consistent pattern"
```

---

## Investigation Phase (CLI Commands)

### 1. List Open RCRs

```bash
# List all open RCRs for a Strategic Directive
node scripts/root-cause-agent.js list --sd-id SD-AUTH-001

# Example Output:
#
# Open RCRs for SD-AUTH-001:
#
# ID: f47ac10b-58cc-4372-a567-0e02b2c3d479
# Status: OPEN
# Severity: P1
# Problem: Test "User login with valid credentials" regressed (was passing 8.2h ago)
# Trigger: TEST_FAILURE (Tier 2)
# Confidence: 70/100
# Created: 2025-10-28T14:23:11Z
# Evidence: test_failure_id, stack_trace, screenshot_url
```

### 2. View RCR Details

```bash
node scripts/root-cause-agent.js view --rcr-id f47ac10b-58cc-4372-a567-0e02b2c3d479

# Shows full RCR including:
# - Problem statement
# - Observed vs Expected state
# - Evidence references (stack traces, logs, screenshots)
# - Confidence breakdown
# - Root cause analysis (if completed)
# - Related RCRs (same pattern)
```

### 3. Check Gate Status

```bash
# Check if SD can proceed with handoff
node scripts/root-cause-agent.js gate-check --sd-id SD-AUTH-001

# Example Output (BLOCKED):
#
# ❌ GATE STATUS: BLOCKED
#
# Open RCRs: 2
# P0 RCRs: 1 (without verified CAPA)
# P1 RCRs: 1 (without verified CAPA)
#
# Blocking RCRs:
# 1. f47ac10b (P0) - Quality score dropped below critical threshold (68/100)
#    CAPA Status: PENDING
# 2. a8b3c7d2 (P1) - Test regression: login test
#    CAPA Status: Not created
#
# Remediation: Create and verify CAPAs for all P0/P1 RCRs before handoff

# Example Output (PASS):
#
# ✅ GATE STATUS: PASS
#
# No blocking RCRs found. EXEC→PLAN handoff can proceed.
```

### 4. Get SD Status

```bash
node scripts/root-cause-agent.js status --sd-id SD-AUTH-001

# Comprehensive summary:
# - Open RCRs by severity
# - CAPA status breakdown
# - Gate readiness
# - Recommended actions
```

---

## CAPA Generation

### What is a CAPA?

**CAPA** = Corrective and Preventive Action manifest that documents:
- **Corrective Actions**: Immediate fixes to resolve the defect
- **Preventive Actions**: Long-term improvements to prevent recurrence
- **Verification Plan**: How to validate the fix works
- **Risk Score**: Assessment of fix complexity and blast radius

### Generate CAPA

```bash
node scripts/root-cause-agent.js capa generate --rcr-id f47ac10b-58cc

# Interactive prompts:
# 1. Enter root cause category (CODE_DEFECT, TEST_COVERAGE_GAP, CONFIG_ERROR, etc.)
# 2. Describe corrective actions (JSON array of action objects)
# 3. Describe preventive actions (JSON array of action objects)
# 4. Define verification plan (test scenarios, success criteria)
# 5. Estimate risk score (0-100, based on complexity and impact)
```

**Example CAPA**:
```json
{
  "rcr_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "root_cause_category": "TEST_COVERAGE_GAP",
  "proposed_changes": {
    "corrective_actions": [
      {
        "action": "Add authentication state validation before login test",
        "files_affected": ["tests/e2e/auth.spec.ts"],
        "estimated_effort_hours": 2
      }
    ],
    "preventive_actions": [
      {
        "action": "Create reusable auth test fixture with state cleanup",
        "files_affected": ["tests/fixtures/auth.ts"],
        "estimated_effort_hours": 4
      },
      {
        "action": "Add pre-test state validation to all E2E tests",
        "files_affected": ["tests/e2e/*.spec.ts"],
        "estimated_effort_hours": 8
      }
    ]
  },
  "verification_plan": {
    "test_scenarios": [
      "Run auth.spec.ts 10 times consecutively",
      "Run full E2E suite with --repeat-each=3"
    ],
    "success_criteria": [
      "Zero authentication failures across all runs",
      "All tests show consistent pass rate >99%"
    ]
  },
  "risk_score": 25,
  "affected_sd_count": 1
}
```

### Update CAPA

```bash
# Modify existing CAPA (before approval)
node scripts/root-cause-agent.js capa update \
  --capa-id <UUID> \
  --field "proposed_changes.corrective_actions" \
  --value '[{"action": "Updated action", "files_affected": ["file.ts"], "estimated_effort_hours": 3}]'
```

### Approve CAPA

```bash
# Move CAPA to APPROVED status (ready for implementation)
node scripts/root-cause-agent.js capa approve --capa-id <UUID>

# This changes:
# - CAPA status: PENDING → APPROVED
# - RCR status: CAPA_PENDING → CAPA_APPROVED
```

---

## Fix Implementation

**IMPORTANT**: RCA does NOT implement fixes. The approved CAPA becomes a work item for the developer.

### Implementation Workflow

1. **Developer pulls CAPA details**:
   ```bash
   node scripts/root-cause-agent.js view --rcr-id <UUID>
   ```

2. **Developer implements corrective actions**:
   - Follow proposed_changes.corrective_actions
   - Update files_affected as specified
   - Track effort_hours for retrospective

3. **Developer implements preventive actions**:
   - Follow proposed_changes.preventive_actions
   - May create new Strategic Directives if scope is large

4. **Developer runs verification plan**:
   - Execute all test_scenarios from verification_plan
   - Validate success_criteria are met
   - Document results

5. **Update CAPA status**:
   ```bash
   # Mark as implemented (triggers verification phase)
   node scripts/root-cause-agent.js capa update \
     --capa-id <UUID> \
     --field "status" \
     --value "IMPLEMENTED"
   ```

---

## Verification Phase

### Run Verification Tests

After CAPA is marked IMPLEMENTED, run the verification plan:

```bash
# Example for auth test regression
npm run test:e2e -- tests/e2e/auth.spec.ts --repeat-each=10

# Check results against success_criteria
# If all criteria met, proceed to verification approval
```

### Verify CAPA

```bash
node scripts/root-cause-agent.js capa verify \
  --capa-id <UUID> \
  --verification-notes "Ran auth.spec.ts 10 times, 100% pass rate. Full E2E suite with --repeat-each=3 showed zero auth failures."

# This triggers:
# - CAPA status: IMPLEMENTED → VERIFIED
# - RCR status: FIX_IN_PROGRESS → RESOLVED (automatic via trigger)
# - Gate unblocked: EXEC→PLAN handoff now allowed
```

### Verification Failure

If verification fails:

```bash
node scripts/root-cause-agent.js capa update \
  --capa-id <UUID> \
  --field "status" \
  --value "FAILED_VERIFICATION"

# Add notes explaining failure:
node scripts/root-cause-agent.js capa update \
  --capa-id <UUID> \
  --field "verification_notes" \
  --value "Auth test still failed on run 7/10. Root cause may be incomplete."

# This requires:
# - Re-analysis of RCR
# - Updated CAPA with additional corrective actions
# - Repeat verification cycle
```

---

## Learning Capture

### Automatic Learning Ingestion

Once RCR is RESOLVED, learning data is automatically captured for EVA:

```bash
# Manual ingestion (normally runs on schedule)
node scripts/rca-learning-ingestion.js --rcr-id <UUID>

# Batch ingestion (all resolved RCRs without learning records)
node scripts/rca-learning-ingestion.js --batch
```

### What Gets Captured?

**15+ ML Features**:
- Categorical: scope_type, trigger_source, root_cause_category, severity_priority
- Numerical: confidence, log_quality, recurrence_count, evidence_strength
- Temporal: hour_of_day, day_of_week
- Context: has_repro_steps, has_stack_trace, has_logs, has_screenshots
- CAPA: risk_score, affected_sd_count, preventive_action_count

**Defect Classification**:
- Maps to 9 taxonomy categories (test_coverage_gap_regression, code_defect_runtime, etc.)
- Rule-based classification (can be replaced with ML model)

**Preventability Analysis**:
- Determines if defect was preventable
- Identifies prevention stage (LEAD_PRE_APPROVAL, PLAN_PRD, EXEC_IMPL, PLAN_VERIFY, NEVER)
- Used to improve quality gates at earlier stages

**Time Metrics**:
- Time to detect (first_occurrence → detected_at)
- Time to resolve (detected_at → resolved_at)
- Used for performance benchmarking

### EVA Integration

Learning records automatically link to EVA preference model:
1. Features extracted and normalized
2. Defect class assigned via taxonomy
3. Prevention analysis completed
4. Record written to `rca_learning_records` table
5. EVA preference model retrains on new data (scheduled job)

---

## Manual Trigger Flow

### When to Use Manual Triggers

- **Post-mortem analysis**: After production incident
- **Chairman directive**: "Investigate why deployment took 4 hours"
- **Pattern exploration**: "Analyze why 3 SDs had handoff rejections this week"
- **Hypothesis testing**: "Check if recent test failures correlate with dependency updates"

### Manual Trigger Steps

1. **Identify scope**:
   - SD-level: Specific Strategic Directive
   - PRD-level: Specific PRD document
   - PIPELINE: CI/CD pipeline failure
   - RUNTIME: Production runtime error

2. **Trigger RCR**:
   ```bash
   node scripts/root-cause-agent.js trigger \
     --sd-id "SD-AUTH-001" \
     --problem-statement "Intermittent authentication failures in production" \
     --context "Observed 12 failures over 3 days, user reports token expiry issues"
   ```

3. **Provide evidence** (optional but recommended):
   ```bash
   # After RCR created, update with evidence
   node scripts/root-cause-agent.js update \
     --rcr-id <UUID> \
     --field "evidence_refs" \
     --value '{"logs": "https://logs.example.com/12345", "stack_trace": "Error: Token expired...", "affected_users": ["user1", "user2"]}'
   ```

4. **Perform investigation**:
   - Review evidence_refs (logs, stack traces, screenshots)
   - Reproduce issue using repro_steps
   - Analyze causal chain (5 Whys method)
   - Identify root_cause_category

5. **Document findings**:
   ```bash
   node scripts/root-cause-agent.js update \
     --rcr-id <UUID> \
     --field "root_cause_analysis" \
     --value "JWT token expiry set to 1 hour, but session refresh logic only checks every 90 minutes"
   ```

6. **Generate CAPA** (follow CAPA generation workflow above)

---

## Gate Enforcement

### How the Gate Works

**Location**: `scripts/unified-handoff-system.js` → `executeExecToPlan()` at line 513

**Logic**:
1. Query for P0/P1 RCRs for this SD
2. Filter for RCRs without verified CAPAs
3. If any found: BLOCK handoff with reasonCode='RCA_GATE_BLOCKED'
4. If none found: ALLOW handoff to proceed

**Non-blocking on error**: If RCA gate check fails (database error, etc.), gate returns PASS with error metadata to prevent false blocks

### Example: Blocked Handoff

```bash
# Developer attempts EXEC→PLAN handoff
node scripts/unified-handoff-system.js exec-to-plan --sd-id SD-AUTH-001

# Output:
#
# ❌ Handoff REJECTED: RCA_GATE_BLOCKED
#
# 2 P0/P1 RCRs exist without verified CAPAs:
#
# 1. RCR f47ac10b (P0) - Quality score dropped below critical threshold
#    Created: 2 hours ago
#    Status: CAPA_PENDING
#    CAPA: Not verified
#
# 2. RCR a8b3c7d2 (P1) - Test regression: login test
#    Created: 4 hours ago
#    Status: OPEN
#    CAPA: Not created
#
# Remediation Steps:
# 1. Generate CAPA for RCR a8b3c7d2: node scripts/root-cause-agent.js capa generate --rcr-id a8b3c7d2
# 2. Implement corrective actions for both RCRs
# 3. Run verification tests
# 4. Verify CAPAs: node scripts/root-cause-agent.js capa verify --capa-id <UUID>
# 5. Retry handoff
```

### Example: Passed Handoff

```bash
# After CAPAs verified
node scripts/unified-handoff-system.js exec-to-plan --sd-id SD-AUTH-001

# Output:
#
# ✅ RCA Gate: PASS (0 blocking RCRs)
# ✅ BMAD Validation: PASS
# ✅ Handoff ACCEPTED
#
# Created handoff record: 9d3f2e1a-4b5c-6d7e-8f9a-0b1c2d3e4f5a
# Status: pending_review
# Next: PLAN agent reviews implementation
```

---

## Dashboard Queries

### Analytics Overview (Last 30 Days)

```sql
SELECT * FROM v_rca_analytics;

-- Returns:
-- - total_rcrs: Total RCRs created
-- - open_rcrs: Currently open
-- - resolved_rcrs: Successfully resolved
-- - avg_resolution_hours: Mean time to resolve
-- - p0_count, p1_count, p2_count, p3_count: By severity
-- - top_categories: Most common root cause categories
-- - top_triggers: Most common trigger sources
-- - preventable_count: How many were preventable
-- - avg_confidence: Mean confidence score
```

### Pattern Recurrence Analysis

```sql
SELECT * FROM v_rca_pattern_recurrence
WHERE occurrence_count >= 3
ORDER BY occurrence_count DESC, last_seen DESC;

-- Shows patterns that have recurred 3+ times
-- Useful for identifying systemic issues
```

### Comprehensive Analytics with Taxonomy

```sql
SELECT * FROM v_rca_comprehensive_analytics
WHERE severity_priority IN ('P0', 'P1')
ORDER BY created_at DESC;

-- Joins RCRs with defect_taxonomy
-- Shows prevention_stage recommendations
-- Useful for strategic quality improvements
```

### RCRs Blocking Handoffs

```sql
SELECT
  rcr.id,
  rcr.sd_id,
  rcr.severity_priority,
  rcr.problem_statement,
  rcr.status,
  COALESCE(capa.status, 'NOT_CREATED') AS capa_status,
  capa.verified_at
FROM root_cause_reports rcr
LEFT JOIN remediation_manifests capa ON capa.rcr_id = rcr.id
WHERE rcr.severity_priority IN ('P0', 'P1')
  AND rcr.status IN ('OPEN', 'IN_REVIEW', 'CAPA_PENDING', 'CAPA_APPROVED', 'FIX_IN_PROGRESS')
  AND (capa.status IS NULL OR capa.status != 'VERIFIED')
ORDER BY
  CASE rcr.severity_priority WHEN 'P0' THEN 1 WHEN 'P1' THEN 2 END,
  rcr.created_at DESC;
```

### Learning Pipeline Status

```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'RESOLVED') AS resolved_rcrs,
  COUNT(lr.id) AS learning_records_created,
  COUNT(*) FILTER (WHERE status = 'RESOLVED' AND lr.id IS NULL) AS pending_ingestion
FROM root_cause_reports rcr
LEFT JOIN rca_learning_records lr ON lr.rcr_id = rcr.id;
```

---

## Troubleshooting

### Issue: RCR Not Auto-Created

**Symptoms**: Expected T1/T2 trigger did not create RCR

**Diagnosis**:
1. Check if runtime monitors are active:
   ```bash
   # In application startup logs, look for:
   # "Initializing RCA runtime monitoring..."
   # "✅ RCA monitoring active (4 triggers)"
   ```

2. Verify trigger conditions met:
   - T1 quality: Score actually dropped below 70?
   - T2 regression: Test was passing within 24h?
   - T2 handoff: 2nd rejection for same handoff type?

3. Check for duplicate suppression:
   ```sql
   SELECT * FROM root_cause_reports
   WHERE failure_signature_hash = md5('your_signature')
     AND status IN ('OPEN', 'IN_REVIEW');
   ```
   If match found, recurrence_count was incremented instead

**Resolution**:
- Ensure Supabase realtime is enabled for monitored tables
- Check `lib/rca-runtime-triggers.js` is imported in application startup
- Manually trigger if needed: `node scripts/root-cause-agent.js trigger`

### Issue: Gate Blocking Despite Verified CAPA

**Symptoms**: Handoff rejected with RCA_GATE_BLOCKED, but CAPA shows verified_at timestamp

**Diagnosis**:
1. Check CAPA status field:
   ```sql
   SELECT id, status, verified_at FROM remediation_manifests WHERE rcr_id = '<UUID>';
   ```
   Status must be exactly 'VERIFIED' (not 'IMPLEMENTED')

2. Check RCR status updated:
   ```sql
   SELECT id, status FROM root_cause_reports WHERE id = '<UUID>';
   ```
   Status should be 'RESOLVED' if CAPA verified

**Resolution**:
- Run CAPA verify command: `node scripts/root-cause-agent.js capa verify --capa-id <UUID>`
- Check database trigger `update_rcr_on_capa_verified()` is active
- Manually update RCR status if trigger failed:
   ```sql
   UPDATE root_cause_reports SET status = 'RESOLVED' WHERE id = '<UUID>';
   ```

### Issue: Learning Ingestion Failing

**Symptoms**: `rca-learning-ingestion.js` throws error or skips RCRs

**Diagnosis**:
1. Check RCR has required fields:
   ```sql
   SELECT id, status, root_cause_category, detected_at
   FROM root_cause_reports
   WHERE id = '<UUID>';
   ```
   root_cause_category must not be null

2. Check for existing learning record:
   ```sql
   SELECT id FROM rca_learning_records WHERE rcr_id = '<UUID>';
   ```

**Resolution**:
- Update RCR with root_cause_category before ingestion
- Delete duplicate learning record if exists
- Re-run: `node scripts/rca-learning-ingestion.js --rcr-id <UUID>`

### Issue: Confidence Score Stuck at 40-50

**Symptoms**: All RCRs have low confidence despite good evidence

**Diagnosis**:
Confidence formula: BASE(40) + log_quality(20) + evidence_strength(20) + pattern_match(15) + historical_success(5)

Low scores indicate missing evidence components:
- log_quality: Requires stack_trace in evidence_refs (adds 20)
- evidence_strength: Requires forensic analysis (adds 20)
- pattern_match: Requires similar pattern in issue_patterns (adds 15)

**Resolution**:
1. Add stack traces to evidence_refs when available
2. Run full forensic analysis (v1.1 feature - stub in v1)
3. Link to existing patterns via pattern_id field

### Issue: RCRs Automatically Going STALE

**Symptoms**: RCRs marked STALE after 30 days

**Diagnosis**:
This is expected behavior (auto_stale_rca trigger function)

**Resolution**:
- Update RCR regularly to reset age calculation
- Mark STALE RCRs as WONT_FIX if intentionally not fixing:
  ```sql
  UPDATE root_cause_reports SET status = 'WONT_FIX' WHERE id = '<UUID>';
  ```

---

## Metrics & KPIs

### Primary Metrics

1. **Mean Time to Detect (MTTD)**:
   ```sql
   SELECT AVG(time_to_detect_hours) FROM rca_learning_records;
   ```
   Target: <24 hours for P0/P1 issues

2. **Mean Time to Resolve (MTTR)**:
   ```sql
   SELECT AVG(time_to_resolve_hours) FROM rca_learning_records;
   ```
   Target: <72 hours for P0, <168 hours for P1

3. **Preventable Defect Rate**:
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE preventable = true) * 100.0 / COUNT(*) AS preventable_pct
   FROM rca_learning_records;
   ```
   Goal: Decreasing trend over time (learning effectiveness)

4. **Gate Block Rate**:
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE rejection_reason LIKE '%RCA_GATE_BLOCKED%') * 100.0 / COUNT(*) AS block_rate
   FROM sd_phase_handoffs
   WHERE handoff_type = 'EXEC_TO_PLAN';
   ```
   Target: <10% (indicates good quality before handoff)

### Secondary Metrics

5. **CAPA Verification Success Rate**:
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE status = 'VERIFIED') * 100.0 /
     COUNT(*) FILTER (WHERE status IN ('VERIFIED', 'FAILED_VERIFICATION')) AS success_rate
   FROM remediation_manifests;
   ```

6. **Pattern Recurrence Rate**:
   ```sql
   SELECT AVG(occurrence_count) FROM issue_patterns;
   ```
   Goal: Trend toward 1.0 (each issue unique, preventive actions working)

7. **Auto-trigger Coverage**:
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE trigger_tier <= 2) * 100.0 / COUNT(*) AS auto_trigger_pct
   FROM root_cause_reports;
   ```
   Target: >80% (most issues caught automatically)

### Dashboards

**Weekly Review**:
- Total RCRs created this week (by tier)
- P0/P1 resolution status
- Top 3 root cause categories
- Gate block incidents

**Monthly Review**:
- MTTD/MTTR trends
- Preventable defect rate trend
- Learning record ingestion count
- CAPA success rate

**Quarterly Review**:
- Defect taxonomy distribution shifts
- Prevention stage effectiveness (are LEAD catches increasing?)
- Pattern recurrence analysis (systemic issues)
- ROI analysis (time saved by early detection)

---

## Best Practices

### For Operators

1. **Triage P0/P1 RCRs within 4 hours**: High severity issues block progress
2. **Always provide context in manual triggers**: Good problem_statement + context = better analysis
3. **Document evidence thoroughly**: Stack traces, logs, screenshots improve confidence scores
4. **Write specific verification plans**: "Run test 10 times" is better than "test it"
5. **Use defect_taxonomy consistently**: Enables pattern detection and prevention analysis
6. **Review STALE RCRs weekly**: Either resolve or mark WONT_FIX to keep queue clean
7. **🆕 Consult issue_patterns FIRST**: Query known patterns before deep investigation (saves 2-4 hours)
8. **🆕 Invoke on FIRST occurrence**: Don't wait for recurring failures to trigger RCA
9. **🆕 Refuse workarounds**: No quick fixes without understanding root cause

### For Developers

1. **Check gate status before starting EXEC→PLAN**: Avoid surprise blocks
   ```bash
   node scripts/root-cause-agent.js gate-check --sd-id <SD>
   ```
2. **Implement preventive actions, not just corrective**: Long-term quality improvement
3. **Run full verification plan**: Don't skip steps to save time
4. **Update RCRs with findings during investigation**: Future pattern matching depends on it
5. **Link related RCRs**: Use pattern_id to connect similar issues

### For LEAD Agents

1. **Review RCA analytics during retrospectives**: Identify systemic process gaps
2. **Prioritize preventable defects**: If prevention_stage = 'LEAD_PRE_APPROVAL', improve directive review
3. **Track CAPA effectiveness**: Are preventive actions actually preventing recurrence?
4. **Escalate recurring patterns**: 3+ occurrences may need architectural changes
5. **Incorporate learning into quality gates**: Update checklists based on common defect classes

### For PLAN Agents

1. **Check RCR history during PRD creation**: Learn from past mistakes on similar features
2. **Reference defect_taxonomy in test plans**: Ensure coverage for common defect classes
3. **Set verification criteria informed by RCAs**: Use CAPA verification plans as templates
4. **Update BMAD based on preventable defects**: If prevention_stage = 'PLAN_PRD', improve validation
5. **Link PRDs to resolved RCRs**: Traceability for future analysis

---

## Integration Points

### With LEO Protocol

- **LEAD Phase**: RCA analytics inform directive review criteria
- **PLAN Phase**: Defect taxonomy guides test plan creation
- **EXEC Phase**: Gate enforcement blocks handoffs until quality verified
- **Retrospectives**: Resolved RCRs auto-link to retrospective metadata

### With Sub-Agents

- **DOCMON**: Documents RCAs in workflow knowledge base
- **GITHUB**: RCA findings posted to PRs when CI failures occur
- **UAT**: User stories validated against common defect patterns
- **RETRO**: Learning records feed into retrospective quality scoring
- **DESIGN**: UI/UX defects tracked via defect_taxonomy
- **SECURITY**: Security defects trigger P0 RCRs automatically
- **DATABASE**: Schema defects analyzed for prevention at PLAN stage
- **TESTING**: Test coverage gaps identified and tracked
- **PERFORMANCE**: Performance regressions trigger T3 RCRs
- **VALIDATION**: Validation failures create forensic evidence for RCAs

### With EVA

- **Preference Model**: Learning records train EVA to predict defect likelihood
- **Chairman Interface**: "Diagnose defect" command triggers manual RCA
- **Quality Scoring**: RCA confidence feeds into overall SD quality score
- **Pattern Detection**: EVA learns from issue_patterns to suggest preventive actions

### With CI/CD

- **Auto-trigger Workflow**: `.github/workflows/rca-auto-trigger.yml`
- **Artifact Collection**: Test results, logs, screenshots preserved as evidence
- **PR Comments**: RCA summaries posted to pull requests
- **Gate Integration**: CI checks gate status before allowing merges (future)

### With Supabase

- **Realtime Triggers**: 4 channels monitor for failures
- **RLS Policies**: service_role (full access), authenticated (read-only)
- **Analytics Views**: v_rca_analytics, v_rca_pattern_recurrence
- **Database Triggers**: Auto-stale, CAPA verification, timestamp updates

---

## Quick Reference

### CLI Commands

```bash
# List RCRs
node scripts/root-cause-agent.js list --sd-id <SD>

# View details
node scripts/root-cause-agent.js view --rcr-id <UUID>

# Manual trigger
node scripts/root-cause-agent.js trigger --sd-id <SD> --problem-statement "<text>"

# Check gate
node scripts/root-cause-agent.js gate-check --sd-id <SD>

# Get status
node scripts/root-cause-agent.js status --sd-id <SD>

# Generate CAPA
node scripts/root-cause-agent.js capa generate --rcr-id <UUID>

# Approve CAPA
node scripts/root-cause-agent.js capa approve --capa-id <UUID>

# Verify CAPA
node scripts/root-cause-agent.js capa verify --capa-id <UUID> --verification-notes "<text>"

# Ingest learning
node scripts/rca-learning-ingestion.js --rcr-id <UUID>
node scripts/rca-learning-ingestion.js --batch
```

### Database Tables

- `root_cause_reports` - Core RCR records
- `remediation_manifests` - CAPA tracking
- `rca_learning_records` - EVA integration
- `defect_taxonomy` - 9 defect categories
- `issue_patterns` - Recurrence tracking

### Status Flows

**RCR Lifecycle**:
OPEN → IN_REVIEW → CAPA_PENDING → CAPA_APPROVED → FIX_IN_PROGRESS → RESOLVED

**CAPA Lifecycle**:
PENDING → UNDER_REVIEW → APPROVED → IN_PROGRESS → IMPLEMENTED → VERIFIED

### Severity Matrix

| Impact ↓ / Likelihood → | FREQUENT | OCCASIONAL | RARE | UNLIKELY |
|-------------------------|----------|------------|------|----------|
| CRITICAL                | P0       | P0         | P1   | P2       |
| HIGH                    | P0       | P1         | P2   | P3       |
| MEDIUM                  | P1       | P2         | P3   | P4       |
| LOW                     | P2       | P3         | P4   | P4       |

**Gate Blocking**: Only P0 and P1 block handoffs

---

**Document Version**: 2.0
**Last Updated**: 2026-01-25
**Maintained By**: LEO Protocol Team
**Feedback**: Report issues to RCA sub-agent or create SD for improvements

---

## Changelog

### v2.0.0 (2026-01-25)
- Added "Proactive Learning Integration" section - query issue_patterns before investigation
- Added "Error-Triggered Auto-Invocation" section - automatic RCA invocation patterns
- Added "Workaround Anti-Patterns" section - explicit workaround refusal protocol
- Updated "Key Principles" to include "FIRST RESPONDER" philosophy
- Updated "Best Practices for Operators" with 3 new proactive patterns
- Updated metadata header to include category, status, version, tags

### v1.0.0 (2025-10-28)
- Initial RCA operator guide
- T1-T4 trigger system documentation
- CAPA generation and verification workflows
- CLI command reference
