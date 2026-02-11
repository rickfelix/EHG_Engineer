# Protocol Improvements Module

API layer for extracting, applying, and tracking protocol improvements from retrospectives.

## Architecture

```
Retrospectives (database)
    ↓
ImprovementExtractor → protocol_improvement_queue (database)
    ↓
ImprovementApplicator → leo_protocol_* tables (database)
    ↓
generate-claude-md-from-db.js → CLAUDE.md (file)
    ↓
EffectivenessTracker → effectiveness scores (database)
```

**Key Principle**: Database-first. NEVER write directly to markdown files.

## Modules

### 1. ImprovementExtractor
Extracts actionable protocol improvements from retrospectives.

**Data Sources**:
- `protocol_improvements` JSONB field (primary)
- `failure_patterns` array (process-related failures)
- `what_needs_improvement` JSONB (PROCESS_IMPROVEMENT category)

**Outputs**: Queued improvements in `protocol_improvement_queue` table

**Usage**:
```js
import { ImprovementExtractor } from './modules/protocol-improvements/index.js';

const client = await createDatabaseClient('engineer');
const extractor = new ImprovementExtractor(client);

// Extract from single retrospective
const improvements = await extractor.extractFromRetrospective(retroId);

// Extract from all retrospectives
const allImprovements = await extractor.extractFromAllRetrospectives();

// Queue for review/application
const queuedCount = await extractor.queueImprovements(improvements);
```

### 2. ImprovementApplicator
Applies approved improvements to database tables.

**Supported Improvement Types**:
- `VALIDATION_RULE` → `handoff_validation_rules`
- `CHECKLIST_ITEM` → `leo_protocol_sections`
- `SKILL_UPDATE` → `leo_skills`
- `PROTOCOL_SECTION` → `leo_protocol_sections`
- `SUB_AGENT_CONFIG` → `leo_sub_agents`
- `TRIGGER_PATTERN` → `leo_sub_agent_triggers`
- `WORKFLOW_PHASE` → `leo_workflow_phases` (manual only)
- `HANDOFF_TEMPLATE` → `leo_handoff_templates` (manual only)

**Auto-Application**:
- Only applies improvements where `auto_applicable = TRUE`
- Requires minimum evidence count (default: 3 retrospectives)
- Automatically regenerates CLAUDE.md after application

**Usage**:
```js
import { ImprovementApplicator } from './modules/protocol-improvements/index.js';

const client = await createDatabaseClient('engineer');
const applicator = new ImprovementApplicator(client);

// Apply single improvement
await applicator.applyImprovement(queueId);

// Apply all auto-applicable improvements (evidence >= 3)
const results = await applicator.applyAllAutoApplicable(3);

// Regenerate markdown files
await applicator.regenerateMarkdown();
```

### 3. EffectivenessTracker
Tracks if applied improvements actually reduce issue frequency.

**Methodology**:
1. Measure issue frequency 30 days BEFORE improvement application
2. Measure issue frequency 7-37 days AFTER application (skip first week for adoption)
3. Calculate reduction rate
4. Score effectiveness 0-100 (100 = issue eliminated)

**Effectiveness Tiers**:
- **Effective** (70+): Issue significantly reduced or eliminated
- **Moderate** (40-69): Some improvement, but issue persists
- **Ineffective** (<40): Little to no improvement, or issue worsened

**Usage**:
```js
import { EffectivenessTracker } from './modules/protocol-improvements/index.js';

const client = await createDatabaseClient('engineer');
const tracker = new EffectivenessTracker(client);

// Track single improvement
const result = await tracker.trackEffectiveness(improvementId);

// Track all unscored improvements (applied >7 days ago)
const results = await tracker.trackAllUnscoredImprovements();

// Flag ineffective improvements
const flagged = await tracker.flagIneffectiveImprovements(40);

// Get effectiveness report
const report = await tracker.getEffectivenessReport();
```

## Standalone Functions

Quick access to common operations:

```js
import {
  extractAndQueueAll,
  applyAllAutoApplicable,
  trackAllUnscored,
  getEffectivenessReport,
  runFullImprovementCycle,
  getImprovementStatus
} from './modules/protocol-improvements/index.js';

// Extract all improvements from retrospectives
await extractAndQueueAll();

// Apply auto-applicable improvements (evidence >= 3)
await applyAllAutoApplicable(3);

// Track effectiveness
await trackAllUnscored();

// Get report
const report = await getEffectivenessReport();

// Run complete cycle
const results = await runFullImprovementCycle({
  sinceDate: new Date('2025-01-01'),
  evidenceThreshold: 3,
  autoApply: true,
  trackEffectiveness: true
});

// Check status
const status = await getImprovementStatus();
console.log(status);
// {
//   pending: { count: 42, avg_priority: 65.2, avg_evidence: 2.1 },
//   applied: { count: 18, avg_priority: 78.5, avg_evidence: 4.3 },
//   ineffective: { count: 3, avg_priority: 45.0, avg_evidence: 5.0 }
// }
```

## Database Schema

### protocol_improvement_queue

Primary table for managing improvements:

```sql
CREATE TABLE protocol_improvement_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  improvement_type TEXT NOT NULL,
  target_table TEXT NOT NULL,
  category TEXT NOT NULL,
  improvement_text TEXT NOT NULL,
  evidence TEXT,
  impact TEXT,
  affected_phase TEXT CHECK (affected_phase IN ('LEAD', 'PLAN', 'EXEC', NULL)),
  auto_applicable BOOLEAN DEFAULT FALSE,
  priority INTEGER DEFAULT 50,
  evidence_count INTEGER DEFAULT 1,
  related_retro_ids UUID[] DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'applied', 'rejected', 'ineffective')),
  applied_at TIMESTAMPTZ,
  applied_by TEXT,
  effectiveness_score INTEGER,
  reoccurrence_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);
```

**Table is auto-created** on first run by ImprovementExtractor.

## Workflow

### 1. Extract Phase
```bash
node -e "import('./scripts/modules/protocol-improvements/index.js').then(m => m.extractAndQueueAll())"
```

Scans retrospectives for protocol improvements and queues them.

### 2. Review Phase (Manual)
Review pending improvements in database:
```sql
SELECT improvement_text, evidence_count, priority, auto_applicable
FROM protocol_improvement_queue
WHERE status = 'pending'
ORDER BY priority DESC, evidence_count DESC;
```

Approve high-priority improvements:
```sql
UPDATE protocol_improvement_queue
SET status = 'approved'
WHERE id = '<improvement-id>';
```

### 3. Apply Phase
```bash
node -e "import('./scripts/modules/protocol-improvements/index.js').then(m => m.applyAllAutoApplicable(3))"
```

Applies improvements with evidence >= 3.

### 4. Track Phase (After 7 days)
```bash
node -e "import('./scripts/modules/protocol-improvements/index.js').then(m => m.trackAllUnscored())"
```

Measures effectiveness by comparing issue frequency before/after.

### 5. Report Phase
```bash
node -e "import('./scripts/modules/protocol-improvements/index.js').then(m => m.getEffectivenessReport())"
```

## Integration with LEO Protocol

This module integrates with:
- **Retrospectives**: Source of improvement suggestions
- **LEO Protocol Tables**: Target for applied improvements
- **CLAUDE.md**: Regenerated from database after changes
- **generate-claude-md-from-db.js**: Markdown generation script

## Best Practices

1. **Always extract first**: Run `extractAndQueueAll()` after retrospectives
2. **Review before applying**: Check pending improvements manually
3. **Wait 7 days**: Let improvements take effect before tracking
4. **Monitor effectiveness**: Flag and remove ineffective improvements
5. **Never edit markdown**: Always write to database, then regenerate

## Error Handling

All modules include comprehensive error handling:
- Database connection failures
- Missing retrospectives
- Invalid improvement types
- Application failures (marked as 'rejected')
- Tracking errors (logged but don't block)

## Testing

Test each module independently:

```js
// Test extraction
const improvements = await extractFromRetrospective('<retro-id>');
console.log(improvements);

// Test application (dry run)
const applicator = new ImprovementApplicator(client);
const result = await applicator.applyImprovement('<queue-id>');
console.log(result);

// Test tracking
const tracker = new EffectivenessTracker(client);
const score = await tracker.calculateEffectivenessScore('<improvement-id>');
console.log(score);
```

## API Reference

See inline JSDoc comments in each module for detailed API documentation.
