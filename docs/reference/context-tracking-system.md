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

## Future Enhancements

1. **Pre-flight estimation**: Use `/v1/messages/count_tokens` endpoint before expensive operations
2. **Real-time dashboard**: WebSocket-based context monitoring in admin UI
3. **Automatic compaction**: Trigger `/compact` when approaching threshold
4. **Cost correlation**: Link token usage to API costs

---

## References

- [Token Accounting Research (Dec 2025)](../../research/token-accounting-research.md)
- [Claude Code Hooks Documentation](https://docs.anthropic.com/en/docs/claude-code/hooks)
- [Context Engineering Best Practices](../agentic-context-engineering-v3.md)
