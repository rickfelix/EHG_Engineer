# RCA Multi-Expert Collaboration Protocol

**Version**: 1.1
**Pattern ID**: PAT-RCA-MULTI-001
**Last Updated**: 2026-01-31 (v1.1: Added independent analysis protocol)

## Overview

The RCA (Root Cause Analysis) agent works as a **triage specialist** that collaborates with domain experts rather than attempting to solve technical issues alone. This protocol defines how RCA invokes multiple domain experts in parallel for complex, cross-domain issues.

## Why Multi-Expert Collaboration?

| Approach | Outcome |
|----------|---------|
| RCA alone | May provide incorrect technical solutions (lacks domain expertise) |
| Domain expert alone | Fixes issue but may miss root cause documentation and prevention |
| RCA + Domain experts | Complete fix + root cause analysis + prevention patterns |

## When to Use Multi-Expert Collaboration

### Automatic Triggers

RCA automatically invokes multiple experts when:

1. **Issue matches known multi-domain patterns:**
   - `security_breach` → SECURITY + API + DATABASE
   - `migration_failure` → DATABASE + VALIDATION + GITHUB
   - `performance_degradation` → PERFORMANCE + DATABASE + API
   - `test_infrastructure` → TESTING + GITHUB + DATABASE
   - `deployment_failure` → GITHUB + DEPENDENCY + SECURITY

2. **Issue keywords span multiple domains:**
   - Keywords match 2+ categories in the routing map
   - E.g., "migration query timeout" spans DATABASE + PERFORMANCE

3. **Explicit triggers:**
   - "spans multiple domains"
   - "cross-domain issue"
   - "multi-expert analysis"
   - "complex root cause"

## Domain Expert Routing Map

| Category | Primary Expert | Secondary Experts | Keywords |
|----------|---------------|-------------------|----------|
| Database | DATABASE | SECURITY, PERFORMANCE | migration, schema, sql, query, rls |
| API | API | SECURITY, PERFORMANCE | endpoint, rest, graphql, route |
| Security | SECURITY | DATABASE, API | auth, vulnerability, cve, injection |
| Performance | PERFORMANCE | DATABASE, API | slow, latency, optimization, cache |
| Testing | TESTING | REGRESSION, UAT | test, e2e, playwright, coverage |
| UI | DESIGN | UAT, TESTING | component, ui, ux, accessibility |
| CI/CD | GITHUB | TESTING, DEPENDENCY | pipeline, workflow, action, deploy |
| Dependencies | DEPENDENCY | SECURITY, GITHUB | npm, package, version, cve |
| Refactoring | REGRESSION | VALIDATION, TESTING | refactor, backward, compatibility |

## Collaboration Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    RCA (Orchestrator)                       │
│  1. TRIAGE: Identify issue category via keywords            │
│  2. DETECT: Check if issue spans multiple domains           │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│           3. INVOKE: Launch experts IN PARALLEL             │
├─────────────────┬─────────────────┬─────────────────────────┤
│    DATABASE     │   VALIDATION    │       GITHUB            │
│    (Expert 1)   │   (Expert 2)    │      (Expert 3)         │
│                 │                 │                         │
│  "Analyze DB    │  "Analyze       │  "Analyze CI/CD         │
│   aspect..."    │   validation    │   aspect..."            │
│                 │   aspect..."    │                         │
└────────┬────────┴────────┬────────┴────────┬────────────────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              4. GATHER: Collect expert findings             │
│  - DATABASE: "SQL syntax issue with CHECK constraint"       │
│  - VALIDATION: "No pre-flight check for existing patterns"  │
│  - GITHUB: "No CI/CD gate for migration validation"         │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│            5. SYNTHESIZE: Unified 5-Whys Analysis           │
│                                                             │
│  WHY 1: Migration failed                                    │
│    └─ DATABASE: SQL syntax error                            │
│  WHY 2: Wrong syntax used                                   │
│    └─ VALIDATION: No pattern check before writing           │
│  WHY 3: Pattern not documented                              │
│    └─ GITHUB: No CI/CD validation gate                      │
│  WHY 4: No enforcement mechanism                            │
│    └─ (Cross-domain gap)                                    │
│  WHY 5: Process gap across domains                          │
│    └─ ROOT CAUSE                                            │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│               6. CAPA: Multi-Domain Actions                 │
│                                                             │
│  Corrective (Fix):                                          │
│  - DATABASE: Fix SQL syntax                                 │
│  - VALIDATION: Add pattern check                            │
│                                                             │
│  Preventive (Prevent):                                      │
│  - GITHUB: Add CI/CD migration validation                   │
│  - DATABASE: Add syntax checklist to CLAUDE_EXEC            │
│  - VALIDATION: Add pre-flight gate                          │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│               7. CAPTURE: Add to issue_patterns             │
│                                                             │
│  pattern_id: PAT-XXX-001                                    │
│  category: database (or primary domain)                     │
│  related_sub_agents: ['DATABASE', 'VALIDATION', 'GITHUB']   │
│  prevention_checklist: [multi-domain items]                 │
└─────────────────────────────────────────────────────────────┘
```

## Critical: Independent Analysis (Not Confirmation)

**ANTI-PATTERN (v1.0 - Confirmation Bias)**:
```javascript
// ❌ Wrong: Asking expert to confirm RCA's hypothesis
Task tool with subagent_type="database-agent":
  "The database migration failed because password is missing.
   Can you confirm this connection pattern?"
```

**Why this fails**: Expert becomes a fact-checker instead of providing independent analysis. Misses alternative solutions.

**CORRECT PATTERN (v1.1 - Independent Analysis)**:
```javascript
// ✅ Right: Asking expert for independent investigation
Task tool with subagent_type="database-agent":
  "Analyze this database migration failure independently:

   Problem: Migration execution failed with 'password not found' error
   Context: [relevant details]

   Your task:
   1. Investigate independently - don't assume any particular solution
   2. What are ALL the options available? (not just the obvious one)
   3. What are the tradeoffs of each approach?
   4. What would YOU recommend as a database expert?
   5. Think deeply - challenge the surface-level answer

   Provide your expert analysis, not confirmation of existing hypotheses."
```

**Evidence from real session (2026-01-31)**:

| Approach | Result |
|----------|--------|
| **RCA + DATABASE (confirmation)** | "Add password to .env" (1 solution) |
| **DATABASE alone (independent)** | Found 4 alternative solutions including zero-config option via Supabase Dashboard |

### Independent Analysis Template

When invoking domain experts, RCA must use this structure:

```
Task tool with subagent_type="<domain>-agent":

"Analyze this issue from your expert perspective:

**Problem**: [Exact error/symptom]
**Context**: [Relevant background]

Your task:
1. Investigate independently - don't assume any particular solution
2. What are ALL the options available? (not just the obvious one)
3. What are the tradeoffs of each approach?
4. What would YOU recommend and why?
5. Think deeply - challenge the surface-level answer

Provide your expert analysis, not just confirmation of existing hypotheses."
```

**Key Principle**: The expert's answer may be completely different from RCA's initial hypothesis. **That's the point.**

## Example: Invoking Multiple Experts (Updated v1.1)

When RCA detects a multi-domain issue, it uses the Task tool to invoke experts in parallel with **independent analysis** requests:

```javascript
// RCA invokes DATABASE expert
Task tool with subagent_type="database-agent":
  "Analyze this migration failure independently.

   Problem: Migration script failed with 'CHECK constraint cannot be used with ADD COLUMN IF NOT EXISTS'
   Context: [details]

   Your task:
   1. What are ALL options for executing this migration?
   2. Is the error message accurate - what's really happening?
   3. What would YOU recommend as a database expert?

   Don't just confirm the obvious - provide your independent analysis."

// RCA invokes VALIDATION expert (in parallel)
Task tool with subagent_type="validation-agent":
  "Analyze this migration failure from validation perspective.

   Problem: [same as above]
   Context: [details]

   Your task:
   1. Are there existing patterns that should have prevented this?
   2. What validation gaps exist?
   3. What would YOU recommend for prevention?

   Provide independent analysis, not confirmation."

// RCA invokes GITHUB expert (in parallel)
Task tool with subagent_type="github-agent":
  "Analyze this migration failure from CI/CD perspective.

   Problem: [same as above]
   Context: [details]

   Your task:
   1. What CI/CD gates could have caught this?
   2. What automation gaps exist?
   3. What would YOU recommend for pipeline improvements?

   Independent investigation - challenge assumptions."
```

## What Each Agent Contributes

| Agent | Contribution |
|-------|--------------|
| **RCA** | Analytical framework, 5-whys methodology, CAPA structure, pattern documentation |
| **Domain Expert** | Technical knowledge, executable solutions, domain-specific root cause |
| **Together** | Complete fix + documented root cause + effective prevention |

## Output Format

RCA produces a unified analysis containing:

1. **Issue Summary** - Single sentence describing the problem
2. **Domain Classification** - Which experts were consulted
3. **Expert Findings** - Summary from each domain expert
4. **Unified 5-Whys** - Root cause chain spanning all domains
5. **Multi-Domain CAPA** - Corrective and Preventive actions per domain
6. **Pattern Entry** - Ready for `issue_patterns` table with `related_sub_agents`
7. **SD Recommendations** - Suggested Strategic Directives to implement fixes

## Benefits

1. **Broader perspective** - Multiple experts catch issues a single agent would miss
2. **Deeper analysis** - Each expert provides domain-specific depth
3. **Better prevention** - Cross-domain patterns prevent entire classes of failures
4. **Institutional learning** - Patterns captured with all contributing experts tagged
5. **Faster resolution** - Parallel expert invocation saves time
6. **Independent alternatives** (v1.1) - Experts provide options RCA wouldn't discover alone

## Implementation Changes (v1.1 - 2026-01-31)

### What Changed

| Component | Before (v1.0) | After (v1.1) |
|-----------|---------------|--------------|
| **RCA Agent** | Router role only | Added Multi-Expert Collaboration Protocol section |
| **Task Tool Access** | Not documented | Explicitly added to rca-agent.md frontmatter |
| **Invocation Pattern** | Narrow confirmation questions | Independent analysis template |
| **Expert Autonomy** | Fact-checking role | Full investigation authority |

### Files Modified

1. **`.claude/agents/rca-agent.md`**:
   - Added `tools: Bash, Read, Write, Task` (line 4)
   - Added "Multi-Expert Collaboration Protocol (CRITICAL)" section (lines 207-289)
   - Includes anti-pattern examples (confirmation bias)
   - Includes correct pattern (independent analysis template)
   - Domain expert routing table
   - Key principle: "You are the TRIAGE SPECIALIST, not the domain expert"

2. **`docs/reference/rca-multi-expert-collaboration.md`** (this file):
   - Added v1.1 updates documenting independent analysis pattern
   - Added real-world evidence from 2026-01-31 session
   - Added anti-pattern vs correct pattern examples
   - Added implementation changes section

### Evidence of Improvement

**Test Case**: Database migration password issue (2026-01-31)

| Metric | Before (Confirmation) | After (Independent) |
|--------|----------------------|---------------------|
| Solutions Found | 1 ("add password") | 4 (including zero-config option) |
| Expert Value-Add | Low (just confirmed) | High (provided alternatives) |
| Time to Solution | Blocked (manual step) | Unblocked (expert executed) |
| User Satisfaction | Required manual intervention | Fully autonomous |

### Verification

To verify v1.1 improvements are active:

```bash
# Check RCA agent has Task tool access
grep "tools:" .claude/agents/rca-agent.md
# Expected: tools: Bash, Read, Write, Task

# Check for Multi-Expert Collaboration section
grep "Multi-Expert Collaboration Protocol" .claude/agents/rca-agent.md
# Expected: Match found

# Verify independent analysis template exists
grep "Independent Analysis Template" docs/reference/rca-multi-expert-collaboration.md
# Expected: Match found
```

## Related Patterns

- **PAT-RCA-ROUTE-001** - Domain expert routing map
- **PAT-DB-MIGRATION-001** - Migration script pattern (example of single-domain pattern that led to this protocol)

## Verification

To verify the protocol is working:

```bash
# Check RCA agent has collaboration protocol
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  .from('leo_sub_agents')
  .select('metadata')
  .eq('code', 'RCA')
  .single()
  .then(({data}) => {
    console.log('Multi-expert support:', data?.metadata?.supports_multi_expert);
    console.log('Protocol version:', data?.metadata?.collaboration_protocol_version);
  });
"
```

Expected output:
```
Multi-expert support: true
Protocol version: 1.0
```
