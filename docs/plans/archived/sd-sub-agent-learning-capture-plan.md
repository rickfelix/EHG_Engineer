# SD Plan: Sub-Agent Learning Capture Enhancement

## Objective
Enhance the LEO Protocol's `/learn` command to capture and surface learnings from ALL sub-agent executions, enabling a feedback loop that improves sub-agent behavior over time.

## Problem Statement
Currently:
- Sub-agent executions are stored in `sub_agent_execution_results` with rich data (verdicts, recommendations, warnings, critical issues)
- The `/learn` command queries retrospectives, issue_patterns, protocol_improvement_queue, and feedback
- BUT: `/learn` does NOT query sub-agent execution data
- No mechanism extracts learnable patterns from sub-agent outputs
- No feedback loop updates sub-agent triggers/autonomy based on performance

## Solution Overview
Add a new learning source to `/learn` that:
1. Queries `sub_agent_execution_results` for patterns
2. Extracts recurring recommendations and performance issues
3. Surfaces them with Devil's Advocate challenges
4. Enables approved learnings to update sub-agent configuration

---

## Implementation Plan

### Phase 1: Add Sub-Agent Learning Extraction (context-builder.js)

**File**: `scripts/modules/learning/context-builder.js`

Add new function `getSubAgentLearnings()`:

```javascript
async function getSubAgentLearnings(limit = TOP_N) {
  // Query recent sub-agent execution results
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('sub_agent_code, verdict, confidence, recommendations, critical_issues, warnings, execution_time, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error querying sub_agent_execution_results:', error.message);
    return [];
  }

  // Group by sub-agent code
  const byAgent = {};
  for (const exec of (data || [])) {
    if (!byAgent[exec.sub_agent_code]) {
      byAgent[exec.sub_agent_code] = [];
    }
    byAgent[exec.sub_agent_code].push(exec);
  }

  const learnings = [];

  for (const [code, executions] of Object.entries(byAgent)) {
    // Calculate effectiveness metrics
    const passRate = executions.filter(e => e.verdict === 'PASS').length / executions.length;
    const avgConfidence = Math.round(executions.reduce((sum, e) => sum + (e.confidence || 0), 0) / executions.length);

    // Extract recurring recommendations
    const allRecs = executions.flatMap(e => e.recommendations || []);
    const recCounts = countOccurrences(allRecs);
    const topRecs = Object.entries(recCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

    // Extract recurring critical issues
    const allIssues = executions.flatMap(e => e.critical_issues || []);
    const issueCounts = countOccurrences(allIssues);
    const topIssues = Object.entries(issueCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

    // Generate learning for recurring recommendations
    if (topRecs.length > 0 && topRecs[0][1] >= 3) {
      learnings.push({
        id: `SAL-${code}-REC`,
        source_type: 'sub_agent_recommendation',
        sub_agent_code: code,
        content: `${code} frequently recommends: ${topRecs.map(r => r[0]).join(', ')}`,
        occurrence_count: topRecs.reduce((sum, r) => sum + r[1], 0),
        confidence: avgConfidence,
        metrics: { pass_rate: passRate, avg_confidence: avgConfidence, execution_count: executions.length },
        items: topRecs.map(r => ({ recommendation: r[0], count: r[1] }))
      });
    }

    // Generate learning for recurring issues
    if (topIssues.length > 0 && topIssues[0][1] >= 2) {
      learnings.push({
        id: `SAL-${code}-ISS`,
        source_type: 'sub_agent_issue',
        sub_agent_code: code,
        content: `${code} frequently detects: ${topIssues.map(i => i[0]).join(', ')}`,
        occurrence_count: topIssues.reduce((sum, i) => sum + i[1], 0),
        confidence: Math.min(100, 50 + topIssues[0][1] * 10),
        metrics: { pass_rate: passRate, execution_count: executions.length },
        items: topIssues.map(i => ({ issue: i[0], count: i[1] }))
      });
    }

    // Flag underperforming sub-agents
    if (executions.length >= 5 && passRate < 0.6) {
      learnings.push({
        id: `SAL-${code}-PERF`,
        source_type: 'sub_agent_performance',
        sub_agent_code: code,
        content: `${code} has low pass rate (${Math.round(passRate * 100)}%). Review triggers/prompts.`,
        occurrence_count: executions.length,
        confidence: 80,
        metrics: { pass_rate: passRate, fail_count: executions.filter(e => e.verdict === 'FAIL').length }
      });
    }
  }

  return learnings.slice(0, limit);
}
```

Update `buildLearningContext()` to include sub-agent learnings:
```javascript
const [lessons, patternResult, improvements, feedbackLearnings, feedbackPatterns, subAgentLearnings] = await Promise.all([
  getRecentLessons(sdId, TOP_N),
  getIssuePatterns(TOP_N),
  getPendingImprovements(TOP_N),
  getResolvedFeedbackLearnings(TOP_N),
  getRecurringFeedbackPatterns(TOP_N),
  getSubAgentLearnings(TOP_N)  // NEW
]);

// Add to context
const context = {
  // ...existing fields
  sub_agent_learnings: subAgentLearnings,
  summary: {
    // ...existing fields
    total_sub_agent_learnings: subAgentLearnings.length
  }
};
```

---

### Phase 2: Add Devil's Advocate for Sub-Agent Learnings (reviewer.js)

**File**: `scripts/modules/learning/reviewer.js`

Add new function `generateSubAgentLearningDA()`:

```javascript
function generateSubAgentLearningDA(learning) {
  const challenges = [];
  const suggestions = [];

  // Challenge based on sample size
  if (learning.metrics?.execution_count < 10) {
    challenges.push(`Only ${learning.metrics.execution_count} executions analyzed - may need more data.`);
  }

  // Challenge performance learnings
  if (learning.source_type === 'sub_agent_performance') {
    challenges.push('Low pass rate may reflect legitimate validation failures, not sub-agent issues.');
    suggestions.push('Review SD complexity distribution before adjusting sub-agent configuration.');
  }

  // Challenge recommendation patterns
  if (learning.source_type === 'sub_agent_recommendation') {
    challenges.push('Recurring recommendations may indicate SD-level issues, not protocol gaps.');
    suggestions.push('Consider whether these recommendations should become automated checks.');
  }

  // Challenge issue patterns
  if (learning.source_type === 'sub_agent_issue') {
    challenges.push('Recurring issues may be codebase problems, not sub-agent configuration issues.');
    suggestions.push('Consider creating an issue_pattern if this is a codebase-level concern.');
  }

  // Challenge based on confidence
  if (learning.confidence < 60) {
    challenges.push(`Low confidence (${learning.confidence}%) - pattern may not be reliable.`);
  }

  if (challenges.length === 0) {
    challenges.push('Consider: Is this a sub-agent issue or a codebase pattern?');
  }

  return {
    ...learning,
    da_counter_argument: challenges[0],
    da_all_challenges: challenges,
    da_suggestions: suggestions.length > 0 ? suggestions : null
  };
}
```

Update `reviewContext()`:
```javascript
export function reviewContext(context) {
  const intelligence = context.intelligence || {};

  const reviewed = {
    patterns: context.patterns.map(p => generatePatternDA(p, intelligence)),
    lessons: context.lessons.map(generateLessonDA),
    improvements: context.improvements.map(generateImprovementDA),
    sub_agent_learnings: (context.sub_agent_learnings || []).map(generateSubAgentLearningDA),  // NEW
    intelligence: intelligence,
    summary: {
      ...context.summary,
      reviewed_at: new Date().toISOString(),
      da_mode: 'always_show'
    }
  };

  return reviewed;
}
```

Update `formatReviewedContextForDisplay()` to include sub-agent section:
```javascript
// Add after improvements section
if (reviewed.sub_agent_learnings?.length > 0) {
  lines.push('\n## Sub-Agent Learnings (with Devil\'s Advocate)');
  lines.push('Patterns extracted from sub-agent execution history:\n');
  for (const sal of reviewed.sub_agent_learnings) {
    const badge = sal.source_type === 'sub_agent_performance' ? '⚠️ PERF' :
                  sal.source_type === 'sub_agent_recommendation' ? '💡 REC' : '🔍 ISS';
    lines.push(`\n**[${sal.id}]** ${badge} ${sal.content}`);
    lines.push(`  - Sub-agent: ${sal.sub_agent_code} | Occurrences: ${sal.occurrence_count}`);
    if (sal.metrics) {
      lines.push(`  - Metrics: ${Math.round(sal.metrics.pass_rate * 100)}% pass rate, ${sal.metrics.execution_count} executions`);
    }
    lines.push(`  - **🔴 DA:** ${sal.da_counter_argument}`);
    if (sal.da_suggestions?.length > 0) {
      lines.push(`  - **💡 Suggestion:** ${sal.da_suggestions[0]}`);
    }
  }
}
```

---

### Phase 3: Schema Enhancement (Optional but Recommended)

**File**: New migration `database/migrations/YYYYMMDD_sub_agent_learning_tracking.sql`

```sql
-- Add source tracking to protocol_improvement_queue
ALTER TABLE protocol_improvement_queue
ADD COLUMN IF NOT EXISTS source_sub_agent_code VARCHAR(20),
ADD COLUMN IF NOT EXISTS source_execution_ids UUID[];

COMMENT ON COLUMN protocol_improvement_queue.source_sub_agent_code IS
  'Sub-agent that generated this improvement recommendation';

-- Add effectiveness tracking to leo_sub_agents
ALTER TABLE leo_sub_agents
ADD COLUMN IF NOT EXISTS effectiveness_metrics JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_effectiveness_update TIMESTAMPTZ;

COMMENT ON COLUMN leo_sub_agents.effectiveness_metrics IS
  'Aggregated performance: {pass_rate, avg_confidence, execution_count, common_recommendations}';
```

---

### Phase 4: Feedback Loop (Future Enhancement)

Create `scripts/modules/learning/sub-agent-config-applier.js` to:
- Update `leo_sub_agents.effectiveness_metrics` when learnings are approved
- Track which sub-agents need attention based on performance
- Optionally queue trigger/prompt modifications for review

---

## Files to Modify

| File | Changes |
|------|---------|
| `scripts/modules/learning/context-builder.js` | Add `getSubAgentLearnings()`, update `buildLearningContext()` |
| `scripts/modules/learning/reviewer.js` | Add `generateSubAgentLearningDA()`, update `reviewContext()`, `formatReviewedContextForDisplay()` |
| `database/migrations/` | New migration for schema columns (optional) |

## Files for Reference (Read-Only)

| File | Purpose |
|------|---------|
| `lib/sub-agent-executor/results-storage.js` | Understand how results are stored |
| `database/schema/sub_agent_execution_results.sql` | Schema reference |
| `.claude/commands/learn.md` | Learn skill definition |

---

## Verification Plan

1. **Unit Test**: Create test for `getSubAgentLearnings()` with mock execution data
2. **Integration Test**: Run `/learn` and verify sub-agent learnings appear
3. **Manual Test**:
   - Execute several SDs with different sub-agents
   - Run `/learn` command
   - Verify sub-agent learnings section appears
   - Verify Devil's Advocate challenges are relevant
4. **Approval Flow**: Approve a sub-agent learning and verify it creates appropriate SD

---

## Success Criteria

- [ ] `/learn` command shows "Sub-Agent Learnings" section
- [ ] Recurring recommendations from sub-agents are surfaced
- [ ] Underperforming sub-agents are flagged
- [ ] Devil's Advocate challenges are specific to sub-agent context
- [ ] Approved learnings can update sub-agent effectiveness metrics

---

## Complexity Assessment

**Scope**: Medium (2 files modified, 1 optional migration)
**Risk**: Low (additive changes, no breaking changes)
**Dependencies**: None (uses existing tables)

## SD Classification

**Type**: `enhancement`
**Category**: `infrastructure`
**Priority**: `standard`
