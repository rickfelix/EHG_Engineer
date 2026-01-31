<!-- Archived from: C:\Users\rickf\.claude\plans\squishy-kindling-sloth.md -->
<!-- SD Key: SD-LEO-FIX-LEO-ASSIST-INTELLIGENT-002 -->
<!-- Archived at: 2026-01-31T14:56:00.701Z -->

# Plan: /leo assist - Intelligent Autonomous Inbox Processing

## Goal
Create `/leo assist` - a fully autonomous intelligent assistant mode that processes the feedback inbox without human intervention, using context-aware prioritization and smart handling of different item types.

## User Requirements (from discovery)
- **Work Mode**: Triage, prioritize, create SDs, fix issues directly, full implementation
- **Autonomy**: Fully autonomous, no checkpoints, no limits
- **Prioritization**: Context-aware, prioritizes items related to recent SDs
- **Enhancement Handling**: Ask one-by-one about scheduling, save dates
- **Completion**: Summary report of actions taken
- **Activation**: Default behavior for `/leo inbox`, or explicit `/leo assist`

## Architecture

### Core Algorithm (Two-Phase Processing)

```
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: AUTONOMOUS ISSUE PROCESSING                       │
│  ─────────────────────────────────────────────────────────  │
│  No user interaction - runs continuously                    │
└─────────────────────────────────────────────────────────────┘

1. LOAD CONTEXT
   - Query recent SD work (is_working_on=true, recent activity)
   - Load inbox items (issues + enhancements)
   - Build relationship map (which items relate to recent SDs)
   - Separate issues from enhancements

2. PRIORITIZE ISSUES
   Priority stack:
   ├─ P0 Issues (critical, immediate)
   ├─ Issues related to recent SD work (momentum)
   ├─ P1 Issues (high priority)
   └─ P2/P3 Issues (normal)

3. PROCESS ALL ISSUES (Autonomous with Self-Healing)
   For each issue:
   ├─ If <50 LOC estimate → Quick-fix with intelligent retry
   ├─ If 50-100 LOC → Create SD, execute with intelligent retry
   └─ If >100 LOC → Create SD, add to queue

   INTELLIGENT RETRY LOOP (per item):
   ┌─────────────────────────────────────────────────────────┐
   │  Attempt 1: Execute fix                                 │
   │      ├─ Tests PASS → Auto-merge to main ✅              │
   │      └─ Tests FAIL ↓                                    │
   │                                                         │
   │  Attempt 2: Invoke RCA sub-agent                        │
   │      → Diagnose failure, identify root cause            │
   │      → Apply RCA-informed fix                           │
   │      ├─ Tests PASS → Auto-merge ✅                      │
   │      └─ Tests FAIL ↓                                    │
   │                                                         │
   │  Attempt 3: Invoke specialized sub-agent                │
   │      → Database agent (if schema issue)                 │
   │      → Testing agent (if test itself is wrong)          │
   │      → Security agent (if auth/RLS issue)               │
   │      → Apply specialist fix                             │
   │      ├─ Tests PASS → Auto-merge ✅                      │
   │      └─ Tests FAIL → Mark "needs attention" ❌          │
   └─────────────────────────────────────────────────────────┘

   SAFETY GATES (automated, no human review):
   ├─ Tests must pass (after retries)
   ├─ Lint must pass
   ├─ No test file deletions (prevent "fix loop")
   ├─ LOC ejection: abort if actual LOC > 50 mid-fix
   └─ Auto-revert on final failure (leave repo clean)

   Track: which issues were fixed, retry counts, sub-agents invoked

┌─────────────────────────────────────────────────────────────┐
│  PHASE 2: INTERACTIVE ENHANCEMENT SCHEDULING                │
│  ─────────────────────────────────────────────────────────  │
│  Requires user input - asks about each enhancement          │
└─────────────────────────────────────────────────────────────┘

4. PRESENT ENHANCEMENTS (One-by-One with Recommendations)
   For each enhancement:
   ├─ Show full details (title, description, use case)
   ├─ Show AI recommendation:
   │   "This seems related to the UUID fix you just did"
   │   "Low effort - could implement in ~30 LOC"
   │   "No clear relationship to recent work"
   ├─ Ask: Now / This week / Next week / Backlog / Won't do
   └─ Save decision and continue to next enhancement

5. COMPLETE
   - Generate summary report
   - Phase 1: Issues processed (X fixed, Y SDs created)
   - Phase 2: Enhancements scheduled (breakdown by decision)
```

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `.claude/skills/assist.md` | **CREATE** | New skill for /leo assist |
| `.claude/commands/leo.md` | MODIFY | Add assist subcommand routing |
| `lib/quality/assist-engine.js` | **CREATE** | Core prioritization and processing logic |
| `lib/quality/context-analyzer.js` | **CREATE** | SD relationship detection |

### Database Queries

#### 1. Get Recent SD Context
```javascript
// Recent work (last 7 days, is_working_on, or recently modified)
const { data: recentSDs } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, description, sd_type, current_phase, updated_at')
  .or('is_working_on.eq.true,updated_at.gte.' + sevenDaysAgo)
  .order('updated_at', { ascending: false })
  .limit(10);
```

#### 2. Get Actionable Inbox Items
```javascript
// All non-closed items, ordered for processing
const { data: items } = await supabase
  .from('feedback')
  .select('*')
  .not('status', 'in', '(resolved,wont_fix,shipped,snoozed)')
  .order('priority', { ascending: true })
  .order('created_at', { ascending: true });
```

#### 3. Relate Items to SDs (Context Analysis)
```javascript
// For each item, check if title/description mentions recent SD keywords
function findRelatedSD(item, recentSDs) {
  const itemText = (item.title + ' ' + item.description).toLowerCase();
  for (const sd of recentSDs) {
    const sdKeywords = extractKeywords(sd.title + ' ' + sd.description);
    if (sdKeywords.some(kw => itemText.includes(kw))) {
      return sd;
    }
  }
  return null;
}
```

### Enhancement Scheduling Flow (Phase 2)

After all issues are processed, present each enhancement with context:

```javascript
// Build AI recommendation based on context
function generateRecommendation(enhancement, context) {
  const { issuesJustFixed, recentSDs, filesModified } = context;

  // Check if enhancement relates to work just done
  const relatedIssue = findRelatedItem(enhancement, issuesJustFixed);
  const relatedSD = findRelatedItem(enhancement, recentSDs);

  if (relatedIssue) {
    return `🔗 Related to "${relatedIssue.title}" which you just fixed. Good time to implement.`;
  }
  if (relatedSD) {
    return `🔗 Related to SD "${relatedSD.id}" you were working on recently.`;
  }
  if (enhancement.effort_estimate === 'small') {
    return `⚡ Low effort (~${enhancement.estimated_loc || 30} LOC). Quick win.`;
  }
  return `📋 No direct relationship to recent work. Consider for future sprint.`;
}

// Use AskUserQuestion for each enhancement
{
  "question": "📦 Enhancement: {title}\n\n{description}\n\n💡 AI Recommendation:\n{recommendation}\n\nWhen should we implement this?",
  "header": "Schedule",
  "multiSelect": false,
  "options": [
    {"label": "Now", "description": "Create SD and implement immediately"},
    {"label": "This week", "description": "Schedule for this week"},
    {"label": "Next week", "description": "Schedule for next week"},
    {"label": "Backlog", "description": "Add to backlog for future consideration"},
    {"label": "Won't do", "description": "Close as won't implement"}
  ]
}
```

**Scheduling Actions:**
- **Now**: Create SD, add to immediate queue (will be next after assist completes)
- **This week**: Set `snoozed_until` to end of week, status='scheduled'
- **Next week**: Set `snoozed_until` to next Monday, status='scheduled'
- **Backlog**: Set status='backlog'
- **Won't do**: Set status='wont_fix', add resolution note

**Note**: The "Now" option doesn't implement immediately - it queues the enhancement as an SD for after the assist session completes. This keeps Phase 2 focused on scheduling decisions only.

### Summary Report Format

```
════════════════════════════════════════════════════════════
  /leo assist - Session Summary
════════════════════════════════════════════════════════════

  Total Items: 15
  Duration: 45 minutes

┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: ISSUES (Autonomous)                    11 items  │
└─────────────────────────────────────────────────────────────┘

  ✅ AUTO-MERGED (8)
  ────────────────────────────────────────────────────────────
  FB-0001  Missing breadcrumb navigation (12 LOC, 1 attempt)
  FB-0002  Header menu missing Profile option (8 LOC, 1 attempt)
  FB-0003  UI zoom defaults too large (3 LOC, 1 attempt)
  FB-0004  UUID error (45 LOC, 2 attempts - RCA identified null check)
  FB-0005  Permission display (28 LOC, 3 attempts - Security agent fixed RLS)
  ...

  📋 SD CREATED & QUEUED (2)
  ────────────────────────────────────────────────────────────
  FB-0006  → SD-FIX-LARGE-REFACTOR-001 (queued, ~200 LOC)
  FB-0007  → SD-FIX-COMPLEX-ISSUE-001 (queued, ~150 LOC)

  ⚠️  NEEDS ATTENTION (1) - exhausted 3 intelligent attempts
  ────────────────────────────────────────────────────────────
  FB-0008  Auth token refresh - RCA + Security agent couldn't resolve
           Last error: "Token validation requires external API change"
           Recommendation: May need architectural decision

┌─────────────────────────────────────────────────────────────┐
│  PHASE 2: ENHANCEMENTS (Interactive)              4 items  │
└─────────────────────────────────────────────────────────────┘

  🚀 IMPLEMENT NOW (1)
  ────────────────────────────────────────────────────────────
  FB-0010  Dark mode toggle → SD-ENH-DARKMODE-001 (queued)

  📅 SCHEDULED (2)
  ────────────────────────────────────────────────────────────
  FB-0011  Remove shortcuts → This week (Feb 3)
  FB-0012  Filter improvements → Next week (Feb 10)

  📦 BACKLOG (1)
  ────────────────────────────────────────────────────────────
  FB-0013  Search platform redesign → Backlog

════════════════════════════════════════════════════════════
  📊 Inbox Status: 0 remaining (was 15)
  🎯 Next: 3 SDs queued for implementation
════════════════════════════════════════════════════════════
```

### Sub-Agent Escalation Chain (Self-Healing)

The system leverages existing sub-agents to intelligently resolve failures:

| Attempt | Agent | Trigger | Action |
|---------|-------|---------|--------|
| 1 | None | Initial try | Execute the fix directly |
| 2 | **RCA** | Tests fail | 5-whys analysis, identify root cause, apply informed fix |
| 3 | **Specialist** | RCA fix fails | Route to appropriate sub-agent based on error type |

**Specialist Routing:**

| Error Pattern | Sub-Agent | Example Resolution |
|---------------|-----------|-------------------|
| Schema/migration | `database-agent` | Generate missing migration, fix column types |
| Test assertion wrong | `testing-agent` | Update test expectation if behavior change is correct |
| Auth/RLS/permissions | `security-agent` | Fix RLS policies, update auth logic |
| Type errors | `design-agent` | Refactor interfaces, fix type definitions |
| Performance regression | `performance-agent` | Optimize query, add caching |
| Import/dependency | `dependency-agent` | Fix imports, resolve version conflicts |

**Only after 3 intelligent attempts** does an item go to "needs attention" - and at that point, the summary includes:
- What was tried
- Why each attempt failed
- AI recommendation for resolution

## Implementation Plan

### Phase 1: Core Infrastructure (lib/quality/)

**File: `lib/quality/assist-engine.js`**
```javascript
class AssistEngine {
  constructor(supabase) { ... }

  // Load and analyze
  async loadContext() { ... }
  async loadInboxItems() { ... }
  async analyzeRelationships() { ... }

  // Prioritization
  prioritizeItems(items, context) { ... }

  // Processing
  async processItem(item) { ... }
  async processIssue(issue) { ... }
  async processEnhancement(enhancement) { ... }

  // Estimation
  estimateLOC(item) { ... }

  // Reporting
  generateSummary() { ... }
}
```

**File: `lib/quality/context-analyzer.js`**
```javascript
class ContextAnalyzer {
  constructor(supabase) { ... }

  async getRecentSDContext() { ... }
  findRelatedSD(item, recentSDs) { ... }
  extractKeywords(text) { ... }
  scoreRelevance(item, sd) { ... }
}
```

### Phase 2: Skill Definition

**File: `.claude/skills/assist.md`**
- Define the `/leo assist` command behavior
- Reference the AssistEngine for processing logic
- Include the enhancement scheduling flow
- Define summary report generation

### Phase 3: LEO Integration

**File: `.claude/commands/leo.md`**
- Add `assist` and `a` as recognized arguments
- Update argument-hint to include assist
- Route to assist skill with full autonomous behavior
- Add to help menu

### Phase 4: Database Enhancements (if needed)

Potentially add to feedback table:
- `scheduled_for` TIMESTAMPTZ - Target implementation date
- `related_sd_id` VARCHAR(50) - Link to related SD

## Verification

1. **Test empty inbox**: `/leo assist` with no items → immediate summary
2. **Test issue processing**: Add P0 issue → should quick-fix or create SD
3. **Test enhancement scheduling**: Add enhancement → should prompt for schedule
4. **Test context awareness**: With active SD, add related item → should prioritize
5. **Test summary report**: Process multiple items → verify report accuracy

## Scope
- **New files**: 3 (assist-engine.js, context-analyzer.js, assist.md)
- **Modified files**: 1 (leo.md)
- **Estimated LOC**: ~400
- **Complexity**: Medium-High (new autonomous workflow)

## Resolved Design Decisions

1. **Command structure**: Separate commands
   - `/leo inbox` shows list (current behavior)
   - `/leo assist` runs autonomous mode

2. **LOC estimation**: Use existing infrastructure
   - `scripts/create-quick-fix.js` accepts `--estimated-loc`
   - `scripts/classify-quick-fix.js` validates ≤50 LOC threshold
   - LOC Threshold Gate (`scripts/modules/handoff/executors/exec-to-plan/gates/loc-threshold-validation.js`) calculates actual LOC from git diff
   - For assist mode: Claude estimates LOC based on item description, then adjusts after exploration

3. **Dry-run mode**: Yes, add `--dry-run` flag
   - Shows prioritized list and planned actions
   - No database changes or implementations
   - User can review before running full assist

## Triangulation Findings (Incorporated)

External AI review (ChatGPT x2 + Gemini) identified these concerns. Here's how we address them:

| Concern | AI Recommendation | Our Approach |
|---------|-------------------|--------------|
| Protocol conflict (no direct commits) | Use Draft PRs + human review | **Rejected** - Use automated safety gates instead |
| Error recovery | Run journal + checkpoints | ✅ Add `leo_assist_runs` table |
| LOC estimation unreliable | Abort if exceeds threshold | ✅ "Ejection seat" at 50 LOC |
| Conflict detection | Semantic similarity | ✅ Phase 2 (v1.1) |
| Test deletion ("fix loop") | Block test file deletions | ✅ Safety gate |
| Learning from decisions | Track user choices | ✅ Phase 2 (v1.1) |
| Batching for context | Group by component | ✅ Cluster before processing |
| Failure handling | Revert + mark for human | **Enhanced** - Intelligent retry with sub-agents first |

**Key Insight**: Instead of falling back to human review on failure, we use existing sub-agents (RCA, Database, Security, etc.) to self-heal. The "needs attention" bucket should be nearly empty.

## Existing Code to Use

| Component | Location | Purpose |
|-----------|----------|---------|
| Quick-fix creation | `scripts/create-quick-fix.js` | Create QF records |
| Quick-fix classification | `scripts/classify-quick-fix.js` | Validate scope ≤50 LOC |
| LOC threshold gate | `scripts/modules/handoff/.../loc-threshold-validation.js` | Calculate actual LOC |
| Focus filter | `lib/quality/focus-filter.js` | Get urgent/critical items |
| Snooze manager | `lib/quality/snooze-manager.js` | Schedule enhancements |
| SD key generator | `scripts/modules/sd-key-generator.js` | Create SD IDs |
| Session manager | `lib/session-manager.mjs` | Track autonomous session |
| Heartbeat manager | `lib/heartbeat-manager.mjs` | Keep session alive |
