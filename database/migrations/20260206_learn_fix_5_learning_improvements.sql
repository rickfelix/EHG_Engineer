-- SD-LEARN-FIX-LEARNING-IMPROVEMENT-003
-- Address 5 Learning Improvements from /learn system
-- Database-only changes: leo_protocol_sections + protocol_improvement_queue status updates
-- No application code changes required

-- ============================================================
-- IMPROVEMENT 1: Gate Exemption Visibility for LEAD Approval
-- PIQ: 855d50d0-8441-414c-93aa-54b07ce0bb47
-- Evidence: SD-NAV-ADMIN-001 did not leverage OPTIONAL gates until late in process
-- ============================================================
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata, priority)
VALUES (
  'leo-v4-3-3-ui-parity',
  'gate_exemption_visibility',
  'Gate Exemption Visibility During LEAD Approval',
  '## Gate Exemption Visibility During LEAD Approval

### Problem
Bugfix, orchestrator, infrastructure, and documentation SDs have gate exemptions that reduce required validation. However, these exemptions are not prominently displayed during LEAD approval, causing reviewers to plan for validation steps that will be skipped.

### Gate Exemptions by SD Type
| SD Type | Exempted Gates | Exempted Sub-Agents | Threshold |
|---------|---------------|---------------------|-----------|
| `bugfix` | E2E (optional) | DESIGN (optional) | 85% |
| `infrastructure` | TESTING, GITHUB, E2E, Gates 3&4 | TESTING, GITHUB | 80% |
| `documentation` | TESTING, GITHUB, E2E, Gates 3&4 | TESTING, GITHUB | 60% |
| `orchestrator` | USER_STORY | Coordinates children | 70% |
| `feature` | None | None | 85% |
| `security` | None | None | 90% |

### What LEAD Should Verify
When approving an SD with exemptions:
1. **Confirm SD type is correct** - Wrong type means wrong exemptions
2. **Verify exemptions are appropriate** - Does the SD truly need reduced validation?
3. **Check if scope warrants upgrade** - Infrastructure SD with code changes should be `feature`

### Workflow Impact
```
LEAD sees: "infrastructure SD → 4 handoffs, 80% threshold"
Instead of: Assuming 5 handoffs, 85% threshold and getting surprised later
```

### Reference
- SD Type Profiles: `scripts/orchestrator-preflight.js`
- Gate Configuration: `scripts/modules/handoff/validators/`
- Workflow Paths: CLAUDE_CORE_DIGEST.md → SD Type Validation',
  805,
  '{"source_piq": "855d50d0-8441-414c-93aa-54b07ce0bb47", "sd_id": "SD-LEARN-FIX-LEARNING-IMPROVEMENT-003", "affected_phase": "LEAD"}',
  'STANDARD'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- IMPROVEMENT 2: Retroactive LEO Protocol Compliance Procedure
-- PIQ: 7f69132a-84d3-4117-96ae-4347f0682e94
-- Evidence: No clear path existed for completing protocol after implementation
-- ============================================================
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata, priority)
VALUES (
  'leo-v4-3-3-ui-parity',
  'retroactive_compliance_procedure',
  'Retroactive LEO Protocol Compliance Procedure',
  '## Retroactive LEO Protocol Compliance Procedure

### When This Applies
Code was shipped to main without completing the full LEO Protocol workflow. The SD exists in the database but is missing handoffs, PRD, or retrospective.

### Recovery Steps

#### Step 1: Assess Current State
```bash
# Check SD status and handoff history
node scripts/get-working-on-sd.js
node -e "..." # Query sd_phase_handoffs for existing handoffs
```

#### Step 2: Create Missing Artifacts (in order)
| Missing Artifact | Recovery Action | Command |
|-----------------|----------------|---------|
| LEAD-TO-PLAN handoff | Run retroactive LEAD approval | `node scripts/handoff.js execute LEAD-TO-PLAN <SD-ID>` |
| PRD | Create PRD from existing implementation | `node scripts/add-prd-to-database.js <SD-ID>` |
| PLAN-TO-EXEC handoff | Run with implementation context | `node scripts/handoff.js execute PLAN-TO-EXEC <SD-ID>` |
| PLAN-TO-LEAD handoff | Run completion handoff | `node scripts/handoff.js execute PLAN-TO-LEAD <SD-ID>` |
| Retrospective | Create retrospective | Use retro-agent sub-agent |
| LEAD-FINAL-APPROVAL | Final approval | `node scripts/handoff.js execute LEAD-FINAL-APPROVAL <SD-ID>` |

#### Step 3: Document the Recovery
Include in the retrospective:
- Why protocol was bypassed
- What artifacts were missing
- Recovery time investment
- Prevention recommendations

### Prevention
- Gate 0 pre-commit hook blocks commits for draft SDs
- `verify-sd-phase.js` validates phase before implementation
- GitHub Actions PR check validates protocol compliance

### Key Rule
**Retroactive compliance takes longer than doing it right the first time.** The protocol exists to front-load quality, not create busywork.',
  806,
  '{"source_piq": "7f69132a-84d3-4117-96ae-4347f0682e94", "sd_id": "SD-LEARN-FIX-LEARNING-IMPROVEMENT-003", "affected_phase": "ALL"}',
  'STANDARD'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- IMPROVEMENT 3: Jest ESM Testing Patterns Guide
-- PIQ: 30c09b22-9049-4491-9cd7-a20afa0c564d
-- Evidence: Mock fs/promises caused test failures, required refactor to actual filesystem
-- ============================================================
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata, priority)
VALUES (
  'leo-v4-3-3-ui-parity',
  'jest_esm_testing_patterns',
  'Jest ESM Testing Patterns Guide',
  '## Jest ESM Testing Patterns Guide

### Problem
ESM (ES Modules) with `import`/`export` syntax requires specific Jest configuration. Mocking ESM modules (especially Node built-ins like `fs/promises`) is unreliable and causes hard-to-debug test failures.

### Recommended Approach: Filesystem Over Mocking

| Approach | Pros | Cons | When to Use |
|----------|------|------|-------------|
| **Actual filesystem** (temp dirs) | Reliable, tests real behavior | Slightly slower, needs cleanup | File I/O operations |
| **Jest mocks** (`jest.mock`) | Fast, isolated | Brittle with ESM, breaks on refactor | Pure function logic |
| **Manual mocks** (`__mocks__/`) | Persistent, shared | Must maintain separately | Cross-test shared mocks |

### Filesystem Testing Pattern (Recommended)
```javascript
import { mkdtemp, writeFile, readFile, rm } from ''fs/promises'';
import { join } from ''path'';
import { tmpdir } from ''os'';

describe(''FileOperations'', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), ''test-''));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test(''writes and reads file correctly'', async () => {
    const filePath = join(tempDir, ''test.json'');
    await writeFile(filePath, JSON.stringify({ key: ''value'' }));
    const content = JSON.parse(await readFile(filePath, ''utf8''));
    expect(content.key).toBe(''value'');
  });
});
```

### ESM Jest Configuration
```javascript
// jest.config.js
export default {
  transform: {},
  extensionsToTreatAsEsm: [''.ts''],
  testMatch: [''**/*.test.mjs'', ''**/*.test.js''],
  // For ESM: use --experimental-vm-modules
  // NODE_OPTIONS=--experimental-vm-modules npx jest
};
```

### Common Pitfalls
| Pitfall | Symptom | Fix |
|---------|---------|-----|
| `jest.mock()` with ESM | `SyntaxError: Cannot use import` | Use filesystem approach instead |
| Missing cleanup | Tests pass individually, fail together | Always `rm` temp dirs in `afterEach` |
| Hardcoded paths | Tests fail on CI/different OS | Use `tmpdir()` and `join()` |
| Sync file ops in async tests | Race conditions | Always use `fs/promises` |

### Reference
- Incident: auto-proceed-state tests required full refactor from mocking to filesystem
- Impact: 20-30 minutes saved per SD using ESM + filesystem operations',
  807,
  '{"source_piq": "30c09b22-9049-4491-9cd7-a20afa0c564d", "sd_id": "SD-LEARN-FIX-LEARNING-IMPROVEMENT-003", "affected_phase": "EXEC"}',
  'STANDARD'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- IMPROVEMENT 4: Branch Auto-Checkout in PLAN-TO-EXEC
-- PIQ: 41290099-bac7-4fca-93c8-420c80a988a3
-- Evidence: git branch command creates but does not checkout
-- ============================================================
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata, priority)
VALUES (
  'leo-v4-3-3-ui-parity',
  'branch_auto_checkout_guidance',
  'Branch Auto-Checkout After Creation in PLAN-TO-EXEC',
  '## Branch Auto-Checkout After Creation in PLAN-TO-EXEC

### Problem
The PLAN-TO-EXEC handoff creates a feature branch using `git branch <name>`, but does NOT automatically check out to that branch. The developer remains on `main` and may accidentally commit directly to main.

### Expected Behavior
After PLAN-TO-EXEC completes:
1. Feature branch is created
2. Working directory is switched to the feature branch
3. All subsequent commits go to the feature branch

### Current Behavior
After PLAN-TO-EXEC completes:
1. Feature branch is created
2. Working directory STAYS on main
3. Developer must manually run `git checkout <branch>`

### Workaround (Until Fixed)
After running PLAN-TO-EXEC, always check your branch:
```bash
# Verify current branch
git branch --show-current

# If still on main, switch to feature branch
git checkout fix/SD-XXX-description
```

### Branch Naming Convention
```
<type>/SD-<KEY>-<short-description>
```
Examples:
- `fix/SD-LEARN-FIX-001-address-improvements`
- `feat/SD-FEATURE-002-add-dashboard`
- `infra/SD-INFRA-003-update-pipeline`

### Prevention
- Always verify branch after PLAN-TO-EXEC before committing
- The handoff output shows the created branch name
- Use `git branch --show-current` as a quick check

### Reference
- Branch creation: `scripts/modules/handoff/executors/plan-to-exec/`
- Branch enforcement gate: GATE6_BRANCH_ENFORCEMENT
- Root cause: `git branch` creates without checkout, should use `git checkout -b`',
  808,
  '{"source_piq": "41290099-bac7-4fca-93c8-420c80a988a3", "sd_id": "SD-LEARN-FIX-LEARNING-IMPROVEMENT-003", "affected_phase": "PLAN"}',
  'STANDARD'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- IMPROVEMENT 5: PRD Grounding Validation Guidance
-- PIQ: 9edb4d56-128d-40e8-a670-1da2e67473da
-- Evidence: Grounding validator successfully detects context-inappropriate requirements
-- ============================================================
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata, priority)
VALUES (
  'leo-v4-3-3-ui-parity',
  'prd_grounding_validation_guidance',
  'PRD Grounding Validation as Mandatory Pipeline Step',
  '## PRD Grounding Validation as Mandatory Pipeline Step

### What is Grounding Validation?
Grounding validation checks that LLM-generated PRD content is anchored to the actual SD scope and codebase reality. It detects when the LLM has drifted into generating requirements that sound plausible but are not relevant to the specific SD.

### Why It Matters
LLMs can generate highly convincing but contextually inappropriate requirements. For example:
- An infrastructure SD getting UI component requirements
- A database migration SD getting frontend testing requirements
- A documentation SD getting API endpoint requirements

### How It Works
The grounding validator (`scripts/prd/grounding-validator.js`) performs:

1. **Scope Alignment Check**: Does each requirement relate to the SD''s stated scope?
2. **Codebase Reality Check**: Do referenced files, functions, and patterns actually exist?
3. **SD Type Consistency**: Are requirements appropriate for the SD type?
4. **Confidence Scoring**: Each requirement gets a grounding confidence score (0-100%)

### Integration Point
Grounding validation runs AFTER LLM content generation and BEFORE database insertion:
```
LLM generates PRD → Grounding Validator → Filtered PRD → Database Insert
```

### What Gets Flagged
| Issue | Example | Action |
|-------|---------|--------|
| Wrong SD type requirements | UI tests for infrastructure SD | Remove requirement |
| Non-existent file references | `src/components/Widget.tsx` when file doesn''t exist | Flag for correction |
| Scope drift | Feature requirements in a bugfix SD | Remove or flag |
| Duplicate of existing | Requirement already implemented | Remove with evidence |

### Configuration
- **Threshold**: Requirements below 30% grounding confidence are removed
- **Warning**: Requirements between 30-60% are flagged for manual review
- **Pass**: Requirements above 60% are included in PRD

### Reference
- Validator: `scripts/prd/grounding-validator.js`
- Integration: `scripts/prd/index.js` (Phase 3: LLM content generation)
- Evidence: LLM scope drift detected in multiple PRD generations',
  809,
  '{"source_piq": "9edb4d56-128d-40e8-a670-1da2e67473da", "sd_id": "SD-LEARN-FIX-LEARNING-IMPROVEMENT-003", "affected_phase": "PLAN"}',
  'STANDARD'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- UPDATE PIQ STATUS: Mark all 5 items as APPLIED
-- ============================================================
UPDATE protocol_improvement_queue
SET
  status = 'APPLIED',
  applied_at = NOW(),
  reviewed_at = NOW(),
  reviewed_by = 'SD-LEARN-FIX-LEARNING-IMPROVEMENT-003',
  assigned_sd_id = 'SD-LEARN-FIX-LEARNING-IMPROVEMENT-003',
  dry_run_diff = '{"action": "INSERT 5 rows into leo_protocol_sections", "order_index_range": "805-809", "migration": "20260206_learn_fix_5_learning_improvements.sql"}'::jsonb,
  dry_run_at = NOW()
WHERE id IN (
  '855d50d0-8441-414c-93aa-54b07ce0bb47',  -- Gate exemption visibility
  '7f69132a-84d3-4117-96ae-4347f0682e94',  -- Retroactive compliance
  '30c09b22-9049-4491-9cd7-a20afa0c564d',  -- Jest ESM testing
  '41290099-bac7-4fca-93c8-420c80a988a3',  -- Branch auto-checkout
  '9edb4d56-128d-40e8-a670-1da2e67473da'   -- PRD grounding validation
);

-- ============================================================
-- VERIFICATION
-- ============================================================
SELECT 'Protocol sections inserted' AS step, count(*) AS count
FROM leo_protocol_sections
WHERE metadata::text LIKE '%SD-LEARN-FIX-LEARNING-IMPROVEMENT-003%';

SELECT 'PIQ items marked APPLIED' AS step, count(*) AS count
FROM protocol_improvement_queue
WHERE assigned_sd_id = 'SD-LEARN-FIX-LEARNING-IMPROVEMENT-003'
  AND status = 'APPLIED';
