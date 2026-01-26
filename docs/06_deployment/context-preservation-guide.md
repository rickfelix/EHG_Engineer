# Context Preservation System

## Metadata
- **Category**: Operations
- **Status**: Active
- **Version**: 2.0.0
- **Author**: DOCMON Sub-Agent
- **Last Updated**: 2026-01-26
- **Tags**: context-preservation, session-state, crash-recovery, unified-state-manager
- **Related SD**: SD-LEO-INFRA-UNIFY-CONTEXT-PRESERVATION-001

## Overview

The Context Preservation System is a research-based memory architecture that maintains session continuity across Claude Code sessions, crashes, and context compactions. It provides automatic state capture, structured memory, and intelligent restoration to ensure zero work loss.

**Key Features:**
- ✅ **Automatic state capture** (pre-compaction, checkpoints, manual)
- ✅ **Unified state file** (`.claude/unified-session-state.json`)
- ✅ **Research-based architecture** (ReSum, RECOMP, MemGPT)
- ✅ **Token budget management** (300-1200 token range)
- ✅ **Crash recovery** (auto-restore on session start)
- ✅ **Structured memory** (decisions, constraints, questions, evidence)

## Architecture

### Research Foundation

The system implements patterns from leading AI memory research:

| Research | Contribution | Implementation |
|----------|--------------|----------------|
| **ReSum (2025)** | Reasoning state checkpoints with structured sections | `decisions`, `constraints`, `openQuestions` |
| **RECOMP (ICLR 2024)** | Utility-optimized compression with token budget | `TOKEN_BUDGET`, truncation logic |
| **MemGPT (2023)** | Tiered memory hierarchy | Git state, SD context, workflow state, structured sections |

### State File Location

```
.claude/unified-session-state.json
```

**Characteristics:**
- Single source of truth for all context preservation
- JSON format for programmatic access
- Atomic writes (temp file + rename)
- Version-controlled schema

### State Schema v2.0

```javascript
{
  version: "2.0.0",
  timestamp: "2026-01-26T...",
  trigger: "precompact|manual|checkpoint|threshold",

  // Git state (MemGPT: tier 1 - immediate context)
  git: {
    branch: "feature-branch",
    status: "M file1.js\nA file2.js",
    recentCommits: ["abc123 commit message", ...],
    modifiedFiles: ["file1.js", "file2.js", ...],
    stagedChanges: "2 files changed, 50 insertions(+)"
  },

  // SD context (MemGPT: tier 1 - working memory)
  sd: {
    id: "SD-LEO-001",
    title: "Feature Title",
    phase: "EXEC",
    progress: 0.75
  },

  // Workflow state
  workflow: {
    currentPhase: "EXEC_IMPLEMENTATION",
    lastHandoff: "2026-01-26T...",
    toolExecutions: 42
  },

  // ReSum: Structured reasoning sections
  decisions: [
    {
      id: "D1",
      decision: "Use PostgreSQL instead of MongoDB",
      rationale: "Relational data, ACID compliance required",
      timestamp: "2026-01-26T...",
      reversible: false
    }
  ],

  constraints: [
    {
      id: "C1",
      constraint: "Must maintain backward compatibility with v1 API",
      source: "user requirement",
      blocking: true,
      timestamp: "2026-01-26T..."
    }
  ],

  openQuestions: [
    {
      id: "Q1",
      question: "Should we use UUID or auto-increment for primary keys?",
      context: "Migration from existing system uses auto-increment",
      priority: "high",
      timestamp: "2026-01-26T..."
    }
  ],

  // RECOMP: Verbatim evidence (prevents paraphrasing errors)
  evidenceLedger: [
    {
      id: "E1",
      type: "error",
      content: "TypeError: Cannot read property 'id' of undefined",
      source: "npm test output",
      timestamp: "2026-01-26T..."
    }
  ],

  // RECOMP: Token budget tracking
  tokenMetrics: {
    estimatedTokens: 850,
    budgetStatus: "healthy", // healthy|warning|over_budget
    lastTruncation: null
  },

  // Legacy: Backward-compatible summaries
  summaries: {
    contextHighlights: ["Key point 1", "Key point 2"],
    keyDecisions: ["Decision 1", "Decision 2"],
    pendingActions: ["Action 1", "Action 2"]
  }
}
```

## Trigger Mechanisms

### 1. Pre-Compaction (Automatic)

**When:** Before Claude Code compacts context (approaching token limit)

**Trigger:** `.claude/hooks/PreCompact.sh`

**Behavior:**
```bash
# Hook invoked automatically
node lib/context/unified-state-manager.js save --trigger=precompact
```

**Purpose:** Capture reasoning state before context is summarized

### 2. Session Start (Automatic)

**When:** Claude Code session starts

**Trigger:** `.claude/hooks/SessionStart.sh`

**Behavior:**
```bash
# Hook invoked automatically
node lib/context/unified-state-manager.js load

# If state is recent (< 30 minutes):
#   → Display restored context
#   → Resume from preserved state
# Else:
#   → Start fresh session
```

**Purpose:** Auto-restore context for crash recovery

### 3. Manual Checkpoint (User-Initiated)

**When:** User runs `/context-compact` or explicit save

**Command:**
```bash
node lib/context/unified-state-manager.js save --trigger=manual
```

**Purpose:** Manually capture important state before risky operations

### 4. Threshold-Based (Automatic)

**When:** Token usage exceeds threshold (e.g., 70% of budget)

**Trigger:** Programmatic check in workflow scripts

**Purpose:** Proactive state capture before forced compaction

## Token Budget Management

### Budget Configuration

```javascript
const TOKEN_BUDGET = {
  min: 300,      // Minimum tokens for meaningful context
  target: 800,   // Optimal token count
  max: 1200,     // Maximum tokens before truncation
  charsPerToken: 4  // Approximate characters per token
};
```

### Truncation Logic

When state exceeds `max` (1200 tokens), sections are truncated:

| Section | Max Entries | Truncation Strategy |
|---------|-------------|---------------------|
| `decisions` | 10 | Keep most recent |
| `constraints` | 10 | Keep most recent |
| `openQuestions` | 5 | Keep high priority first, then recent |
| `evidenceLedger` | 15 | Keep most recent |
| `contextHighlights` | 5 | Keep most recent |
| `pendingActions` | 10 | Keep most recent |

### Budget Status

| Status | Tokens | Behavior |
|--------|--------|----------|
| `healthy` | < 800 | No action needed |
| `warning` | 800-1200 | Logged, no truncation |
| `over_budget` | > 1200 | Auto-truncate, log warning |

## Usage

### CLI Tool

```bash
# Save current state
node lib/context/unified-state-manager.js save

# Save with specific trigger
node lib/context/unified-state-manager.js save --trigger=checkpoint

# Load and display state
node lib/context/unified-state-manager.js load

# Check state age
node lib/context/unified-state-manager.js age

# Validate state file
node lib/context/unified-state-manager.js validate
```

### Programmatic Usage

```javascript
import UnifiedStateManager from './lib/context/unified-state-manager.js';

const stateManager = new UnifiedStateManager();

// Save state
await stateManager.saveState('checkpoint', {
  highlights: ['Key insight 1', 'Key insight 2'],
  actions: ['Pending task 1', 'Pending task 2']
});

// Load state
const state = stateManager.loadState();
if (state) {
  console.log(`Restored state from ${state.timestamp}`);
  console.log(`SD: ${state.sd.id}, Phase: ${state.sd.phase}`);
}

// Add decision
stateManager.addDecision(
  'Use UUID primary keys for all tables',
  'Better for distributed systems, prevents ID conflicts',
  false // not reversible
);

// Add constraint
stateManager.addConstraint(
  'No breaking changes to public API',
  'contract with external partners',
  true // blocking
);

// Add open question
stateManager.addOpenQuestion(
  'Should we support IE11?',
  'Legacy client requirement unclear',
  'high'
);

// Add evidence
stateManager.addEvidence(
  'error',
  'TypeError: Cannot read property "id" of undefined',
  'npm test output line 42'
);

// Check if state is recent
if (stateManager.isStateRecent()) {
  console.log('State is less than 30 minutes old');
}
```

## Structured Sections

### Decisions

**Purpose:** Track key decisions with rationale

**Schema:**
```javascript
{
  id: "D1",               // Auto-incremented (D1, D2, ...)
  decision: "What was decided",
  rationale: "Why this decision was made",
  timestamp: "ISO 8601",
  reversible: true|false  // Can this be changed later?
}
```

**Example:**
```javascript
stateManager.addDecision(
  'Migrate from REST to GraphQL API',
  'Reduces over-fetching, better type safety, single endpoint',
  false
);
```

### Constraints

**Purpose:** Document discovered or enforced limitations

**Schema:**
```javascript
{
  id: "C1",
  constraint: "The limitation",
  source: "user|code|system|external",
  blocking: true|false,   // Is this blocking progress?
  timestamp: "ISO 8601"
}
```

**Example:**
```javascript
stateManager.addConstraint(
  'Database migrations must be zero-downtime',
  'production SLA requirement',
  true
);
```

### Open Questions

**Purpose:** Track unresolved questions requiring decisions

**Schema:**
```javascript
{
  id: "Q1",
  question: "The question",
  context: "Why this matters",
  priority: "high|medium|low",
  timestamp: "ISO 8601",
  resolved: false,         // Added when resolved
  resolution: "...",       // Added when resolved
  resolvedAt: "ISO 8601"   // Added when resolved
}
```

**Example:**
```javascript
stateManager.addOpenQuestion(
  'Should we use row-level security (RLS) or application-level auth?',
  'Security model impacts all table designs',
  'high'
);

// Later, resolve:
stateManager.resolveQuestion('Q1', 'Using RLS for better security isolation');
```

### Evidence Ledger

**Purpose:** Store verbatim evidence to prevent paraphrasing errors

**Types:** `error`, `command`, `output`, `observation`

**Schema:**
```javascript
{
  id: "E1",
  type: "error|command|output|observation",
  content: "Verbatim content (max 500 chars)",
  source: "Where this came from",
  timestamp: "ISO 8601"
}
```

**Example:**
```javascript
stateManager.addEvidence(
  'error',
  'ECONNREFUSED: Connection refused to localhost:5432',
  'PostgreSQL connection attempt'
);

stateManager.addEvidence(
  'command',
  'npm test -- --coverage',
  'test execution command'
);

stateManager.addEvidence(
  'output',
  'Coverage: 85% statements, 78% branches',
  'test coverage report'
);
```

## Session Restoration

### Automatic Restoration

When a session starts, the system checks for recent state:

```
Session Start
    ↓
Check .claude/unified-session-state.json
    ↓
State exists? → Check age
    ↓
Age < 30 min? → AUTO-RESTORE
    ↓
Display restoration banner:
=============================================================
[CONTEXT RESTORED] Session state from 2026-01-26T15:30:00Z
=============================================================
[GIT] Branch: feature-branch
[GIT] Uncommitted changes: 3
[GIT] Latest: abc123 Add feature implementation
[SD] Working on: SD-LEO-001
[SD] Phase: EXEC
[DECISIONS] 2 recorded
   D1: Use PostgreSQL instead of MongoDB...
[CONSTRAINTS] 1 BLOCKING
   C1: Must maintain backward compatibility...
[QUESTIONS] 1 open
   Q1 [HIGH]: Should we use UUID or auto-increment...
[TODO] Pending actions: 2
       - Implement database migration
       - Write E2E tests
=============================================================
[RESTORED] Context automatically loaded - ready to continue
```

### Manual Restoration

If state is older than 30 minutes, use manual restoration:

```bash
# Load state
node lib/context/unified-state-manager.js load

# Review state
# Decide if you want to resume or start fresh
```

## Crash Recovery

### How It Works

1. **Pre-crash:** State automatically saved via PreCompact hook
2. **Crash:** Claude Code session terminates unexpectedly
3. **Restart:** User restarts Claude Code
4. **Auto-restore:** SessionStart hook detects recent state
5. **Resume:** Context displayed, work continues

### Example Scenario

```
10:00 - Working on SD-LEO-001 (EXEC phase)
10:15 - PreCompact triggered, state saved
10:20 - System crash (power outage)
10:25 - User restarts Claude Code
10:25 - SessionStart detects state from 10:15
10:25 - Context restored automatically
10:26 - Work resumes with full context
```

### Recovery Guarantees

- ✅ **Git state:** Branch, commits, modified files preserved
- ✅ **SD context:** Current SD, phase, progress restored
- ✅ **Decisions:** All key decisions with rationale preserved
- ✅ **Constraints:** Blocking and non-blocking constraints restored
- ✅ **Questions:** Open questions with priority preserved
- ✅ **Evidence:** Recent errors and outputs preserved

## Integration Points

### PreCompact Hook

**Location:** `.claude/hooks/PreCompact.sh`

**Purpose:** Auto-save before context compaction

**Implementation:**
```bash
#!/bin/bash
node lib/context/unified-state-manager.js save --trigger=precompact
```

### SessionStart Hook

**Location:** `.claude/hooks/SessionStart.sh`

**Purpose:** Auto-restore on session start

**Implementation:**
```bash
#!/bin/bash
node lib/context/unified-state-manager.js load
```

### /context-compact Command

**Location:** `.claude/commands/context-compact.md`

**Purpose:** Manual context compaction with state preservation

**Workflow:**
1. Save current state via unified-state-manager
2. Compact conversation history
3. Inject saved state into new context

## Performance

### State File Size

| Content | Typical Size | Max Size |
|---------|--------------|----------|
| Empty state | ~500 bytes | - |
| Typical session | 2-4 KB | - |
| Large session | 8-12 KB | 15 KB (truncated) |

**Note:** 15 KB ≈ 3,750 tokens, well within budget

### Execution Time

| Operation | Time |
|-----------|------|
| Save state | 10-50ms |
| Load state | 5-20ms |
| Git operations | 100-500ms |
| Total save | 150-600ms |

### Memory Usage

| Component | Memory |
|-----------|--------|
| State object | ~50 KB |
| Git data | ~100 KB |
| Total | ~150 KB |

## Troubleshooting

### Issue: State not restoring automatically

**Diagnosis:**
```bash
# Check if state file exists
ls -la .claude/unified-session-state.json

# Check state age
node lib/context/unified-state-manager.js age
```

**Solutions:**
- State > 30 min old → Use manual load
- File missing → No previous session to restore
- Hooks not executable → `chmod +x .claude/hooks/*.sh`

### Issue: State file corrupted

**Symptoms:** JSON parse error on load

**Recovery:**
```bash
# Backup corrupted file
cp .claude/unified-session-state.json .claude/unified-session-state.json.bak

# Validate JSON
node -e "JSON.parse(require('fs').readFileSync('.claude/unified-session-state.json', 'utf8'))"

# If invalid, start fresh
rm .claude/unified-session-state.json
```

### Issue: Token budget exceeded

**Symptoms:** Warning in logs: `Token budget exceeded: 1500 tokens`

**Diagnosis:**
```javascript
const state = stateManager.loadState();
console.log(state.tokenMetrics);
// { estimatedTokens: 1500, budgetStatus: 'over_budget', ... }
```

**Solutions:**
- **Automatic:** Truncation happens automatically
- **Manual:** Reduce `MAX_ENTRIES` configuration
- **Resolve questions:** Mark open questions as resolved

### Issue: Missing git state

**Symptoms:** `git.error` in state file

**Causes:**
- Not in git repository
- Git binary not in PATH
- Git operation timeout

**Fix:**
```bash
# Ensure git is available
git --version

# Ensure in git repo
git status

# If timeout, check git performance
time git log -5 --oneline
```

## Configuration

### Token Budget Tuning

Edit `lib/context/unified-state-manager.js`:

```javascript
const TOKEN_BUDGET = {
  min: 300,      // Lower: less preserved context
  target: 800,   // Adjust based on needs
  max: 1200,     // Higher: more preserved context
  charsPerToken: 4
};
```

### Max Entries Tuning

```javascript
const MAX_ENTRIES = {
  decisions: 10,        // Increase for decision-heavy work
  constraints: 10,      // Increase for complex requirements
  openQuestions: 5,     // Increase for discovery phases
  evidenceLedger: 15,   // Increase for debugging
  contextHighlights: 5,
  pendingActions: 10
};
```

### State Age Threshold

```javascript
const MAX_AGE_MINUTES = 30;  // Consider state "recent" if less than this
```

## Migration from v1.0 to v2.0

### Automatic Migration

v1.0 state files are automatically migrated on load:

```javascript
if (state.version === '1.0.0') {
  // Add v2.0 fields with defaults
  state.version = '2.0.0';
  state.decisions = [];
  state.constraints = [];
  state.openQuestions = [];
  state.evidenceLedger = [];
  state.tokenMetrics = { ... };
}
```

### Manual Migration

If you have custom v1.0 state:

```bash
# Load v1.0 state
node lib/context/unified-state-manager.js load

# Save as v2.0
node lib/context/unified-state-manager.js save --trigger=manual
```

## Best Practices

### When to Use Each Section

| Section | Use When |
|---------|----------|
| `decisions` | Making architectural or design choices |
| `constraints` | Discovering requirements or limitations |
| `openQuestions` | Need user input or further research |
| `evidenceLedger` | Capturing errors, outputs, or observations |
| `summaries` | General context (legacy, use structured sections instead) |

### Incremental State Building

```javascript
// Start of session
stateManager.addDecision('Use TypeScript for new modules', 'Better type safety', false);

// During implementation
stateManager.addConstraint('No external API calls in tests', 'CI/CD requirement', true);

// When blocked
stateManager.addOpenQuestion('Which auth library to use?', 'Affects all routes', 'high');

// On error
stateManager.addEvidence('error', 'Test failed: expected 200, got 500', 'npm test');

// End of session
await stateManager.saveState('checkpoint');
```

### Token Budget Monitoring

```javascript
const state = stateManager.loadState();
console.log(`Tokens: ${state.tokenMetrics.estimatedTokens}`);
console.log(`Status: ${state.tokenMetrics.budgetStatus}`);

if (state.tokenMetrics.budgetStatus === 'over_budget') {
  // Resolve old questions
  // Archive old evidence
  // Re-save state
}
```

## Related Documentation

- **Unified State Manager:** `lib/context/unified-state-manager.js`
- **PreCompact Hook:** `.claude/hooks/PreCompact.sh`
- **SessionStart Hook:** `.claude/hooks/SessionStart.sh`
- **/context-compact Command:** `.claude/commands/context-compact.md`
- **Research Papers:** ReSum (2025), RECOMP (ICLR 2024), MemGPT (2023)

## Changelog

### v2.0.0 (2026-01-24)
- ✅ Research-based structured sections (SD-LEO-INFRA-UNIFY-CONTEXT-PRESERVATION-001)
- ✅ `decisions`, `constraints`, `openQuestions`, `evidenceLedger`
- ✅ Token budget management (300-1200 tokens)
- ✅ Auto-truncation with intelligent prioritization
- ✅ Incremental state building API
- ✅ Question resolution tracking
- ✅ Verbatim evidence capture

### v1.0.0 (2025-10-15)
- ✅ Initial implementation
- ✅ Git state capture
- ✅ SD context preservation
- ✅ PreCompact/SessionStart hooks
- ✅ Legacy summaries support

---

**For Questions:**
- Review state file: `.claude/unified-session-state.json`
- Check implementation: `lib/context/unified-state-manager.js`
- Test restoration: Restart Claude Code session
