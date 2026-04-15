<!-- DIGEST FILE - Enforcement-focused protocol content -->
<!-- generated_at: 2026-04-15T13:11:58.994Z -->
<!-- git_commit: 33e08791 -->
<!-- db_snapshot_hash: a08c22f75efba9a2 -->
<!-- file_content_hash: pending -->

# CLAUDE_PLAN_DIGEST.md - PLAN Phase (Enforcement)

**Protocol**: LEO 4.3.3
**Purpose**: PRD requirements and constraints (<5k chars)

---

## PLAN Phase Negative Constraints

## 🚫 PLAN Phase Negative Constraints

<negative_constraints phase="PLAN">
These anti-patterns are specific to the PLAN phase. Violating them leads to incomplete PRDs and blocked handoffs.

### NC-PLAN-001: No Implementation in PLAN Phase
**Anti-Pattern**: Writing actual code (components, services, migrations) during PLAN
**Why Wrong**: PLAN is for specification, not execution. Code written here won't be tracked.
**Correct Approach**: Document requirements, architecture, and test scenarios. Save coding for EXEC.

### NC-PLAN-002: No PRD Without Exploration
**Anti-Pattern**: Creating PRD immediately after SD approval without reading codebase
**Why Wrong**: PRDs miss existing infrastructure, create duplicate work, conflict with patterns
**Correct Approach**: Read ≥5 relevant files, document findings in exploration_summary

### NC-PLAN-003: No Boilerplate Acceptance Criteria
**Anti-Pattern**: Using generic criteria like "all tests pass", "code review done", "meets requirements"
**Why Wrong**: Russian Judge detects boilerplate (≤50% score), blocks PLAN→EXEC handoff
**Correct Approach**: Write specific, measurable criteria tied to functional requirements

### NC-PLAN-004: No Skipping Sub-Agents
**Anti-Pattern**: Creating PRD without running DESIGN, DATABASE sub-agents
**Why Wrong**: Gate 1 blocks handoff if sub-agent execution not recorded
**Correct Approach**: Use Task tool with specialized sub-agents:
⚠️ Do NOT use `node lib/sub-agent-executor.js` in interactive sessions - use Task tool instead.

### NC-PLAN-005: No Placeholder Requirements
**Anti-Pattern**: Using "TBD", "to be defined", "will be determined" in requirements
**Why Wrong**: PRD validator blocks placeholders, signals incomplete planning
**Correct Approach**: If truly unknown, use AskUserQuestion to clarify before PRD creation
</negative_constraints>

## PLAN Pre-EXEC Checklist

## PLAN Agent Pre-EXEC Checklist (MANDATORY)

**Evidence from Retrospectives**: Database verification issues appeared in SD-UAT-003, SD-UAT-020, and SD-008. Early verification saves 2-3 hours per blocker.

Before creating PLAN→EXEC handoff, PLAN agent MUST verify:

### Database Dependencies ✅
- [ ] **Identify all data dependencies** in PRD
- [ ] **Run schema verification script** for data-dependent SDs
- [ ] **Verify tables/columns exist** OR create migration
- [ ] **Document verification results** in PLAN→EXEC handoff
- [ ] If tables missing: **Escalate to LEAD** with options

**Success Pattern** (SD-UAT-003):
> "Database Architect verification provided evidence for LEAD decision. Documented instead of implementing → saved 4-6 hours"

### Architecture Planning ✅
- [ ] **Component sizing estimated** (target 300-600 lines per component)
- [ ] **Existing infrastructure identified** (don't rebuild what exists)
- [ ] **Third-party libraries considered** before custom code

**Success Pattern** (SD-UAT-020):
> "Leveraged existing Supabase Auth instead of building custom → saved 8-10 hours"

### Testing Strategy ✅
- [ ] **Smoke tests defined** (3-5 tests minimum)
- [ ] **Test scenarios documented** in PRD

### Quality Validation ✅
- [ ] **Verified claims with code review** (if UI/UX SD)
- [ ] **Assessed technical feasibility**
- [ ] **Identified potential blockers**

**Success Pattern** (SD-UAT-002):
> "LEAD code review rejected 3/5 false claims → saved hours of unnecessary work"

## PRD Creation Anti-Pattern (PROHIBITED)

**NEVER create one-off PRD creation scripts like:**
- `create-prd-sd-*.js`
- `insert-prd-*.js`
- `enhance-prd-*.js`

**ALWAYS use the standard CLI:**
### Why This Matters
- One-off scripts bypass PRD quality validation
- They create massive maintenance burden (100+ orphaned scripts)
- They fragment PRD creation patterns

### Archived Scripts Location
~100 legacy one-off scripts have been moved to:
- `scripts/archived-prd-scripts/`

These are kept for reference but should NEVER be used as templates.

### Correct Workflow
1. Run `node scripts/add-prd-to-database.js`
2. Follow the modular PRD creation system in `scripts/prd/`
3. PRD is properly validated against quality rubrics

## PRD Creation — Inline Mode is the Default for Claude Code

**CRITICAL**: When running `node scripts/add-prd-to-database.js <SD-ID> "<title>"` from a Claude Code session, the script defaults to **inline mode** (`LLM_PRD_INLINE=true`). This is the correct mode. **Do NOT set `LLM_PRD_INLINE=false`** from within Claude Code.

### What inline mode does

The script prints the PRD generation system prompt + user prompt to stdout between delimiters:
Followed by:
**This is NOT an error.** It is a handoff from the script to Claude Code. The script is telling you: "I printed the prompt, now YOU (Opus 4.6) generate the PRD JSON and INSERT it."

### Why external API mode is wrong for Claude Code

Setting `LLM_PRD_INLINE=false` routes through `lib/llm/client-factory.js`, which calls Anthropic/Google/OpenAI over HTTP. From within a Claude Code session this:
1. Pays twice for the same model (Claude Code IS Opus 4.6)
2. Often times out due to sandboxing/network restrictions
3. Hits `LLM_PROVIDER=google` in `.env` by default → Gemini timeout
4. Reference: SD-LEO-FIX-REPLACE-EXTERNAL-API-001 was specifically created to eliminate this external call for Claude Code

### Correct workflow

1. Run `node scripts/add-prd-to-database.js SD-XXX-001 "PRD Title"` (default flags, no `LLM_PRD_INLINE` override).
2. Read the **full prompt** between the delimiters — do NOT truncate with `| tail` since you need the system prompt's JSON schema.
3. Generate the PRD JSON yourself matching the schema, using the parent SD's plan_content / arch doc / vision doc as source material.
4. INSERT the generated JSON into `product_requirements_v2` directly. Required fields: `executive_summary`, `functional_requirements`, `system_architecture`, `acceptance_criteria`, `test_scenarios`, `implementation_approach`, `risks`. The `id` field is manual text format `PRD-<sd_key>`; `sd_id` references `strategic_directives_v2.id` (UUID, not sd_key). Status must be `approved` before PLAN-TO-EXEC.
5. Also INSERT user stories into `user_stories` with `implementation_context` JSONB (NOT NULL).
6. Run `node scripts/handoff.js precheck PLAN-TO-EXEC <SD-ID>` to verify.

### Anti-pattern to avoid

### Misreading inline-mode output as a failure (historical incident)

On 2026-04-06 during SD-LEO-REFAC-STAGE-ADVANCEMENT-ENGINE-001 child decomposition, the PRD creation step was blocked for ~30 minutes because the `WARNING: No PRD record found` message was interpreted as a script failure rather than as the inline-mode handoff signal. The fix attempt (`LLM_PRD_INLINE=false`) then hit external API timeouts, compounding the confusion. Root cause: the warning's phrasing ("You MUST insert the PRD record") is delivered in a warning/error tone, but it is in fact the normal inline-mode completion message.

## ESCALATE TO FULL FILE WHEN

- Debugging specific gate scoring or failure reasons
- Need handoff quality gate details (thresholds, weights, rubrics)
- PRD field requirements are unclear beyond anti-patterns



---

**On-Demand Full Reference**: If you need detailed examples, procedures, or deep reference material, read `CLAUDE_PLAN.md` using the Read tool.

**Environment Override**: Set `CLAUDE_PROTOCOL_MODE=full` to use FULL files instead of DIGEST for all gates.


---

*DIGEST generated: 2026-04-15 9:11:59 AM*
*Protocol: 4.3.3*
