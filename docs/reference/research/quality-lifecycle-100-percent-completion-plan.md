# Quality Lifecycle System - Path to 100% Completion


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-18
- **Tags**: database, api, e2e, migration

**Date**: 2026-01-18
**Parent SD**: SD-QUALITY-LIFECYCLE-001
**Status**: Planning

---

## Current State (Updated 2026-01-18)

```
Database (SD-QUALITY-DB-001):     ████████████████████ 100%
CLI (SD-QUALITY-CLI-001):         ████████████████████ 100%
Triage (SD-QUALITY-TRIAGE-001):   ████████████████████ 100%
UI (SD-QUALITY-UI-001):           ████████████████████ 100%
Integration (SD-QUALITY-INT-001): ████████████████████ 100% ← COMPLETE

OVERALL:                          ████████████████████ 100% ✅
```

---

## SD-QUALITY-TRIAGE-001 (100% COMPLETE)

### What's Done
- [x] priority-calculator.js connected to feedback-capture.js
- [x] priority-calculator.js connected to result-recorder.js
- [x] burst-detector.js connected to feedback-capture.js
- [x] ignore-patterns.js converted to ESM and wired to feedback-capture.js
- [x] snooze-manager.js converted to ESM and wired to /inbox skill
- [x] focus-filter.js converted to ESM and wired to /inbox --focus
- [x] triage-engine.js created as central orchestrator
- [x] All modules exported via lib/quality/index.js (49 exports)

### Completed Modules

| Module | File | Status |
|--------|------|--------|
| Priority Calculator | `lib/quality/priority-calculator.js` | CONNECTED |
| Burst Detector | `lib/quality/burst-detector.js` | CONNECTED |
| Ignore Patterns | `lib/quality/ignore-patterns.js` | CONNECTED (ESM) |
| Snooze Manager | `lib/quality/snooze-manager.js` | CONNECTED (ESM) |
| Focus Filter | `lib/quality/focus-filter.js` | CONNECTED (ESM) |
| Triage Engine | `lib/quality/triage-engine.js` | CREATED (ESM) |

### Tasks (ALL COMPLETE)

1. **Wire snooze-manager.js** ✅
   - Converted to ESM
   - Wired to `/inbox snooze <id>` and `/inbox snoozed` commands

2. **Wire ignore-patterns.js** ✅
   - Converted to ESM
   - Wired to `lib/feedback-capture.js` - checks patterns before inserting

3. **Wire focus-filter.js** ✅
   - Converted to ESM
   - Wired to `/inbox focus` and `/inbox --focus` commands

4. **Create triage-engine.js** ✅
   - Created `lib/quality/triage-engine.js` with:
     - `triageFeedback()` - Full triage on single item
     - `batchTriage()` - Triage multiple items
     - `triageUntriaged()` - Auto-triage all new items
     - `getTriageStats()` - Triage statistics
     - Auto-assignment rules
     - AI triage suggestion generation

5. **Add auto-triage trigger** ✅
   - Ignore patterns checked in `feedback-capture.js`
   - Priority calculation via `priority-calculator.js`
   - Burst detection via `burst-detector.js`

### Completed
- Completed: 2026-01-18

---

## SD-QUALITY-UI-001 (100% COMPLETE)

### What's Done
- [x] QualityInboxPage.tsx (358 lines)
- [x] QualityBacklogPage.tsx (290 lines)
- [x] QualityPatternsPage.tsx (392 lines)
- [x] QualityReleasesPage.tsx (349 lines)
- [x] FeedbackDetailPanel.tsx
- [x] FeedbackWidget.tsx (307 lines)
- [x] Breadcrumb labels (quality, inbox, backlog, releases, patterns)
- [x] "Promote to SD" button with handler

### Completed Tasks

1. **Added breadcrumb labels** ✅
   - File: `EHG/src/components/navigation/BreadcrumbNavigation.tsx`
   - Added: `quality`, `inbox`, `backlog`, `releases`, `patterns` to routeLabels object

2. **Added "Promote to SD" button** ✅
   - File: `EHG/src/components/quality/FeedbackDetailPanel.tsx`
   - Added `ArrowUpToLine` icon import
   - Added `resolution_sd_id` to Feedback interface
   - Added `onPromoteToSD?` callback prop
   - Button shows when no existing SD link and handler provided
   - Shows SD badge when already promoted

3. **Wired onPromoteToSD handler** ✅
   - File: `EHG/src/pages/quality/QualityInboxPage.tsx`
   - Added promoteToSD mutation (calls API endpoint)
   - Added sonner toast notifications
   - API endpoint: `POST /api/feedback/:id/promote-to-sd` (created in INT-001)

### Completed
- Completed: 2026-01-18

---

## SD-QUALITY-INT-001 (100% COMPLETE)

### What's Done
- [x] Browser error capture (ErrorCaptureProvider.tsx)
- [x] window.onerror + unhandledrejection handlers
- [x] React Error Boundaries (5 implementations)
- [x] Error deduplication (5-min window)
- [x] Direct feedback table insertion
- [x] UAT result recorder → feedback table
- [x] Risk Router notification for P0/P1 feedback
- [x] /learn integration with feedback table
- [x] Feedback-to-SD promotion endpoint

### Completed Tasks

1. **Wired Risk Router to high-severity feedback** ✅
   - Added `notifyHighSeverityFeedback()` to `lib/uat/risk-router.js`
   - Added `getHighSeverityFeedback()` for dashboard queries
   - Wired in `lib/feedback-capture.js` after successful P0/P1 insert
   - Auto-escalation actions and risk assessment stored in metadata

2. **Wired /learn to query feedback table** ✅
   - Added `getResolvedFeedbackLearnings()` to `scripts/modules/learning/context-builder.js`
   - Added `getRecurringFeedbackPatterns()` for error type grouping
   - Updated `buildLearningContext()` to include feedback sources
   - Updated `formatContextForDisplay()` to show feedback learnings

3. **Created feedback-to-SD promotion endpoint** ✅
   - Added `POST /api/feedback/:id/promote-to-sd` to `server.js`
   - Added `GET /api/feedback/:id` helper endpoint
   - Creates SD with metadata tracking feedback origin
   - Updates feedback with `resolution_sd_id` reference

### Completed
- Completed: 2026-01-18

---

## Execution Order (Recommended)

### Phase 1: SD-QUALITY-TRIAGE-001 (Highest Priority)
**Rationale**: Completes the triage engine that powers everything else. Other SDs depend on triage working correctly.

1. Wire snooze-manager to /inbox
2. Wire ignore-patterns to feedback-capture
3. Wire focus-filter to /inbox --focus
4. Create triage-engine.js orchestrator
5. Add auto-triage trigger

### Phase 2: SD-QUALITY-INT-001 (Enables Flows)
**Rationale**: Creates end-to-end value by connecting systems.

1. Wire Risk Router to high-severity feedback
2. Wire /learn to query feedback table
3. Create feedback-to-SD promotion endpoint

### Phase 3: SD-QUALITY-UI-001 (Polish)
**Rationale**: Final UX improvements once backend is complete.

1. Add breadcrumb labels
2. Add "Promote to SD" button
3. Add cross-page links

---

## Total Effort Estimate

| SD | Current | Target | Effort |
|----|---------|--------|--------|
| TRIAGE-001 | 20% | 100% | ~2-3 hours |
| UI-001 | 90% | 100% | ~1-2 hours |
| INT-001 | 60% | 100% | ~2-3 hours |
| **Total** | 74% | 100% | **~5-8 hours** |

---

## Files Reference

### EHG_Engineer Repository
- `lib/quality/priority-calculator.js` - Priority assignment
- `lib/quality/burst-detector.js` - Error grouping
- `lib/quality/snooze-manager.js` - Snooze operations
- `lib/quality/ignore-patterns.js` - Pattern filtering
- `lib/quality/focus-filter.js` - Focus mode filtering
- `lib/quality/index.js` - Module exports
- `lib/feedback-capture.js` - Error capture integration
- `lib/uat/result-recorder.js` - UAT integration
- `.claude/skills/inbox.md` - /inbox skill
- `.claude/skills/feedback.md` - /feedback alias

### EHG Repository (Frontend)
- `src/pages/quality/QualityInboxPage.tsx`
- `src/pages/quality/QualityBacklogPage.tsx`
- `src/pages/quality/QualityPatternsPage.tsx`
- `src/pages/quality/QualityReleasesPage.tsx`
- `src/components/quality/FeedbackWidget.tsx`
- `src/components/quality/FeedbackDetailPanel.tsx`
- `src/components/navigation/BreadcrumbNavigation.tsx`
- `src/components/error-capture/ErrorCaptureProvider.tsx`

### Database
- `database/migrations/391_quality_lifecycle_schema.sql`

---

## Success Criteria

### SD-QUALITY-TRIAGE-001
- [ ] All 5 lib/quality modules connected and functional
- [ ] Auto-triage runs on new feedback creation
- [ ] /inbox supports snooze, ignore, focus commands
- [ ] E2E test passes for triage workflow

### SD-QUALITY-UI-001
- [ ] Breadcrumbs show "Quality" label
- [ ] "Promote to SD" button works in detail panel
- [ ] Cross-links exist between quality pages
- [ ] No console errors on quality pages

### SD-QUALITY-INT-001
- [ ] P0 feedback triggers Risk Router notification
- [ ] /learn process queries feedback table
- [ ] Feedback can be promoted to SD via API
- [ ] End-to-end flow: Error → Capture → Triage → Resolve → Learn

---

*Plan created: 2026-01-18*
*Last updated: 2026-01-18*
