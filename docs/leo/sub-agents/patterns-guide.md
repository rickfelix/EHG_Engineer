# Sub-Agent Patterns Guide


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-20
- **Tags**: database, api, testing, migration

**SD-REFACTOR-SUBAGENTS-001: Sub-Agent Base Class & Pattern Extraction**

This guide documents the LEO Protocol sub-agent architecture, patterns, and best practices for creating new sub-agents.

## Quick Reference

| Component | Location | Purpose | LOC |
|-----------|----------|---------|-----|
| BaseSubAgent | lib/agents/base-sub-agent.js | Factory pattern, budget enforcement | ~630 |
| SubAgentExecutor | lib/sub-agent-executor.js | Execution framework, model routing | ~1315 |
| PhaseOrchestrator | scripts/orchestrate-phase-subagents.js | Phase-based orchestration | ~650 |
| ContextAwareSelector | lib/context-aware-sub-agent-selector.js | Hybrid sub-agent selection | ~540 |

---

## 1. BaseSubAgent API & Lifecycle

### Factory Pattern (MANDATORY)

Direct instantiation is forbidden. All sub-agents MUST use the factory method:

```javascript
import BaseSubAgent from '../agents/base-sub-agent.js';

// CORRECT: Use factory method with budget validation
const agent = await BaseSubAgent.create('MyAgent', '🔍', {
  ventureId: 'venture-uuid-here',  // REQUIRED (no legacy mode)
  agentId: 'optional-custom-id'
});

// WRONG: Direct instantiation throws error
const agent = new BaseSubAgent('MyAgent');  // THROWS!
```

### Lifecycle Phases

1. **Instantiation** (via `create()`)
   - Validates `ventureId` is provided (throws `VentureRequiredException` if missing)
   - Checks budget via `venture_token_budgets` table
   - Throws `BudgetExhaustedException` if budget <= 0
   - Logs instantiation attempt to `system_events`

2. **Execution** (via `execute()`)
   - Sets `startTime` in metadata
   - Calls `analyze()` (implemented by subclass)
   - Deduplicates findings
   - Filters by confidence threshold (minimum: 0.6)
   - Calculates score
   - Returns standardized output

3. **Termination**
   - Sets `endTime` in metadata
   - Results stored in `sub_agent_execution_results` table

### Key Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Agent name |
| `emoji` | string | Display emoji (default: 🤖) |
| `ventureId` | string | **REQUIRED** venture UUID |
| `findings` | array | Analysis findings |
| `metrics` | object | Execution metrics |
| `metadata` | object | Timestamps, version info |

### Adding Findings

```javascript
this.addFinding({
  type: 'SECURITY_ISSUE',
  severity: 'high',       // critical, high, medium, low, info
  confidence: 0.85,       // 0.0-1.0 (minimum 0.6 to report)
  file: 'src/auth.js',
  line: 42,
  description: 'SQL injection vulnerability detected',
  recommendation: 'Use parameterized queries'
});
```

---

## 2. Phase-Executor Contract & Errors

### Model Routing Strategy (HAIKU-FIRST)

The executor routes sub-agents to optimal models based on phase context:

| Tier | Model | Use Cases |
|------|-------|-----------|
| 1 | Haiku | CI/CD, documentation, pattern extraction |
| 2 | Sonnet | Design, testing, analysis, API work |
| 3 | Opus | **Security-critical** and quality gates |

```javascript
// Phase-specific routing (from lib/sub-agent-executor.js)
PHASE_MODEL_OVERRIDES = {
  LEAD: {
    GITHUB: 'haiku',      // Deterministic CI/CD
    SECURITY: 'opus',     // NEVER COMPROMISE
  },
  PLAN: {
    DATABASE: 'sonnet',   // Schema design needs reasoning
    SECURITY: 'opus',     // NEVER COMPROMISE
  },
  EXEC: {
    TESTING: 'opus',      // Critical QA gate
    SECURITY: 'opus',     // NEVER COMPROMISE
  }
};
```

### Exception Hierarchy

```
Error
├── BudgetExhaustedException    (budget <= 0, non-retryable)
├── VentureRequiredException    (no ventureId, non-retryable)
└── BudgetConfigurationException (no budget record, non-retryable)
```

**BudgetExhaustedException**
- Thrown when `budget_remaining <= 0` for venture
- Properties: `agentId`, `ventureId`, `budgetRemaining`
- `isRetryable: false` (absolute kill switch)

**VentureRequiredException**
- Thrown when instantiated without `ventureId`
- Legacy mode has been eliminated
- `isRetryable: false`

**BudgetConfigurationException**
- Thrown when no budget record exists in database
- FAIL-CLOSED behavior (no record = HALT)
- `isRetryable: false`

### Execution Flow

```
executeSubAgent(code, sdId, options)
  ├── Resolve SD key to UUID
  ├── Get SD phase (LEAD/PLAN/EXEC)
  ├── Determine optimal model
  ├── Load instructions from leo_sub_agents
  ├── Create Task Contract (if enabled)
  ├── Execute sub-agent module (or manual mode)
  ├── Run hallucination detection (L1-L4)
  ├── Complete task contract
  └── Store results in sub_agent_execution_results
```

---

## 3. Unified Result Schema & Hashing

### Standard Output Format

All sub-agents return this structure:

```javascript
{
  agent: 'SECURITY',           // Agent name
  score: 85,                   // 0-100 score
  status: 'GOOD',              // EXCELLENT|GOOD|ACCEPTABLE|POOR|CRITICAL
  summary: '2 high priority issues found',
  findings: [/* standard finding objects */],
  findingsBySeverity: {
    critical: [],
    high: [/* findings */],
    medium: [],
    low: [],
    info: []
  },
  metrics: {/* agent-specific metrics */},
  metadata: {
    startTime: '2025-12-27T...',
    endTime: '2025-12-27T...',
    filesScanned: 42,
    version: '1.0.0',
    budgetValidated: true
  },
  recommendations: [/* prioritized recommendations */]
}
```

### Finding Deduplication

Findings are deduplicated using a composite key:

```javascript
const key = `${finding.type}-${finding.location.file}-${finding.location.line}`;
```

When duplicates exist:
- Higher confidence finding is kept
- Higher severity finding is kept
- Occurrence count added to metadata

### Finding ID Generation

Each finding gets a unique ID via MD5 hash:

```javascript
const content = `${type}-${file}-${line}-${description}`;
const id = crypto.createHash('md5').update(content).digest('hex').substring(0, 8);
```

### Verdict Mapping

Database schema allows specific verdicts. Mapping:

| Original Verdict | Database Verdict |
|------------------|------------------|
| PASS | PASS |
| FAIL | FAIL |
| BLOCKED | BLOCKED |
| CONDITIONAL_PASS | CONDITIONAL_PASS |
| WARNING | WARNING |
| ERROR | FAIL |
| PENDING | WARNING |
| MANUAL_REQUIRED | WARNING |

---

## 4. Supabase Client Pool Usage & Safety

### Singleton Pattern

The sub-agent framework uses a lazy-initialized singleton for Supabase:

```javascript
// In base-sub-agent.js
let _supabaseClient = null;
function getSupabaseClient() {
  if (!_supabaseClient) {
    _supabaseClient = createClient(supabaseUrl, supabaseKey);
  }
  return _supabaseClient;
}

// In sub-agent-executor.js
let supabaseClient = null;
async function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = await createSupabaseServiceClient('engineer', {
      verbose: false
    });
  }
  return supabaseClient;
}
```

### Service Role Key Requirement

Sub-agent operations require the service role key to bypass RLS:

```javascript
// Use service role key for orchestration
const supabase = await createSupabaseServiceClient('engineer', { verbose: false });
```

### Budget Check Tables (Priority Order)

1. `venture_token_budgets` - Primary budget tracking
2. `venture_phase_budgets` - Fallback for phase-specific budgets

If neither exists: **FAIL-CLOSED** (throws `BudgetConfigurationException`)

### Result Storage Tables

| Table | Purpose |
|-------|---------|
| `sub_agent_execution_results` | Main results storage |
| `subagent_validation_results` | Hallucination check results |
| `system_events` | Instantiation logging |
| `product_requirements_v2.metadata` | PRD linkage for DESIGN, DATABASE, SECURITY, STORIES, RISK |

---

## 5. Migration Guide & New Agent Template

### Creating a New Sub-Agent

**Step 1: Add to Database**

```sql
INSERT INTO leo_sub_agents (
  code, name, description, priority, capabilities, active
) VALUES (
  'MYAGENT',
  'My Agent',
  'Description of what this agent does',
  50,  -- priority (1-100)
  ARRAY['capability1', 'capability2'],
  true
);
```

**Step 2: Create Module**

Create `lib/sub-agents/myagent.js`:

```javascript
/**
 * MyAgent Sub-Agent Module
 * Purpose: [What this agent does]
 */

import BaseSubAgent from '../agents/base-sub-agent.js';

/**
 * Execute the MyAgent analysis
 * @param {string} sdId - Strategic Directive ID (UUID)
 * @param {Object} subAgent - Sub-agent record from database
 * @param {Object} options - Execution options
 * @returns {Object} Execution results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n🔍 ${subAgent.name} analyzing SD: ${options.sdKey || sdId}`);

  // Initialize agent with budget enforcement
  const agent = await BaseSubAgent.create(subAgent.code, '🔍', {
    ventureId: options.ventureId || sdId,
    agentId: `${subAgent.code}-${Date.now()}`
  });

  try {
    // Perform analysis
    const analysisResult = await performAnalysis(sdId, options);

    // Add findings
    for (const issue of analysisResult.issues) {
      agent.addFinding({
        type: issue.type,
        severity: issue.severity,
        confidence: issue.confidence,
        file: issue.file,
        line: issue.line,
        description: issue.message,
        recommendation: issue.fix
      });
    }

    // Generate standard output
    const score = agent.calculateScore();
    const output = agent.generateStandardOutput(score);

    return {
      verdict: score >= 85 ? 'PASS' : score >= 70 ? 'CONDITIONAL_PASS' : 'FAIL',
      confidence: Math.round(score),
      message: output.summary,
      findings: output.findings,
      recommendations: output.recommendations,
      metrics: analysisResult.metrics
    };

  } catch (error) {
    return agent.handleError(error);
  }
}

async function performAnalysis(sdId, options) {
  // TODO: Implement your analysis logic
  return {
    issues: [],
    metrics: {}
  };
}
```

**Step 3: Add to Phase Mapping**

Update `scripts/orchestrate-phase-subagents.js`:

```javascript
const PHASE_SUBAGENT_MAP = {
  PLAN_VERIFY: ['TESTING', 'GITHUB', 'MYAGENT'],  // Add to relevant phase
};
```

**Step 4: Add Category Mapping** (for pattern injection)

Update `lib/sub-agent-executor.js`:

```javascript
const SUB_AGENT_CATEGORY_MAPPING = {
  'MYAGENT': ['relevant', 'categories'],
};
```

### Migrating from Legacy Patterns

**Before (Direct Instantiation)**
```javascript
// OLD - Direct instantiation (FORBIDDEN)
const agent = new BaseSubAgent('MyAgent');
agent.ventureId = ventureId;  // Manual assignment
```

**After (Factory Pattern)**
```javascript
// NEW - Factory with budget enforcement
const agent = await BaseSubAgent.create('MyAgent', '🔍', {
  ventureId  // REQUIRED, no fallback
});
```

### Testing New Sub-Agents

```bash
# Execute sub-agent for a specific SD
node -e "
import { executeSubAgent } from './lib/sub-agent-executor.js';
const result = await executeSubAgent('MYAGENT', 'SD-TEST-001');
console.log(JSON.stringify(result, null, 2));
"
```

---

## Best Practices

### DO

- Always use `BaseSubAgent.create()` factory method
- Provide descriptive findings with file/line locations
- Set appropriate confidence scores (0.6-1.0)
- Log to `system_events` for audit trail
- Handle errors gracefully with `handleError()`

### DON'T

- Never instantiate `BaseSubAgent` directly
- Never skip budget validation
- Never store findings without deduplication
- Never use hardcoded credentials
- Never ignore the `isRetryable` flag on exceptions

---

## Related Documentation

- [Governance Library Guide](../../reference/governance-library-guide.md) - Exception handling patterns
- [Utility Library Guide](./utility-library-guide.md) - Shared utilities
- [LEO Protocol Core](../CLAUDE_CORE.md) - Protocol execution philosophy

---

*Generated for SD-REFACTOR-SUBAGENTS-001 | LEO Protocol v4.3.3*
