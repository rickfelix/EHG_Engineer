---
description: Compact context by summarizing and moving details to memory
argument-hint: [focus area or leave empty for full compaction]
---

# 🗜️ Context Compaction

Analyze current context usage and apply intelligent compression to prevent overflow.

**Focus Area**: $ARGUMENTS

## Compaction Strategy

The context monitor will:

1. **Analyze Current Usage**
   - Estimate total token count
   - Identify verbose sections
   - Check against thresholds (150K warning, 170K critical)

2. **Smart Summarization**
   - Sub-agent reports → Key findings only
   - Handoff details → Summaries with memory references
   - Repetitive content → Deduplicated
   - Long descriptions → Truncated with "see memory" pointers

3. **Memory-First Pattern**
   - Full details → `.claude/session-state.md`
   - Summaries remain in context
   - Cross-references for retrieval

## Compaction Levels

### HEALTHY (< 150K tokens)
- No action needed
- Continue normally

### WARNING (150K-170K tokens)
- Selective compression
- Move verbose sections to memory
- Keep critical data in context

### CRITICAL (170K-190K tokens)
- Aggressive summarization
- Sub-agent reports → 1-line summaries
- Handoff details → Memory only
- Keep only essential context

### EMERGENCY (> 190K tokens)
- Emergency compression
- Complete current phase immediately
- Force handoff with minimal context
- Full state dump to memory

## What Gets Compressed

**High Priority** (compress first):
- Sub-agent detailed reports
- Historical handoff descriptions
- Verbose recommendations
- Repetitive information
- Debug/diagnostic output

**Medium Priority**:
- Implementation details
- Test output (keep pass/fail only)
- Long code snippets

**Never Compress**:
- Current SD ID
- Current phase
- Critical issues
- Active PRD requirements
- File tree context (already in memory)

## Usage Examples

```
/context-compact
→ Full context analysis and compression

/context-compact sub-agents
→ Focus on compressing sub-agent reports only

/context-compact handoffs
→ Compress historical handoff data
```

## After Compaction

You'll receive:
- Token count before/after
- Compression ratio
- What was moved to memory
- Estimated tokens remaining
- Recommendation for next steps

## Automatic Triggers

Context compaction is automatically triggered when:
- Context usage exceeds 170K tokens
- Before creating handoffs
- Before starting new phases
- When memory updates would exceed limits

## Memory Recovery

All compressed data is stored in `.claude/session-state.md` and can be retrieved:

```javascript
import MemoryManager from './lib/context/memory-manager.js';
const memory = new MemoryManager();
const state = await memory.readSessionState();
// Full details are in state.raw
```

---

**Note**: This command uses the Context Monitor to intelligently decide what to compress. Claude 4.5 Sonnet's built-in context awareness helps guide the compression strategy.