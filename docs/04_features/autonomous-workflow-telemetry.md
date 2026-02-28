---
category: feature
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [feature, auto-generated]
---
# Autonomous Workflow Telemetry


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [User Stories](#user-stories)
  - [As a LEO Protocol User](#as-a-leo-protocol-user)
  - [As a System Administrator](#as-a-system-administrator)
  - [As a Developer](#as-a-developer)
- [How It Works](#how-it-works)
  - [1. Automatic Collection (Invisible)](#1-automatic-collection-invisible)
  - [2. Weekly Analysis (Automatic)](#2-weekly-analysis-automatic)
  - [3. Improvement Items (Auto-Created)](#3-improvement-items-auto-created)
  - [4. Display in sd:next (Visible)](#4-display-in-sdnext-visible)
- [Configuration](#configuration)
  - [Viewing Current Thresholds](#viewing-current-thresholds)
  - [Adjusting Sensitivity](#adjusting-sensitivity)
  - [Adding New Dimensions](#adding-new-dimensions)
  - [Disabling Monitoring](#disabling-monitoring)
- [Manual Analysis (On-Demand)](#manual-analysis-on-demand)
- [Troubleshooting](#troubleshooting)
  - [Issue: No Analysis Running](#issue-no-analysis-running)
  - [Issue: No Bottlenecks Detected (But System Feels Slow)](#issue-no-bottlenecks-detected-but-system-feels-slow)
  - [Issue: Too Many Bottlenecks (Alert Fatigue)](#issue-too-many-bottlenecks-alert-fatigue)
- [Advanced Usage](#advanced-usage)
  - [Custom Dimensions](#custom-dimensions)
  - [Historical Trend Analysis](#historical-trend-analysis)
  - [Export Data for External Analysis](#export-data-for-external-analysis)
- [Technical Implementation](#technical-implementation)
  - [Adding Instrumentation to New Code](#adding-instrumentation-to-new-code)
  - [Adding New Threshold Configuration](#adding-new-threshold-configuration)
- [Related Documentation](#related-documentation)
- [Frequently Asked Questions](#frequently-asked-questions)
- [Version History](#version-history)

## Metadata
- **Category**: Feature
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Claude Opus 4.6 (EXEC Sub-Agent)
- **Last Updated**: 2026-02-09
- **Tags**: telemetry, feedback-loop, autonomous, bottleneck-detection, self-improvement
- **Related SD**: SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001

## Overview

**Autonomous Workflow Telemetry** is a set-and-forget performance monitoring system that automatically:

1. **Collects** detailed timing data for every LEO Protocol operation
2. **Analyzes** performance weekly to identify bottlenecks
3. **Creates** improvement items when thresholds are breached
4. **Displays** findings in the `sd:next` queue

**Key Benefit**: Zero manual intervention required. The system runs autonomously in the background, creating a continuous feedback loop: **Execute → Measure → Analyze → Improve**.

## User Stories

### As a LEO Protocol User
- **I want** performance issues to be detected automatically
- **So that** I don't have to manually monitor or analyze workflow timing

### As a System Administrator
- **I want** bottlenecks to create improvement items automatically
- **So that** performance degradation is tracked and prioritized

### As a Developer
- **I want** visibility into workflow performance trends
- **So that** I can understand where the system is slow and why

## How It Works

### 1. Automatic Collection (Invisible)

Every time LEO Protocol executes an operation (handoff, gate, sub-agent), timing data is captured:

```
Handoff: LEAD-TO-PLAN
├── Gate: GATE_SD_START_PROTOCOL (3.2s)
├── Gate: GATE_PRD_REQUIRED (5.1s)
├── Sub-Agent: DESIGN (120s)
└── Gate: GATE_PLAN_VERIFICATION (8.5s)

Total: 136.8s
```

**What's Captured**:
- Start and end times (millisecond precision)
- Duration (total execution time)
- Queue wait time (if applicable)
- Context metadata (SD type, phase, retry attempts)

**Performance Impact**: ~1-2% overhead (negligible, non-blocking)

### 2. Weekly Analysis (Automatic)

Once per week (or when 7+ days since last analysis), the system:

1. **Queries** all traces from the last 7 days
2. **Calculates** P50 (median) duration for each dimension:
   - **Phase**: LEAD, PLAN, EXEC
   - **Gate**: Individual gate performance
   - **Sub-Agent**: DESIGN, RCA, TESTING, etc.
   - **SD Type**: feature, bugfix, refactor, etc.
3. **Compares** to configured baselines
4. **Detects** bottlenecks (observed P50 > baseline * threshold)

**Example**:
```
Dimension: phase:EXEC
Baseline P50: 45s
Threshold: 2.0x
Observed P50: 150s

Bottleneck Detected! (150s > 45s * 2.0 = 90s)
Severity Ratio: 3.3x
```

### 3. Improvement Items (Auto-Created)

When a bottleneck is detected, an improvement item is created in `continuous_improvements`:

```json
{
  "source": "TELEMETRY_BOTTLENECK",
  "title": "Optimize EXEC phase performance (3.3x slower than baseline)",
  "description": "P50 duration: 150s vs baseline 45s. Threshold: 2.0x.",
  "source_detail": {
    "dimension_type": "phase",
    "dimension_key": "EXEC",
    "observed_p50_ms": 150000,
    "baseline_p50_ms": 45000,
    "ratio": 3.3
  }
}
```

**Rate Limiting**: Max 3 items per dimension per run (prevents spam)

### 4. Display in sd:next (Visible)

The latest findings appear at the bottom of the `sd:next` output:

```bash
npm run sd:next
```

**Output**:
```
═══════════════════════════════════════════════════════════
 WORKFLOW TELEMETRY
═══════════════════════════════════════════════════════════
  Last analysis: 2026-02-09 (today)
  3 bottleneck(s) detected
  3x phase:EXEC (p50=150s vs baseline=45s)
  2x gate:GATE_PRD_REQUIRED (p50=15s vs baseline=5s)
  1.8x subagent:DESIGN (p50=216s vs baseline=120s)

  (1400 traces, 45 dimensions, 1200ms)
```

## Configuration

### Viewing Current Thresholds

```bash
# Query active thresholds
node -e "
require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('telemetry_thresholds')
  .select('*')
  .eq('is_active', true)
  .order('dimension_type,dimension_key')
  .then(({data})=>console.table(data));
"
```

### Adjusting Sensitivity

**More Sensitive** (detect smaller slowdowns):
```sql
UPDATE telemetry_thresholds
SET multiplier = 1.5  -- Was 2.0 (alert at 1.5x baseline instead of 2.0x)
WHERE dimension_type = 'phase' AND dimension_key = 'EXEC';
```

**Less Sensitive** (only alert on major slowdowns):
```sql
UPDATE telemetry_thresholds
SET multiplier = 3.0  -- Was 2.0 (alert at 3.0x baseline)
WHERE dimension_type = 'subagent' AND dimension_key = 'DESIGN';
```

### Adding New Dimensions

**Monitor a new gate**:
```sql
INSERT INTO telemetry_thresholds (dimension_type, dimension_key, baseline_p50_ms, multiplier)
VALUES ('gate', 'GATE_NEW_GATE_NAME', 10000, 2.0);
--           type   identifier          baseline   threshold
```

**Monitor a new sub-agent**:
```sql
INSERT INTO telemetry_thresholds (dimension_type, dimension_key, baseline_p50_ms, multiplier)
VALUES ('subagent', 'NEW_SUBAGENT', 60000, 1.5);
```

### Disabling Monitoring

**Disable specific dimension**:
```sql
UPDATE telemetry_thresholds
SET is_active = false
WHERE dimension_key = 'NOISY_DIMENSION';
```

**Disable all monitoring** (not recommended):
```sql
UPDATE telemetry_thresholds SET is_active = false;
```

## Manual Analysis (On-Demand)

Trigger analysis manually without waiting for weekly schedule:

```bash
# Dry run (preview only, no items created)
node scripts/telemetry/analyze-bottlenecks.js --dry-run

# Full analysis (creates improvement items)
node scripts/telemetry/analyze-bottlenecks.js
```

**Example Output**:
```
════════════════════════════════════════════════════════════
 WORKFLOW BOTTLENECK ANALYSIS
════════════════════════════════════════════════════════════
Run ID: abc-123-def-456
Traces scanned: 1,400
Dimensions evaluated: 45

────────────────────────────────────────────────────────────
 BOTTLENECKS DETECTED (3)
────────────────────────────────────────────────────────────

  🔴 CRITICAL (ratio ≥ 5.0x)
     None

  🟡 WARNING (ratio 2.0-5.0x)
     3x phase:EXEC
        Observed P50: 150s | Baseline: 45s | Threshold: 2.0x

     2x gate:GATE_PRD_REQUIRED
        Observed P50: 15s | Baseline: 5s | Threshold: 3.0x

  🟢 MINOR (ratio 1.5-2.0x)
     1.8x subagent:DESIGN
        Observed P50: 216s | Baseline: 120s | Threshold: 1.5x

────────────────────────────────────────────────────────────
 IMPROVEMENT ITEMS
────────────────────────────────────────────────────────────
  Created: 3 items
  Skipped (rate limit): 0
  Skipped (duplicate): 0

Duration: 1.2s
```

## Troubleshooting

### Issue: No Analysis Running

**Symptom**: Last analysis is >7 days old

**Check**:
```bash
node -e "
require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('telemetry_analysis_runs')
  .select('status,triggered_at,finished_at')
  .order('triggered_at',{ascending:false})
  .limit(3)
  .then(({data})=>console.table(data));
"
```

**Fix**:
```bash
# Manually trigger analysis
node scripts/telemetry/analyze-bottlenecks.js
```

### Issue: No Bottlenecks Detected (But System Feels Slow)

**Cause**: Thresholds may be too lenient

**Check Actual Performance**:
```sql
-- Calculate actual P50 for EXEC phase
SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) as actual_p50_ms
FROM workflow_trace_log
WHERE span_type = 'phase'
  AND span_name = 'EXEC'
  AND created_at > NOW() - INTERVAL '7 days';
```

**Adjust Threshold**:
```sql
-- Lower the multiplier to be more sensitive
UPDATE telemetry_thresholds
SET multiplier = 1.5  -- Was 2.0
WHERE dimension_type = 'phase' AND dimension_key = 'EXEC';
```

### Issue: Too Many Bottlenecks (Alert Fatigue)

**Cause**: Thresholds may be too aggressive

**Check Recent Items**:
```sql
SELECT source_detail->>'dimension_key' as dimension,
       COUNT(*) as item_count
FROM continuous_improvements
WHERE source = 'TELEMETRY_BOTTLENECK'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY source_detail->>'dimension_key'
ORDER BY item_count DESC;
```

**Fix**:
```sql
-- Increase multiplier for noisy dimensions
UPDATE telemetry_thresholds
SET multiplier = 3.0  -- Was 2.0
WHERE dimension_key = 'NOISY_DIMENSION';
```

## Advanced Usage

### Custom Dimensions

**Monitor specific SD type + gate combinations**:
```sql
INSERT INTO telemetry_thresholds (dimension_type, dimension_key, baseline_p50_ms, multiplier)
VALUES ('gate+sd_type', 'GATE_PRD_REQUIRED:feature', 8000, 2.5);
--     Composite type    gate_name:sd_type          baseline threshold
```

**Why**: Feature SDs may take longer in PRD gates than bugfixes

### Historical Trend Analysis

**Compare current vs. historical performance**:
```sql
WITH current_week AS (
  SELECT span_type, span_name, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) as p50
  FROM workflow_trace_log
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY span_type, span_name
),
previous_week AS (
  SELECT span_type, span_name, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) as p50
  FROM workflow_trace_log
  WHERE created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
  GROUP BY span_type, span_name
)
SELECT c.span_type, c.span_name,
       p.p50 as prev_week_p50,
       c.p50 as curr_week_p50,
       ROUND((c.p50 - p.p50) / p.p50::numeric * 100, 2) as change_pct
FROM current_week c
JOIN previous_week p USING (span_type, span_name)
WHERE ABS(c.p50 - p.p50) > 1000  -- >1s change
ORDER BY change_pct DESC;
```

### Export Data for External Analysis

**Export trace data to CSV**:
```sql
\copy (
  SELECT workflow_execution_id, sd_id, phase, span_type, span_name, duration_ms, created_at
  FROM workflow_trace_log
  WHERE created_at > NOW() - INTERVAL '30 days'
) TO 'telemetry_export.csv' WITH CSV HEADER;
```

## Technical Implementation

**For developers contributing to the telemetry system:**

### Adding Instrumentation to New Code

```javascript
import { createSpan } from '../lib/telemetry/trace.js';

async function myNewFeature(context) {
  // Create a span for this operation
  const span = createSpan({
    traceId: context.traceId,
    spanName: 'my_new_feature',
    spanType: 'custom',
    attributes: {
      sd_id: context.sdId,
      custom_metadata: 'value'
    }
  });

  try {
    // Your implementation here
    const result = await doWork();
    return result;
  } finally {
    // Always end the span (even on error)
    span.end();
  }
}
```

### Adding New Threshold Configuration

```javascript
// In migration file or setup script
await supabase.from('telemetry_thresholds').insert({
  dimension_type: 'custom',
  dimension_key: 'my_new_dimension',
  baseline_p50_ms: 30000,  // 30 seconds baseline
  multiplier: 2.0,          // Alert at 2x baseline (60s)
  is_active: true
});
```

## Related Documentation

- [Workflow Telemetry System Architecture](../01_architecture/workflow-telemetry-system.md)
- [Telemetry System Operations Guide](../06_deployment/telemetry-system-ops.md)
- [LEO Protocol Overview](../03_protocols_and_standards/LEO_v4.3_HYBRID_SUB_AGENTS.md)
- [Continuous Improvements System](../04_features/continuous-improvements.md)

## Frequently Asked Questions

**Q: Does telemetry slow down LEO Protocol execution?**
A: No. Overhead is <2% (typically 1-5ms per operation). Writes are asynchronous and non-blocking.

**Q: How often does analysis run?**
A: Automatically once per week (when session starts if >7 days since last run). You can also trigger manually.

**Q: Can I disable telemetry collection?**
A: Not recommended. If absolutely needed, remove instrumentation from code (not user-configurable).

**Q: What happens if analysis fails?**
A: The system logs the error and continues. Sessions are never blocked by telemetry failures (fire-and-forget design).

**Q: How much database storage does telemetry use?**
A: ~90MB/year at typical usage levels (200-500 traces/day). Old traces can be archived/deleted after 90 days.

**Q: Can I export telemetry data?**
A: Yes. Use `\copy` command (see Advanced Usage section) or query `workflow_trace_log` table directly.

**Q: How do I know if a bottleneck is real vs. noise?**
A: Check the `sample_count` in the bottleneck details. Bottlenecks with <20 samples may be noise.

## Version History

- **v1.0.0** (2026-02-09): Initial feature documentation
  - User-facing overview of autonomous telemetry system
  - Configuration guide
  - Troubleshooting guide
  - Advanced usage examples
  - Orchestrator SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001 (3 children)
