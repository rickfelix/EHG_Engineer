<!-- DIGEST FILE - Enforcement-focused protocol content -->
<!-- generated_at: 2026-02-16T13:27:51.149Z -->
<!-- git_commit: 28f7a129 -->
<!-- db_snapshot_hash: 6c0e5841d5dacd55 -->
<!-- file_content_hash: pending -->

# CLAUDE_LEAD_DIGEST.md - LEAD Phase (Enforcement)

**Protocol**: LEO 4.3.3
**Purpose**: LEAD approval gates and constraints (<5k chars)

---

## 🚫 MANDATORY: Phase Transition Commands (BLOCKING)

**Anti-Bypass Protocol**: These commands MUST be run for ALL phase transitions. Do NOT use database-agent to create handoffs directly.

### ⛔ NEVER DO THIS:
- Using `database-agent` to directly insert into `sd_phase_handoffs`
- Creating handoff records without running validation scripts
- Skipping preflight knowledge retrieval

### ✅ ALWAYS DO THIS:

#### Pre-flight Batch Validation (RECOMMENDED)
#### LEAD → PLAN Transition
#### PLAN → EXEC Transition
#### EXEC → PLAN Transition (Verification)
#### PLAN → LEAD Transition (Final Approval)
### Emergency Bypass (SD-LEARN-010)
For emergencies ONLY. Bypasses require audit logging and are rate-limited.

**Rate Limits:**
- 3 bypasses per SD maximum
- 10 bypasses per day globally
- All bypasses logged to `audit_log` table with severity=warning

### What These Scripts Enforce
| Script | Validations |
|--------|-------------|
| `phase-preflight.js` | Loads context, patterns, and lessons from database |
| `handoff.js precheck` | **Batch validation** - runs ALL gates, git checks, reports ALL issues at once |
| `handoff.js LEAD-TO-PLAN` | SD completeness (100% required), strategic objectives |
| `handoff.js PLAN-TO-EXEC` | PRD exists (`ERR_NO_PRD`), chain completeness (`ERR_CHAIN_INCOMPLETE`) |
| `handoff.js EXEC-TO-PLAN` | TESTING enforcement (`ERR_TESTING_REQUIRED`), chain completeness |
| `handoff.js PLAN-TO-LEAD` | Traceability, workflow ROI, retrospective quality |

### Error Codes (SD-LEARN-010)
| Code | Meaning | Remediation |
|------|---------|-------------|
| `ERR_TESTING_REQUIRED` | TESTING sub-agent must run before EXEC-TO-PLAN (feature/qa SDs) | Run TESTING sub-agent first |
| `ERR_CHAIN_INCOMPLETE` | Missing prerequisite handoff in chain | Complete missing handoff first |
| `ERR_NO_PRD` | No PRD found for PLAN-TO-EXEC | Create PRD before proceeding |

### Compliance Marker
Valid handoffs are recorded with `created_by: 'UNIFIED-HANDOFF-SYSTEM'`. Handoffs with other `created_by` values indicate process bypass.

### Check Compliance
**FAILURE TO RUN THESE COMMANDS = LEO PROTOCOL VIOLATION**

## 6-Step SD Evaluation Checklist

**6-Step SD Evaluation Checklist (MANDATORY for LEAD & PLAN)**:

1. Query `strategic_directives_v2` for SD metadata
2. Query `product_requirements_v2` for existing PRD
3. **Query `sd_backlog_map` for linked backlog items** ← CRITICAL
4. Search codebase for existing infrastructure
5. Identify gaps between backlog requirements and existing code
6. **Execute QA smoke tests** ← NEW (verify tests run before approval)

**Backlog Review Requirements**: Review backlog_title, item_description, extras.Description_1 for each item

**Complete Checklist**: See `docs/reference/sd-evaluation-checklist.md`

## Quality Validation Examples

**Evidence from Retrospectives**: Thorough validation saves 4-6 hours per SD by catching issues early.

### LEAD Pre-Approval Validation Examples

#### Example 1: Verify Claims Against Reality

**Case** (SD-UAT-002): Code review revealed 3/5 claimed issues didn't exist → saved 3-4 hours of unnecessary work

**Lesson**: Always verify claims with actual code inspection, don't trust assumptions

#### Example 2: Leverage Existing Infrastructure

**Case** (SD-UAT-020): Used existing Supabase Auth instead of custom solution → saved 8-10 hours

**Lesson**: Check what already exists before approving new development

#### Example 3: Document Blockers Instead of Building Around Them

**Case** (SD-UAT-003): Database blocker identified early → documented constraint instead of workaround → saved 4-6 hours

**Lesson**: Identify true blockers during approval phase, not during implementation

#### Example 4: Question Necessity vs. Nicety

**Lesson**: Distinguish between "must have" (core requirements) and "nice to have" (future enhancements) during validation

### Quality Gate Benefits

Thorough LEAD pre-approval validation:
- Catches false assumptions early
- Identifies existing solutions
- Documents blockers before implementation starts
- Ensures resource allocation matches real requirements

**Total Time Saved from Examples**: 15-20 hours across validated SDs

## 🛡️ LEAD Pre-Approval Strategic Validation Gate

### MANDATORY Before Approving ANY Strategic Directive

LEAD MUST answer these questions BEFORE approval:

1. **Need Validation**: Is this solving a real user problem or perceived problem?
2. **Solution Assessment**: Does the proposed solution align with business objectives?
3. **Existing Tools**: Can we leverage existing tools/infrastructure instead of building new?
4. **Value Analysis**: Does the expected value justify the development effort?
5. **Feasibility Review**: Are there any technical or resource constraints that make this infeasible?
6. **Risk Assessment**: What are the key risks and how are they mitigated?
7. **Simplicity Check**: Are there simpler alternatives? (Reference: over-engineering rubric)
8. **Deletion Audit (Q8)**: What has been REMOVED from the original request?
   - Target: >10% scope reduction
   - If <10% eliminated, flag for additional scrutiny
   - Document what was cut and why
   - Record in `scope_reduction_percentage` field

**Approval Criteria**:
- Real user/business problem identified
- Solution is technically feasible
- Resources are available or can be allocated
- Risks are acceptable and documented
- Expected value justifies effort
- Scope has been actively reduced (Q8 answered)

**SCOPE LOCK**: Once LEAD approves an SD, the scope is LOCKED. LEAD commits to delivering the approved scope.

## SD Creation Anti-Pattern (PROHIBITED)

**NEVER create one-off SD creation scripts like:**
- `create-*-sd.js`
- `create-sd*.js`

**ALWAYS use the standard CLI:**
### Why This Matters
- One-off scripts bypass validation and governance
- They create maintenance burden (100+ orphaned scripts)
- They fragment the codebase and confuse future developers

### Archived Scripts Location
~100 legacy one-off scripts have been moved to:
- `scripts/archived-sd-scripts/`

These are kept for reference but should NEVER be used as templates.

### Correct Workflow
1. Run `node scripts/leo-create-sd.js`
2. Follow interactive prompts
3. SD is properly validated and tracked in database


---

**On-Demand Full Reference**: If you need detailed examples, procedures, or deep reference material, read `CLAUDE_LEAD.md` using the Read tool.

**Environment Override**: Set `CLAUDE_PROTOCOL_MODE=full` to use FULL files instead of DIGEST for all gates.


---

*DIGEST generated: 2026-02-16 8:27:51 AM*
*Protocol: 4.3.3*
