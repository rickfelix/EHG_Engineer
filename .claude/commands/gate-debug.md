---
description: "Debug gate failures during handoff execution. Use when a handoff fails, gates return low scores, or you need to diagnose validation issues."
---

<!-- GENERATED: hash=b9def34bff1b timestamp=2026-04-03T13:56:55.655Z sections=6 -->

# Gate Debug — Diagnose Failures, Inspect Fields, Retry

**Purpose**: Systematic gate failure diagnosis and resolution.
This skill encodes the exact steps for understanding why a handoff gate failed,
inspecting the relevant database fields, and retrying correctly.

## Quick Reference
```bash
# See ALL gate failures at once (run this FIRST)
node scripts/handoff.js precheck <PHASE> <SD-ID>

# Re-run a specific handoff after fixing
node scripts/handoff.js execute <PHASE> <SD-ID>
```

## Diagnosis Protocol

### MANDATORY: Phase Transition Commands (BLOCKING)

## MANDATORY: Phase Transition Commands (BLOCKING)

**Anti-Bypass Protocol**: These commands MUST be run for ALL phase transitions.

### Required Commands

**Pre-flight Batch Validation (RECOMMENDED)**:
```bash
node scripts/handoff.js precheck PLAN-TO-EXEC SD-XXX-001
```

**Phase Transitions**:
```bash
# LEAD → PLAN
node scripts/phase-preflight.js --phase PLAN --sd-id SD-XXX-001
node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001

# PLAN → EXEC
node scripts/phase-preflight.js --phase EXEC --sd-id SD-XXX-001
node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001

# EXEC → PLAN (Verification)
node scripts/handoff.js execute EXEC-TO-PLAN SD-XXX-001

# PLAN → LEAD (Final Approval)
node scripts/handoff.js execute PLAN-TO-LEAD SD-XXX-001
```

### Error Codes
| Code | Meaning | Fix |
|------|---------|-----|
| `ERR_TESTING_REQUIRED` | TESTING sub-agent must run | Run TESTING first |
| `ERR_CHAIN_INCOMPLETE` | Missing prerequisite handoff | Complete missing handoff |
| `ERR_NO_PRD` | No PRD for PLAN-TO-EXEC | Create PRD first |

### Emergency Bypass (Rate-Limited)
```bash
node scripts/handoff.js execute EXEC-TO-PLAN SD-XXX-001 \
  --bypass-validation --bypass-reason "Production outage - JIRA-12345"
```
- 3 bypasses per SD max, 10 per day globally
- All bypasses logged to `audit_log` with severity=warning

### Compliance Check
```bash
npm run handoff:compliance SD-ID
```

**FAILURE TO RUN THESE COMMANDS = LEO PROTOCOL VIOLATION**

---

### Mandatory 4-Step Handoff Chain

## 🔄 Mandatory 4-Step Handoff Chain

**CRITICAL: The complete LEO Protocol cycle requires ALL FOUR handoffs in sequence.**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    LEO PROTOCOL HANDOFF CHAIN                       │
│                                                                     │
│    ┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐        │
│    │  LEAD  │────→│  PLAN  │────→│  EXEC  │────→│  PLAN  │────→   │
│    │        │ (1) │        │ (2) │        │ (3) │        │ (4)    │
│    │ Approve│     │  PRD   │     │  Code  │     │ Verify │        │
│    └────────┘     └────────┘     └────────┘     └────────┘        │
│         │                                             │            │
│         │              ┌───────────┐                  │            │
│         └──────────────│ LEAD Final│←─────────────────┘            │
│                        │ Approval  │                               │
│                        └───────────┘                               │
│                                                                     │
│    (1) LEAD-TO-PLAN  - SD approved, PRD creation authorized        │
│    (2) PLAN-TO-EXEC  - PRD complete, implementation approved       │
│    (3) EXEC-TO-PLAN  - Code complete, verification phase           │
│    (4) PLAN-TO-LEAD  - Verification complete, final approval       │
│                                                                     │
│    ⚠️  SD CANNOT reach 100% without PLAN-TO-LEAD handoff!          │
└─────────────────────────────────────────────────────────────────────┘
```

### Handoff Commands (Execute in Order)

| Step | Handoff | Command | Validates |
|------|---------|---------|-----------|
| 1 | LEAD → PLAN | `node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001` | SD approved, scope defined |
| 2 | PLAN → EXEC | `node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001` | PRD complete, design/database analyzed |
| 3 | EXEC → PLAN | `node scripts/handoff.js execute EXEC-TO-PLAN SD-XXX-001` | Implementation complete, tests passing |
| 4 | PLAN → LEAD | `node scripts/handoff.js execute PLAN-TO-LEAD SD-XXX-001` | Verification complete, retrospective exists |

### Completion Requirements

**The `calculate_sd_progress()` function requires:**
- All 4 handoffs (LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, **PLAN-TO-LEAD**)
- Retrospective with quality score ≥70%
- Git status clean, all commits pushed
- Infrastructure SDs exempt from Gate 3/4 (design/database validation)

**Root Cause (Six Whys)**: SD completion was previously possible with only 3 handoffs because the function checked `COUNT(handoffs) >= min_handoffs` but `min_handoffs=3`. Now explicitly requires PLAN-TO-LEAD handoff record.

### Checking Handoff Status

```bash
# View all handoffs for an SD
node scripts/check-handoff-chain.js SD-XXX-001

# Or query directly
node -e "
import { createSupabaseClient } from './lib/supabase-client.js';
const supabase = createSupabaseClient();
const { data } = await supabase
  .from('sd_phase_handoffs')
  .select('handoff_type, status, created_at')
  .eq('sd_id', 'SD-XXX-001')
  .eq('status', 'accepted')
  .order('created_at');
console.log('Handoff chain:', data.map(h => h.handoff_type).join(' → '));
"
```

---

### Gate Failure Protocol

## Gate Failure Protocol

When a handoff gate fails, **diagnose before retrying**. Blind retries waste time and mask systemic issues.

### Classification
| Type | Signal | Action |
|------|--------|--------|
| **Transient** | Timeout, network error, stale cache | Retry once after clearing state |
| **Data** | Missing field, wrong format, constraint violation | Fix the data, then retry |
| **Systemic** | Gate logic bug, threshold misconfigured, script error | Fix the gate/script, then retry |

### Diagnosis Steps
1. Read the full error message (not just the gate name)
2. Check `HANDOFF_RESULT` line for `REASON=` code
3. If `REASON` contains `FAILED` — look at the `REMEDIATION` section
4. If same gate fails twice with same reason — it is **systemic**, not transient
5. Run `node scripts/handoff.js precheck <PHASE> <SD-ID>` to see ALL gate results at once

### Anti-Pattern
- **Wrong**: Retry 3 times, then bypass with `--bypass-validation`
- **Right**: Read error → fix root cause → retry once → if still failing, invoke RCA sub-agent

---

### Gate Bypass Audit Trail Requirements

## Gate Bypass Audit Trail Requirements

### Rule
Every gate bypass MUST be recorded with a complete audit trail. Bypasses without audit records are protocol violations.

### Required Audit Fields
When bypassing any validation gate, the following MUST be recorded:

| Field | Required | Description |
|-------|----------|-------------|
| `bypass_reason` | YES | Why the gate was bypassed (specific, not generic) |
| `sd_id` | YES | Which SD the bypass applies to |
| `gate_name` | YES | Which gate was bypassed |
| `bypassed_by` | YES | Who authorized the bypass |
| `timestamp` | YES | When the bypass occurred |
| `severity` | YES | Impact level (low/medium/high) |
| `compensating_control` | RECOMMENDED | What alternative validation was done |

### Bypass Audit Storage
All bypasses are logged to the `audit_log` table:
```sql
INSERT INTO audit_log (event_type, severity, sd_id, details)
VALUES (
  'GATE_BYPASS',
  'warning',
  'SD-XXX-001',
  jsonb_build_object(
    'gate_name', 'GATE_PRD_EXISTS',
    'bypass_reason', 'Trivial config change, PRD not required',
    'bypassed_by', 'UNIFIED-HANDOFF-SYSTEM',
    'compensating_control', 'Manual review by LEAD before approval'
  )
);
```

### Rate Limits (Enforced)
| Limit | Threshold | Action on Exceed |
|-------|-----------|-----------------|
| Per SD | 3 bypasses max | Block further bypasses |
| Per day | 10 bypasses globally | Block all bypasses for 24h |
| Per gate | No limit per gate | But tracked for pattern analysis |

### Why Audit Trail Matters
**Incident**: An SD completed without proper gate validation. When a bug was discovered post-deployment, the team could not reconstruct which validations were skipped, making root cause analysis impossible.

### Monitoring
Run periodic audit to detect bypass patterns:
```sql
SELECT sd_id, COUNT(*) as bypass_count,
       array_agg(details->>'gate_name') as bypassed_gates
FROM audit_log
WHERE event_type = 'GATE_BYPASS'
  AND created_at > NOW() - interval '7 days'
GROUP BY sd_id
HAVING COUNT(*) >= 2
ORDER BY bypass_count DESC;
```

### Reference
- Emergency bypass docs: CLAUDE_CORE.md (Emergency Bypass section)
- Rate limit enforcement: `scripts/modules/handoff/validation/bypass-limiter.js`
- Audit log table: `database/schema/audit_log`

---

### Handoff Precheck Command

## Handoff Precheck Command

Before running a handoff execute, use **precheck** to evaluate ALL gates at once:

```bash
node scripts/handoff.js precheck <TYPE> <SD-ID>
```

Precheck runs all gates in batch mode. LLM-powered gates are skipped for fast advisory checks (<5s). Use this to identify ALL failures before fixing them.

---

### Handoff Precheck Command

## Handoff Precheck Command

Before running a handoff execute, use **precheck** to evaluate ALL gates at once:

```bash
node scripts/handoff.js precheck <TYPE> <SD-ID>
```

Precheck runs all gates in batch mode. LLM-powered gates are skipped for fast advisory checks (<5s). Use this to identify ALL failures before fixing them.

## Common Gate Fixes
| Gate | Common Cause | Fix |
|------|-------------|-----|
| SMOKE_TEST_SPECIFICATION | Missing/malformed smoke_test_steps | Add objects with instruction + expected_outcome |
| GATE_SD_QUALITY | Placeholder content | Replace generic text with specific details |
| GATE_PRD_EXISTS | No PRD in database | Run add-prd-to-database.js |
| BMAD_PLAN_TO_EXEC | Missing implementation_context | Add to user stories |
| ERR_CHAIN_INCOMPLETE | Skipped prerequisite handoff | Run missing handoff first |

## Anti-Drift Rules
1. ALWAYS run precheck FIRST to see all failures (not just the first one)
2. NEVER bypass gates without --bypass-validation flag and documented reason
3. ALWAYS fix root cause, not symptoms (e.g., fix the data, not the gate check)
4. NEVER retry blindly — read the error message and fix the specific issue
