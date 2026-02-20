<!-- DIGEST FILE - Enforcement-focused protocol content -->
<!-- generated_at: 2026-02-20T21:50:55.269Z -->
<!-- git_commit: b4930caf -->
<!-- db_snapshot_hash: 1787835840a9ee3a -->
<!-- file_content_hash: pending -->

# CLAUDE_LEAD_DIGEST.md - LEAD Phase (Enforcement)

**Protocol**: LEO 4.3.3
**Purpose**: LEAD approval gates and constraints (<5k chars)

---

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

*DIGEST generated: 2026-02-20 4:50:55 PM*
*Protocol: 4.3.3*
