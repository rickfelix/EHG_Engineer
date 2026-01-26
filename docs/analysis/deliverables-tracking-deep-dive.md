# Deliverables Tracking System: Deep-Dive Analysis


## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, e2e, unit

**Date**: 2025-11-28
**Status**: ANALYSIS COMPLETE - Improvement Plan Proposed
**Related**: SD-UI-PARITY-001, LEO Protocol v4.3.3

---

## Executive Summary

The current `sd_scope_deliverables` tracking system has significant architectural gaps that create friction during EXEC phase and handoff transitions. The system was designed with manual developer updates in mind, but since Claude_EXEC handles all implementation, the system needs to be **fully automated** with no manual intervention required.

**Key Finding**: The system has the right database schema but lacks the integration points to automatically track what Claude_EXEC actually produces.

---

## Current Architecture

### Data Flow (As Designed)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        CURRENT FLOW (FRAGMENTED)                         │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  PLAN-TO-EXEC Handoff                                                    │
│       │                                                                  │
│       ▼                                                                  │
│  extract-deliverables-from-prd.js                                        │
│       │ Extracts from: exec_checklist, functional_requirements,         │
│       │                scope text, OR user_stories                       │
│       ▼                                                                  │
│  sd_scope_deliverables (populated)                                       │
│       │                                                                  │
│       │    ❌ GAP: No automatic updates during EXEC                     │
│       │    📝 CLAUDE_EXEC.md says "manual updates"                      │
│       ▼                                                                  │
│  EXEC-TO-PLAN Handoff                                                    │
│       │                                                                  │
│       ▼                                                                  │
│  auto_complete_deliverables_on_handoff.sql (database trigger)           │
│       │ Marks ALL deliverables complete when handoff is accepted        │
│       │                                                                  │
│       ▼                                                                  │
│  get_progress_breakdown() checks deliverables_complete                   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Key Components

1. **`sd_scope_deliverables` table** (`leo_protocol_enforcement_001_scope_deliverables.sql`)
   - Schema is well-designed with proper tracking fields
   - Has `extracted_from` field that can link back to source (prd, user_stories)
   - Has `completion_status`, `completion_evidence`, `verified_by` fields

2. **`extract-deliverables-from-prd.js`** (PLAN→EXEC handoff)
   - Attempts to extract deliverables from multiple PRD sources
   - Fallback cascade: exec_checklist → functional_requirements → scope text → user_stories
   - **GAP**: Often fails to extract meaningful deliverables if PRD isn't structured properly

3. **`auto-complete-deliverables.js`** (EXEC→PLAN handoff verification)
   - Complex cascading verification system (4 tiers)
   - Cross-references PRD checklist, sub-agent results, handoffs, user stories
   - **GAP**: Defers to database trigger for low-confidence cases

4. **`auto_complete_deliverables_on_handoff.sql`** (Database trigger)
   - Fires when EXEC-TO-PLAN handoff is accepted
   - Blindly marks ALL deliverables as complete
   - **GAP**: No verification of actual work, just trusts handoff acceptance

5. **`user_stories` table** (Separate tracking)
   - Has `validation_status` and `e2e_test_status` columns
   - Auto-validates when E2E test passes (trigger)
   - **GAP**: No explicit link to deliverables table

---

## Identified Gaps

### Gap 1: No Real-Time Tracking During EXEC

**Problem**: Deliverables are populated at PLAN→EXEC but never updated during EXEC. The only update happens at EXEC→PLAN when the trigger blindly marks everything complete.

**Impact**:
- Progress calculation shows 0% for EXEC_implementation until handoff
- No visibility into what's actually been completed
- No incremental progress tracking

**Evidence**:
```
"EXEC_implementation": {
    "weight": 30,
    "progress": 30,
    "deliverables_tracked": false,  ← Always false during EXEC
    "deliverables_complete": true   ← Only true after handoff
}
```

### Gap 2: User Stories Disconnected from Deliverables

**Problem**: `user_stories` and `sd_scope_deliverables` are parallel tracking systems with no explicit relationship.

**Current Workarounds**:
- `extract-deliverables-from-prd.js` can create deliverables FROM user stories (Option 4)
- `auto-complete-deliverables.js` checks `USER_STORIES_VALIDATED` as a verification source

**Impact**:
- Completing a user story doesn't automatically complete related deliverables
- Completing a deliverable doesn't validate related user stories
- Duplicate tracking effort with potential mismatches

### Gap 3: Extraction Relies on PRD Structure

**Problem**: Deliverable extraction depends on PRD having well-structured content:
- `exec_checklist` array with `text` and `checked` fields
- `functional_requirements` array
- Pattern-matched scope text

**Impact**:
- Inconsistent PRD formats lead to 0 deliverables extracted
- Falls back to creating deliverables from user stories (which duplicates tracking)

### Gap 4: Manual Update Instructions in Protocol

**Problem**: `CLAUDE_EXEC.md` instructs Claude to manually update deliverables:

```javascript
// After each major implementation milestone:
await supabase
  .from('sd_scope_deliverables')
  .update({
    completion_status: 'completed',
    completion_evidence: 'Brief description of what was done'
  })
```

**Impact**:
- Claude_EXEC may or may not run these updates
- No automated detection of completed work
- Inconsistent tracking across different SDs

### Gap 5: No Link Between Git Commits and Deliverables

**Problem**: When Claude_EXEC creates a component (e.g., `ScoreBar.tsx`), there's no automatic connection to the deliverable tracking system.

**Impact**:
- Git history shows work was done
- `sd_scope_deliverables` doesn't know about it
- Progress stays at 0% until manual handoff

### Gap 6: Child SD Deliverables Not Inherited/Linked

**Problem**: When using child SDs (e.g., SD-UI-PARITY-001A), deliverables need to be populated for each child, and progress doesn't roll up automatically.

**Impact**:
- Parent SD progress calculation ignores child deliverable status
- Each child needs separate deliverable extraction
- No unified view of parent+children deliverable completion

---

## Opportunities for Improvement

### Opportunity 1: Unified User Story ↔ Deliverable Model

**Concept**: Make user stories THE source of truth for deliverables, eliminating duplication.

**Benefits**:
- Single source of tracking
- Completing a user story = completing its deliverables
- E2E test pass = validated user story = completed deliverable

**Implementation Approach**:
```sql
-- Add deliverable tracking directly to user_stories
ALTER TABLE user_stories
  ADD COLUMN deliverable_type VARCHAR(50),
  ADD COLUMN completion_evidence TEXT,
  ADD COLUMN files_created TEXT[];  -- Array of file paths

-- Or: Create explicit link table
CREATE TABLE user_story_deliverables (
  user_story_id UUID REFERENCES user_stories(id),
  deliverable_id UUID REFERENCES sd_scope_deliverables(id),
  relationship_type VARCHAR(50) -- 'primary', 'supporting', 'derived'
);
```

### Opportunity 2: Git Commit → Deliverable Auto-Linking

**Concept**: Parse git commits made by Claude_EXEC and auto-update deliverables based on files changed.

**Trigger Points**:
- Pre-commit hook records files changed
- Post-commit hook updates deliverables
- Or: Periodic sync during EXEC phase

**Implementation Approach**:
```javascript
// In unified-handoff-system.js or new module
async function syncDeliverablesToGitHistory(sdId) {
  // 1. Get recent commits on SD branch
  const commits = await getGitCommitsForBranch(`sd/${sdId}`);

  // 2. For each commit, extract files changed
  // 3. Match files to deliverables by:
  //    - deliverable_type + file path patterns
  //    - deliverable_name keywords in commit message

  // 4. Update sd_scope_deliverables with evidence
}
```

### Opportunity 3: Claude_EXEC Instrumentation

**Concept**: Automatically track when Claude_EXEC creates/modifies files and update deliverables in real-time.

**Implementation Approaches**:
1. **Hook-based**: Add to Claude Code hooks that fire on file write
2. **Session-based**: At end of Claude_EXEC session, parse conversation for file operations
3. **Database trigger on Write tool**: Capture file operations in a tracking table

### Opportunity 4: Checkpoint-Based Deliverable Verification

**Concept**: For large SDs with checkpoints, tie deliverables to specific checkpoints and verify at each checkpoint boundary.

**Implementation**:
```sql
ALTER TABLE sd_scope_deliverables
  ADD COLUMN checkpoint_id VARCHAR(100) REFERENCES strategic_directives_v2(id);

-- Child SD completion auto-verifies parent deliverables for that checkpoint
CREATE OR REPLACE FUNCTION verify_checkpoint_deliverables()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.relationship_type = 'child_phase' THEN
    -- Mark all deliverables for this checkpoint as complete
    UPDATE sd_scope_deliverables
    SET completion_status = 'completed',
        verified_by = 'CHECKPOINT',
        verified_at = NOW()
    WHERE checkpoint_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Opportunity 5: Sub-Agent Verification Integration

**Concept**: Leverage existing sub-agent results to verify deliverables automatically.

**Current State**: `auto-complete-deliverables.js` already checks sub-agent results but only as a SECONDARY verification source.

**Enhancement**:
- Make sub-agent TESTING pass → auto-complete test deliverables
- Make sub-agent DATABASE pass → auto-complete database deliverables
- Make sub-agent DESIGN pass → auto-complete UI deliverables

### Opportunity 6: PRD exec_checklist as Single Source

**Concept**: Standardize on `prd.exec_checklist` as THE source for deliverables, with auto-population of user story links.

**Current State**: `exec_checklist` is already used but inconsistently populated.

**Enhancement**:
- PLAN phase MUST populate exec_checklist with explicit deliverables
- Each checklist item links to user story ID(s)
- Validation gate: exec_checklist.length > 0 required for PLAN→EXEC

---

## Proposed Architecture (v2.0)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    PROPOSED FLOW (INTEGRATED)                            │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  PLAN Phase                                                              │
│       │                                                                  │
│       ▼                                                                  │
│  user_stories table (populated with deliverable metadata)                │
│       │ story_key, title, acceptance_criteria, deliverable_type         │
│       │                                                                  │
│       ▼                                                                  │
│  exec_checklist in PRD (auto-generated from user_stories)               │
│       │ Links: exec_checklist[].user_story_ids = ['US-001', 'US-002']   │
│       │                                                                  │
│  ─────────────────────────────────────────────────────────────────────  │
│  PLAN-TO-EXEC Handoff                                                    │
│       │                                                                  │
│       ▼                                                                  │
│  sd_scope_deliverables (auto-populated from exec_checklist)             │
│       │ Each deliverable links to user_story_id                         │
│       │                                                                  │
│  ─────────────────────────────────────────────────────────────────────  │
│  EXEC Phase (AUTOMATED TRACKING)                                         │
│       │                                                                  │
│       ├─► Git commit detected                                            │
│       │       │                                                          │
│       │       ▼                                                          │
│       │   Parse commit → match to deliverables → update completion      │
│       │                                                                  │
│       ├─► E2E test passes (via TESTING sub-agent)                       │
│       │       │                                                          │
│       │       ▼                                                          │
│       │   user_stories.validation_status = 'validated'                  │
│       │   sd_scope_deliverables (linked) → completion_status = done     │
│       │                                                                  │
│       └─► Claude_EXEC creates file                                       │
│               │                                                          │
│               ▼                                                          │
│           Track in sd_exec_file_operations table                         │
│           Match to deliverables → update progress                        │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────────  │
│  EXEC-TO-PLAN Handoff                                                    │
│       │                                                                  │
│       ▼                                                                  │
│  Verification Gate (BLOCKING)                                            │
│       ├── All user_stories validated? ✓                                 │
│       ├── All sd_scope_deliverables completed? ✓                        │
│       ├── E2E tests passing? ✓                                          │
│       └── Sub-agent verdicts? ✓                                         │
│                                                                          │
│       │                                                                  │
│       ▼                                                                  │
│  Progress = 100% (calculated from real data, not handoff trigger)       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Roadmap

### Phase 1: Data Model Enhancement (Database)

1. **Add user_story_id to sd_scope_deliverables**
   ```sql
   ALTER TABLE sd_scope_deliverables
     ADD COLUMN user_story_id UUID REFERENCES user_stories(id),
     ADD COLUMN checkpoint_sd_id VARCHAR(100) REFERENCES strategic_directives_v2(id);
   ```

2. **Create file operations tracking table**
   ```sql
   CREATE TABLE sd_exec_file_operations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     sd_id VARCHAR(100) REFERENCES strategic_directives_v2(id),
     operation_type VARCHAR(20), -- 'create', 'modify', 'delete'
     file_path TEXT NOT NULL,
     commit_hash VARCHAR(40),
     deliverable_id UUID REFERENCES sd_scope_deliverables(id),
     user_story_id UUID REFERENCES user_stories(id),
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

3. **Create bi-directional sync trigger**
   - user_story validated → linked deliverable completed
   - deliverable completed → check if all linked stories done

### Phase 2: Extraction Enhancement (PLAN→EXEC)

1. **Require exec_checklist with user_story links**
   - Modify PRD creation to always generate exec_checklist
   - Each checklist item must reference user_story_id(s)

2. **Enhanced extract-deliverables-from-prd.js**
   - Primary: exec_checklist with story links
   - No fallback to generic extraction (force proper PRD structure)

### Phase 3: Real-Time Tracking (EXEC Phase)

1. **Git commit parser**
   - Parse commits on SD branch
   - Match files to deliverables
   - Update completion status with commit evidence

2. **Claude Code hook integration** (if feasible)
   - Hook on file write operations
   - Track in sd_exec_file_operations
   - Auto-match to deliverables

3. **Sub-agent result triggers**
   - TESTING pass → complete test deliverables
   - DATABASE pass → complete database deliverables

### Phase 4: Verification Enhancement (EXEC→PLAN)

1. **Replace blind auto-complete trigger**
   - Remove bulk completion on handoff
   - Use actual completion data from Phase 3

2. **Enhanced verification gate**
   - Check user_stories all validated
   - Check sd_scope_deliverables all completed
   - Check no orphan deliverables (created but not completed)

### Phase 5: Progress Calculation Update

1. **Update get_progress_breakdown()**
   - Use real completion counts, not handoff acceptance
   - Show incremental progress during EXEC

2. **Parent/Child rollup**
   - Calculate parent progress from child deliverables
   - Checkpoint completion triggers parent progress update

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Git parsing misses non-committed work | Medium | Medium | Also track file writes via hooks |
| Over-automation marks incomplete work done | Medium | High | Require verification evidence for completion |
| Complex migration breaks existing SDs | Low | High | Feature flag, backward compatible |
| Performance impact from triggers | Low | Medium | Index optimization, async processing |

---

## Success Metrics

1. **Zero manual deliverable updates** - Claude_EXEC never needs to run explicit update queries
2. **Real-time progress visibility** - Progress updates within minutes of work completion
3. **100% traceability** - Every completed deliverable links to commit/file/test evidence
4. **User story ↔ deliverable consistency** - No orphan records in either table

---

## Recommendation

**Start with Phase 1 + 2** to establish the data model foundation and proper PRD structure. This unblocks the SD-UI-PARITY-001A issue immediately by ensuring deliverables are properly populated.

**Then Phase 3** for real-time tracking, which provides the most value but is also the most complex.

**Phase 4-5** can be implemented incrementally as the foundation solidifies.

---

*Analysis by Claude_EXEC | SD-UI-PARITY-001 Context*
