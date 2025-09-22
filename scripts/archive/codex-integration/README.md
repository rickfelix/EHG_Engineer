# OpenAI Codex Integration Archive

This directory contains the archived OpenAI Codex integration experiment conducted on 2025-09-20.

## Why Archived?

The dual-lane architecture with OpenAI Codex and Anthropic Claude was found to be unnecessarily complex without significant benefits:

- Two AI systems couldn't learn from each other
- No feedback loop between agents
- Manual handoff was cumbersome
- Claude can handle all the same tasks independently

## What Was Tested

Successfully demonstrated a complete LEO Protocol workflow:

1. **LEAD Agent** (Claude) created Strategic Directive: `SD-TEST-CODEX-1758340937843`
2. **PLAN Agent** (Claude) created PRD: `PRD-CODEX-TEST-1758341001565`
3. **Generated prompt** for OpenAI Codex with handoff: `CODEX-1758341064216`
4. **OpenAI Codex** generated 4 artifacts (manifest, patch, SBOM, attestation)
5. **Applied implementation** to create `src/utils/timestamp.js`
6. **Verified functionality** - all tests passed
7. **Updated database** to track completion

## Key Learnings

✅ **Valuable:**
- Database-driven workflow patterns
- Structured PRD → Implementation flow
- Artifact-based handoffs
- SLSA compliance approach

❌ **Not Valuable:**
- Cross-platform AI handoffs
- Manual prompt copying
- Maintaining two AI contexts

## Files Archived

### Scripts:
- `generate-codex-prompt.js` - Generated prompts for Codex
- `process-codex-artifacts.js` - Processed Codex output
- `validate-codex-output.js` - Validated artifacts
- `monitor-codex-artifacts.js` - Watched for new artifacts
- `setup-codex-handoffs.js` - Database setup for handoffs
- `get-codex-prompt.js` - Easy prompt retrieval
- `test-codex-validation.js` - Validation testing
- `complete-codex-integration.js` - Mark integration complete
- `create-test-sd-for-codex.js` - Test SD creation
- `create-prd-from-test-sd.js` - Test PRD creation

### Documentation:
- `OPENAI_CODEX_INTEGRATION.md` - Full integration guide
- `CODEX_WORKFLOW_QUICK_REFERENCE.md` - Quick reference
- `AGENTS.md` - Codex bridge to CLAUDE.md
- `documentation/CODEX_*.md` - Analysis reports
- `documentation/DEEP_RESEARCH_PROMPT_DUAL_LANE_CODEX.md` - Research prompt
- `auto-labels-original.yml` - Original dual-lane workflow

### Database:
- `database-migrations/014_codex_handoffs.sql` - Codex handoff tables

### Artifacts:
- All generated artifacts from the successful test run

## Outcome

The timestamp utility module was successfully implemented and remains in `src/utils/timestamp.js`. The database-driven LEO Protocol workflow has been simplified to use Claude for all agent roles.

---
*Archived: 2025-09-20*
*Decision: Simplify to unified Claude-based architecture*