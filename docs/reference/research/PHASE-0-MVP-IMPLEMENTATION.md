# Phase 0 MVP: Haiku-First Model Allocation (Week 1)


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-04
- **Tags**: database, api, testing, e2e

**Target**: Enable Haiku-first model allocation with intelligent escalation by end of week
**Effort**: ~3.5 hours of implementation
**Complexity**: Low (mostly configuration changes, not architectural)
**Risk**: Minimal (fully reversible, with manual override)

---

## Overview

Phase 0 MVP is the **minimal viable system** to start using Haiku as default while maintaining quality through escalation logic. It includes:

1. **Manual token logging** at SD checkpoints (5 mins per SD)
2. **Updated sub-agent model assignments** (Haiku for Tier 1, Sonnet for Tier 2, Opus for Tier 3)
3. **Escalation logging infrastructure** (track when Haiku upgrades to Sonnet)
4. **CLI visibility** (show recommended model before each SD)
5. **Traffic-light budget status** (green/yellow/orange/red zones)

**What's NOT included yet**:
- Database schema (using manual logging)
- Auto-escalation logic (manual escalation decisions)
- Forecast accuracy tracking (simple linear model only)
- Dashboard web interface (CLI output only)
- Learning/calibration loops

---

## Task Breakdown & Time Estimates

### TASK 1: Update Sub-Agent Executor with Haiku Defaults
**Effort**: 15 minutes (reduced from 20 - no escalation logic)
**File**: `/mnt/c/_EHG/EHG_Engineer/lib/sub-agent-executor.js`

**What to change**:
Update `PHASE_MODEL_OVERRIDES` to assign Haiku defaults (static, deterministic model selection):

```javascript
const PHASE_MODEL_OVERRIDES = {
  LEAD: {
    // TIER 1: Haiku Default
    GITHUB: 'haiku',      // PR operations, deterministic
    DOCMON: 'haiku',      // Template-based, 83-100% pass
    RETRO: 'haiku',       // Pattern extraction, 96% pass
    VALIDATION: 'haiku',  // Ideation phase, low-risk
    QUICKFIX: 'haiku',    // <50 LOC, trivial edits

    // TIER 2: Sonnet Default
    RISK: 'sonnet',       // Risk assessment needs reasoning
    STORIES: 'sonnet',    // User story generation
    API: 'sonnet',        // API design patterns
    DESIGN: 'sonnet',     // Architecture brainstorming

    // TIER 3: Opus (Non-negotiable)
    SECURITY: 'opus',     // Threat modeling - never compromise
  },

  PLAN: {
    // TIER 1: Haiku Default
    GITHUB: 'haiku',      // Branch/PR setup
    DOCMON: 'haiku',      // Doc review

    // TIER 2: Sonnet Default (mid-level reasoning required)
    VALIDATION: 'sonnet', // Complex multi-system validation
    DESIGN: 'sonnet',     // Component architecture
    DATABASE: 'sonnet',   // Schema design (constraints matter)
    TESTING: 'sonnet',    // Test plan generation
    STORIES: 'sonnet',    // User story elaboration
    API: 'sonnet',        // API contract validation
    RISK: 'sonnet',       // Security risk assessment
    DEPENDENCY: 'sonnet', // CVE assessment

    // TIER 3: Opus (Non-negotiable)
    SECURITY: 'opus',     // Security design review
  },

  EXEC: {
    // TIER 1: Haiku Default
    GITHUB: 'haiku',      // PR creation, merges
    DOCMON: 'haiku',      // Doc updates
    QUICKFIX: 'haiku',    // Small edits, <50 LOC

    // TIER 2: Sonnet Default (substantive work)
    TESTING: 'sonnet',    // E2E test execution (edge cases)
    DEPENDENCY: 'sonnet', // CVE verification
    DESIGN: 'sonnet',     // Implementation architecture
    PERFORMANCE: 'sonnet',// Optimization analysis
    RETRO: 'sonnet',      // Retrospective generation

    // TIER 3: Opus (Non-negotiable)
    SECURITY: 'opus',     // Security review of code
    VALIDATION: 'opus',   // Final QA gate - quality critical
  }
};
```

**That's it.** No escalation logic. Just a static lookup table: (agent, phase) → model.

**How it works**:
1. Sub-agent calls executor: `executor.getModel(GITHUB, LEAD)`
2. Executor looks up: `PHASE_MODEL_OVERRIDES[LEAD][GITHUB]`
3. Returns: `'haiku'`
4. Sub-agent uses Haiku

**Verification**:
- Run `npm run sd:next` and confirm model recommendations match the table
- Verify system uses assigned models during SD execution

---

### TASK 2: Create Token Logging Infrastructure
**Effort**: 15 minutes
**File**: Create `/mnt/c/_EHG/EHG_Engineer/scripts/token-logger.js` (new file)

```javascript
#!/usr/bin/env node

/**
 * Token Logging Infrastructure (MVP)
 * Manual token tracking at SD checkpoints
 * Static model assignment (no escalations, no overrides)
 *
 * Usage:
 *   node scripts/token-logger.js --sd SD-XYZ --phase LEAD --tokens 45000
 *   node scripts/token-logger.js --log  // Show current week's log
 */

const fs = require('fs');
const path = require('path');

const TOKEN_LOG_FILE = path.join(__dirname, '../.token-log.json');

// Initialize log if it doesn't exist
function ensureLogExists() {
  if (!fs.existsSync(TOKEN_LOG_FILE)) {
    const weekStart = getWeekStart();
    const logStructure = {
      week_start: weekStart,
      week_end: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      budget_limit: 500000, // Configurable
      tokens_used: 0,
      entries: []
    };
    fs.writeFileSync(TOKEN_LOG_FILE, JSON.stringify(logStructure, null, 2));
  }
}

function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(now.setDate(diff));
}

function logTokenUsage({ sd_id, phase, tokens, notes = '' }) {
  ensureLogExists();

  const log = JSON.parse(fs.readFileSync(TOKEN_LOG_FILE, 'utf8'));

  const entry = {
    timestamp: new Date().toISOString(),
    sd_id: sd_id,
    phase: phase,
    tokens: tokens,
    notes: notes
  };

  log.entries.push(entry);
  log.tokens_used += tokens;

  fs.writeFileSync(TOKEN_LOG_FILE, JSON.stringify(log, null, 2));

  const percentUsed = ((log.tokens_used / log.budget_limit) * 100).toFixed(1);
  const budgetZone = getBudgetZone(percentUsed);

  console.log(`✅ Logged: ${sd_id} (${phase}) - ${tokens.toLocaleString()} tokens`);
  console.log(`   Weekly total: ${log.tokens_used.toLocaleString()} / ${log.budget_limit.toLocaleString()} (${percentUsed}%) [${budgetZone}]`);

  return { logged: true, zone: budgetZone };
}

function getBudgetZone(percentUsed) {
  const p = parseFloat(percentUsed);
  if (p < 70) return '🟢 GREEN';
  if (p < 85) return '🟡 YELLOW';
  if (p < 95) return '🟠 ORANGE';
  return '🔴 RED';
}

function displayWeeklyLog() {
  ensureLogExists();

  const log = JSON.parse(fs.readFileSync(TOKEN_LOG_FILE, 'utf8'));
  const percentUsed = ((log.tokens_used / log.budget_limit) * 100).toFixed(1);
  const budgetZone = getBudgetZone(percentUsed);

  console.log('\n📊 WEEKLY TOKEN LOG');
  console.log('═'.repeat(70));
  console.log(`Week: ${log.week_start.substring(0, 10)} → ${log.week_end.substring(0, 10)}`);
  console.log(`Budget: ${log.tokens_used.toLocaleString()} / ${log.budget_limit.toLocaleString()} (${percentUsed}%) [${budgetZone}]`);
  console.log('');

  // Group by phase
  const byPhase = {};
  const byModel = {};

  log.entries.forEach(entry => {
    if (!byPhase[entry.phase]) byPhase[entry.phase] = 0;
    if (!byModel[entry.model]) byModel[entry.model] = 0;
    byPhase[entry.phase] += entry.tokens;
    byModel[entry.model] += entry.tokens;
  });

  console.log('By Phase:');
  Object.entries(byPhase).forEach(([phase, tokens]) => {
    const pct = ((tokens / log.tokens_used) * 100).toFixed(0);
    console.log(`  ${phase}: ${tokens.toLocaleString()} (${pct}%)`);
  });

  console.log('\nBy Model:');
  Object.entries(byModel).forEach(([model, tokens]) => {
    const pct = ((tokens / log.tokens_used) * 100).toFixed(0);
    console.log(`  ${model}: ${tokens.toLocaleString()} (${pct}%)`);
  });

  console.log(`\nTotal Entries: ${log.entries.length}`);
  console.log('═'.repeat(70) + '\n');
}

// CLI Interface
const args = process.argv.slice(2);

if (args.includes('--log')) {
  displayWeeklyLog();
} else if (args.includes('--sd')) {
  const sdIndex = args.indexOf('--sd');
  const phaseIndex = args.indexOf('--phase');
  const tokensIndex = args.indexOf('--tokens');

  const result = logTokenUsage({
    sd_id: args[sdIndex + 1],
    phase: args[phaseIndex + 1],
    tokens: parseInt(args[tokensIndex + 1])
  });
} else {
  console.log(`
Usage:
  node scripts/token-logger.js --sd SD-XYZ --phase LEAD --tokens 45000
  node scripts/token-logger.js --log
`);
}

module.exports = { logTokenUsage, getWeeklyLog: () => JSON.parse(fs.readFileSync(TOKEN_LOG_FILE, 'utf8')) };
```

**Verification**: Run `node scripts/token-logger.js --log` and confirm output.

---

### TASK 3: Add Model Recommendation to CLAUDE.md
**Effort**: 10 minutes
**File**: Update `/mnt/c/_EHG/EHG_Engineer/CLAUDE.md`

**Add new section after "Session Initialization"**:

```markdown
## Model Assignment Strategy (Haiku-First)

### Sub-Agent Model Defaults

**TIER 1: Haiku Default** (Low-stakes, deterministic)
- `github-agent`: Haiku → Sonnet for complex merge analysis
- `docmon-agent`: Haiku → Sonnet for novel doc structures
- `retro-agent`: Haiku (96% pass rate)
- `validation-agent`: Haiku (LEAD only) → Sonnet (PLAN/EXEC)
- `quickfix-agent`: Haiku (<50 LOC only)

**TIER 2: Sonnet Default** (Substantive work, reasoning)
- `testing-agent`: Sonnet → Opus for security-critical testing
- `design-agent`: Sonnet → Opus for novel architectural patterns
- `database-agent`: Sonnet → Opus for complex multi-table migrations
- `api-agent`: Sonnet → Opus for security-sensitive endpoints
- `stories-agent`: Sonnet (context understanding required)
- `risk-agent`: Sonnet → Opus for security-related risks
- `performance-agent`: Sonnet (optimization analysis)
- `dependency-agent`: Sonnet → Opus for novel vulnerabilities

**TIER 3: Opus Only** (Security-critical, non-negotiable)
- `security-agent`: Opus (all phases, never downgrade)
- `validation-agent`: Opus in PLAN/EXEC phases (quality gates)

### Budget Zones & Model Selection

| Zone | Tokens Used | Strategy |
|------|------------|----------|
| 🟢 GREEN   | 0-70%  | Use preferred models per assignment |
| 🟡 YELLOW  | 70-85% | Bias toward Haiku, upgrade cautiously |
| 🟠 ORANGE  | 85-95% | Haiku-primary, defer non-critical |
| 🔴 RED     | 95%+   | Haiku-only unless security-critical |

### Recommended Model for Current SD

Before starting each SD, the system recommends:
```
Primary: {recommended_model}
Fallback: {escalation_model}
Avoid: {constrained_model}
Reason: {brief_rationale}
```

Example:
```
Primary: Haiku (Low-stakes validation, pattern matching)
Fallback: Sonnet (if validation too complex)
Avoid: Opus (not needed for shallow validation)
Reason: Haiku sufficient for initial SD feasibility check
```

### Manual Override

Chairman can override model selection with:
```
npm run override-model --sd SD-XYZ --model opus --reason "Complex security implications"
```

All overrides are logged for analysis.

### See Also
- Token logging: `node scripts/token-logger.js --log`
- Escalation events: Check `.token-log.json` for escalation history
- Phase 0 MVP: `docs/research/PHASE-0-MVP-IMPLEMENTATION.md`
- Haiku-First Strategy: `docs/research/HAIKU-FIRST-STRATEGY.md`
```

---

### TASK 4: Create Traffic-Light Budget Display
**Effort**: 25 minutes
**File**: Create `/mnt/c/_EHG/EHG_Engineer/scripts/show-budget-status.js` (new file)

```javascript
#!/usr/bin/env node

/**
 * Token Budget Status Display
 * Shows weekly budget consumption with traffic light indicator
 *
 * Usage:
 *   node scripts/show-budget-status.js
 */

const fs = require('fs');
const path = require('path');

const TOKEN_LOG_FILE = path.join(__dirname, '../.token-log.json');

function displayBudgetStatus() {
  if (!fs.existsSync(TOKEN_LOG_FILE)) {
    console.log('📋 No token log found. Start logging tokens with:');
    console.log('   node scripts/token-logger.js --sd SD-XYZ --phase LEAD --tokens 45000 --model sonnet');
    return;
  }

  const log = JSON.parse(fs.readFileSync(TOKEN_LOG_FILE, 'utf8'));
  const weekStart = new Date(log.week_start);
  const weekEnd = new Date(log.week_end);
  const now = new Date();

  const daysElapsed = Math.floor((now - weekStart) / (24 * 60 * 60 * 1000));
  const daysRemaining = Math.ceil((weekEnd - now) / (24 * 60 * 60 * 1000));

  const percentUsed = (log.tokens_used / log.budget_limit) * 100;
  const barLength = 30;
  const filledLength = Math.round((percentUsed / 100) * barLength);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

  // Determine traffic light
  let light = '🟢 GREEN';
  let recommendation = 'Use models per assignment freely';
  if (percentUsed >= 95) {
    light = '🔴 RED';
    recommendation = 'Haiku-only, escalate only for security-critical';
  } else if (percentUsed >= 85) {
    light = '🟠 ORANGE';
    recommendation = 'Haiku-primary, defer non-critical SDs';
  } else if (percentUsed >= 70) {
    light = '🟡 YELLOW';
    recommendation = 'Monitor burn rate, upgrade models cautiously';
  }

  const burnRate = daysElapsed > 0 ? log.tokens_used / daysElapsed : 0;
  const projectedFinal = burnRate * 7;
  const status = projectedFinal > log.budget_limit ? '⚠️ ON TRACK TO EXCEED' : '✅ ON TARGET';

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║              ANTHROPIC WEEKLY TOKEN BUDGET STATUS              ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║ ${light} BUDGET ZONE                                           ║`);
  console.log('║                                                                ║');
  console.log(`║ [TOKENS] ${bar} ${percentUsed.toFixed(1)}% ║`);
  console.log(`║ ${log.tokens_used.toLocaleString().padEnd(18)} / ${log.budget_limit.toLocaleString()} tokens                   ║`);
  console.log('║                                                                ║');
  console.log(`║ [BURN RATE] ${burnRate.toFixed(0)} tokens/day                           ║`);
  console.log(`║ ${status}                                        ║`);
  console.log(`║ Projected final: ${projectedFinal.toLocaleString()} tokens                      ║`);
  console.log('║                                                                ║');
  console.log(`║ [TIMELINE] Day ${daysElapsed} of 7 (${daysRemaining} days remaining)                      ║`);
  console.log(`║ Reset: ${log.week_end.substring(0, 10)} at 2 PM PST                               ║`);
  console.log('║                                                                ║');
  console.log(`║ 📋 RECOMMENDATION:                                            ║`);
  console.log(`║ ${recommendation.padEnd(62)} ║`);
  console.log('║                                                                ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║ USAGE BY PHASE (THIS WEEK)                                     ║');

  // Calculate by phase
  const byPhase = {};
  log.entries.forEach(entry => {
    if (!byPhase[entry.phase]) byPhase[entry.phase] = { tokens: 0, count: 0 };
    byPhase[entry.phase].tokens += entry.tokens;
    byPhase[entry.phase].count++;
  });

  Object.entries(byPhase).forEach(([phase, data]) => {
    const pct = ((data.tokens / log.tokens_used) * 100).toFixed(0);
    console.log(`║ ${phase.padEnd(6)}: ${data.tokens.toLocaleString().padStart(10)} tokens (${pct.padStart(3)}%) - ${data.count} entries   ║`);
  });

  console.log('║                                                                ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║ USAGE BY MODEL (THIS WEEK)                                     ║');

  // Calculate by model
  const byModel = {};
  log.entries.forEach(entry => {
    if (!byModel[entry.model]) byModel[entry.model] = { tokens: 0, count: 0 };
    byModel[entry.model].tokens += entry.tokens;
    byModel[entry.model].count++;
  });

  Object.entries(byModel).forEach(([model, data]) => {
    const pct = ((data.tokens / log.tokens_used) * 100).toFixed(0);
    const modelEmoji = model === 'haiku' ? '⚡' : model === 'sonnet' ? '🧠' : '⭐';
    console.log(`║ ${modelEmoji} ${model.padEnd(9)}: ${data.tokens.toLocaleString().padStart(10)} tokens (${pct.padStart(3)}%) - ${data.count} entries   ║`);
  });

  console.log('║                                                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
}

displayBudgetStatus();
```

**Verification**: Run `node scripts/show-budget-status.js` after logging some tokens.

---

### TASK 5: Create Quick Reference Card for Chairman
**Effort**: 10 minutes
**File**: Create `/mnt/c/_EHG/EHG_Engineer/docs/HAIKU-QUICK-REFERENCE.md`

```markdown
# Haiku-First Quick Reference

## Before Each SD

1. **Check budget status**:
   ```bash
   node scripts/show-budget-status.js
   ```

2. **Look at recommended model** (in `npm run sd:next` output):
   ```
   Recommended Model: {model}
   Reason: {why}
   Escalation: {upgrade path if needed}
   ```

3. **Log tokens at LEAD approval**:
   ```bash
   node scripts/token-logger.js --sd SD-YOUR-ID --phase LEAD --tokens ESTIMATE --model haiku
   ```

## After Each Phase

1. **Log actual tokens used** (update estimate):
   ```bash
   node scripts/token-logger.js --sd SD-YOUR-ID --phase PLAN --tokens ACTUAL --model sonnet
   ```

2. **If Haiku produced poor output**:
   - Escalate to Sonnet: `npm run override-model --sd SD-XYZ --model sonnet --reason "quality"`
   - Log the escalation
   - Continue with Sonnet for this SD

## Never Violate These Rules

❌ **NEVER** downgrade security-agent from Opus
❌ **NEVER** use Haiku for VALIDATION in PLAN/EXEC phases
❌ **NEVER** downgrade model to save tokens on critical work
✅ **DO** defer non-critical SDs if budget is tight
✅ **DO** escalate Haiku to Sonnet if output quality is low
✅ **DO** log all model choices for analysis

## Models

| Model | Cost | Speed | Best For |
|-------|------|-------|----------|
| ⚡ Haiku | 1/3 Sonnet | 2x faster | Simple tasks, validation, retrieval |
| 🧠 Sonnet | Baseline | Normal | Design, testing, complex code |
| ⭐ Opus | 5x Sonnet | Slower | Security, critical reasoning |

## Budget Zones

- 🟢 **GREEN** (0-70%): Use freely
- 🟡 **YELLOW** (70-85%): Monitor, upgrade cautiously
- 🟠 **ORANGE** (85-95%): Prefer Haiku, defer non-critical
- 🔴 **RED** (95%+): Haiku-only unless security-critical

## Commands

```bash
# Check budget
node scripts/show-budget-status.js

# Log token usage
node scripts/token-logger.js --sd SD-XYZ --phase LEAD --tokens 45000 --model haiku

# View weekly log
node scripts/token-logger.js --log

# Override model
npm run override-model --sd SD-XYZ --model opus --reason "complex security"
```

## When to Escalate Haiku to Sonnet

✅ Haiku output quality is obviously low (needs significant revision)
✅ Task involves complex multi-system analysis
✅ Task involves edge case detection
✅ Task involves reasoning about constraints

❌ Don't escalate just because Sonnet is "safer"
❌ Don't escalate if Haiku output is acceptable
❌ Don't escalate if it violates budget constraints and SD is deferrable
```

**Verification**: File exists and is readable.

---

### TASK 6: Update .gitignore
**Effort**: 2 minutes
**File**: Update `/mnt/c/_EHG/EHG_Engineer/.gitignore`

```
# Token logging (local tracking, don't commit)
.token-log.json
```

---

## Implementation Order (Recommended)

**DO IN THIS SEQUENCE** (each depends on previous):

1. **TASK 1** (15 mins): Update sub-agent executor → enables Haiku assignments
2. **TASK 2** (15 mins): Create token logger → enables tracking
3. **TASK 4** (25 mins): Create budget display → enables visibility
4. **TASK 3** (10 mins): Update CLAUDE.md → documents for Chairman
5. **TASK 5** (10 mins): Create quick reference → chair's cheat sheet
6. **TASK 6** (2 mins): Update .gitignore → clean repo

**Total Time**: ~77 minutes (~1.25 hours)

---

## Testing Checklist

After implementation, verify:

- [ ] `lib/sub-agent-executor.js` has PHASE_MODEL_OVERRIDES with Haiku defaults
- [ ] `scripts/token-logger.js` exists and runs without errors
- [ ] `node scripts/token-logger.js --log` displays formatted weekly log
- [ ] `node scripts/show-budget-status.js` displays traffic-light status
- [ ] CLAUDE.md includes "Model Assignment Strategy" section
- [ ] Quick reference card is accessible
- [ ] `.gitignore` includes `.token-log.json`

---

## First SD with Haiku (Validation Run)

### SD Selection Criteria
- **Complexity**: 1-2 (trivial to simple)
- **Phase**: LEAD only (lowest risk)
- **Sub-agents**: Use Haiku-default agents (GITHUB, DOCMON, VALIDATION)
- **Critical**: NO (not in critical path)

### Expected Behavior
1. Recommend Haiku for all Tier 1 tasks
2. Log tokens at LEAD, PLAN, EXEC
3. Track if Haiku produces acceptable output
4. If rework needed, escalate to Sonnet and log escalation

### Success Criteria
- Haiku completes the work without major rework
- Token logging works as expected
- Budget display is accurate
- Chairman feels confident in Haiku quality

---

## Rollback Plan

If Haiku-first causes issues:

1. **Revert TASK 1**: Change PHASE_MODEL_OVERRIDES back to Sonnet defaults
2. **Keep TASK 2-6**: Token logging infrastructure remains (useful for any allocation strategy)
3. **No data loss**: All logs preserved in `.token-log.json`

**Rollback effort**: 2 minutes (one commit)

---

## Success Metrics (Week 1)

Track after first 2-3 SDs:

1. **Quality**: Are Haiku outputs acceptable? (target: >80% quality)
2. **Rework rate**: Do Haiku tasks need re-execution? (target: <20%)
3. **Escalation frequency**: How often does Haiku escalate to Sonnet? (target: <10%)
4. **Chairman confidence**: Does Chairman feel comfortable with Haiku as default?

If all metrics green → proceed to Week 2
If any metric red → investigate and adjust

---

## Next Steps (Week 2+)

- [ ] Analyze Week 1 escalation patterns
- [ ] Adjust Tier assignments if needed
- [ ] Implement auto-escalation logic (quality-score based)
- [ ] Add forecasting model
- [ ] Build dashboard web interface

---

**Status**: READY TO IMPLEMENT
**Difficulty**: LOW
**Risk**: MINIMAL (fully reversible)
**Expected Outcome**: Haiku enabled, Chairman confident in quality by week's end
