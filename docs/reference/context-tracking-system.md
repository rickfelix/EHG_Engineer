# Context Tracking System

**Version**: 1.0
**Created**: 2025-12-26
**Based on**: Token Accounting & Memory Utilization Research (Dec 2025)

---

## Overview

The Context Tracking System provides **server-authoritative token measurement** for Claude Code sessions, replacing the previous heuristic-based estimation (`text.length / 4`).

### Key Improvements

| Aspect | Old Approach | New Approach |
|--------|--------------|--------------|
| Token counting | Client-side heuristic | Server-reported `current_usage` |
| Cache tracking | Not tracked | Explicit `cache_read/create` fields |
| Compaction detection | Not detected | Non-monotonic usage detection |
| Accuracy | ~70% (drift over time) | 100% (billing-accurate) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Code Runtime                          │
│                                                                 │
│  Status Line JSON ──────┐ (every 300ms)                        │
│  {                      │                                       │
│    "context_window": {  ▼                                       │
│      "current_usage": { ┌────────────────────────────────────┐ │
│        input_tokens,    │ statusline-context-tracker.sh      │ │
│        cache_read,      │ - Accurate % calculation            │ │
│        cache_creation   │ - Threshold alerts                  │ │
│      }                  │ - Compaction detection              │ │
│    }                    │ - JSONL logging                     │ │
│  }                      └─────────────┬──────────────────────┘ │
│                                       │                         │
│                         ┌─────────────▼──────────────────────┐ │
│                         │ .claude/logs/context-usage.jsonl   │ │
│                         └─────────────┬──────────────────────┘ │
│                                       │ (npm run context:sync)  │
│                         ┌─────────────▼──────────────────────┐ │
│                         │ Supabase: context_usage_log        │ │
│                         │           context_usage_daily      │ │
│                         └────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Status Line Script

**Location**: `.claude/statusline-context-tracker.sh`

Captures `current_usage` from Claude Code status line and:
- Calculates accurate context percentage
- Displays status in terminal
- Logs to JSONL file
- Detects compaction events

**Output Format**:
```
[Opus] 42% (84,000t) 📦15%     # Healthy, 15% cache hit
[Opus] 75% (150,000t) ⚠️       # Warning threshold
[Opus] 92% (184,000t) 🔴       # Critical threshold
[Opus] 35% (70,000t) ♻️        # Compaction detected
```

### 2. Sync Script

**Location**: `scripts/sync-context-usage.js`

Syncs local JSONL logs to Supabase for historical analysis.

**Commands**:
```bash
npm run context:sync      # Sync pending logs to database
npm run context:usage     # Show usage summary
npm run context:analyze   # Analyze compaction patterns
```

### 3. Database Tables

**`context_usage_log`**: Raw entries from status line
- `context_used`: Accurate total (input + cache_read + cache_creation)
- `compaction_detected`: TRUE when context dropped
- `cache_read_tokens`: For cache efficiency analysis

**`context_usage_daily`**: Aggregated daily summaries

**Functions**:
- `get_context_usage_summary(days)`: Session-level metrics
- `get_compaction_analysis()`: Compaction trigger analysis

---

## Installation

### 1. Enable Status Line

Already configured in `.claude/settings.json`:
```json
{
  "statusLine": {
    "type": "command",
    "command": ".claude/statusline-context-tracker.sh"
  }
}
```

### 2. Apply Database Migration

```bash
node scripts/run-sql-migration.js database/migrations/20251226_context_usage_tracking.sql
```

### 3. Verify Installation

```bash
# Check status line is working (visible in Claude Code terminal)
# Check logs are being created
ls -la .claude/logs/

# Sync and view summary
npm run context:sync
npm run context:usage
```

---

## Token Calculation Formula

The accurate context usage formula (from research):

```
CONTEXT_USED = input_tokens + cache_creation_input_tokens + cache_read_input_tokens
PERCENTAGE = (CONTEXT_USED / 200000) * 100
```

**Critical**: Cache read tokens MUST be counted. Even though they're cached (saving compute), they still occupy attention window space.

---

## Thresholds

| Status | Percentage | Action |
|--------|------------|--------|
| HEALTHY | 0-70% | Continue normally |
| WARNING | 70-90% | Consider compaction |
| CRITICAL | 90-95% | MUST compact before handoff |
| EMERGENCY | >95% | BLOCKED |

---

## Status Line Indicators

| Icon | Meaning |
|------|---------|
| ✅ | Healthy (0-70%) |
| ⚠️ | Warning (70-90%) |
| 🔴 | Critical (90-95%) |
| 🚨 | Emergency (>95%) |
| 📦 | Cache efficiency % |
| ♻️ | Compaction detected |

---

## Compaction Detection

The system detects compaction by monitoring for **non-monotonic usage**:
- If `current_usage < previous_usage`, compaction occurred
- Compaction events are logged with `compaction_detected: true`
- Analysis available via `npm run context:analyze`

### Compaction Analysis Output

```
♻️ Compaction Pattern Analysis
═══════════════════════════════════════════════════════════

Total compaction events: 12

Compaction Trigger Analysis:
  Average trigger point: 93.2%
  Min trigger point: 89%
  Max trigger point: 97%

Post-Compaction Context:
  Average post-compaction: 12.4%
  This suggests ~7.5x compression ratio
```

---

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run context:usage` | Show usage summary |
| `npm run context:sync` | Sync logs to database |
| `npm run context:analyze` | Analyze compaction patterns |
| `npm run context:monitor` | Run old heuristic monitor (deprecated) |

---

## Database Queries

### Recent Sessions
```sql
SELECT * FROM v_context_usage_recent;
```

### Weekly Summary
```sql
SELECT * FROM get_context_usage_summary(7);
```

### Compaction Analysis
```sql
SELECT * FROM get_compaction_analysis();
```

### High Usage Sessions
```sql
SELECT session_id, MAX(usage_percent) as peak
FROM context_usage_log
WHERE timestamp >= NOW() - INTERVAL '7 days'
GROUP BY session_id
HAVING MAX(usage_percent) >= 80
ORDER BY peak DESC;
```

---

## Integration with LEO Protocol

### Handoff Context Health

Every handoff should include context health status:

```markdown
## Context Health
**Current Usage**: 84,000 tokens (42% of 200K budget)
**Status**: HEALTHY
**Cache Efficiency**: 15% (cache reads / total cached)
**Compactions This Session**: 0
```

### Phase Preflight

The `phase-preflight.js` script can query context health before starting work:

```javascript
// Query current context health
const { data } = await supabase
  .from('v_context_usage_recent')
  .select('*')
  .eq('session_id', currentSessionId)
  .single();

if (data?.peak_usage > 70) {
  console.warn('⚠️ Context usage high, consider compaction before EXEC');
}
```

---

## Troubleshooting

### Status Line Not Updating

1. Check script is executable:
   ```bash
   ls -la .claude/statusline-context-tracker.sh
   chmod +x .claude/statusline-context-tracker.sh
   ```

2. Verify jq is installed:
   ```bash
   which jq
   sudo apt-get install jq
   ```

3. Check settings.json syntax:
   ```bash
   cat .claude/settings.json | jq .
   ```

### Logs Not Being Created

1. Check logs directory exists:
   ```bash
   mkdir -p .claude/logs
   ```

2. Check permissions:
   ```bash
   ls -la .claude/logs/
   ```

3. Test script manually:
   ```bash
   echo '{"model":{"display_name":"Test"},"context_window":{"current_usage":{"input_tokens":1000},"context_window_size":200000}}' | .claude/statusline-context-tracker.sh
   ```

### Sync Failing

1. Check database connection:
   ```bash
   npm run check-db
   ```

2. Run migration:
   ```bash
   node scripts/run-sql-migration.js database/migrations/20251226_context_usage_tracking.sql
   ```

---

---

## Context Preservation System (PreCompact + SessionStart Hooks)

**Status**: ✅ Implemented (2026-01-24)

### Problem Statement

When Claude Code auto-compacts context (typically when approaching 95%+ usage), critical details can be lost:
- Current SD key and phase
- List of modified files
- Active error messages being debugged
- Uncommitted changes status

This causes disorientation after compaction: "What was I working on?"

### Solution Architecture

Two lifecycle hooks work together to preserve and restore context:

```
Context High (>90%) → PreCompact Hook → Save snapshot
                              ↓
                    Auto-compaction occurs
                              ↓
         SessionStart Hook → Alert to restore files
                              ↓
                  Claude reads restoration files
                              ↓
                      Context restored
```

### Hook 1: PreCompact (Save State)

**Location**: `scripts/hooks/precompact-snapshot.ps1`
**Trigger**: Before context compaction
**Purpose**: Save git state and work status before compaction

**What It Saves**:
- Git status (`git status --porcelain`)
- Git diff stat (`git diff --stat`)
- Staged changes (`git diff --cached --stat`)
- Current branch name
- Recent commits (last 5)
- Modified files from last hour

**Output File**: `.claude/compaction-snapshot.md`

**Example Output**:
```markdown
# Pre-Compaction Snapshot
**Created**: 2026-01-24 15:30:00
**Trigger**: Auto-compaction imminent

## Git Status
M  docs/reference/claude-code-hooks.md
?? scripts/hooks/precompact-snapshot.ps1

## Current Branch
feat/SD-XXX-001-context-preservation
```

**Configuration** (already in `.claude/settings.json`):
```json
{
  "hooks": {
    "PreCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\scripts\\hooks\\precompact-snapshot.ps1",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

### Hook 2: SessionStart (Restore Reminder)

**Location**: `scripts/hooks/session-start-loader.ps1`
**Trigger**: When a Claude Code session starts or resumes
**Purpose**: Alert user to available restoration files

**What It Does**:
- Checks for recent compaction snapshot (< 30 minutes old)
- Displays reminder to read state files
- Shows current SD queue hint

**Output** (when recent compaction detected):
```
🔄 CONTEXT RESTORATION AVAILABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Recent compaction detected. State files:
  📁 .claude/compaction-snapshot.md (git state)
  📁 .claude/session-state.md (work state)

⚡ READ THESE FILES to restore context before continuing.
```

**Configuration** (already in `.claude/settings.json`):
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\scripts\\hooks\\session-start-loader.ps1",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### Integration with CLAUDE_CORE.md

The "Compaction Instructions (CRITICAL)" section in CLAUDE_CORE.md instructs Claude on:
- What to preserve during compaction (SD key, phase, modified files, PRD requirements)
- What is safe to discard (verbose logs, historical handoff details)
- **Post-compaction protocol**: Immediately read `.claude/compaction-snapshot.md` and `.claude/session-state.md`

### Manual State Management

Two state files work together:

| File | Updated By | Contains |
|------|-----------|----------|
| `.claude/session-state.md` | Manual (during handoffs, `/context-compact`) | Current SD, progress, known issues, recent work |
| `.claude/compaction-snapshot.md` | Auto (PreCompact hook) | Git state, modified files, recent commits |

Both files persist across sessions and survive compaction.

### Usage Workflow

**Normal Operation**:
1. Work on SD → modify files → session reaches 90%+ context
2. PreCompact hook fires → `.claude/compaction-snapshot.md` created
3. Auto-compaction occurs → context summarized
4. User starts new session → SessionStart hook alerts to restoration files
5. Claude reads both state files → work continues seamlessly

**Manual Intervention**:
```bash
# Force a compaction snapshot
powershell.exe -File scripts/hooks/precompact-snapshot.ps1

# View saved state
cat .claude/compaction-snapshot.md
cat .claude/session-state.md
```

### Verification

After implementing hooks, verify:

```bash
# Check hooks are configured
cat .claude/settings.json | jq '.hooks | keys'

# Manually trigger PreCompact hook
powershell.exe -ExecutionPolicy Bypass -File scripts/hooks/precompact-snapshot.ps1

# Verify snapshot file created
ls -la .claude/compaction-snapshot.md

# Manually trigger SessionStart hook
powershell.exe -ExecutionPolicy Bypass -File scripts/hooks/session-start-loader.ps1
```

---

## Related: Unified Context Preservation System

**Version**: 2.0 (Implemented 2026-01-24)
**SD**: SD-LEO-INFRA-UNIFY-CONTEXT-PRESERVATION-001

The Context Tracking System (token measurement) works alongside the **Unified Context Preservation System** (state preservation across compaction).

### Integration Points

| System | Purpose | Data Format |
|--------|---------|-------------|
| **Context Tracking** | Monitors token usage, detects compaction events | JSONL logs → database |
| **Unified State Preservation** | Preserves work state before/after compaction | JSON state file |

**When compaction occurs**:
1. Context Tracking detects non-monotonic usage drop
2. Unified State Preservation (PreCompact hook) saves state BEFORE compaction
3. Compaction happens
4. Unified State Preservation (SessionStart hook) restores state AFTER

**State Preserved**:
- Git: branch, status, commits, staged changes, modified files
- SD: current SD ID, title, phase, progress
- Workflow: phase, last handoff, tool executions
- Summaries: context highlights, key decisions, pending actions

**See**: [Claude Code Hooks Reference](claude-code-hooks.md#context-preservation-system-unified-state-sd-leo-infra-unify-context-preservation-001) for complete unified state documentation.

---

## Unified State Manager v2.0 Upgrade

**Status**: ✅ Implemented (2026-01-24)
**SD**: SD-LEO-INFRA-UPGRADE-CONTEXT-PRESERVATION-001
**Research Basis**: ReSum (2025), RECOMP (ICLR 2024), MemGPT (2023)

### Problem Statement

The original UnifiedStateManager v1.0 had critical gaps identified through academic research on LLM context compression and memory management:

1. **Missing Decisions Tracking**: No structured section for recording key decisions made during session
2. **Missing Constraints**: No tracking of technical/business constraints affecting implementation
3. **Paraphrasing Errors**: Context highlights were paraphrased summaries, losing verbatim evidence
4. **No Open Questions**: Missing mechanism to track unresolved questions across sessions
5. **No Token Budget**: No enforcement of token limits for state preservation

### v2.0 Enhancements

#### Schema Version: 1.0.0 → 2.0.0

**New Structured Sections** (ReSum 2025 research):
- `decisions[]`: Key decisions with reasoning and timestamp
- `constraints[]`: Technical/business/timeline constraints
- `openQuestions[]`: Unresolved questions to track across sessions

**Verbatim Evidence Ledger** (RECOMP ICLR 2024):
- `evidenceLedger[]`: Verbatim excerpts from code, logs, errors
- Prevents paraphrasing errors that lose critical detail
- Each entry includes source location and context

**Token Budget Enforcement** (MemGPT 2023):
- Target: 300-1200 tokens for optimal context preservation
- Automatic truncation when exceeding budget
- Oldest entries evicted first within each section

#### Implementation Details

**Location**: `lib/context/unified-state-manager.js`

**Token Budget Configuration**:
```javascript
const TOKEN_BUDGET = {
  min: 300,      // Minimum tokens for meaningful context
  target: 800,   // Optimal token count
  max: 1200,     // Maximum tokens before truncation
  charsPerToken: 4  // Approximate characters per token
};
```

**Maximum Entries Per Section**:
```javascript
const MAX_ENTRIES = {
  decisions: 10,
  constraints: 10,
  openQuestions: 5,
  evidenceLedger: 15,
  contextHighlights: 5,
  pendingActions: 10
};
```

**New Methods**:
- `addDecision(decision, reasoning)`: Record key decisions
- `addConstraint(constraint, type)`: Track constraints (technical/business/timeline)
- `addOpenQuestion(question, context)`: Log unresolved questions
- `resolveQuestion(questionId, resolution)`: Close questions with resolution
- `addEvidence(source, excerpt, context)`: Store verbatim evidence
- `estimateTokens()`: Calculate current token usage
- `truncateForBudget()`: Enforce token budget limits

**Example Usage**:
```javascript
const stateManager = new UnifiedStateManager('.claude/unified-session-state.json');

// Record a decision
stateManager.addDecision(
  'Use PostgreSQL jsonb over separate table',
  'Better performance for flexible schema, aligns with Supabase strengths'
);

// Track a constraint
stateManager.addConstraint(
  'Must maintain backward compatibility with v1 state files',
  'technical'
);

// Log an open question
const qid = stateManager.addOpenQuestion(
  'Should we use Redis for session caching?',
  'Performance optimization discussion, PLAN phase'
);

// Later: resolve the question
stateManager.resolveQuestion(qid, 'Deferred - premature optimization');

// Store verbatim evidence
stateManager.addEvidence(
  'lib/context/unified-state-manager.js:42',
  'TypeError: Cannot read property \'length\' of undefined',
  'Error when loading corrupted state file'
);
```

#### Schema Migration

**v1.0.0 State**:
```json
{
  "version": "1.0.0",
  "summaries": {
    "contextHighlights": ["..."],
    "pendingActions": ["..."]
  }
}
```

**v2.0.0 State**:
```json
{
  "version": "2.0.0",
  "summaries": {
    "contextHighlights": ["..."],
    "pendingActions": ["..."],
    "keyDecisions": [
      {
        "id": "dec_1737730800000",
        "decision": "Use PostgreSQL jsonb over separate table",
        "reasoning": "Better performance...",
        "timestamp": "2026-01-24T14:00:00.000Z"
      }
    ]
  },
  "constraints": [
    {
      "id": "con_1737730900000",
      "constraint": "Must maintain backward compatibility",
      "type": "technical",
      "timestamp": "2026-01-24T14:01:40.000Z"
    }
  ],
  "openQuestions": [
    {
      "id": "q_1737731000000",
      "question": "Should we use Redis for session caching?",
      "context": "Performance optimization discussion",
      "status": "open",
      "timestamp": "2026-01-24T14:03:20.000Z"
    }
  ],
  "evidenceLedger": [
    {
      "id": "ev_1737731100000",
      "source": "lib/context/unified-state-manager.js:42",
      "excerpt": "TypeError: Cannot read property 'length' of undefined",
      "context": "Error when loading corrupted state file",
      "timestamp": "2026-01-24T14:05:00.000Z"
    }
  ]
}
```

**Migration Behavior**:
- v1.0.0 files are automatically upgraded to v2.0.0 on first load
- Missing fields are initialized with empty arrays
- Existing fields are preserved
- BOM character handling prevents JSON parse errors

#### Testing

All 10 unit tests pass:
- Schema version validation (v2.0.0)
- Token budget enforcement (300-1200 range)
- Add methods (decision, constraint, question, evidence)
- Resolve question method
- State field initialization
- Token estimation accuracy

#### Benefits

1. **Structured Decision Tracking**: Decisions persist across sessions with full reasoning
2. **Constraint Awareness**: Technical/business constraints visible to all agents
3. **Question Continuity**: Unresolved questions don't get lost in compaction
4. **Verbatim Evidence**: Critical error messages, logs, code excerpts preserved exactly
5. **Token Efficiency**: Automatic budget enforcement prevents state bloat
6. **Research-Backed**: Based on peer-reviewed LLM memory research

#### Research References

- **ReSum (2025)**: Structured memory sections for reasoning state checkpoints
- **RECOMP (ICLR 2024)**: Utility-optimized compression with verbatim evidence preservation
- **MemGPT (2023)**: OS-like memory hierarchy with token budget management

---

---

## Future Enhancements

1. **Pre-flight estimation**: Use `/v1/messages/count_tokens` endpoint before expensive operations
2. **Real-time dashboard**: WebSocket-based context monitoring in admin UI
3. **Automatic compaction**: Trigger `/compact` when approaching threshold
4. **Cost correlation**: Link token usage to API costs
5. **~~Enhanced state preservation~~**: ✅ **COMPLETED** (v2.0 Unified State - SD-LEO-INFRA-UNIFY-CONTEXT-PRESERVATION-001)

---

## References

- [Claude Code Hooks Reference](claude-code-hooks.md) - Complete hook documentation including PreCompact/SessionStart
- [Token Accounting Research (Dec 2025)](../../research/token-accounting-research.md)
- [Claude Code Hooks Documentation](https://docs.anthropic.com/en/docs/claude-code/hooks)
- [Context Engineering Best Practices](agentic-context-engineering-v3.md)
- [CLAUDE_CORE.md Compaction Instructions](../../CLAUDE_CORE.md#compaction-instructions-critical) - What Claude preserves during compaction
