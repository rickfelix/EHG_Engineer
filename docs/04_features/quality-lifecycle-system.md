# Quality Lifecycle System - User Guide

**Status**: Completed
**Version**: 1.0.0
**Orchestrator SD**: SD-QUALITY-LIFECYCLE-001
**Last Updated**: 2026-01-18

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Components](#components)
4. [Usage Guide](#usage-guide)
5. [Architecture](#architecture)
6. [Integration](#integration)
7. [Troubleshooting](#troubleshooting)

---

## Overview

The Quality Lifecycle System is EHG's unified approach to quality and feedback management. It provides a single, comprehensive system for capturing, triaging, and resolving both issues (bugs) and enhancements (feature requests) across EHG and all ventures.

### Key Features

- **Unified Feedback Management**: Single inbox for issues and enhancements
- **Multi-Venture Architecture**: Supports EHG and all ventures from one system
- **Dual Interface**: CLI for developers, Web UI for business users
- **Intelligent Triage**: Priority calculation, burst grouping, noise control
- **Automatic Error Capture**: Runtime errors automatically logged
- **Release Planning**: Bundle enhancements into versioned releases

### The Five Stages

```
┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐
│PREVENTION │   │  CAPTURE  │   │  TRIAGE   │   │RESOLUTION │   │ LEARNING  │
│           │   │           │   │           │   │           │   │           │
│ PRDs      │──▶│ /uat      │──▶│ Prioritize│──▶│ /quick-fix│──▶│ /learn    │
│ User      │   │ /inbox    │   │ AI Triage │   │ Full SD   │   │ Patterns  │
│ Stories   │   │ Errors    │   │ Snooze    │   │           │   │ Improve   │
└───────────┘   └───────────┘   └───────────┘   └───────────┘   └───────────┘
```

1. **Prevention** (PLAN Phase): Define requirements before coding
2. **Capture** (POST-EXEC): Detect issues and collect enhancement ideas
3. **Triage**: Prioritize, filter noise, route to resolution
4. **Resolution**: Fix issues and build enhancements
5. **Learning**: Extract patterns, create improvement SDs

---

## Getting Started

### For Developers (CLI)

View your feedback inbox:
```bash
/inbox
```

Report a new issue:
```bash
/inbox new
```

Report an enhancement:
```bash
/inbox new --type=enhancement
```

Filter to issues only:
```bash
/inbox --issues
```

Filter to enhancements only:
```bash
/inbox --enhance
```

### For Business Users (Web UI)

1. Navigate to `/quality` section in EHG application
2. Click the feedback button (bottom-right FAB) to submit feedback
3. Use the inbox view to see all feedback
4. Use the backlog view to plan enhancements
5. Use the releases view to track versioned releases

### Quick Reference

| Task | CLI | Web UI |
|------|-----|--------|
| Report an issue | `/inbox new` | Click FAB, select "Issue" |
| Report enhancement | `/inbox new --type=enhancement` | Click FAB, select "Enhancement" |
| View all feedback | `/inbox` | `/quality/inbox` |
| View backlog | `/inbox --enhance` | `/quality/backlog` |
| View releases | N/A | `/quality/releases` |

---

## Components

The Quality Lifecycle System consists of 6 major components, each implemented as a Strategic Directive:

### 1. Database Foundation (SD-QUALITY-DB-001)

**Purpose**: Unified data model for feedback, releases, and SD linkage

**Key Tables**:
- `feedback`: Unified table for issues + enhancements (type discriminator)
- `releases`: Versioned releases per venture
- `feedback_sd_map`: Many-to-many mapping between feedback and SDs

**Type Discriminator**:
```javascript
// feedback.type field
'issue'       // Bugs, errors, defects
'enhancement' // Feature requests, improvements
```

**Multi-Venture Support**:
```javascript
// feedback.source_application field
'ehg'         // EHG application
'venture_a'   // Venture A
'venture_b'   // Venture B
// ... etc
```

**Source Types**:
```javascript
// feedback.source_type field
'manual_feedback'      // User-submitted via form
'auto_capture'         // Automatic error capture
'uat_failure'          // Failed UAT test
'error_capture'        // Code: captureError()
'uncaught_exception'   // Unhandled errors
'unhandled_rejection'  // Unhandled promise rejections
```

### 2. CLI Interface (SD-QUALITY-CLI-001)

**Purpose**: `/inbox` command for reporting and managing feedback via CLI

**Commands**:
```bash
/inbox                          # Show all open feedback (prioritized, hide snoozed)
/inbox new                      # Report a new issue (default type)
/inbox new --type=enhancement   # Suggest a new feature
/inbox [ID]                     # View/update specific feedback
/inbox snooze [ID] [duration]   # Snooze feedback
/inbox wontfix [ID]             # Mark issue as won't fix
/inbox wontdo [ID]              # Mark enhancement as won't do
/inbox convert [ID]             # Convert issue <-> enhancement
```

**Filters**:
```bash
--issues      # Issues only
--enhance     # Enhancements only
--mine        # Items I reported
--critical    # Critical severity (issues)
--app=NAME    # Filter by application
--all         # Show all (including snoozed)
```

**Aliases**:
- `/feedback` → `/inbox`
- `/issues` → `/inbox`

### 3. Triage & Prioritization (SD-QUALITY-TRIAGE-001)

**Purpose**: Priority calculation, burst grouping, noise control

#### Priority Calculation

**For Issues**: Severity-based (P0-P3)
```
P0 = Critical severity + current venture
P1 = High severity OR current venture
P2 = Medium severity, other ventures
P3 = Low severity, auto-captured
```

**For Enhancements**: Value/Effort Matrix
```javascript
const VALUE_EFFORT_MATRIX = {
  high: {
    small: 'P1',    // Quick wins
    medium: 'P1',
    large: 'P2'
  },
  medium: {
    small: 'P1',
    medium: 'P2',
    large: 'P3'
  },
  low: {
    small: 'P2',
    medium: 'P3',
    large: 'P3'
  }
};
```

#### Burst Grouping

**Problem**: 100 identical errors in 1 minute = inbox flooded
**Solution**: Group identical errors into a single item

```
Configuration:
- Time window: 5 minutes (CLI-appropriate)
- Min occurrences: 3+ errors
- Grouping fields: error_type, source_application, source_file
```

#### Noise Control

| Action | Effect | Use Case |
|--------|--------|----------|
| Snooze 24h | Hidden until tomorrow | "I'll deal with this after launch" |
| Snooze 7d | Hidden for a week | "Not urgent, revisit next sprint" |
| Ignore pattern | Auto-hide matching issues | "Ignore all generic 404s from bots" |
| Won't Fix | Closed, not counted as backlog | "Known limitation, documented" |

### 4. Web UI (SD-QUALITY-UI-001)

**Purpose**: `/quality` section for Chairman and business users

#### Views

**1. Inbox (`/quality/inbox`)**
- All feedback, unified view
- Filters: Venture, Type, Priority, Release
- "Needs Attention" section (P0/P1)
- Quick actions: Triage, Backlog, Reject

**2. Backlog (`/quality/backlog`)**
- Enhancements grouped by venture
- Kanban board: Unscheduled → Planned → In Progress → Completed
- Drag to schedule (target_quarter)
- "Promote to SD" button
- Fatigue Meter per venture

**3. Releases (`/quality/releases`)**
- Timeline view by venture
- Release cards with progress
- "Create Release" button
- Health check warnings (orphaned items)

**4. Patterns (`/quality/patterns`)**
- AI-detected clusters
- Cross-venture pattern detection
- "5 ventures requested PDF export" → [Create Bundled SD]

#### Feedback Widget (FAB)

**Location**: Bottom-right corner, always visible
**Behavior**: Opens modal overlay

**Form Fields by Type**:

| Field | Issues | Enhancements |
|-------|--------|--------------|
| Type toggle | Bug/Error selected | Feature/Improvement selected |
| Title | Required | Required |
| Description | What went wrong? | What would you like? |
| Severity | Critical/High/Med/Low | - |
| Value estimate | - | High/Medium/Low |
| Steps to reproduce | ✓ (optional) | - |
| Use case | - | ✓ (optional) |

### 5. System Integrations (SD-QUALITY-INT-001)

**Purpose**: Error capture, /uat integration, Risk Router

#### Automatic Error Capture

**Node.js** (CLI, scripts, backend):
```javascript
// Global error handler
process.on('uncaughtException', captureError);
process.on('unhandledRejection', captureError);

// Manual capture
import { captureError } from 'lib/quality/error-capture.js';
try {
  // risky operation
} catch (error) {
  await captureError(error, { context: 'handoff' });
}
```

**Browser** (Web UI):
```javascript
window.addEventListener('error', captureError);
window.addEventListener('unhandledrejection', captureError);
```

**Deduplication**:
- Hash: error message + stack trace
- If same hash seen within 5 minutes → increment `occurrence_count`
- Store `first_seen` and `last_seen` timestamps

#### /uat Integration

**Current Behavior**: `/uat` test failures create feedback records

```javascript
// When user marks test as FAIL
{
  type: 'issue',
  source_application: 'ehg',
  source_type: 'uat_failure',
  source_id: '<uat_test_result_id>',
  severity: 'high',  // From failure type
  sd_id: '<current_sd>',
  ...
}
```

**Risk Router** then routes to:
- `/quick-fix` if <50 LOC and no risky keywords
- Full SD creation otherwise

#### /learn Connection

When feedback is resolved:
- Pattern detection: Same error_hash 3+ times → create pattern
- Same category recurs → flag for `/learn`

```
feedback (resolved) → pattern detection → issue_patterns → /learn → improvement SD
```

### 6. Triangulation Fixes (SD-QUALITY-FIXES-001)

**Purpose**: Fixes identified through multi-AI validation

**Fixes Applied**:
1. Added RLS policies to `feedback_sd_map`
2. Updated `source_type` CHECK constraint for new error types
3. Implemented value/effort matrix for enhancement priority
4. Added CLI commands: snooze, wontfix, wontdo
5. Added CLI flags: --critical, --app
6. Documented burst detection threshold deviation

---

## Usage Guide

### Reporting Feedback

#### Via CLI

**Report an issue**:
```bash
/inbox new
```
Then select:
- Type: Issue (default)
- Title: "Payment checkout fails on Safari"
- Description: "When clicking pay button, nothing happens..."
- Severity: High

**Report an enhancement**:
```bash
/inbox new --type=enhancement
```
Then provide:
- Title: "Add dark mode support"
- Description: "Users have requested dark mode..."
- Value estimate: High
- Effort estimate: Medium
- Use case: "As a user working at night, I want dark mode..."

#### Via Web UI

1. Click FAB (bottom-right corner)
2. Toggle type: Issue or Enhancement
3. Fill form (title, description, type-specific fields)
4. Submit

**Result**: Feedback immediately appears in inbox with calculated priority

### Managing Feedback

#### View Inbox

**CLI**:
```bash
/inbox                    # All open feedback
/inbox --issues           # Issues only
/inbox --enhance          # Enhancements only
/inbox --critical         # Critical issues
/inbox --app=venture_a    # Venture A only
/inbox --mine             # My feedback
```

**Web UI**:
- Navigate to `/quality/inbox`
- Use filters: Venture dropdown, Type toggle, Priority selector

#### Triage Feedback

**Snooze**:
```bash
/inbox snooze FB-123 7d   # Hide for 7 days
```

**Mark as Won't Fix/Do**:
```bash
/inbox wontfix FB-123     # Issue won't be fixed
/inbox wontdo FB-456      # Enhancement won't be built
```

**Convert Type**:
```bash
/inbox convert FB-789     # Issue → Enhancement (or vice versa)
```
*When to convert*: "User expected PDF export but only CSV exists" → Feature request, not bug

#### Assign to Resolution

**Quick Fix** (<50 LOC):
```bash
/quick-fix FB-123
```

**Full SD** (complex):
1. Create SD via `/leo` or Directive Lab
2. Link feedback to SD via `feedback_sd_map` table
3. SD resolution automatically updates feedback status

### Planning Releases

**Purpose**: Bundle enhancements into versioned releases

#### Create Release

**Via Web UI** (`/quality/releases`):
1. Click "Create Release"
2. Fill form:
   - Venture: Select venture (or EHG global)
   - Version: v2.1.0
   - Name: "The Dark Mode Update"
   - Target date: 2026-02-01
3. Save

#### Add Enhancements to Release

**Via Backlog** (`/quality/backlog`):
1. Drag enhancement from "Unscheduled" to "Planned"
2. Select release: v2.1.0
3. Enhancement now linked to release

**Via Database**:
```javascript
await supabase
  .from('feedback')
  .update({ release_id: '<release_uuid>' })
  .eq('id', '<feedback_uuid>');
```

#### Track Release Progress

**Via Releases View** (`/quality/releases`):
- Timeline shows all releases by venture
- Progress bar: % of items completed
- Health check: Warns if orphaned items not linked to SD

### Cross-Venture Workflows

#### View Feedback Across Ventures

**CLI**:
```bash
/inbox                    # All ventures (default: My Focus Context)
/inbox --app=ehg          # EHG only
/inbox --app=venture_a    # Venture A only
```

**Web UI**:
- Use venture filter dropdown in `/quality/inbox`

#### Detect Cross-Venture Patterns

**Via Patterns View** (`/quality/patterns`):
- System detects: "PDF export requested by 3 ventures"
- Action: "Create Bundled SD" button → Creates SD addressing all 3

### Error Capture Workflows

#### Automatic Capture

**Node.js**:
```javascript
// Errors are captured automatically via global handlers
throw new Error('Payment failed');  // Auto-captured
```

**Browser**:
```javascript
// Errors are captured automatically
throw new Error('Render failed');  // Auto-captured
```

**Result**: Feedback record created with:
- `type: 'issue'`
- `source_type: 'auto_capture'` or `'uncaught_exception'`
- `severity: 'high'` (auto-determined)
- `error_hash`: For deduplication

#### Manual Capture

```javascript
import { captureError } from 'lib/quality/error-capture.js';

try {
  await dangerousOperation();
} catch (error) {
  await captureError(error, {
    context: 'handoff',
    severity: 'critical',
    sd_id: 'SD-XXX-001'
  });
}
```

#### View Error Bursts

**Burst Grouping**: 100 identical errors → 1 feedback item

**CLI**:
```bash
/inbox --critical         # P0 items include grouped errors
```

**View Details**:
```bash
/inbox FB-123
```
Output:
```
Error: Database connection timeout
Occurrences: 127
First seen: 2026-01-18 10:00:00
Last seen: 2026-01-18 10:05:23
Source: venture_a
```

---

## Architecture

### Data Model

```
┌─────────────────┐
│    feedback     │  (Unified table: issues + enhancements)
│─────────────────│
│ id              │  UUID
│ type            │  'issue' | 'enhancement'
│ source_application  │  'ehg', 'venture_a', ...
│ source_type     │  'manual_feedback', 'auto_capture', 'uat_failure', ...
│ title           │
│ description     │
│ status          │  'new', 'triaged', 'in_progress', 'resolved', ...
│ priority        │  P0-P3 (issues), high/med/low (enhancements)
│ severity        │  critical/high/medium/low (issues only)
│ value_estimate  │  high/medium/low (enhancements only)
│ effort_estimate │  small/medium/large (enhancements only)
│ release_id      │  → releases.id
│ ...             │
└─────────────────┘
         │
         │ Many-to-Many
         │
         ▼
┌─────────────────┐
│ feedback_sd_map │  (Junction table)
│─────────────────│
│ feedback_id     │  → feedback.id
│ sd_id           │  → strategic_directives_v2.id
│ relationship_type   │  'addresses', 'partially_addresses', 'related'
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ strategic_directives_v2  │
│─────────────────│
│ id              │
│ target_release_id   │  → releases.id
│ ...             │
└─────────────────┘

┌─────────────────┐
│    releases     │  (Versioned releases per venture)
│─────────────────│
│ id              │  UUID
│ venture_id      │  NULL for EHG global
│ version         │  'v2.1.0'
│ name            │  'The Dark Mode Update'
│ status          │  'planned', 'active', 'shipped'
│ target_date     │  DATE
│ shipped_at      │  TIMESTAMPTZ
└─────────────────┘
```

### Component Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                       INTERFACE LAYER                              │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│   CLI INTERFACE              WEB UI INTERFACE                     │
│   (Developers, Claude)       (Chairman, End Users)                │
│                                                                   │
│   ┌─────────────────┐        ┌─────────────────┐                 │
│   │  /inbox         │        │ Feedback Widget │                 │
│   │  /inbox new     │        │ (FAB)           │                 │
│   │  /inbox [ID]    │        │                 │                 │
│   │  /inbox --flags │        │ /quality/inbox  │                 │
│   └────────┬────────┘        └────────┬────────┘                 │
│            │                          │                           │
│            └──────────┬───────────────┘                           │
│                       │                                           │
│                       ▼                                           │
│              ┌─────────────────┐                                  │
│              │  Feedback API   │                                  │
│              │ (shared backend)│                                  │
│              └────────┬────────┘                                  │
├───────────────────────┼───────────────────────────────────────────┤
│               BUSINESS LOGIC LAYER                                │
├───────────────────────┼───────────────────────────────────────────┤
│                       ▼                                           │
│         ┌──────────────────────────────┐                          │
│         │   Priority Calculator        │                          │
│         │  (lib/quality/priority-calculator.js)                   │
│         │  - Severity → P0-P3          │                          │
│         │  - Value/Effort → Priority   │                          │
│         └──────────────────────────────┘                          │
│                       │                                           │
│                       ▼                                           │
│         ┌──────────────────────────────┐                          │
│         │   Burst Detector             │                          │
│         │  (lib/quality/burst-detector.js)                        │
│         │  - Group identical errors    │                          │
│         │  - Time window: 5 min        │                          │
│         └──────────────────────────────┘                          │
│                       │                                           │
│                       ▼                                           │
│         ┌──────────────────────────────┐                          │
│         │   Error Capture              │                          │
│         │  (lib/quality/error-capture.js)                         │
│         │  - Global handlers           │                          │
│         │  - Deduplication             │                          │
│         └──────────────────────────────┘                          │
├───────────────────────┼───────────────────────────────────────────┤
│                  DATA LAYER                                       │
├───────────────────────┼───────────────────────────────────────────┤
│                       ▼                                           │
│              ┌─────────────────┐                                  │
│              │  feedback table │                                  │
│              │  (Supabase)     │                                  │
│              └─────────────────┘                                  │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### Integration Points

**With LEO Protocol**:
- `/uat` failures → `feedback` table (`source_type: 'uat_failure'`)
- `/quick-fix` reads from `feedback` table
- `/learn` uses `issue_patterns` generated from `feedback`
- Risk Router routes feedback to `/quick-fix` or SD creation

**With Governance**:
- `/quality/backlog` → "Promote to SD" → `/governance/directive-lab`
- `/governance/directive-lab` → "Source Selection" → link enhancements
- `/governance/prd-manager` → "View linked enhancements" sidebar

**With Ventures**:
- Each venture includes feedback widget (FAB)
- Error capture middleware auto-logs errors
- API integration writes to central `feedback` table with `source_application` set

---

## Integration

### Integrating with New Ventures

When creating a new venture, integrate the Quality Lifecycle System:

#### 1. Add Feedback Widget

**React Component** (`src/components/quality/FeedbackWidget.tsx`):
```typescript
import { FeedbackWidget } from '@ehg/quality';

export function App() {
  return (
    <>
      <YourAppContent />
      <FeedbackWidget />  {/* Bottom-right FAB */}
    </>
  );
}
```

**Configuration**:
```typescript
<FeedbackWidget
  source_application="venture_a"  // Set venture ID
  defaultType="issue"             // Default to issue or enhancement
/>
```

#### 2. Add Error Capture Middleware

**Node.js Backend**:
```javascript
import { setupErrorCapture } from 'lib/quality/error-capture.js';

setupErrorCapture({
  source_application: 'venture_a',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY
});
```

**Browser Frontend**:
```javascript
import { setupBrowserErrorCapture } from 'lib/quality/error-capture.js';

setupBrowserErrorCapture({
  source_application: 'venture_a'
});
```

#### 3. API Integration

**Submit Feedback**:
```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, key);

await supabase.from('feedback').insert({
  type: 'issue',
  source_application: 'venture_a',
  source_type: 'manual_feedback',
  title: 'Bug in checkout',
  description: '...',
  severity: 'high',
  priority: 'P1'  // Calculate via priority-calculator
});
```

### API Reference

#### Feedback Endpoints

**Create Feedback**:
```javascript
POST /api/feedback
Body: {
  type: 'issue' | 'enhancement',
  title: string,
  description: string,
  severity?: 'critical' | 'high' | 'medium' | 'low',  // Issues
  value_estimate?: 'high' | 'medium' | 'low',          // Enhancements
  effort_estimate?: 'small' | 'medium' | 'large',      // Enhancements
  source_application: string,
  source_type: string,
  ...
}
Response: { id: UUID, priority: string }
```

**Get Feedback**:
```javascript
GET /api/feedback?status=open&type=issue&app=ehg
Response: [ { id, type, title, priority, ... }, ... ]
```

**Update Feedback**:
```javascript
PATCH /api/feedback/:id
Body: { status: 'resolved', resolution_notes: '...' }
Response: { id, status, ... }
```

**Snooze Feedback**:
```javascript
POST /api/feedback/:id/snooze
Body: { duration: '24h' | '7d' | { days: 7 } }
Response: { id, snoozed_until: timestamp }
```

#### Priority Calculation

**For Issues**:
```javascript
import { calculatePriority } from 'lib/quality/priority-calculator.js';

const priority = calculatePriority('high', 'issue');
// Returns: 'P1'
```

**For Enhancements**:
```javascript
import { calculateEnhancementPriority } from 'lib/quality/priority-calculator.js';

const { priority, reasoning } = calculateEnhancementPriority({
  value_estimate: 'high',
  effort_estimate: 'small'
});
// Returns: { priority: 'P1', reasoning: 'Enhancement with high value and small effort -> P1' }
```

#### Error Capture

**Manual Capture**:
```javascript
import { captureError } from 'lib/quality/error-capture.js';

try {
  await riskyOperation();
} catch (error) {
  await captureError(error, {
    context: 'payment_flow',
    severity: 'critical',
    metadata: { order_id: '12345' }
  });
}
```

**Automatic Capture** (already set up globally):
```javascript
// Just throw errors - they're captured automatically
throw new Error('This will be captured');
```

---

## Troubleshooting

### Common Issues

#### Feedback Not Appearing in Inbox

**Symptoms**: Submitted feedback not visible in `/inbox` or `/quality/inbox`

**Check**:
1. Feedback status: `SELECT status FROM feedback WHERE id = 'FB-XXX'`
   - If `status = 'snoozed'`: Check `snoozed_until` timestamp
2. Filters applied: `/inbox --all` to see all feedback including snoozed
3. RLS policies: Verify authenticated user has read access

**Solution**:
```bash
# View all feedback including snoozed
/inbox --all

# Update status if needed
node -e "supabase.from('feedback').update({status:'new'}).eq('id','FB-XXX')"
```

#### Priority Calculation Incorrect

**Symptoms**: Issue shows wrong priority (e.g., P3 when should be P0)

**Check**:
1. Severity field: `SELECT severity, priority FROM feedback WHERE id = 'FB-XXX'`
2. Priority calculation logic in `lib/quality/priority-calculator.js`

**Solution**:
```javascript
// Recalculate priority
import { updateFeedbackPriority } from 'lib/quality/priority-calculator.js';
await updateFeedbackPriority('FB-XXX');
```

#### Error Burst Not Grouping

**Symptoms**: 100 identical errors create 100 separate feedback items

**Check**:
1. Error hash generation: `SELECT error_hash, COUNT(*) FROM feedback WHERE type='issue' GROUP BY error_hash`
2. Time window: Errors must occur within 5 minutes

**Solution**:
```bash
# Manual grouping
node scripts/quality/regroup-errors.js
```

#### /uat Failures Not Creating Feedback

**Symptoms**: Test marked as FAIL, no feedback record created

**Check**:
1. Result recorder integration: `lib/uat/result-recorder.js` line ~150
2. Database permissions: Service role can write to `feedback` table

**Solution**:
```javascript
// Test integration
import { recordTestResult } from 'lib/uat/result-recorder.js';
await recordTestResult({
  test_run_id: 'xxx',
  test_case_id: 'yyy',
  status: 'failed',
  failure_type: 'functionality',
  failure_notes: 'Test failure'
});

// Check feedback created
SELECT * FROM feedback WHERE source_type = 'uat_failure' ORDER BY created_at DESC LIMIT 1;
```

#### Feedback Widget Not Showing

**Symptoms**: FAB not visible in EHG application

**Check**:
1. `AuthenticatedLayout.tsx` line 104: `<FeedbackWidget />` present
2. Browser console: Check for React errors
3. Z-index: Widget has `z-50`, other elements may overlap

**Solution**:
```javascript
// Verify widget mounted
document.querySelector('[aria-label="Submit feedback"]')
```

### Database Queries

#### View All Feedback by Venture

```sql
SELECT
  id,
  type,
  title,
  priority,
  status,
  source_application
FROM feedback
WHERE source_application = 'venture_a'
  AND status IN ('new', 'triaged')
ORDER BY priority ASC, created_at DESC;
```

#### Find Duplicate Errors

```sql
SELECT
  error_hash,
  COUNT(*) as count,
  MIN(created_at) as first_seen,
  MAX(created_at) as last_seen
FROM feedback
WHERE type = 'issue'
  AND error_hash IS NOT NULL
GROUP BY error_hash
HAVING COUNT(*) > 1
ORDER BY count DESC;
```

#### View Release Progress

```sql
SELECT
  r.version,
  r.name,
  COUNT(f.id) as total_items,
  COUNT(CASE WHEN f.status IN ('resolved', 'completed') THEN 1 END) as completed_items,
  ROUND(
    COUNT(CASE WHEN f.status IN ('resolved', 'completed') THEN 1 END)::numeric /
    COUNT(f.id)::numeric * 100
  ) as progress_percent
FROM releases r
LEFT JOIN feedback f ON f.release_id = r.id
WHERE r.id = '<release_uuid>'
GROUP BY r.id, r.version, r.name;
```

#### Find Orphaned Enhancements

```sql
-- Enhancements in a release but not linked to any SD
SELECT
  f.id,
  f.title,
  f.priority,
  f.release_id
FROM feedback f
LEFT JOIN feedback_sd_map fsm ON fsm.feedback_id = f.id
WHERE f.type = 'enhancement'
  AND f.release_id IS NOT NULL
  AND fsm.sd_id IS NULL;
```

### Performance Optimization

#### Index Usage

The system includes 12+ indexes for optimal query performance:

```sql
-- Type-specific queries
CREATE INDEX idx_feedback_type ON feedback(type);
CREATE INDEX idx_feedback_issues ON feedback(created_at DESC) WHERE type = 'issue';
CREATE INDEX idx_feedback_enhancements ON feedback(created_at DESC) WHERE type = 'enhancement';

-- Multi-venture queries
CREATE INDEX idx_feedback_source_app ON feedback(source_application);

-- Priority queries
CREATE INDEX idx_feedback_priority ON feedback(priority);
CREATE INDEX idx_feedback_severity ON feedback(severity) WHERE type = 'issue';

-- Deduplication
CREATE INDEX idx_feedback_error_hash ON feedback(error_hash) WHERE error_hash IS NOT NULL;
```

#### Bulk Operations

**Recalculate All Priorities**:
```javascript
import { recalculateAllPriorities } from 'lib/quality/priority-calculator.js';
await recalculateAllPriorities();
```

**Run Burst Detection**:
```javascript
import { runBurstDetection } from 'lib/quality/burst-detector.js';
await runBurstDetection();
```

---

## Appendix

### Validation History

This system was validated through FOUR rounds of multi-AI triangulation:

1. **Vision Review** (Claude, OpenAI, Gemini) - Added Triage stage, noise control
2. **Enhancement Integration** (Claude, OpenAI, Gemini) - Unified table with type discriminator
3. **UI Integration** (Claude, OpenAI, Gemini) - `/quality` section, releases table
4. **SD Hierarchy** (Claude, OpenAI, Gemini) - 6 SDs, single orchestrator

**Consensus Scores**:
- Vision Clarity: 8.5/10
- Conceptual Completeness: 8.3/10
- Solo Entrepreneur Fit: 9.3/10

### Related Documentation

- Vision: `docs/vision/quality-lifecycle-system.md`
- Workflow: `docs/workflow/quality-lifecycle-workflow.md`
- Triangulation Research: `docs/research/triangulation-quality-lifecycle-*.md`
- Database Schema: `docs/reference/schema/engineer/tables/feedback.md`

### Strategic Directives

| SD ID | Title | Status |
|-------|-------|--------|
| SD-QUALITY-LIFECYCLE-001 | Orchestrator | Completed |
| SD-QUALITY-DB-001 | Database Foundation | Completed |
| SD-QUALITY-CLI-001 | /inbox CLI Command | Completed |
| SD-QUALITY-TRIAGE-001 | Triage & Prioritization | Completed |
| SD-QUALITY-UI-001 | /quality Web UI Section | Completed |
| SD-QUALITY-INT-001 | System Integrations | Completed |
| SD-QUALITY-FIXES-001 | Triangulation Fixes | Completed |

---

**Documentation generated**: 2026-01-18
**Based on**: SD-QUALITY-LIFECYCLE-001 (orchestrator + 6 children)
**Validated by**: Claude Opus 4.5, OpenAI GPT-4o, AntiGravity (Gemini)
