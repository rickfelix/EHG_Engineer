# Stop Hook: Sub-Agent Enforcement Draft v2


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, schema

**Status**: DRAFT v2 (Post-Triangulation)
**Created**: 2026-01-21
**Updated**: 2026-01-21
**Purpose**: Enforce SD-type-aware sub-agent execution with timing validation and auto-remediation

---

## Design Decisions (Owner Approved)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Session behavior | Autonomous continuation | Sessions continue until validation passes |
| Enforcement point | Layered (phase scripts + Stop hook) | Double coverage with auto-remediation |
| Strictness | SD-type-based with documented exceptions | Flexibility with accountability |
| Rollout | Full enforcement immediately | Confidence in approach |
| Bypass mechanism | Explanation + retrospective required | Learning from exceptions |
| Caching | 1 hour cache | Performance optimization |
| Recommended sub-agents | Auto-run | Maximize quality coverage |
| Timing | Strict phase windows | Ensure proper sequencing |
| Learning loop | Retrospective capture | Manual SD creation from patterns |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    LAYERED ENFORCEMENT                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 1: PHASE TRANSITION SCRIPTS (Hard Block)                 │
│  ├── complete-plan-phase.js                                     │
│  ├── complete-exec-phase.js                                     │
│  └── Blocks if required sub-agents missing for phase            │
│                                                                 │
│  Layer 2: STOP HOOK (Auto-Remediation)                          │
│  ├── Detects missing required + recommended sub-agents          │
│  ├── AUTO-TRIGGERS missing sub-agents                           │
│  ├── Blocks session end until validation passes                 │
│  └── Forces retrospective on bypass                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Hook Configuration

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\.claude\\set-activity-state.ps1 -State idle",
            "timeout": 2
          },
          {
            "type": "command",
            "command": "node C:/Users/rickf/Projects/_EHG/EHG_Engineer/scripts/hooks/stop-subagent-enforcement.js",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

**Note**: Timeout set to 120 seconds to allow auto-remediation of missing sub-agents.

---

## Sub-Agent Enforcement Matrix

### By SD Type (Required)

| SD Type | Required Sub-Agents | Phase Timing |
|---------|---------------------|--------------|
| `feature` | TESTING, DESIGN, STORIES | DESIGN/STORIES in PLAN, TESTING in EXEC |
| `implementation` | TESTING, API | API in PLAN, TESTING in EXEC |
| `infrastructure` | GITHUB, DOCMON | GITHUB in EXEC, DOCMON any |
| `database` | DATABASE, SECURITY | DATABASE in PLAN/EXEC, SECURITY before completion |
| `security` | SECURITY, DATABASE | Both before completion |
| `documentation` | DOCMON | Any phase |
| `bugfix` | RCA, REGRESSION, TESTING | RCA first, others in EXEC |
| `refactor` | REGRESSION, VALIDATION | Both in EXEC |
| `performance` | PERFORMANCE, TESTING | Both in EXEC |
| `orchestrator` | RETRO | At completion |

### By SD Type (Recommended - Auto-Run)

| SD Type | Recommended Sub-Agents |
|---------|------------------------|
| `feature` | UAT, API |
| `implementation` | DATABASE |
| `infrastructure` | VALIDATION |
| `database` | REGRESSION |
| `security` | TESTING, RCA |
| `documentation` | VALIDATION |
| `bugfix` | UAT |
| `refactor` | TESTING |
| `performance` | REGRESSION |
| `orchestrator` | (none) |

### By Category (Additive)

| Category | Additional Sub-Agents |
|----------|----------------------|
| `Quality Assurance`, `quality`, `testing` | +TESTING, +UAT, +VALIDATION |
| `audit` | +VALIDATION, +RCA |
| `security` | +SECURITY, +RISK |
| `bug_fix` | +RCA, +REGRESSION |
| `ux_improvement`, `product_feature` | +DESIGN, +STORIES, +UAT |
| `database`, `database_schema` | +DATABASE, +SECURITY |

### Universal

| Trigger | Sub-Agent | Timing |
|---------|-----------|--------|
| All SD completions | RETRO | After final handoff |

---

## Strict Phase Windows

Sub-agents MUST run within their designated phase window:

```
LEAD ──┬────────────────────────────────────────────────────────────>
       │
       └─ LEAD-TO-PLAN (accepted) ─┐
                                   ▼
PLAN ──────────────────────────────────────────────────────────────>
       │ ALLOWED: DESIGN, STORIES, API (design), DATABASE (schema)  │
       │ BLOCKED: TESTING, REGRESSION, PERFORMANCE                  │
       └─ PLAN-TO-EXEC (accepted) ─┐
                                   ▼
EXEC ──────────────────────────────────────────────────────────────>
       │ ALLOWED: TESTING, REGRESSION, PERFORMANCE, SECURITY        │
       │ BLOCKED: DESIGN, STORIES (too late)                        │
       └─ EXEC-TO-PLAN (accepted) ─┐
                                   ▼
VERIFICATION ──────────────────────────────────────────────────────>
       │ ALLOWED: UAT, VALIDATION                                   │
       └─ PLAN-TO-LEAD (accepted) ─┐
                                   ▼
COMPLETION ────────────────────────────────────────────────────────>
       │ REQUIRED: RETRO                                            │
       └─ LEAD-FINAL-APPROVAL ─> COMPLETED
```

### Timing Rules Table

| Sub-Agent | Must Run After | Must Run Before | Phase |
|-----------|----------------|-----------------|-------|
| DESIGN | LEAD-TO-PLAN | PLAN-TO-EXEC | PLAN |
| STORIES | LEAD-TO-PLAN | PLAN-TO-EXEC | PLAN |
| API | LEAD-TO-PLAN | PLAN-TO-EXEC | PLAN |
| DATABASE | LEAD-TO-PLAN | EXEC-TO-PLAN | PLAN/EXEC |
| TESTING | PLAN-TO-EXEC | LEAD-FINAL-APPROVAL | EXEC |
| REGRESSION | PLAN-TO-EXEC | EXEC-TO-PLAN | EXEC |
| PERFORMANCE | PLAN-TO-EXEC | EXEC-TO-PLAN | EXEC |
| SECURITY | Any | LEAD-FINAL-APPROVAL | Any |
| UAT | EXEC-TO-PLAN | LEAD-FINAL-APPROVAL | Verification |
| VALIDATION | Any | LEAD-FINAL-APPROVAL | Any |
| RCA | (First for bugfix) | Before fix | Early |
| RETRO | PLAN-TO-LEAD | Session end | Completion |
| GITHUB | PLAN-TO-EXEC | LEAD-FINAL-APPROVAL | EXEC |
| DOCMON | Any | LEAD-FINAL-APPROVAL | Any |
| RISK | Any | PLAN-TO-EXEC | Early |

---

## Caching Strategy

To avoid redundant sub-agent executions, cache recent validations:

```javascript
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

function isValidationCached(agent, executions) {
  const recentExec = executions.find(e =>
    e.sub_agent_code === agent &&
    ['PASS', 'CONDITIONAL_PASS'].includes(e.verdict) &&
    (Date.now() - new Date(e.created_at).getTime()) < CACHE_DURATION_MS
  );
  return !!recentExec;
}
```

**Rules**:
- Trust PASS/CONDITIONAL_PASS verdicts from last hour
- FAIL verdicts require re-run
- Cache is per-SD (different SDs don't share cache)

---

## Bypass Mechanism

Bypasses are allowed but require accountability:

### Requirements for Bypass

1. **Written explanation** (minimum 50 characters)
2. **Retrospective entry** documenting:
   - Why bypass was needed
   - What sub-agents were skipped
   - Lessons learned / process improvement suggestions

### Bypass Implementation

```javascript
// Check for bypass request in environment or file
const bypassFile = path.join(process.env.CLAUDE_PROJECT_DIR, '.stop-hook-bypass.json');

if (fs.existsSync(bypassFile)) {
  const bypass = JSON.parse(fs.readFileSync(bypassFile, 'utf-8'));

  // Validate bypass has required fields
  if (!bypass.explanation || bypass.explanation.length < 50) {
    return {
      decision: 'block',
      reason: 'Bypass requires explanation (min 50 chars)'
    };
  }

  if (!bypass.retrospective_committed) {
    return {
      decision: 'block',
      reason: 'Bypass requires retrospective entry before proceeding',
      action: 'Run: node scripts/generate-retrospective.js --bypass-entry'
    };
  }

  // Log bypass to audit
  await logBypassToAudit(bypass);

  // Allow bypass
  console.log(`Bypass allowed: ${bypass.explanation.slice(0, 100)}...`);
  process.exit(0);
}
```

### Bypass File Format

```json
{
  "sd_key": "SD-FEATURE-001",
  "explanation": "Emergency hotfix for production issue. TESTING sub-agent skipped because production is down and we need immediate deployment. Will run full test suite post-deployment.",
  "skipped_agents": ["TESTING", "UAT"],
  "retrospective_committed": true,
  "retrospective_id": "retro-uuid-here",
  "created_at": "2026-01-21T15:30:00Z",
  "created_by": "user"
}
```

---

## Auto-Remediation Logic

When the Stop hook detects missing sub-agents, it automatically triggers them:

```javascript
async function autoRemediate(sdId, missingAgents, sdKey) {
  console.log(`\n🔧 Auto-remediation: Running ${missingAgents.length} missing sub-agents...`);

  for (const agent of missingAgents) {
    console.log(`\n   Running ${agent}...`);

    try {
      // Execute sub-agent
      const result = await executeSubAgent(agent, sdId, { sdKey });

      if (['PASS', 'CONDITIONAL_PASS'].includes(result.verdict)) {
        console.log(`   ✅ ${agent}: ${result.verdict}`);
      } else {
        console.log(`   ⚠️ ${agent}: ${result.verdict}`);
        // Continue to next agent, don't fail entire remediation
      }
    } catch (error) {
      console.error(`   ❌ ${agent} failed: ${error.message}`);
    }
  }

  console.log('\n🔧 Auto-remediation complete. Re-validating...');
}
```

### Remediation Order

Sub-agents are run in dependency order:

1. **RCA** (if bugfix) - understand root cause first
2. **DESIGN** - design before implementation
3. **STORIES** - user stories inform testing
4. **DATABASE** - schema before code
5. **API** - API design before implementation
6. **SECURITY** - security review
7. **TESTING** - verify implementation
8. **REGRESSION** - backward compatibility
9. **PERFORMANCE** - performance validation
10. **UAT** - user acceptance
11. **VALIDATION** - final validation
12. **GITHUB** - CI/CD verification
13. **DOCMON** - documentation compliance
14. **RETRO** - retrospective (always last)

---

## Implementation Script

`scripts/hooks/stop-subagent-enforcement.js`:

```javascript
#!/usr/bin/env node
/**
 * Stop Hook: Sub-Agent Enforcement with Auto-Remediation
 *
 * LEO Protocol v4.3.3+
 *
 * Behavior:
 * 1. Detects current SD from git branch
 * 2. Determines required + recommended sub-agents based on SD type/category
 * 3. Validates sub-agents ran in correct phase windows
 * 4. AUTO-RUNS missing sub-agents (remediation)
 * 5. Blocks session end until all validations pass
 * 6. Bypass requires explanation + retrospective entry
 *
 * Exit codes:
 *   0 - All validations passed
 *   2 - Blocking: Missing sub-agents (triggers Claude to continue)
 */

import { createClient } from '@supabase/supabase-js';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

const REQUIREMENTS = {
  byType: {
    feature: {
      required: ['TESTING', 'DESIGN', 'STORIES'],
      recommended: ['UAT', 'API']
    },
    implementation: {
      required: ['TESTING', 'API'],
      recommended: ['DATABASE']
    },
    infrastructure: {
      required: ['GITHUB', 'DOCMON'],
      recommended: ['VALIDATION']
    },
    database: {
      required: ['DATABASE', 'SECURITY'],
      recommended: ['REGRESSION']
    },
    security: {
      required: ['SECURITY', 'DATABASE'],
      recommended: ['TESTING', 'RCA']
    },
    documentation: {
      required: ['DOCMON'],
      recommended: ['VALIDATION']
    },
    bugfix: {
      required: ['RCA', 'REGRESSION', 'TESTING'],
      recommended: ['UAT']
    },
    refactor: {
      required: ['REGRESSION', 'VALIDATION'],
      recommended: ['TESTING']
    },
    performance: {
      required: ['PERFORMANCE', 'TESTING'],
      recommended: ['REGRESSION']
    },
    orchestrator: {
      required: [],
      recommended: ['RETRO']
    }
  },
  byCategory: {
    'Quality Assurance': ['TESTING', 'UAT', 'VALIDATION'],
    'quality': ['TESTING', 'UAT', 'VALIDATION'],
    'testing': ['TESTING', 'UAT'],
    'audit': ['VALIDATION', 'RCA'],
    'security': ['SECURITY', 'RISK'],
    'bug_fix': ['RCA', 'REGRESSION'],
    'ux_improvement': ['DESIGN', 'UAT'],
    'UX Improvement': ['DESIGN', 'UAT'],
    'product_feature': ['DESIGN', 'STORIES', 'API'],
    'database': ['DATABASE'],
    'database_schema': ['DATABASE', 'SECURITY']
  },
  universal: ['RETRO']
};

const TIMING_RULES = {
  DESIGN: { after: 'LEAD-TO-PLAN', before: 'PLAN-TO-EXEC', phase: 'PLAN' },
  STORIES: { after: 'LEAD-TO-PLAN', before: 'PLAN-TO-EXEC', phase: 'PLAN' },
  API: { after: 'LEAD-TO-PLAN', before: 'PLAN-TO-EXEC', phase: 'PLAN' },
  DATABASE: { after: 'LEAD-TO-PLAN', before: 'EXEC-TO-PLAN', phase: 'PLAN/EXEC' },
  TESTING: { after: 'PLAN-TO-EXEC', before: 'LEAD-FINAL-APPROVAL', phase: 'EXEC' },
  REGRESSION: { after: 'PLAN-TO-EXEC', before: 'EXEC-TO-PLAN', phase: 'EXEC' },
  PERFORMANCE: { after: 'PLAN-TO-EXEC', before: 'EXEC-TO-PLAN', phase: 'EXEC' },
  SECURITY: { after: null, before: 'LEAD-FINAL-APPROVAL', phase: 'ANY' },
  UAT: { after: 'EXEC-TO-PLAN', before: 'LEAD-FINAL-APPROVAL', phase: 'VERIFICATION' },
  VALIDATION: { after: null, before: 'LEAD-FINAL-APPROVAL', phase: 'ANY' },
  RCA: { after: null, before: null, phase: 'EARLY' },
  RETRO: { after: 'PLAN-TO-LEAD', before: null, phase: 'COMPLETION' },
  GITHUB: { after: 'PLAN-TO-EXEC', before: 'LEAD-FINAL-APPROVAL', phase: 'EXEC' },
  DOCMON: { after: null, before: 'LEAD-FINAL-APPROVAL', phase: 'ANY' },
  RISK: { after: null, before: 'PLAN-TO-EXEC', phase: 'EARLY' }
};

const REMEDIATION_ORDER = [
  'RCA', 'DESIGN', 'STORIES', 'DATABASE', 'API', 'SECURITY',
  'TESTING', 'REGRESSION', 'PERFORMANCE', 'UAT', 'VALIDATION',
  'GITHUB', 'DOCMON', 'RETRO'
];

// ============================================================================
// MAIN LOGIC
// ============================================================================

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 1. Check for bypass
  const bypassResult = await checkBypass(supabase);
  if (bypassResult.allowed) {
    process.exit(0);
  }
  if (bypassResult.blocked) {
    console.log(JSON.stringify(bypassResult.response));
    process.exit(2);
  }

  // 2. Get current branch to extract SD ID
  let branch;
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    process.exit(0); // Not in git repo
  }

  // 3. Extract SD ID from branch
  const sdMatch = branch.match(/SD-[A-Z]+-[A-Z0-9]+-[0-9]+|SD-[A-Z]+-[0-9]+/i);
  if (!sdMatch) {
    process.exit(0); // No SD in branch
  }
  const sdKey = sdMatch[0];

  // 4. Get SD details
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, legacy_id, title, sd_type, category, current_phase, status')
    .or(`sd_key.eq.${sdKey},legacy_id.eq.${sdKey}`)
    .single();

  if (sdError || !sd) {
    process.exit(0); // SD not found
  }

  // 5. Skip if completed
  if (sd.status === 'completed' || sd.current_phase === 'COMPLETED') {
    process.exit(0);
  }

  // 6. Determine required + recommended sub-agents
  const sdType = sd.sd_type || 'feature';
  const category = sd.category || '';

  const typeReqs = REQUIREMENTS.byType[sdType] || { required: [], recommended: [] };
  const categoryReqs = REQUIREMENTS.byCategory[category] || [];

  const required = new Set([...typeReqs.required, ...categoryReqs]);
  const recommended = new Set(typeReqs.recommended);

  // Add universal if near completion
  if (['PLAN', 'LEAD'].includes(sd.current_phase)) {
    REQUIREMENTS.universal.forEach(s => required.add(s));
  }

  // Merge recommended into execution list (auto-run)
  const allToRun = new Set([...required, ...recommended]);

  // 7. Get handoff timestamps
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_type, status, created_at')
    .eq('sd_id', sd.id)
    .eq('status', 'accepted')
    .order('created_at', { ascending: true });

  const handoffTimes = {};
  handoffs?.forEach(h => {
    handoffTimes[h.handoff_type] = new Date(h.created_at);
  });

  // 8. Get sub-agent executions
  const { data: executions } = await supabase
    .from('sub_agent_execution_results')
    .select('sub_agent_code, verdict, created_at')
    .eq('sd_id', sd.id);

  // 9. Validate each sub-agent
  const missing = [];
  const wrongTiming = [];
  const cached = [];

  for (const agent of allToRun) {
    const agentExecs = executions?.filter(e => e.sub_agent_code === agent) || [];
    const passingExecs = agentExecs.filter(e =>
      ['PASS', 'CONDITIONAL_PASS'].includes(e.verdict)
    );

    // Check cache
    const recentPass = passingExecs.find(e =>
      (Date.now() - new Date(e.created_at).getTime()) < CACHE_DURATION_MS
    );

    if (recentPass) {
      cached.push(agent);
      continue; // Cached, skip
    }

    if (passingExecs.length === 0) {
      missing.push(agent);
      continue;
    }

    // Check timing
    const rule = TIMING_RULES[agent];
    if (rule) {
      const afterTime = rule.after ? handoffTimes[rule.after] : null;
      const beforeTime = rule.before ? handoffTimes[rule.before] : null;

      const validExec = passingExecs.some(e => {
        const execTime = new Date(e.created_at);
        const afterOk = !afterTime || execTime >= afterTime;
        const beforeOk = !beforeTime || execTime <= beforeTime;
        return afterOk && beforeOk;
      });

      if (!validExec) {
        wrongTiming.push({
          agent,
          rule: `Must run in ${rule.phase} phase (after ${rule.after || 'any'}, before ${rule.before || 'any'})`,
          lastRun: passingExecs[0]?.created_at
        });
      }
    }
  }

  // 10. If issues found, auto-remediate
  if (missing.length > 0 || wrongTiming.length > 0) {
    console.error(`\n🔍 Sub-Agent Enforcement for ${sdKey} (${sdType})`);
    console.error(`   Phase: ${sd.current_phase}`);
    console.error(`   Cached: ${cached.length} sub-agents`);

    if (missing.length > 0) {
      console.error(`   Missing: ${missing.join(', ')}`);
    }
    if (wrongTiming.length > 0) {
      console.error(`   Wrong timing: ${wrongTiming.map(w => w.agent).join(', ')}`);
    }

    // Sort missing by remediation order
    const toRemediate = [...missing, ...wrongTiming.map(w => w.agent)];
    const sorted = toRemediate.sort((a, b) =>
      REMEDIATION_ORDER.indexOf(a) - REMEDIATION_ORDER.indexOf(b)
    );

    // Return blocking response with remediation instructions
    const output = {
      decision: 'block',
      reason: `SD ${sdKey} (${sdType}) requires sub-agent validation`,
      details: {
        sd_key: sdKey,
        sd_type: sdType,
        category: category,
        current_phase: sd.current_phase,
        missing: missing,
        wrong_timing: wrongTiming,
        cached: cached.length
      },
      remediation: {
        auto_run: true,
        agents_to_run: sorted,
        command: `node scripts/orchestrate-phase-subagents.js ${sdKey} --agents ${sorted.join(',')}`
      },
      bypass_instructions: {
        step1: 'Create .stop-hook-bypass.json with explanation (min 50 chars)',
        step2: 'Run: node scripts/generate-retrospective.js --bypass-entry',
        step3: 'Set retrospective_committed: true in bypass file'
      }
    };

    console.log(JSON.stringify(output));
    process.exit(2);
  }

  // 11. All validations passed
  console.error(`✅ Sub-Agent Enforcement: ${sdKey} passed (${cached.length} cached, ${allToRun.size - cached.length} validated)`);
  process.exit(0);
}

// ============================================================================
// BYPASS HANDLING
// ============================================================================

async function checkBypass(supabase) {
  const bypassFile = path.join(
    process.env.CLAUDE_PROJECT_DIR || process.cwd(),
    '.stop-hook-bypass.json'
  );

  if (!fs.existsSync(bypassFile)) {
    return { allowed: false, blocked: false };
  }

  try {
    const bypass = JSON.parse(fs.readFileSync(bypassFile, 'utf-8'));

    // Validate explanation
    if (!bypass.explanation || bypass.explanation.length < 50) {
      return {
        allowed: false,
        blocked: true,
        response: {
          decision: 'block',
          reason: 'Bypass explanation must be at least 50 characters',
          current_length: bypass.explanation?.length || 0
        }
      };
    }

    // Validate retrospective committed
    if (!bypass.retrospective_committed) {
      return {
        allowed: false,
        blocked: true,
        response: {
          decision: 'block',
          reason: 'Bypass requires retrospective entry',
          action: 'Run: node scripts/generate-retrospective.js --bypass-entry'
        }
      };
    }

    // Log bypass to audit
    try {
      await supabase.from('audit_log').insert({
        event_type: 'STOP_HOOK_BYPASS',
        severity: 'warning',
        details: {
          sd_key: bypass.sd_key,
          explanation: bypass.explanation,
          skipped_agents: bypass.skipped_agents,
          retrospective_id: bypass.retrospective_id
        }
      });
    } catch (e) {
      console.error('Failed to log bypass to audit:', e.message);
    }

    // Clean up bypass file
    fs.unlinkSync(bypassFile);

    console.error(`⚠️ Bypass allowed for ${bypass.sd_key}: ${bypass.explanation.slice(0, 80)}...`);
    return { allowed: true, blocked: false };

  } catch (e) {
    return {
      allowed: false,
      blocked: true,
      response: {
        decision: 'block',
        reason: `Invalid bypass file: ${e.message}`
      }
    };
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

main().catch(err => {
  console.error('Stop hook error:', err.message);
  process.exit(0); // Don't block on internal errors
});
```

---

## Integration with Phase Transition Scripts

Update phase transition scripts to include hard blocking:

### `scripts/complete-exec-phase.js` (example)

```javascript
// Add at start of completion logic
import { validateSubAgents } from './hooks/stop-subagent-enforcement.js';

async function completeExecPhase(sdId) {
  // Hard block if required sub-agents missing
  const validation = await validateSubAgents(sdId, 'EXEC');

  if (!validation.passed) {
    console.error('❌ Cannot complete EXEC phase:');
    console.error(`   Missing: ${validation.missing.join(', ')}`);
    console.error(`   Wrong timing: ${validation.wrongTiming.map(w => w.agent).join(', ')}`);
    console.error('\nRun the following to remediate:');
    console.error(`   ${validation.remediationCommand}`);
    process.exit(1);
  }

  // Continue with phase completion...
}
```

---

## Exception Handling Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXCEPTION FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Stop hook blocks session                                    │
│     └── Missing: TESTING, UAT                                   │
│                                                                 │
│  2. User decides to bypass (emergency)                          │
│     └── Creates .stop-hook-bypass.json                          │
│         {                                                       │
│           "explanation": "Production down, need hotfix...",     │
│           "skipped_agents": ["TESTING", "UAT"],                 │
│           "retrospective_committed": false                      │
│         }                                                       │
│                                                                 │
│  3. Hook blocks: "retrospective required"                       │
│     └── User runs: node scripts/generate-retrospective.js      │
│                    --bypass-entry                               │
│                                                                 │
│  4. Retrospective created with bypass documentation             │
│     └── Updates bypass file: retrospective_committed: true      │
│                                                                 │
│  5. Hook allows bypass, logs to audit_log                       │
│                                                                 │
│  6. Retrospective captures:                                     │
│     - Why bypass was needed                                     │
│     - What was skipped                                          │
│     - Lessons learned                                           │
│     - Process improvement suggestions                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Metrics to Track

| Metric | Query | Purpose |
|--------|-------|---------|
| Sub-agent coverage | `SELECT sub_agent_code, COUNT(*) FROM sub_agent_execution_results GROUP BY 1` | Track adoption |
| Block rate | `SELECT COUNT(*) FROM audit_log WHERE event_type = 'STOP_HOOK_BLOCK'` | Measure friction |
| Bypass rate | `SELECT COUNT(*) FROM audit_log WHERE event_type = 'STOP_HOOK_BYPASS'` | Track exceptions |
| Remediation success | `SELECT COUNT(*) FROM audit_log WHERE event_type = 'STOP_HOOK_REMEDIATION'` | Auto-fix effectiveness |
| Cache hit rate | Logged in hook output | Performance optimization |

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `.claude/settings.json` | Modify | Add Stop hook configuration |
| `scripts/hooks/stop-subagent-enforcement.js` | Create | Main enforcement script |
| `scripts/generate-retrospective.js` | Modify | Add `--bypass-entry` flag |
| `scripts/complete-exec-phase.js` | Modify | Add hard blocking |
| `scripts/complete-plan-phase.js` | Modify | Add hard blocking |

---

## Rollout Checklist

- [ ] Create `scripts/hooks/` directory
- [ ] Implement `stop-subagent-enforcement.js`
- [ ] Update `.claude/settings.json` with hook
- [ ] Add `--bypass-entry` to retrospective script
- [ ] Update phase transition scripts
- [ ] Test with sample SD
- [ ] Monitor metrics for first week
- [ ] Adjust matrix based on feedback

---

*Draft v2 - Post-Triangulation with Owner Decisions*
*Full enforcement, auto-remediation, strict timing, documented exceptions*
