# Stop Hook Sub-Agent Enforcement - Operational Runbook


## Metadata
- **Category**: Deployment
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-30
- **Tags**: database, api, testing, schema

**Document Type**: Operational Runbook
**System**: Claude Code Stop Hook
**Component**: `scripts/hooks/stop-subagent-enforcement.js`
**Owner**: LEO Infrastructure Team
**Last Updated**: 2026-01-21
**Version**: 2.3
**SD**: SD-LEO-INFRA-STOP-HOOK-SUB-001, SD-LEO-REFAC-TESTING-INFRA-001, SD-QF-POST-COMPLETION-VALIDATOR-001, SD-LEO-INFRA-STOP-HOOK-ENHANCEMENT-001

## Overview

The Stop Hook Sub-Agent Enforcement system validates that required sub-agents have been executed for a Strategic Directive before allowing a Claude session to end. This ensures quality gates are enforced across all SD types.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Code Stop Hook                                       │
│  (Triggered when session ends)                              │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ├─> 1. Extract SD from git branch
                 │
                 ├─> 2. Query Supabase for SD details
                 │       ├─ SD type (feature, infrastructure, etc.)
                 │       ├─ Category
                 │       └─ Current phase
                 │
                 ├─> 3. Determine required sub-agents
                 │       ├─ By SD type (REQUIREMENTS.byType)
                 │       ├─ By category (REQUIREMENTS.byCategory)
                 │       └─ Universal (RETRO for near-completion)
                 │
                 ├─> 4. Query sub-agent execution results
                 │       ├─ Check for PASS/CONDITIONAL_PASS verdicts
                 │       ├─ Apply 1-hour cache for recent PASSes
                 │       └─ Validate phase window timing
                 │
                 ├─> 5. Validation outcome
                 │       ├─ All validations passed → Exit 0
                 │       ├─ Missing sub-agents → Exit 2 (block)
                 │       └─ Wrong timing → Exit 2 (block)
                 │
                 └─> 6. Auto-remediation
                         └─ Return JSON with commands to run
```

## Configuration

### Hook Registration

**File**: `.claude/settings.json`

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
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

**Timeout**: 120 seconds (includes database queries and validation)

### Environment Variables

Required in `.env`:
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for database access
- `CLAUDE_PROJECT_DIR`: Project root directory (optional, defaults to `process.cwd()`)

## Sub-Agent Requirements Matrix

### Required vs Recommended Behavior (v2.1)

**As of commit `78a590fbe` (2026-01-21)**:

| Classification | Behavior | Exit Code | User Impact |
|----------------|----------|-----------|-------------|
| **Required** | BLOCKS session end if missing | Exit 2 | Must run before ending session |
| **Recommended** | WARNS but allows session end | Exit 0 | Advisory message with suggestion |

**Example Warning Output** (Recommended missing):
```
⚠️  Sub-Agent Advisory for SD-XXX-001 (refactor)
   Missing recommended: TESTING
   💡 Consider running: node scripts/orchestrate-phase-subagents.js SD-XXX-001 --agents TESTING
   (Not blocking - these are optional but improve quality)
```

### By SD Type

| SD Type | Required Sub-Agents (BLOCK) | Recommended Sub-Agents (WARN) |
|---------|----------------------------|-------------------------------|
| `feature` | TESTING, DESIGN, STORIES | UAT, API |
| `implementation` | TESTING, API | DATABASE |
| `infrastructure` | GITHUB, DOCMON | VALIDATION |
| `database` | DATABASE, SECURITY | REGRESSION |
| `security` | SECURITY, DATABASE | TESTING, RCA |
| `documentation` | DOCMON | VALIDATION |
| `bugfix` | RCA, REGRESSION, TESTING | UAT |
| `refactor` | REGRESSION, VALIDATION | TESTING |
| `performance` | PERFORMANCE, TESTING | REGRESSION |
| `orchestrator` | (none) | RETRO |

### By Category

| Category | Additional Sub-Agents |
|----------|----------------------|
| `Quality Assurance` | TESTING, UAT, VALIDATION |
| `quality` | TESTING, UAT, VALIDATION |
| `testing` | TESTING, UAT |
| `audit` | VALIDATION, RCA |
| `security` | SECURITY, RISK |
| `bug_fix` | RCA, REGRESSION |
| `ux_improvement` | DESIGN, UAT |
| `product_feature` | DESIGN, STORIES, API |
| `database` | DATABASE |
| `database_schema` | DATABASE, SECURITY |

### Universal Requirements

**RETRO** sub-agent is universally required when SD is in one of these phases:
- `PLAN`
- `LEAD`
- `PLAN_VERIFY`
- `LEAD_FINAL`

## Phase Window Timing Rules

Sub-agents must run within designated phase windows:

| Sub-Agent | After Handoff | Before Handoff | Phase Window |
|-----------|---------------|----------------|--------------|
| DESIGN | LEAD-TO-PLAN | PLAN-TO-EXEC | PLAN |
| STORIES | LEAD-TO-PLAN | PLAN-TO-EXEC | PLAN |
| API | LEAD-TO-PLAN | PLAN-TO-EXEC | PLAN |
| DATABASE | LEAD-TO-PLAN | EXEC-TO-PLAN | PLAN/EXEC |
| TESTING | PLAN-TO-EXEC | LEAD-FINAL-APPROVAL | EXEC |
| REGRESSION | PLAN-TO-EXEC | EXEC-TO-PLAN | EXEC |
| PERFORMANCE | PLAN-TO-EXEC | EXEC-TO-PLAN | EXEC |
| SECURITY | (any) | LEAD-FINAL-APPROVAL | ANY |
| UAT | EXEC-TO-PLAN | LEAD-FINAL-APPROVAL | VERIFICATION |
| VALIDATION | (any) | LEAD-FINAL-APPROVAL | ANY |
| RCA | (any) | (any) | EARLY |
| RETRO | PLAN-TO-LEAD | (any) | COMPLETION |
| GITHUB | PLAN-TO-EXEC | LEAD-FINAL-APPROVAL | EXEC |
| DOCMON | (any) | LEAD-FINAL-APPROVAL | ANY |
| RISK | (any) | PLAN-TO-EXEC | EARLY |

**Timing Validation**: The hook checks that at least one PASS verdict exists within the designated phase window based on handoff timestamps.

## Caching Strategy

**Duration**: 1 hour (3600000 ms)

**Logic**:
```javascript
const recentPass = passingExecs.find(e =>
  (Date.now() - new Date(e.created_at).getTime()) < CACHE_DURATION_MS
);

if (recentPass) {
  // Skip validation, use cached result
}
```

**Purpose**: Avoid redundant sub-agent executions when stopping and resuming work on the same SD within an hour.

## Exit Codes

| Exit Code | Meaning | Action |
|-----------|---------|--------|
| `0` | All validations passed | Session ends normally |
| `2` | Blocking: Missing sub-agents | Claude continues session with remediation instructions |

**Note**: Exit code `2` signals to Claude Code that the session should NOT end yet. Claude receives the blocking JSON output and can auto-remediate.

## Bypass Mechanism

### When to Bypass

Use bypass for:
- Emergency hotfixes
- Temporary workarounds
- Situations where sub-agent execution is impossible (e.g., external dependency failure)

### Bypass Process

**Step 1**: Create `.stop-hook-bypass.json` in project root:

```json
{
  "sd_key": "SD-LEO-XXX-001",
  "explanation": "Emergency hotfix for production outage - sub-agent validation deferred to post-incident review",
  "skipped_agents": ["TESTING", "UAT"],
  "retrospective_committed": false,
  "retrospective_id": null
}
```

**Requirements**:
- `explanation`: Minimum 50 characters, must justify bypass
- `skipped_agents`: List of sub-agents being skipped
- `retrospective_committed`: Must be `true` to proceed

**Step 2**: Generate retrospective entry:

```bash
node scripts/generate-retrospective.js --bypass-entry
```

This creates a retrospective entry documenting the bypass decision.

**Step 3**: Update bypass file:

```json
{
  "sd_key": "SD-LEO-XXX-001",
  "explanation": "Emergency hotfix for production outage - sub-agent validation deferred to post-incident review",
  "skipped_agents": ["TESTING", "UAT"],
  "retrospective_committed": true,
  "retrospective_id": "5ef55068..."
}
```

**Step 4**: Retry session end

The hook will:
1. Validate bypass file structure
2. Check `retrospective_committed === true`
3. Log bypass to audit table (`audit_log` with severity `warning`)
4. Delete bypass file
5. Allow session to end (exit 0)

### Bypass Validation Failures

| Error | Resolution |
|-------|------------|
| `explanation` < 50 chars | Provide detailed justification |
| `retrospective_committed !== true` | Run `generate-retrospective.js --bypass-entry` |
| Invalid JSON | Fix JSON syntax |
| Missing required fields | Add `sd_key`, `explanation`, `skipped_agents`, `retrospective_committed` |

## Auto-Remediation

When validation fails, the hook returns JSON with remediation instructions:

```json
{
  "decision": "block",
  "reason": "SD SD-LEO-INFRA-STOP-HOOK-SUB-001 (infrastructure) requires sub-agent validation",
  "details": {
    "sd_key": "SD-LEO-INFRA-STOP-HOOK-SUB-001",
    "sd_type": "infrastructure",
    "category": "infrastructure",
    "current_phase": "EXEC",
    "missing": ["GITHUB", "DOCMON"],
    "wrong_timing": [],
    "cached": 0
  },
  "remediation": {
    "auto_run": true,
    "agents_to_run": ["GITHUB", "DOCMON"],
    "command": "node scripts/orchestrate-phase-subagents.js SD-LEO-INFRA-STOP-HOOK-SUB-001 --agents GITHUB,DOCMON"
  },
  "bypass_instructions": {
    "step1": "Create .stop-hook-bypass.json with explanation (min 50 chars)",
    "step2": "Run: node scripts/generate-retrospective.js --bypass-entry",
    "step3": "Set retrospective_committed: true in bypass file"
  }
}
```

**Remediation Order**: Sub-agents are sorted by execution order (defined in `REMEDIATION_ORDER` constant).

## Monitoring and Observability

### Logs

**Success**:
```
✅ Sub-Agent Enforcement: SD-LEO-XXX-001 passed (2 cached, 3 validated)
```

**Failure**:
```
🔍 Sub-Agent Enforcement for SD-LEO-XXX-001 (feature)
   Phase: EXEC
   Cached: 1 sub-agents
   Missing: TESTING, UAT
```

**Bypass**:
```
⚠️ Bypass allowed for SD-LEO-XXX-001: Emergency hotfix for production outage - sub-agent...
```

### Audit Trail

All bypass events are logged to `audit_log` table:

```sql
SELECT
  event_type,
  severity,
  details->>'sd_key' as sd_key,
  details->>'explanation' as explanation,
  details->>'skipped_agents' as skipped_agents,
  created_at
FROM audit_log
WHERE event_type = 'STOP_HOOK_BYPASS'
ORDER BY created_at DESC;
```

### Metrics

Track these metrics for effectiveness:

1. **Block Rate**: How often does enforcement fire?
   ```sql
   SELECT COUNT(*) FROM sub_agent_execution_results
   WHERE created_at > NOW() - INTERVAL '7 days';
   ```

2. **Bypass Rate**: How often is bypass used?
   ```sql
   SELECT COUNT(*) FROM audit_log
   WHERE event_type = 'STOP_HOOK_BYPASS'
   AND created_at > NOW() - INTERVAL '7 days';
   ```

3. **Cache Hit Rate**: How often does caching avoid redundant execution?
   - Monitor log output for "X cached" counts

## Troubleshooting

### Hook Not Triggering

**Symptom**: Session ends without validation

**Diagnosis**:
1. Check `.claude/settings.json` has Stop hook configured
2. Verify hook script exists at correct path
3. Check file permissions (must be executable on Unix systems)
4. Look for hook errors in Claude Code output

**Resolution**:
```bash
# Verify hook configuration
cat .claude/settings.json | jq '.hooks.Stop'

# Test hook manually
node scripts/hooks/stop-subagent-enforcement.js
```

### Hook Times Out

**Symptom**: Hook exceeds 120s timeout

**Diagnosis**:
1. Check Supabase connectivity
2. Review database query performance
3. Check for large result sets

**Resolution**:
- Increase timeout in `.claude/settings.json`
- Optimize database queries
- Add indexes if needed

### False Positives

**Symptom**: Hook blocks when sub-agents were actually run

**Diagnosis**:
1. Check `sub_agent_execution_results` table for missing entries
2. Verify sub-agent code matches exactly (case-sensitive)
3. Check verdict is `PASS` or `CONDITIONAL_PASS`

**Resolution**:
```bash
# Query sub-agent executions
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('sub_agent_execution_results')
  .select('sub_agent_code, verdict, created_at')
  .eq('sd_id', 'SD-XXX-001')
  .then(({data}) => console.log(JSON.stringify(data, null, 2)));
"
```

### SD Not Detected

**Symptom**: Hook exits 0 immediately (no validation)

**Diagnosis**:
1. Check git branch name matches pattern: `SD-[A-Z]+-(?:[A-Z]+-)*[0-9]+`
2. Verify SD exists in `strategic_directives_v2` table
3. Check SD status is not `completed`

**Resolution**:
```bash
# Test regex pattern
node -e "
const branch = require('child_process').execSync('git rev-parse --abbrev-ref HEAD', {encoding: 'utf-8'}).trim();
const sdMatch = branch.match(/SD-[A-Z]+-(?:[A-Z]+-)*[0-9]+/i);
console.log('Branch:', branch);
console.log('SD Match:', sdMatch ? sdMatch[0] : 'NO MATCH');
"
```

### Wrong Timing Detection

**Symptom**: Hook reports "wrong timing" for sub-agents that ran in correct phase

**Diagnosis**:
1. Check handoff timestamps in `sd_phase_handoffs` table
2. Verify sub-agent execution timestamp falls within phase window
3. Check for clock drift or timezone issues

**Resolution**:
```bash
# Query handoff timestamps
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('sd_phase_handoffs')
  .select('handoff_type, status, created_at')
  .eq('sd_id', 'SD-XXX-001')
  .eq('status', 'accepted')
  .order('created_at', { ascending: true })
  .then(({data}) => console.log(JSON.stringify(data, null, 2)));
"
```

### Post-Completion Validator False Positive (AUTO-PROCEED Blocking)

**Symptom**: Completed SD blocks AUTO-PROCEED with "Missing SHIP" even though PR was merged

**Error Message**:
```
⚠️  Post-Completion Validation for SD-XXX-001
   ❌ BLOCKING: Missing required post-completion commands: SHIP
```

**Root Cause** (fixed in PR #685):
1. SD query in `index.js` did not include `completion_date` field
2. Validator received `sd.completion_date` as `undefined`
3. `git diff main...HEAD` failed after branch merge (branch deleted)
4. Catch block incorrectly assumed SHIP was needed when diff failed

**Diagnosis**:
```bash
# Check if completion_date is set but SD still blocks
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('strategic_directives_v2')
  .select('id, sd_key, status, completion_date, current_phase')
  .eq('sd_key', 'SD-XXX-001')
  .single()
  .then(({data}) => {
    console.log('SD Status:', data.status);
    console.log('Completion Date:', data.completion_date);
    console.log('Current Phase:', data.current_phase);
    console.log('Expected: completion_date should be set if status is completed');
  });
"

# Check if branch still exists (may cause false positive if deleted)
git branch -a | grep SD-XXX-001
```

**Resolution** (fixed in commit `025855807`):
1. Added `completion_date` to SD select query (`index.js:178`)
2. Changed catch block to log info instead of blocking when `git diff` fails
3. Validator now correctly identifies completed SDs even after branch deletion

**Verification**:
```bash
# Verify fix is in place
grep "completion_date" scripts/hooks/stop-subagent-enforcement/index.js

# Expected output:
# .select('id, sd_key, sd_key, title, sd_type, category, current_phase, status, completion_date')
```

**Workaround** (if running older version):
- Ensure branch exists when session ends
- Or manually set bypass file with retrospective committed

**Related**:
- **PR**: #685 - fix(stop-hook): resolve post-completion validator false positive blocking AUTO-PROCEED
- **Commit**: `025855807`
- **Files Modified**: `scripts/hooks/stop-subagent-enforcement/index.js`, `scripts/hooks/stop-subagent-enforcement/post-completion-validator.js`

## Maintenance

### Updating Requirements Matrix

To change which sub-agents are required for an SD type:

1. Edit `scripts/hooks/stop-subagent-enforcement.js`
2. Update `REQUIREMENTS.byType` or `REQUIREMENTS.byCategory`
3. Commit changes
4. Update this documentation

### Adding New Sub-Agents

When adding a new sub-agent to the system:

1. Add to appropriate sections in `REQUIREMENTS`
2. Add timing rules to `TIMING_RULES` if phase-specific
3. Add to `REMEDIATION_ORDER` for proper sequencing
4. Update this documentation

### Disabling Hook (Emergency)

If the hook is causing widespread issues:

```bash
# Temporary disable (remove from settings.json)
node -e "
const fs = require('fs');
const settings = JSON.parse(fs.readFileSync('.claude/settings.json', 'utf-8'));
settings.hooks.Stop = settings.hooks.Stop.filter(h =>
  !h.hooks.some(hook => hook.command.includes('stop-subagent-enforcement'))
);
fs.writeFileSync('.claude/settings.json', JSON.stringify(settings, null, 2));
console.log('Hook disabled');
"

# Or use environment variable bypass
LEO_SKIP_HOOKS=1 claude-code
```

## Related Documentation

- **Design Document**: `docs/drafts/STOP-HOOK-SUBAGENT-ENFORCEMENT-DRAFT.md`
- **Triangulation Synthesis**: `docs/research/triangulation-stop-hook-synthesis.md`
- **Protocol Amendment**: `docs/03_protocols_and_standards/LEO_v4.3_subagent_enforcement.md`
- **Hook Reference**: `docs/reference/claude-code-hooks.md` (general hook documentation)
- **Sub-Agent Guide**: `docs/reference/sub-agent-execution.md`

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.3 | 2026-01-30 | Added cross-session AUTO-PROCEED continuation (SD-LEO-INFRA-STOP-HOOK-ENHANCEMENT-001, PR #694) - Exit code 3 signaling, continuation state, external loop runner |
| 2.2 | 2026-01-29 | Added troubleshooting for post-completion validator false positive (PR #685) |
| 1.0 | 2026-01-21 | Initial operational runbook for SD-LEO-INFRA-STOP-HOOK-SUB-001 |

---

**Document Status**: ✅ Active
**Review Cycle**: Quarterly
**Next Review**: 2026-04-21
