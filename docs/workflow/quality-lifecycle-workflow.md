# Quality Lifecycle System - Workflow Guide


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-18
- **Tags**: database, api, e2e, schema

**Status**: Completed
**Version**: 1.0.0
**Orchestrator SD**: SD-QUALITY-LIFECYCLE-001
**Last Updated**: 2026-01-18

## Overview

This document describes the operational workflows for the Quality Lifecycle System, showing how feedback flows through the five stages and how components integrate with LEO Protocol and existing systems.

---

## Table of Contents

1. [Core Workflow](#core-workflow)
2. [Feedback Capture Workflows](#feedback-capture-workflows)
3. [Triage Workflows](#triage-workflows)
4. [Resolution Workflows](#resolution-workflows)
5. [Release Planning Workflows](#release-planning-workflows)
6. [Integration Workflows](#integration-workflows)
7. [Chairman Workflows](#chairman-workflows)

---

## Core Workflow

### The Five-Stage Lifecycle

```
┌────────────────────────────────────────────────────────────────────────┐
│                     QUALITY LIFECYCLE SYSTEM                            │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  PREVENTION    CAPTURE      TRIAGE        RESOLUTION    LEARNING      │
│  (PLAN)        (POST-EXEC)  (Filter)      (Fix/Build)   (Improve)     │
│                                                                        │
│  ┌─────┐      ┌─────┐      ┌─────┐       ┌─────┐      ┌─────┐        │
│  │ PRD │ ───▶ │/uat │ ───▶ │ P0  │ ───▶  │/fix │ ───▶ │/learn│       │
│  │User │      │/inbox      │ P1  │       │ SD  │      │Ptrns │       │
│  │Story│      │Error│      │Snooze      │     │      │     │       │
│  └─────┘      └─────┘      └─────┘       └─────┘      └─────┘        │
│                                                                        │
│     ↓             ↓             ↓             ↓            ↓          │
│  Define       Detect       Prioritize      Execute      Extract       │
│  Expected     Problems     & Filter        Solution     Patterns      │
│  Behavior     & Ideas      Noise           & Ship       & Improve     │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Stage 1: Prevention (PLAN Phase)

**Purpose**: Define requirements and expected behavior BEFORE coding

**Activities**:
- Write PRDs with user stories
- Define acceptance criteria
- Specify success metrics
- Identify risks

**Output**: Clear requirements that prevent issues

**LEO Integration**: Built into PLAN phase via PRD template

### Stage 2: Capture (POST-EXEC)

**Purpose**: Detect issues and collect enhancement ideas

**Entry Points**:
1. **Manual Feedback**: Users report via `/inbox new` or feedback widget
2. **Automatic Errors**: Runtime errors auto-captured
3. **UAT Failures**: Test failures from `/uat` command

**Output**: Feedback record in `feedback` table with type discriminator

### Stage 3: Triage (Filter)

**Purpose**: Prioritize, filter noise, route to resolution

**Activities**:
- Calculate priority (severity-based or value/effort)
- Group error bursts
- Apply snooze/ignore rules
- AI triage suggestions (future)

**Output**: Prioritized feedback ready for resolution

### Stage 4: Resolution (Fix/Build)

**Purpose**: Fix issues and build enhancements

**Paths**:
- **Quick Fix**: <50 LOC, no risky keywords → `/quick-fix`
- **Full SD**: Complex issues or enhancements → LEO Protocol
- **Won't Fix/Do**: Explicitly rejected

**Output**: Resolved feedback, updated status

### Stage 5: Learning (Improve)

**Purpose**: Extract patterns and create improvement SDs

**Activities**:
- Detect recurring issues (same error_hash 3+ times)
- Identify cross-venture patterns
- Create improvement SDs via `/learn`

**Output**: Continuous improvement SDs

---

## Feedback Capture Workflows

### Workflow 1: Manual Issue Reporting (CLI)

**Actor**: Developer or Claude

**Steps**:
1. Run `/inbox new`
2. System prompts via AskUserQuestion:
   - Type: Issue (default)
   - Title: "Payment checkout fails on Safari"
   - Description: "When clicking pay button..."
   - Severity: High
3. System calculates priority: High severity → P1
4. Feedback created in database:
   ```javascript
   {
     id: 'FB-001',
     type: 'issue',
     source_application: 'ehg',
     source_type: 'manual_feedback',
     title: 'Payment checkout fails on Safari',
     severity: 'high',
     priority: 'P1',
     status: 'new'
   }
   ```
5. Confirmation: "Feedback FB-001 logged (Priority: P1)"

**Result**: Issue appears in inbox, visible to `/inbox` and `/quality/inbox`

### Workflow 2: Manual Enhancement Request (Web UI)

**Actor**: Chairman or end user

**Steps**:
1. Click FAB (bottom-right corner)
2. Modal opens
3. Toggle type: Enhancement
4. Fill form:
   - Title: "Add dark mode support"
   - Description: "Users working at night need dark mode..."
   - Value estimate: High
   - Effort estimate: Medium
   - Use case: "As a user working at night, I want..."
5. Submit
6. System calculates priority: High value + Medium effort → P1
7. Feedback created in database
8. Confirmation: "Enhancement request submitted: FB-002"

**Result**: Enhancement appears in backlog (`/quality/backlog`)

### Workflow 3: Automatic Error Capture

**Actor**: System (automatic)

**Trigger**: Runtime error occurs

**Node.js Example**:
```javascript
// Error thrown somewhere in code
throw new Error('Database connection timeout');

// Global handler captures
process.on('uncaughtException', async (error) => {
  await captureError(error, {
    source_application: 'ehg',
    context: 'database_connection'
  });
});
```

**Steps**:
1. Error occurs
2. Global handler captures error
3. System generates error hash: `SHA256(message + stack)`
4. Check for existing error with same hash in last 5 minutes
5. If exists: Increment `occurrence_count`, update `last_seen`
6. If new: Create feedback record:
   ```javascript
   {
     id: 'FB-003',
     type: 'issue',
     source_application: 'ehg',
     source_type: 'uncaught_exception',
     error_message: 'Database connection timeout',
     stack_trace: '...',
     error_hash: 'abc123...',
     occurrence_count: 1,
     severity: 'high',  // Auto-determined
     priority: 'P1'
   }
   ```
7. No user notification (silent capture)

**Result**: Error logged, ready for triage

### Workflow 4: UAT Test Failure

**Actor**: Developer or Claude running `/uat`

**Steps**:
1. Run `/uat` for SD-XXX-001
2. Execute test scenario: "User can log in"
3. Test fails
4. System prompts:
   - Failure type: Functionality
   - Failure notes: "Login button not responding"
5. Result recorder creates feedback:
   ```javascript
   {
     id: 'FB-004',
     type: 'issue',
     source_application: 'ehg',
     source_type: 'uat_failure',
     source_id: '<uat_test_result_id>',
     title: 'UAT Failure: User can log in',
     description: 'Login button not responding',
     severity: 'high',
     priority: 'P1',
     sd_id: 'SD-XXX-001'
   }
   ```
6. Risk Router routes:
   - Estimate LOC: 30 lines
   - No risky keywords
   - Suggest: `/quick-fix FB-004`

**Result**: Test failure captured, routed to resolution

---

## Triage Workflows

### Workflow 5: Priority Calculation (Issues)

**Trigger**: New issue created

**Logic**:
```javascript
function calculateIssuePriority(severity, source_application) {
  const currentVenture = getCurrentVentureContext();

  if (severity === 'critical' && source_application === currentVenture) {
    return 'P0';
  } else if (severity === 'high' || source_application === currentVenture) {
    return 'P1';
  } else if (severity === 'medium') {
    return 'P2';
  } else {
    return 'P3';
  }
}
```

**Example**:
- Issue: Payment failure
- Severity: Critical
- Source: EHG (current venture)
- **Result**: P0

### Workflow 6: Priority Calculation (Enhancements)

**Trigger**: New enhancement created

**Logic**:
```javascript
const VALUE_EFFORT_MATRIX = {
  high: { small: 'P1', medium: 'P1', large: 'P2' },
  medium: { small: 'P1', medium: 'P2', large: 'P3' },
  low: { small: 'P2', medium: 'P3', large: 'P3' }
};

function calculateEnhancementPriority(value, effort) {
  return VALUE_EFFORT_MATRIX[value][effort];
}
```

**Example**:
- Enhancement: Add dark mode
- Value: High (user-requested feature)
- Effort: Medium (styling changes)
- **Result**: P1 (quick win)

### Workflow 7: Burst Grouping

**Trigger**: 3+ identical errors within 5 minutes

**Scenario**: API endpoint returns 500 error, called 127 times in 3 minutes

**Steps**:
1. First error creates feedback: FB-005
   - `error_hash: 'xyz789'`
   - `occurrence_count: 1`
2. Second error (hash matches, within 5 min):
   - Update FB-005: `occurrence_count: 2`
3. Third error: `occurrence_count: 3`
4. ... errors 4-127: `occurrence_count: 127`
5. `last_seen` timestamp updated to last occurrence

**Result**: 127 errors → 1 feedback item (FB-005)

**Display**:
```
FB-005: API endpoint timeout
Occurrences: 127
First seen: 2026-01-18 10:00:00
Last seen: 2026-01-18 10:03:42
Status: Burst detected
```

### Workflow 8: Snooze Feedback

**Actor**: Developer or Chairman

**Use Case**: "I'll deal with this after launch"

**CLI**:
```bash
/inbox snooze FB-006 7d
```

**Web UI**: Click "Snooze" button, select duration

**Steps**:
1. System updates feedback:
   ```sql
   UPDATE feedback
   SET snoozed_until = NOW() + INTERVAL '7 days'
   WHERE id = 'FB-006';
   ```
2. Feedback hidden from default views
3. Confirmation: "FB-006 snoozed until 2026-01-25"

**Visibility**:
- `/inbox` → Not visible (default: hide snoozed)
- `/inbox --all` → Visible with "(Snoozed)" label
- Auto-reappears after `snoozed_until` timestamp

### Workflow 9: Won't Fix / Won't Do

**Actor**: Chairman or Lead Developer

**Use Case**: "Known limitation, documented"

**CLI**:
```bash
/inbox wontfix FB-007
```

**Steps**:
1. System prompts for reason
2. Update feedback:
   ```sql
   UPDATE feedback
   SET
     status = 'wont_fix',
     resolution_notes = 'Known Safari limitation - documented in help',
     resolved_at = NOW()
   WHERE id = 'FB-007';
   ```
3. Feedback closed, not counted in backlog

**Result**: Feedback archived, reasoning captured

---

## Resolution Workflows

### Workflow 10: Quick Fix (<50 LOC)

**Trigger**: Small issue or tiny enhancement

**Steps**:
1. Identify small feedback: FB-008
2. Run `/quick-fix FB-008`
3. System:
   - Loads feedback details
   - Creates feature branch: `fix/FB-008-button-alignment`
   - Guides through implementation
4. Make changes (30 lines)
5. System runs tests
6. Create PR and merge
7. Update feedback:
   ```sql
   UPDATE feedback
   SET
     status = 'resolved',
     resolution_type = 'quick_fix',
     resolved_at = NOW()
   WHERE id = 'FB-008';
   ```

**Result**: Issue fixed, feedback resolved, no full SD needed

### Workflow 11: Full SD for Complex Issue

**Trigger**: Complex issue requiring architecture changes

**Steps**:
1. Identify complex feedback: FB-009 (auth system overhaul)
2. Chairman decides: "Create SD"
3. Via Directive Lab or `/leo`:
   - Create SD-AUTH-002
   - Link to feedback via `feedback_sd_map`:
     ```sql
     INSERT INTO feedback_sd_map (feedback_id, sd_id, relationship_type)
     VALUES ('FB-009', 'SD-AUTH-002', 'addresses');
     ```
4. SD goes through LEAD → PLAN → EXEC
5. On SD completion:
   ```sql
   UPDATE feedback
   SET
     status = 'resolved',
     resolution_type = 'full_sd',
     resolution_sd_id = 'SD-AUTH-002',
     resolved_at = NOW()
   WHERE id = 'FB-009';
   ```

**Result**: Complex issue resolved via full LEO Protocol workflow

### Workflow 12: Convert Issue ↔ Enhancement

**Trigger**: Feedback misclassified

**Scenario**: User reports "CSV export missing" as issue, but PDF export doesn't exist yet → Feature request

**CLI**:
```bash
/inbox convert FB-010
```

**Steps**:
1. System loads FB-010 (currently type='issue')
2. Prompt: "Convert to enhancement?"
3. User confirms
4. System updates:
   ```sql
   UPDATE feedback
   SET
     type = 'enhancement',
     original_type = 'issue',
     converted_at = NOW(),
     conversion_reason = 'User expected PDF export but feature does not exist - feature request not bug',
     value_estimate = 'medium',  -- Prompt user
     effort_estimate = 'medium'  -- Prompt user
   WHERE id = 'FB-010';
   ```
5. Recalculate priority: Medium/Medium → P2

**Result**: Feedback moves from issue queue to enhancement backlog

---

## Release Planning Workflows

### Workflow 13: Create Release

**Actor**: Chairman or Product Manager

**Context**: Quarterly planning - bundle enhancements for v2.1

**Web UI** (`/quality/releases`):
1. Click "Create Release"
2. Fill form:
   - Venture: EHG
   - Version: v2.1.0
   - Name: "Q1 2026 Feature Pack"
   - Target date: 2026-03-31
3. Submit
4. Release created:
   ```javascript
   {
     id: '<uuid>',
     venture_id: '<ehg_uuid>',
     version: 'v2.1.0',
     name: 'Q1 2026 Feature Pack',
     status: 'planned',
     target_date: '2026-03-31'
   }
   ```

**Result**: Release available for linking enhancements

### Workflow 14: Add Enhancements to Release

**Actor**: Chairman

**Context**: Plan which enhancements ship in v2.1

**Web UI** (`/quality/backlog`):
1. View backlog (Kanban board)
2. Drag enhancement from "Unscheduled" to "Planned"
3. Modal: "Select release"
4. Choose: v2.1.0
5. Enhancement updated:
   ```sql
   UPDATE feedback
   SET release_id = '<v2.1_uuid>'
   WHERE id = 'FB-011';
   ```

**Repeat for 8 more enhancements**

**Result**: v2.1.0 now contains 9 enhancements

### Workflow 15: Bundle Enhancements into SD

**Actor**: Chairman or Lead Developer

**Context**: 9 enhancements in v2.1 → Create 2 SDs to address them

**Directive Lab** (`/governance/directive-lab`):
1. Create SD-UI-POLISH-001
2. "Source Selection" step:
   - Click "Link enhancements from release"
   - Select v2.1.0
   - Choose 5 enhancements (FB-011 through FB-015)
3. System creates mappings:
   ```sql
   INSERT INTO feedback_sd_map (feedback_id, sd_id)
   VALUES
     ('FB-011', 'SD-UI-POLISH-001'),
     ('FB-012', 'SD-UI-POLISH-001'),
     ...
   ```
4. SD-UI-POLISH-001 linked to release:
   ```sql
   UPDATE strategic_directives_v2
   SET target_release_id = '<v2.1_uuid>'
   WHERE id = 'SD-UI-POLISH-001';
   ```

**Repeat for second SD**: SD-EXPORT-002 (FB-016 through FB-019)

**Result**: 9 enhancements → 2 SDs, both targeting v2.1.0

### Workflow 16: Track Release Progress

**Actor**: Chairman

**Web UI** (`/quality/releases`):

**View**:
```
┌────────────────────────────────────────────────┐
│ v2.1.0 - Q1 2026 Feature Pack                  │
│ Target: 2026-03-31 (42 days)                   │
│                                                │
│ Progress: ████████████░░░░░░░░  60%           │
│                                                │
│ Items: 9 total, 5 completed, 4 in progress    │
│                                                │
│ SDs:                                           │
│ • SD-UI-POLISH-001 (EXEC) ── 5 enhancements    │
│ • SD-EXPORT-002 (PLAN) ────── 4 enhancements   │
│                                                │
│ ⚠️ Health Check: All items linked             │
└────────────────────────────────────────────────┘
```

**As SDs complete**:
- EXEC phase complete → Enhancements marked `in_progress`
- LEAD-FINAL-APPROVAL → Enhancements marked `resolved`
- All resolved → Release ready to ship

### Workflow 17: Ship Release

**Actor**: Chairman

**Context**: v2.1.0 complete, ready to deploy

**Steps**:
1. Verify 100% progress in `/quality/releases`
2. Deploy to production
3. Update release:
   ```sql
   UPDATE releases
   SET
     status = 'shipped',
     shipped_at = NOW()
   WHERE id = '<v2.1_uuid>';
   ```
4. Notify users: "v2.1.0 shipped: 9 new features"

**Result**: Release shipped, enhancements delivered

---

## Integration Workflows

### Workflow 18: /uat → Feedback Integration

**Trigger**: Developer runs `/uat` and test fails

**Current Flow**:
```
/uat test → FAIL → result-recorder.js → feedback table (source_type: uat_failure)
                                       ↓
                                Risk Router → /quick-fix or SD
```

**Implementation** (`lib/uat/result-recorder.js`):
```javascript
async function recordTestResult(result) {
  // Record to uat_test_results (existing)
  const testResult = await supabase.from('uat_test_results').insert(result);

  // If failed, create feedback
  if (result.status === 'failed') {
    const { data: feedback } = await supabase.from('feedback').insert({
      type: 'issue',
      source_application: result.source_application || 'ehg',
      source_type: 'uat_failure',
      source_id: testResult.id,
      title: `UAT Failure: ${result.test_case_name}`,
      description: result.failure_notes,
      severity: mapFailureTypeToSeverity(result.failure_type),
      sd_id: result.sd_id
    });

    // Risk Router picks up from here
    await routeToResolution(feedback.id);
  }
}
```

### Workflow 19: Risk Router Integration

**Trigger**: New feedback with type='issue'

**Risk Router Flow**:
```
New Issue → Risk Router → Estimate complexity
                        ↓
                   ┌────┴────┐
                   │         │
              <50 LOC    >50 LOC
             No risks   OR risks
                   │         │
                   ▼         ▼
              /quick-fix   Full SD
```

**Implementation** (`lib/quality/risk-router.js`):
```javascript
async function routeToResolution(feedbackId) {
  const feedback = await loadFeedback(feedbackId);

  // Estimate LOC
  const estimatedLOC = await estimateComplexity(feedback);

  // Check for risky keywords
  const hasRisks = RISKY_KEYWORDS.some(keyword =>
    feedback.description.toLowerCase().includes(keyword)
  );

  if (estimatedLOC < 50 && !hasRisks) {
    // Suggest quick fix
    console.log(`Feedback ${feedbackId} routed to /quick-fix`);
    return { route: 'quick_fix', feedback_id: feedbackId };
  } else {
    // Suggest full SD
    console.log(`Feedback ${feedbackId} requires full SD`);
    return { route: 'full_sd', feedback_id: feedbackId };
  }
}
```

### Workflow 20: /learn Integration

**Trigger**: Pattern detected in resolved feedback

**Pattern Detection**:
```sql
-- Find recurring errors
SELECT
  error_hash,
  COUNT(*) as occurrence_count,
  array_agg(id) as feedback_ids
FROM feedback
WHERE type = 'issue'
  AND status = 'resolved'
  AND error_hash IS NOT NULL
GROUP BY error_hash
HAVING COUNT(*) >= 3;
```

**/learn Flow**:
1. Pattern detected: "Database timeout error" occurred 5 times across 3 ventures
2. Run `/learn`
3. System:
   - Analyzes pattern
   - Identifies root cause: "Connection pool too small"
   - Creates improvement SD: SD-INFRA-DB-POOL-001
4. SD addresses:
   - Increase connection pool size
   - Add connection monitoring
   - Update configuration docs

**Result**: Systemic issue fixed, future occurrences prevented

---

## Chairman Workflows

### Workflow 21: Weekly Triage Session

**Actor**: Chairman

**Cadence**: Every Monday, 30 minutes

**Agenda**:
1. Review "Needs Attention" (P0/P1)
2. Triage new feedback
3. Snooze/reject low-priority items

**Steps**:

**Web UI** (`/quality/inbox`):
1. View inbox (default: "Needs Attention" visible)
2. Review P0 items (2 critical issues):
   - FB-020: Payment failure → Assign to `/quick-fix`
   - FB-021: Database corruption → Create SD immediately
3. Review P1 items (5 high-priority):
   - FB-022: Dashboard slow → Add to backlog
   - FB-023: Export broken → `/quick-fix`
   - FB-024: Dark mode request → Add to Q1 release
   - FB-025: Mobile nav issue → Add to backlog
   - FB-026: API timeout → Snooze 7d (launch week)
4. Expand "Other Feedback" (P2/P3):
   - FB-027 through FB-032: Low-priority cosmetic issues
   - Bulk snooze 30d
5. Check Fatigue Meter: 12 open items (Low fatigue ✓)

**Time**: 25 minutes

**Result**: All critical/high items triaged, low-priority noise controlled

### Workflow 22: Monthly Release Planning

**Actor**: Chairman

**Cadence**: First Friday of month, 1 hour

**Agenda**:
1. Review backlog
2. Select enhancements for next release
3. Create SDs
4. Update baseline

**Steps**:

**Web UI** (`/quality/backlog`):
1. Review unscheduled enhancements by venture
2. Sort by priority and votes
3. Select top 10 for Q1 2026 release:
   - Dark mode (FB-024)
   - PDF export (FB-028)
   - Mobile navigation (FB-025)
   - ... 7 more
4. Create release v2.1.0 (target: 2026-03-31)
5. Drag enhancements to "Planned" column
6. Link to release

**Directive Lab**:
7. Bundle into 2 SDs:
   - SD-UI-POLISH-001: Dark mode, mobile nav, 3 others (5 items)
   - SD-EXPORT-002: PDF export, CSV improvements (2 items)
8. Link SDs to release
9. Add to baseline (SD queue)

**Result**: Q1 release planned, SDs ready for execution

### Workflow 23: Cross-Venture Pattern Review

**Actor**: Chairman

**Cadence**: Quarterly, 30 minutes

**Context**: Detect patterns across all ventures

**Web UI** (`/quality/patterns`):

**View**:
```
Cross-Venture Patterns Detected:

1. "PDF Export" requested by 5 ventures
   - Venture A: 3 users
   - Venture B: 2 users
   - Venture C: 4 users
   - Venture D: 1 user
   - Venture E: 2 users
   Total: 12 requests

   → [Create Bundled SD]

2. "Mobile App" requested by 3 ventures
   - Venture A: 5 users
   - Venture C: 3 users
   - Venture F: 4 users
   Total: 12 requests

   → [Add to Roadmap]
```

**Action**:
1. Click "Create Bundled SD" for PDF Export
2. System creates SD-SHARED-PDF-001
3. Links all 12 enhancement requests
4. SD targets "shared infrastructure" for all ventures

**Result**: Common need addressed once, deployed everywhere

---

## Phase Transition Workflows

### Workflow 24: LEAD → Capture Integration

**Context**: SD approved in LEAD, moving to PLAN

**User Story Definition** (PLAN phase):
```
User Story: US-001
As a user, when I submit feedback, I want confirmation so I know it was received.

Acceptance Criteria:
- AC-001: Feedback form submission shows success message
- AC-002: Confirmation includes feedback ID (e.g., "FB-123 logged")
- AC-003: User redirected to feedback detail page
```

**These acceptance criteria become test scenarios in /uat**:
```
Scenario: User submits feedback
Given: User is on any page
When: User clicks feedback button and submits form
Then: Success message appears with feedback ID
```

### Workflow 25: PLAN → EXEC Integration

**Context**: PRD approved, implementation begins

**PRD Section: Feedback Widget**:
```
Requirement: Feedback Widget (FAB)
Location: Bottom-right corner, all pages
Behavior: Opens modal with feedback form
Fields: Type toggle, title, description, severity/value
```

**Implementation** (EXEC phase):
- Component: `FeedbackWidget.tsx`
- Integration: `AuthenticatedLayout.tsx` line 104
- API: `/api/feedback` POST endpoint

### Workflow 26: EXEC → POST-EXEC Integration

**Context**: Implementation complete, E2E tests pass

**Automatic Transition to Capture Stage**:
1. Code shipped to production
2. Error capture middleware active
3. Feedback widget deployed
4. Users start submitting feedback
5. Errors automatically logged
6. Quality Lifecycle System operational

**Monitoring**:
```sql
-- Check feedback volume
SELECT
  DATE(created_at) as date,
  COUNT(*) as total,
  COUNT(CASE WHEN type='issue' THEN 1 END) as issues,
  COUNT(CASE WHEN type='enhancement' THEN 1 END) as enhancements
FROM feedback
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## Appendix

### Workflow Metrics

**Triage Efficiency**:
- Target: <5 minutes per feedback item
- Metric: Average time from `created_at` to `triaged_at`

**Resolution Speed**:
- Quick Fix: <1 day (target)
- Full SD: 3-7 days (varies by complexity)
- Metric: Average time from `triaged_at` to `resolved_at`

**Noise Control**:
- Fatigue Meter: Open items / Total items over 90 days
- Target: <20% (Low fatigue)
- Warning: >50% (High fatigue)

### Best Practices

1. **Triage Weekly**: Don't let feedback pile up
2. **Use Snooze Liberally**: Hide noise during critical periods
3. **Bundle Thoughtfully**: Group related enhancements, but <10 per SD
4. **Link to SDs**: Always map enhancements to SDs for traceability
5. **Review Patterns Quarterly**: Detect systemic issues early

### Related Documentation

- User Guide: `docs/04_features/quality-lifecycle-system.md`
- Vision: `docs/vision/quality-lifecycle-system.md`
- Database Schema: `docs/reference/schema/engineer/tables/feedback.md`

---

**Workflow documentation generated**: 2026-01-18
**Based on**: SD-QUALITY-LIFECYCLE-001 (orchestrator + 6 children)
**Validated by**: Claude Opus 4.5, OpenAI GPT-4o, AntiGravity (Gemini)
