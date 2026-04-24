<!-- DIGEST FILE - Enforcement-focused protocol content -->
<!-- generated_at: 2026-04-24T11:38:22.548Z -->
<!-- git_commit: 3f7b4bc6 -->
<!-- db_snapshot_hash: 025565500b723151 -->
<!-- file_content_hash: pending -->

# CLAUDE_CORE_DIGEST.md - Core Protocol (Enforcement)

**Protocol**: LEO 4.4.1
**Purpose**: Essential enforcement rules (<10k chars)
**Effort**: medium (core context; phase-specific files tag their own effort for phase work)

---

## RCA Issue Resolution Mandate

## ⚠️ CRITICAL: Issue Resolution Protocol

**When you encounter ANY issue, error, or unexpected behavior:**

1. **DO NOT work around it** - Workarounds hide problems and create technical debt
2. **DO NOT ignore it** - Every issue is a signal that something needs attention
3. **INVOKE the RCA Sub-Agent** - Use `subagent_type="rca-agent"` via the Task tool

### Sub-Agent Prompt Quality Standard (Five-Point Brief)

**CRITICAL**: The prompt you write when spawning ANY sub-agent is the highest-impact point in the entire agent chain. Everything downstream — team composition, investigation direction, finding quality — inherits from it.

Every sub-agent invocation MUST include these five elements:

| Element | What to Include | Example |
|---------|----------------|---------|
| **Symptom** | Observable behavior (what IS happening) | "The /users endpoint returns 504 after 30s" |
| **Location** | Files, endpoints, DB tables involved | "routes/users.js line 45, lib/queries/user-lookup.js" |
| **Frequency** | How often, when it started, pattern | "Started 2h ago, every 3rd request fails" |
| **Prior attempts** | What was already tried (so agent doesn't repeat) | "Server restart didn't help, DNS is fine" |
| ... | *(see full file for complete table)* |

**Anti-patterns** (NEVER do these):
- ❌ "Analyze why [issue] is occurring" — too vague, agent has nothing to anchor on
- ❌ Dum

*...truncated. Read full file for complete section.*

## 🚫 MANDATORY: Phase Transition Commands (BLOCKING)

## MANDATORY: Phase Transition Commands (BLOCKING)

**Anti-Bypass Protocol**: These commands MUST be run for ALL phase transitions.
> Why: `handoff.js` writes phase state to `sd_phase_handoffs` and runs the gate pipeline. Without this record, future sessions cannot determine the SD's phase, which gates passed, or whether implementation was authorized — the SD becomes unresumable.

### Required Commands

**Pre-flight Batch Validation (RECOMMENDED)**:
**Phase Transitions**:
### Error Codes
| Code | Meaning | Fix |
|------|---------|-----|
| `ERR_TESTING_REQUIRED` | TESTING sub-agent must run | Run TESTING first |
| `ERR_CHAIN_INCOMPLETE` | Missing prerequisite handoff | Complete missing handoff |
| `ERR_NO_PRD` | No PRD for PLAN-TO-EXEC | Create PRD first |

### Emergency Bypass (Rate-Limited)
- 3 bypasses per SD max, 10 per day globally
- All bypasses logged to `audit_log` with severity=warning

### Compliance Check
> Why: Skipping these commands is the most common cause of orphaned SDs — directives that appear in-progress but have no handoff records, making them invisible to the queue and unresumable by new sessions.

**FAILURE TO RUN THESE COMMANDS = LEO PROTOCOL VIOLATION**

## Mandatory Agent Invocation Rules

**CRITICAL**: Certain task types REQUIRE specialized agent invocation - NO ad-hoc manual inspection allowed.

### Task Type -> Required Agent

| Task Keywords | MUST Invoke | Purpose |
|---------------|-------------|---------|
| UI, UX, design, landing page, styling, CSS, colors, buttons | **design-agent** | Accessibility audit (axe-core), contrast checking |
| accessibility, a11y, WCAG, screen reader, contrast | **design-agent** | WCAG 2.1 AA compliance validation |
| form, input, validation, user flow | **design-agent** + **testing-agent** | UX + E2E verification |
| performance, slow, loading, latency | **performance-agent** | Load testing, optimization |
| ... | *(see full file for complete table)* |

### Why This Exists

**Incident**: Human-like testing perspective interpreted as manual content inspection.
**Result**: 47 accessibility issues missed, including critical contrast failures (1.03:1 ratio).
**Root Cause**: Ad-hoc review instead of specialized agent invocation.
**Prevention**: Explicit rules mandate agent use for specialized tasks.

### How to Apply

1. Detect task type from user request keywords
2. Invoke required agent(s) BEFORE making changes
3. Agent findings inform implementation
4. Re-run agent AFTER changes to verify fixes

## Global Negative Constraints

These anti-patterns apply across ALL phases. Violating them leads to failed handoffs and rework.

### NC-001: No Markdown Files as Source of Truth
❌ Creating/updating .md files to store requirements, PRDs, or status
✅ Use database tables via scripts

### NC-002: No Bypassing Process Scripts
❌ Directly inserting into database tables
✅ Always use handoff.js, add-prd-to-database.js

### NC-003: No Guessing File Locations
❌ Assuming file paths based on naming conventions
✅ Use Glob/Grep to find exact paths, read files before editing

### NC-004: No Implementation Without Reading
❌ Starting to code before reading existing implementation
✅ Read ≥5 relevant files before writing any code

### NC-005: No Workarounds Before Root Cause Analysis
❌ Implementing quick fixes without understanding why something fails
✅ Identify root cause first, then fix

### NC-006: No Background Execution for Validation
❌ Using `run_in_background: true` for handoff/validation commands
✅ Run all LEO process scripts inline with appropriate timeouts

**Affected Commands** (MUST run inline):
- `node scripts/handoff.js execute ...`
- `node scripts/add-prd-to-database.js ...`
- `node scripts/phase-preflight.js ...`

### NC-7: No Silent Hook Failures
❌ Catching post-stage hook errors and logging as "non-fatal" when the hook produced zero expected output rows
✅ Hooks that write to database tables must ve

*...truncated. Read full file for complete section.*

## Critical Term Definitions

## 🚫 CRITICAL TERM DEFINITIONS (BINDING)

These definitions are BINDING. Misinterpretation is a protocol violation.

### "Complete an SD"
**Definition**: An SD is "complete" ONLY when:
1. Full LEAD→PLAN→EXEC cycle executed (per sd_type requirements)
2. Database status = 'completed'
3. All required handoffs recorded
4. Retrospective created
5. LEO Protocol validation trigger passes

**NOT complete**: Code shipped but database shows 'draft' / 'in_progress' / 'active'

### "Continue autonomously"
**Definition**: Execute the current SD through its full LEO Protocol workflow WITHOUT stopping to ask for user confirmation at each step.
**NOT**: Skip workflow steps for efficiency.
**AUTO-PROCEED**: Phase transitions *within* an SD run automatically. Post-completion sequence (/document → /ship → /learn) and next-SD selection also run automatically — modulated by the SD Continuation Truth Table (which handoffs are TERMINAL / require phase work) and Chaining setting (orchestrator-to-orchestrator).

**ONLY STOP IF** (Canonical Pause Points — same list as AUTO-PROCEED Mode):
1. **Orchestrator completion** — after all children, when Chaining is OFF
2. **Blocking error requiring human decision** — merge conflicts, ambiguous requirements
3. **Test failures after 2 retry attempts**
4. **All children blocked**
5. **Critical security or data-loss scenario** (includes DB/code status mis

*...truncated. Read full file for complete section.*

## SD Type-Aware Workflow Paths

## SD Type Validation & Workflow Paths

**IMPORTANT**: Different SD types have different required handoffs AND different gate pass thresholds.

### Gate Pass Thresholds
| SD Type | Threshold | Required Handoffs | Notes |
|---------|-----------|-------------------|-------|
| `feature` | 85% | All 5 | Full validation |
| `bugfix` | 85% | All 5 | Regression testing critical |
| `database` | 85% | All 5 | May skip UI-dependent E2E |
| `security` | 90% | All 5 | Strictest validation |
| ... | *(see full file for complete table)* |

### Workflow Paths

**Full Workflow (5 handoffs)** - feature, bugfix, database, security, refactor:
**Reduced Workflow (4 handoffs)** - infrastructure, documentation:
### Required Sub-Agents by Type
| SD Type | Required Sub-Agents |
|---------|---------------------|
| `feature` | TESTING, DESIGN, DATABASE, STORIES |
| `bugfix` | TESTING, REGRESSION |
| `database` | DATABASE |
| `security` | SECURITY, TESTING |
| ... | *(see full file for complete table)* |

### UAT Requirements
| SD Type | UAT Required | Notes |
|---------|-------------|-------|
| `feature` | **YES** | Human-verifiable outcome |
| `bugfix` | **YES** | Verify fix works |
| `infrastructure` | **EXEMPT** | Internal tooling (no customer-facing UI) |
| `documentation` | No | No runtime behavior |

### Pre-Handoff Check
Reference: `lib/utils/sd-type-validation.js`

## Background Task Output Retrieval

## Global Negative Constraints

These anti-patterns apply across ALL phases. Violating them leads to failed handoffs and rework.

### NC-001: No Markdown Files as Source of Truth
❌ Creating/updating .md files to store requirements, PRDs, or status
✅ Use database tables via scripts

### NC-002: No Bypassing Process Scripts
❌ Directly inserting into database tables
✅ Always use handoff.js, add-prd-to-database.js

### NC-003: No Guessing File Locations
❌ Assuming file paths based on naming conventions
✅ Use Glob/Grep to find exact paths, read files before editing

### NC-004: No Implementation Without Reading
❌ Starting to code before reading existing implementation
✅ Read ≥5 relevant files before writing any code

### NC-005: No Workarounds Before Root Cause Analysis
❌ Implementing quick fixes without understanding why something fails
✅ Identify root cause first, then fix

### NC-006: No Background Execution for Validation
❌ Using `run_in_background: true` for handoff/validation commands
✅ Run all LEO process scripts inline with appropriate timeouts

**Affected Commands** (MUST run inline):
- `node scripts/handoff.js execute ...`
- `node scripts/add-prd-to-database.js ...`
- `node scripts/phase-preflight.js ...`

## Sub-Agent Routing

**Use Task tool** with `subagent_type="<type>"`. Key agents: TESTING, DESIGN, DATABASE, SECURITY, RCA, REGRESSION, PERFORMANCE, UAT, VALIDATION, DOCMON.

*Full trigger keyword table in CLAUDE_CORE.md.*


## ESCALATE TO FULL FILE WHEN

- Writing sub-agent prompts (need prompt quality standards from CLAUDE_CORE.md)
- Debugging gate failures (need full gate scoring details)
- Understanding governance hierarchy or strategic priorities
- Auto-proceed or continuation logic is unclear (full tables in CLAUDE_CORE.md)
- Need execution philosophy or design principles



---

**On-Demand Full Reference**: If you need detailed examples, procedures, or deep reference material, read `CLAUDE_CORE.md` using the Read tool.

**Environment Override**: Set `CLAUDE_PROTOCOL_MODE=full` to use FULL files instead of DIGEST for all gates.


---

*DIGEST generated: 2026-04-24 7:38:22 AM*
*Protocol: 4.4.1*
