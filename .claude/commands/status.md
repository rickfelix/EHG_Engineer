<!-- reasoning_effort: low -->

# /status - Pipeline Status Command

**Purpose**: Display real-time health metrics for the self-improvement pipeline.

## What This Shows

The /status command provides visibility into:
- **MTTI (Mean Time To Intervention)**: How quickly issues are detected and proposals created
- **MTTR (Mean Time To Remediate)**: How quickly proposals lead to completed SDs
- **Pipeline Activity**: Recent proposals, completions, and feedback
- **Queue Depths**: Pending work and active SDs

## Usage

```
/status
```

## Execution

When invoked, run:
```bash
node scripts/pipeline-status.js
```

## Output Format

```
╔═══════════════════════════════════════════════════════════════╗
║              SELF-IMPROVEMENT PIPELINE STATUS                  ║
╠═══════════════════════════════════════════════════════════════╣
║                                                                ║
║  ⏱️  MTTI (Mean Time To Intervention)                         ║
║  ├─ 7-day average:  X.X hours                                 ║
║  └─ 30-day average: X.X hours                                 ║
║                                                                ║
║  🔧 MTTR (Mean Time To Remediate)                             ║
║  ├─ 7-day average:  X.X hours                                 ║
║  └─ 30-day average: X.X hours                                 ║
║                                                                ║
║  📊 LAST 24 HOURS                                             ║
║  ├─ Proposals created:   X                                    ║
║  ├─ SDs completed:       X                                    ║
║  └─ Feedback received:   X                                    ║
║                                                                ║
║  📋 QUEUE STATUS                                              ║
║  ├─ Pending proposals:   X                                    ║
║  └─ Active SDs:          X                                    ║
║                                                                ║
║  ⏰ Last metric: YYYY-MM-DD HH:mm:ss                          ║
╚═══════════════════════════════════════════════════════════════╝
```

## Targets

| Metric | Target | Status |
|--------|--------|--------|
| MTTI | < 24 hours | 🟢 On track / 🟡 Warning / 🔴 Critical |
| MTTR | < 72 hours | 🟢 On track / 🟡 Warning / 🔴 Critical |

## Health Indicators

- 🟢 **Healthy**: Metrics within target, pipeline flowing
- 🟡 **Warning**: Metrics approaching threshold, review needed
- 🔴 **Critical**: Metrics exceeded, intervention required

## Related Commands

- `/leo next` - View SD queue
- `/inbox` - View pending feedback
- `/learn` - Capture patterns from completed work
