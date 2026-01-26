# Overflow Prevention Patterns


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, schema, security

**Version**: 1.0.0
**Last Updated**: 2025-09-29
**Status**: Active

## Overview

LEO Protocol now includes proactive overflow prevention to maintain Claude 4.5 Sonnet's context health throughout multi-phase workflows. The system monitors token usage and applies intelligent compression before hitting context limits.

## Architecture

### Components

1. **Context Monitor** (`lib/context/context-monitor.js`)
   - Token estimation (~4 characters per token)
   - Status analysis with thresholds
   - Smart summarization for verbose content
   - Handoff preparation with compression

2. **Smart Handoff Manager** (`lib/context/handoff-with-overflow-prevention.js`)
   - Wraps existing handoff system
   - Automatic overflow detection
   - Context-aware compression strategies
   - Memory-first pattern for large content

3. **Slash Command** (`.claude/commands/context-compact.md`)
   - Manual compaction trigger: `/context-compact`
   - Focus areas: `/context-compact sub-agents`
   - Real-time status display

### Token Budget

```
Total Context Window:     200,000 tokens
Base Context (imports):    56,000 tokens (28%)
Available for Work:       144,000 tokens (72%)
```

## Thresholds

| Status | Token Range | Percentage | Action |
|--------|-------------|------------|--------|
| **HEALTHY** | 0-150K | 0-75% | Continue normally |
| **WARNING** | 150K-170K | 75-85% | Selective compression |
| **CRITICAL** | 170K-190K | 85-95% | Aggressive summarization |
| **EMERGENCY** | 190K-200K | 95-100% | Force handoff immediately |

## Compression Strategies

### Strategy 1: Full Context (HEALTHY)
- **When**: Context usage < 150K tokens
- **Action**: No compression needed
- **Handoff**: Full details remain in context
- **Example**:
```javascript
{
  strategy: 'full-context',
  inContext: handoffData,
  inMemory: null
}
```

### Strategy 2: Selective Compression (WARNING)
- **When**: 150K-170K tokens
- **Action**: Compress verbose sections
- **What Gets Compressed**:
  - Arrays → Top 5 items only
  - Known issues → Critical/high severity only
  - Descriptions → Max 500 chars + "see memory"
- **Example**:
```javascript
{
  strategy: 'selective',
  inContext: {
    recommendations: recommendations.slice(0, 5),
    knownIssues: knownIssues.filter(i => i.severity === 'critical'),
    description: description.substring(0, 500) + '... (see memory for full)'
  }
}
```

### Strategy 3: Memory-First (CRITICAL/EMERGENCY)
- **When**: Context > 170K tokens
- **Action**: Full details to memory, summaries in context
- **Handoff Structure**:
```javascript
{
  strategy: 'memory-first',
  inContext: {
    from: 'PLAN',
    to: 'EXEC',
    summary: {
      completedItems: 10,
      totalItems: 12,
      keyDecisions: ['Decision 1', 'Decision 2', 'Decision 3'],
      criticalIssues: [],
      nextActions: ['Action 1', 'Action 2', 'Action 3']
    },
    fullDetailsLocation: 'Memory: .claude/session-state.md'
  },
  inMemory: fullHandoffData,
  tokensSaved: 45000
}
```

## Sub-Agent Report Summarization

When processing sub-agent reports, the system applies compression based on context status:

### Full Reports (HEALTHY)
```javascript
{
  strategy: 'full',
  reports: [
    {
      agent: 'DATABASE',
      status: 'passed',
      confidence: 95,
      critical_issues: [],
      recommendations: ['Add index', 'Optimize query', 'Review schema']
    },
    // ... all reports
  ]
}
```

### Summarized Reports (WARNING/CRITICAL)
```javascript
{
  strategy: 'summarized',
  summary: 'Sub-Agent Verification: 8 passed, 1 failed, 2 warnings. Critical issues from: SECURITY.',
  reports: [
    {
      agent: 'DATABASE',
      status: 'passed',
      confidence: 95,
      criticalIssues: [],  // Top 3 only
      topRecommendation: 'Add index'  // Top 1 only
    },
    // ... summarized reports
  ],
  compressionRatio: '62.5%',
  fullReportsInMemory: true
}
```

## Usage Patterns

### Pattern 1: Pre-Handoff Check

Every handoff automatically includes a pre-handoff context check:

```javascript
import { createSmartHandoff } from './lib/context/handoff-with-overflow-prevention.js';

const handoff = await createSmartHandoff('LEAD', 'PLAN', 'SD-2025-001', {
  executiveSummary: 'Phase completed successfully',
  completenessReport: { total: 5, completed: 5 },
  deliverablesManifest: { primary: ['Strategy document'] },
  keyDecisions: ['Approved for PLAN phase'],
  knownIssues: [],
  resourceUtilization: { time: '2 hours' },
  actionItems: ['Begin technical planning']
});

// Output:
// 🔍 Pre-Handoff Context Check (LEAD)...
//    Context Status: HEALTHY
//    Estimated Total: 56,213 tokens
//    Usage: 28.1%
//    Remaining: 143,787 tokens
//    ✅ Continue normally. Context usage is healthy.
//    Strategy: full-context
```

### Pattern 2: Manual Compaction

When context feels heavy, trigger manual compaction:

```bash
/context-compact
```

Output:
```
📊 Context Monitor Status

==================================================
Status:           ✅ HEALTHY
Total Estimated:  156,000 tokens
Base Context:     56,000 tokens
Conversation:     100,000 tokens
Usage:            78.0%
Remaining:        44,000 tokens
==================================================

💡 Recommendation:
   Consider summarizing verbose content or moving details to memory.
```

### Pattern 3: Focus Area Compaction

Compress specific areas:

```bash
/context-compact sub-agents
/context-compact handoffs
```

### Pattern 4: Sub-Agent Processing

Process sub-agent reports with automatic compression:

```javascript
import { processSubAgentReports } from './lib/context/handoff-with-overflow-prevention.js';

const result = await processSubAgentReports([
  { agent: 'DATABASE', status: 'passed', ... },
  { agent: 'SECURITY', status: 'warning', ... },
  { agent: 'TESTING', status: 'passed', ... }
]);

if (result.strategy === 'summarized') {
  console.log(result.summary);  // Use compact summary
  // Full reports available in memory
} else {
  console.log(result.reports);  // Use full reports
}
```

## What Gets Compressed

### High Priority (Compress First)
- ✅ Sub-agent detailed reports
- ✅ Historical handoff descriptions
- ✅ Verbose recommendations
- ✅ Repetitive information
- ✅ Debug/diagnostic output

### Medium Priority
- ✅ Implementation details
- ✅ Test output (keep pass/fail counts only)
- ✅ Long code snippets

### Never Compress
- ❌ Current SD ID
- ❌ Current phase
- ❌ Critical issues
- ❌ Active PRD requirements
- ❌ File tree context (already optimized)

## Memory Recovery

All compressed data is stored in `.claude/session-state.md` and can be retrieved:

```javascript
import MemoryManager from './lib/context/memory-manager.js';

const memory = new MemoryManager();
const state = await memory.readSessionState();

// Full details are in state.raw
console.log(state.raw);
```

## Automatic Triggers

Overflow prevention is automatically triggered:

1. **Before Handoffs** - Every phase transition
2. **Context > 170K** - Automatic summarization kicks in
3. **Memory Updates** - Before large memory writes
4. **Phase Completion** - Before marking phases complete

## Testing

Run the overflow prevention test suite:

```bash
node scripts/test-overflow-prevention.js
```

Tests verify:
- ✅ Token estimation accuracy
- ✅ Status threshold detection
- ✅ Sub-agent summarization
- ✅ Smart handoff strategies
- ✅ Compression ratios

Expected result: **12/12 tests passed (100%)**

## CLI Commands

### Check Context Status
```bash
node lib/context/context-monitor.js
```

### Run Overflow Tests
```bash
node scripts/test-overflow-prevention.js
```

### Manual Context Compaction
```bash
/context-compact
```

## Integration with LEO Protocol

### LEAD Agent
- Pre-handoff check before LEAD→PLAN
- Smart handoff creation with compression
- Context status included in handoff metadata

### PLAN Agent
- Pre-handoff check before PLAN→EXEC
- Sub-agent report summarization
- Verification results compression

### EXEC Agent
- Pre-handoff check before EXEC→PLAN
- Implementation details compression
- Test output summarization

## Best Practices

1. **Monitor Proactively**
   - Check `/context-compact` at start of each phase
   - Review token usage before large operations

2. **Trust Automatic Compression**
   - System applies compression intelligently
   - Full details always preserved in memory

3. **Retrieve Details When Needed**
   - Memory Manager provides access to full content
   - Reference `.claude/session-state.md` for details

4. **Prefer Memory-First for Large Content**
   - Sub-agent reports > 5K tokens → Memory
   - Handoff details > 10K tokens → Memory
   - Keep summaries in context only

5. **Use Slash Commands**
   - `/context-compact` for manual intervention
   - Focus areas for targeted compression
   - Real-time status feedback

## Performance Impact

- **Token Estimation**: < 1ms per operation
- **Status Analysis**: < 5ms per check
- **Summarization**: < 100ms per sub-agent report
- **Handoff Preparation**: < 200ms per handoff
- **Memory Writes**: < 50ms per section

## Future Enhancements

- **Phase 4**: Parallel sub-agent execution with compression
- **Phase 5**: Enhanced refactoring with context packages
- **Metrics**: Track compression ratios over time
- **Optimization**: Machine learning-based compression priorities

## Troubleshooting

### Issue: Context still overflowing
**Solution**: Trigger `/context-compact` manually, focus on sub-agents

### Issue: Compressed content too aggressive
**Solution**: Threshold tuning in `context-monitor.js` (currently 150K/170K/190K)

### Issue: Memory writes failing
**Solution**: Check `.claude/session-state.md` file permissions

### Issue: Test failures
**Solution**: Verify token estimation matches actual usage (4 chars/token baseline)

## References

- Context Monitor: `lib/context/context-monitor.js`
- Smart Handoff: `lib/context/handoff-with-overflow-prevention.js`
- Memory Manager: `lib/context/memory-manager.js`
- Slash Command: `.claude/commands/context-compact.md`
- Test Suite: `scripts/test-overflow-prevention.js`

---

**Status**: ✅ Phase 3 Complete
**Test Coverage**: 100% (12/12 tests passing)
**Production Ready**: Yes