<!-- file_content_hash: 50b719e3dfd22cb5 -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_LEAD_MANUAL.md — LEAD Manual (reference companion)

**Generated**: 2026-09-11 6:54:28 AM
**Protocol**: LEO 4.4.1
**Purpose**: Long-form LEAD reference — the Q9 strategic-validation rubric, parent/child SD governance, multi-track parallel execution, directive submission review
**Load when**: At the MOMENT OF DOING one of these procedures — not at every LEAD phase entry

> This companion carries REFERENCE AND PROCEDURE. Every RULE and PROHIBITION that governs LEAD stays in CLAUDE_LEAD.md and is in force whether or not this file is read. If you are ever unsure whether something belongs here, it belongs in CLAUDE_LEAD.md — this file exists to make that file readable, not to relieve it of anything that binds.

---

## Common SD Creation Errors and Solutions

### Database Constraint Errors

#### Error: `null value in column "sd_key" violates not-null constraint`

**Cause**: Missing `sd_key` field when creating SD
**Solution**:
```javascript
const sd = {
  id: 'SD-XXX-001',
  sd_key: 'SD-XXX-001',  // MUST be present and match id format
  // ... other fields
};
```
**Reference**: `docs/database/strategic_directives_v2_field_reference.md` line 20

#### Error: `duplicate key value violates unique constraint`

**Cause**: SD with that id or sd_key already exists
**Solution**: Use UPDATE instead of INSERT, or choose a different ID
```javascript
// Check if exists first
const { data: existing } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', 'SD-XXX-001')
  .single();

if (existing) {
  // Update existing
  await supabase.from('strategic_directives_v2').update(sd).eq('id', 'SD-XXX-001');
} else {
  // Insert new
  await supabase.from('strategic_directives_v2').insert(sd);
}
```

#### Error: `invalid input syntax for type json`

**Cause**: Invalid JSON in `metadata`, `success_criteria`, or other JSONB fields
**Solution**: Ensure JSONB fields are valid JSON objects/arrays, not strings
> Why: JSONB fields are validated at insert time by PostgreSQL — a malformed string does not become an error until a downstream read fails silently. Supabase type inference will not catch a plain string where an object is expected, so the error surfaces during gate evaluation rather than at creation.

### Handoff Validation Errors

#### Error: `ERR_NO_PRD` during PLAN-TO-EXEC

**Cause**: No PRD found for SD
**Solution**: Create PRD before executing handoff
```bash
node scripts/add-prd-to-database.js --sd-id SD-XXX-001 --title "PRD Title"
```
**Reference**: CLAUDE_EXEC.md line 84

#### Error: `ERR_CHAIN_INCOMPLETE` during handoff

**Cause**: Missing prerequisite handoff in chain
**Solution**: Complete the missing prerequisite handoff first

| Handoff | Requires First |
|---------|---------------|
| PLAN-TO-EXEC | LEAD-TO-PLAN |
| EXEC-TO-PLAN | PLAN-TO-EXEC |
| PLAN-TO-LEAD | EXEC-TO-PLAN |
| LEAD-FINAL | PLAN-TO-LEAD |

#### Error: `ERR_TESTING_REQUIRED` during EXEC-TO-PLAN

**Cause**: TESTING sub-agent must run before EXEC-TO-PLAN for feature/bugfix SDs
**Solution**: Run TESTING sub-agent first
```
Task(subagent_type="testing-agent", prompt="Execute TESTING validation for SD-XXX-001")
```

### SD Type Errors

#### Error: SD blocked by TESTING validation but no code changes

**Cause**: `sd_type` not set correctly for documentation-only SD
**Solution**: Set `sd_type = 'documentation'` to skip code validation
```sql
UPDATE strategic_directives_v2 SET sd_type = 'documentation' WHERE sd_key = 'SD-XXX-001';
```
**Evidence**: SD-TECH-DEBT-DOCS-001 was blocked until sd_type was set correctly

#### Error: Refactor SD missing intensity level

**Cause**: Refactor SDs require `intensity_level` field
**Solution**: Set intensity level before LEAD approval
```sql
UPDATE strategic_directives_v2
SET intensity_level = 'structural'  -- cosmetic, structural, or architectural
WHERE sd_key = 'SD-REFACTOR-001';
```

### Branch and Git Errors

#### Error: `Branch is stale (>7 days)`

**Cause**: Feature branch has diverged from main for too long
**Solution**: Sync with main before handoff
```bash
git fetch origin main
git merge origin/main --no-edit
```

#### Error: Multiple SDs detected on branch

**Cause**: Branch contains commits from multiple SDs
**Solution**: Create separate branches for each SD

### Quick Diagnostic Commands

```bash
# Check SD exists and get status
node -e "require('dotenv').config(); const {createClient}=require('@supabase/supabase-js'); createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY).from('strategic_directives_v2').select('id,sd_key,status,sd_type').eq('sd_key','SD-XXX-001').single().then(r=>console.log(r.data||r.error));"

# Check handoff chain
node scripts/handoff.js list SD-XXX-001

# Validate before handoff (find all issues)
node scripts/handoff.js precheck PLAN-TO-EXEC SD-XXX-001
```


### SDKeyGenerator Errors (SD-LEO-SDKEY-001)

#### Error: `Invalid SD type` or `new value for domain sd_type violates check constraint`

**Cause**: Using user-friendly type names that don't match database constraint
**Solution**: SDKeyGenerator automatically maps user types to valid database types:
```javascript
// User-friendly types → Database types
fix, bugfix → bugfix
feature, feat → feature
enhancement → feature
refactor, refactoring → refactor
infrastructure, infra → infrastructure
documentation, docs → documentation
testing, test → testing
security → security
```

**Reference**: `scripts/modules/sd-key-generator.js` line 45-60

#### Error: `SD key collision detected` or duplicate key in different format

**Cause**: Proposed SD key matches existing SD in either `sd_key` OR `id` column
**Solution**: SDKeyGenerator checks BOTH columns automatically:
```javascript
// Checks both columns
const { data: existing } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key')
  .or(`sd_key.eq.${proposedKey},id.eq.${proposedKey}`);
```
If collision detected, sequential number auto-increments (001 → 002 → 003).

**Reference**: `scripts/modules/sd-key-generator.js` keyExists() function

#### Error: Semantic extraction produces unclear abbreviations

**Cause**: Title contains many small words or acronyms
**Solution**: SDKeyGenerator extracts 2-3 meaningful words, skipping common words:
```javascript
// "Fix navigation route not working" → "NAV-ROUTE"
// "Add user authentication feature" → "USER-AUTH"
// Skips: the, a, an, and, or, but, to, from, with, of, for, in, on, at
```

**Manual override available**:
```javascript
await generateSDKey({
  source: 'UAT',
  type: 'bugfix',
  title: 'Fix navigation route not working',
  semanticOverride: 'NAV-FIX'  // Force specific semantic
});
```

**Reference**: `scripts/modules/sd-key-generator.js` extractSemanticWords() function

#### Error: Child SD key format incorrect (e.g., `SD-UAT-FIX-NAV-001-A` vs `SD-UAT-FIX-NAV-001A`)

**Cause**: Manual child key creation without using SDKeyGenerator hierarchy functions
**Solution**: Use SDKeyGenerator hierarchy functions for consistent encoding:
```javascript
// Root SD
const rootKey = await generateSDKey({...}); // SD-UAT-FIX-NAV-001

// Child (no hyphen before suffix)
const childKey = generateChildKey(rootKey, 'A'); // SD-UAT-FIX-NAV-001A

// Grandchild (hyphen before numeric suffix)
const grandchildKey = generateGrandchildKey(childKey, '1'); // SD-UAT-FIX-NAV-001A-1

// Great-grandchild (dot separator)
const greatGrandchildKey = generateGreatGrandchildKey(grandchildKey, '1'); // SD-UAT-FIX-NAV-001A-1.1
```

**Hierarchy encoding rules**:
- Root: `SD-SOURCE-TYPE-SEMANTIC-NUM`
- Child: Append letter (no hyphen): `-NUMA`
- Grandchild: Add hyphen + number: `-NUMA-1`
- Great-grandchild: Add dot + number: `-NUMA-1.1`

**Reference**: `docs/reference/sd-key-generator-guide.md` Hierarchy Support section

#### Error: Sequential numbering gaps (e.g., 001, 002, 005)

**Cause**: Deleted SDs or manual key creation creating gaps
**Solution**: SDKeyGenerator automatically finds next available number:
```javascript
// If SD-UAT-FIX-NAV-001 and SD-UAT-FIX-NAV-003 exist
// Next key will be SD-UAT-FIX-NAV-002 (fills gap)
// Then SD-UAT-FIX-NAV-004 (next sequential)
```

**Reference**: `scripts/modules/sd-key-generator.js` getNextSequentialNumber() function

### Using /leo create Command

#### Recommended: Unified SD creation interface (SD-LEO-SDKEY-001)

Instead of manually calling SDKeyGenerator or legacy scripts, use `/leo create`:

```bash
# Interactive mode - Prompts for all fields
/leo create

# From UAT finding
/leo create --from-uat <test-id>

# From /learn pattern
/leo create --from-learn <pattern-id>

# From /inbox feedback
/leo create --from-feedback <feedback-id>

# Create child SD
/leo create --child SD-UAT-FIX-NAV-001 A
```

**Features**:
- Automatic source detection (UAT, LEARN, FEEDBACK, etc.)
- Type mapping to valid database constraints
- Collision detection across both `sd_key` and `id` columns
- Sequential numbering with gap detection
- Hierarchy support (4 levels)

**Reference**: `docs/reference/npm-scripts-guide.md` line 121-148, `docs/reference/sd-key-generator-guide.md`

#### Migration from legacy scripts

If you have code using old SD creation patterns, migrate to SDKeyGenerator:

```javascript
// OLD (manual key generation)
const sdKey = `SD-${source}-${type.toUpperCase()}-${semantic}-001`;

// NEW (SDKeyGenerator)
import { generateSDKey } from './modules/sd-key-generator.js';
const sdKey = await generateSDKey({ source, type, title });
```

**Migrated scripts**:
1. `scripts/uat-to-strategic-directive-ai.js`
2. `scripts/sd-from-feedback.js`
3. `scripts/pattern-alert-sd-creator.js`
4. `scripts/create-sd.js`
5. `scripts/modules/learning/executor.js`


## 🎯 Strategic Validation Question 9: Human-Verifiable Outcome

## Strategic Validation Question 9: Human-Verifiable Outcome

**Added in LEO v4.4.0** - Part of LEAD Pre-Approval Gate

### The Question
> "Describe the 30-second demo that proves this SD delivered value."
> Why: If you cannot describe a demo, the SD is defining behavior at the wrong layer of abstraction — observable by engineers but not by users. The 30-second demo forces the SD to ground out in user-visible value rather than internal correctness.

If you cannot answer this question concretely, the SD is too vague to approve.

### Evaluation Criteria

| Rating | Criteria |
|--------|----------|
| ✅ YES | SD has concrete `smoke_test_steps` with user-observable outcomes |
| ⚠️ PARTIAL | Some verification steps exist but are too technical or vague |
| ❌ NO | No smoke test steps defined, or all criteria are technical-only |

### Required Format: smoke_test_steps

Feature SDs MUST include `smoke_test_steps` JSONB array:

```json
[
  {"step_number": 1, "instruction": "Navigate to /dashboard", "expected_outcome": "Dashboard loads with venture list visible"},
  {"step_number": 2, "instruction": "Click Create Venture button", "expected_outcome": "New venture form appears"},
  {"step_number": 3, "instruction": "Fill form and click Save", "expected_outcome": "Success toast + venture appears in list"}
]
```

### LEAD Agent Actions

**If YES**: Proceed with approval
**If PARTIAL**:
- Require concrete user-observable outcomes
- Reject technical-only criteria ("API returns 200", "data in database")

**If NO**:
- **BLOCK approval** until `smoke_test_steps` is populated
> Why: `smoke_test_steps` is the contract between PLAN and EXEC. Without it, EXEC has no acceptance criteria and the AIQualityEvaluator caps scores at 70% — gates will fail and the SD will be sent back for rework anyway.
- Prompt: "What will a user SEE that proves this works?"

### SD Type Exemptions

| SD Type | Requires Q9? | Reason |
|---------|--------------|--------|
| feature | ✅ YES | User-facing, must be verifiable |
| bugfix | ✅ YES | Fix must be observable |
| security | ⚠️ API test | Verify auth/authz works |
| database | ⚠️ API test | Verify data flows correctly |
| infrastructure | ⚠️ CONDITIONAL | REQUIRED if SD produces code (see below); exempt for pure protocol/policy changes |
| documentation | ❌ NO | No runtime behavior |
| refactor | ❌ NO | Behavior unchanged by definition |

**Code-producing infrastructure SDs require `smoke_test_steps`** (SD-LEO-INFRA-ENFORCE-EXECUTION-SMOKE-001). The gate auto-detects code production by scanning `scope`, `key_changes`, and `title` for:
- Code file references: `.js`, `.ts`, `.cjs`, `.mjs`, `.jsx`, `.tsx`, `.py`, `.sh`, `.ps1`, `.bash`
- Code-production keywords: `script`, `utility`, `function`, `module`, `handler`, `gate`, `validator`, `middleware`, `endpoint`, `api`, `worker`, `plugin`, `hook`, `adapter`, `factory`, `engine`, `executor`, `runner`

If any match, the LEAD-TO-PLAN preflight will block with `SMOKE_TEST_MISSING`. Plain config/doc/protocol infrastructure SDs (e.g. "update CLAUDE.md", "add environment variable") are exempt. Detection logic: `scripts/modules/handoff/validation/sd-type-applicability-policy.js::detectCodeProduction`.

### Integration with Validation Gates

This question is ENFORCED by:
1. **LeadToPlanExecutor** - `SMOKE_TEST_SPECIFICATION` gate blocks without steps
2. **ExecToPlanExecutor** - `HUMAN_VERIFICATION_GATE` validates execution
3. **AIQualityEvaluator** - Caps scores at 70% if no human-verifiable outcomes
4. **UserStoryQualityRubric** - Caps at 6/10 for technical-only acceptance criteria

## Parent-Child SD Phase Governance

## Parent-Child SD Phase Governance (PAT-PARENT-CHILD-001)

### Overview

When a parent SD delegates work to child SDs, specific phase transition rules apply.

**Critical Rule**: Parent SDs MUST be in EXEC phase before child SDs can be activated.

### The Problem

Database trigger `enforce_sd_phase_transition_rules` enforces:
- Child SD cannot be activated while parent is in PLAN phase
- Parent must be in EXEC phase first

**Error Message**: "LEO Protocol: Child SD cannot be activated while parent is in PLAN phase. Parent must be in EXEC phase first."

### Why This Happens

Typical workflow:
1. Parent SD completes v1 implementation
2. Parent transitions to PLAN phase (waiting for v2 work from children)
3. Child SDs need to activate to do v2 work
4. **BLOCKED**: Trigger prevents child activation because parent is in PLAN

### Resolution Steps

**Option 1: Manual Phase Transition**

```sql
-- Step 1: Insert handoff record
INSERT INTO sd_handoffs (sd_id, direction, from_agent, to_agent, summary, created_by)
VALUES (
  '<PARENT_SD_UUID>',
  'PLAN_TO_EXEC',
  'PLAN',
  'EXEC',
  'Re-activating parent SD to allow child SD execution',
  'SYSTEM'
);

-- Step 2: Update parent phase
UPDATE strategic_directives_v2
SET phase = 'EXEC', status = 'in_progress'
WHERE id = '<PARENT_SD_UUID>';
```

**Option 2: Use sd:start (Recommended)**

```bash
npm run sd:start <PARENT_SD_KEY>
```

### Best Practices

1. **Plan for re-activation**: When parent delegates to children, document that parent will need to return to EXEC
2. **Use parent-child SD pattern intentionally**: Understand the phase governance before creating child SDs
3. **Document in PRD**: Note parent-child relationships and phase transition requirements
4. **Check before activation**: Query parent phase before attempting child activation

### Recommended Improvements

1. Update trigger error messages to include resolution steps
2. Use `npm run sd:start` to reactivate parent SDs
3. Add database function for safe parent re-activation
4. Update handoff.js for parent-child handling

### Related Patterns

- SD Hierarchy documentation
- Phase transition rules
- Database trigger governance

## Multi-Track Parallel Execution

### Track System Overview

The LEO Protocol organizes SDs into tracks designed for **parallel execution across multiple Claude Code instances**:

| Track | Focus Area | Can Run In Parallel With |
|-------|-----------|-------------------------|
| **A: Infrastructure** | Core systems, safety, EVA | B, C |
| **B: Features** | User-facing stages, product | A, C |
| **C: Quality** | Testing, verification, gates | A, B |
| **STANDALONE** | No dependencies | Any track |

### How To Present SD Options

When presenting READY SDs to the user, **always clarify parallel execution options**:

```
**For this session**, I recommend SD-XXX (Track A, rank #1).

**For parallel throughput**, you could also start additional Claude Code instances:
- Track B: SD-YYY (Features)  
- Track C: SD-ZZZ (Quality)

Tracks are designed to work simultaneously without file conflicts.
Would you like to proceed with just Track A, or start multiple instances?
```

### Conflict Prevention

Before recommending parallel work:
1. Check `sd_conflict_matrix` for file/component overlap
2. SDs touching the same files should NOT run in parallel
3. Use `npm run sd:next` to see track assignments

### Single vs Multi-Instance Decision

| Scenario | Recommendation |
|----------|---------------|
| User has one Claude Code session | Pick highest-ranked READY SD |
| User asks about multiple SDs | Explain parallel track option |
| User has limited time | Focus on single highest-impact SD |
| User wants maximum throughput | Suggest 2-3 parallel instances by track |

### Commands Reference

```bash
npm run sd:next      # Shows all tracks with READY SDs
npm run sd:status    # Overall progress by track
```


---

*Generated from database: 2026-09-11*
*Protocol Version: 4.4.1*
*Source of truth: leo_protocol_sections (section_type=parent_child_sd_governance, multi_track_parallel_execution, lead_strategic_validation_q9, sd_creation_errors). Do not hand-edit — edit the DB section and regenerate.*
