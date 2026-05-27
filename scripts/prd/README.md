# scripts/prd

PRD authoring + lifecycle utilities.

## Auto-generated user stories (SD-LEO-INFRA-AUTO-STORY-QUALITY-GATE-001 Option B)

When you run `add-prd-to-database.js` with a PRD containing `functional_requirements`, the system auto-generates user stories from those FRs via `scripts/modules/auto-trigger-stories.mjs`. The lifecycle is now:

1. **Auto-generation** — generated user_story rows default to:
   - `status='draft'` when ALL acceptance criteria carry `is_boilerplate=true` (boilerplate-template path)
   - `status='ready'` when the LLM-quality-generation path produced enriched ACs

2. **USER_STORY_QUALITY gate** at PLAN-TO-EXEC handoff (`scripts/modules/handoff/verifiers/plan-to-exec/PlanToExecVerifier.js`) filters to `status IN ('ready', 'active')` before invoking the Gemini quality evaluator:
   - SDs with only draft stories: **SOFT-PASS** with a suggestion to run the promotion CLI (handoff continues; no LLM-cost burned on boilerplate)
   - SDs with ready/active stories: scored as before (no regression)

3. **Promotion** — after enriching the acceptance criteria of one or more stories (set `is_boilerplate=false` on each AC, add concrete given/when/then), promote them via:

   ```bash
   # Promote specific stories
   node scripts/promote-user-stories.js --sd-id SD-XXX-001 --story-keys US-001,US-002

   # Promote all stories where at least one AC is non-boilerplate
   node scripts/promote-user-stories.js --sd-id SD-XXX-001 --all-non-boilerplate

   # Dry-run first
   node scripts/promote-user-stories.js --sd-id SD-XXX-001 --all --dry-run
   ```

   The CLI refuses to promote stories where all ACs are still flagged boilerplate (unless `--force` is passed).

4. **Re-run** `node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001` — the gate now scores the promoted stories.

### Why this design

Two prior retrospectives (in `scripts/one-off/insert-retro-fdbk-learn.cjs` and `_record-stories-result-finalize-claude-code.mjs`) documented the same defect before this SD was filed: auto-generated user stories scored ~14/100 by the LLM quality evaluator (because the templated boilerplate text isn't testable/specific/benefit-articulated), hard-blocking every venture or feature SD at PLAN-TO-EXEC. CronGenius pilot 2026-05-27 surfaced it again as finding F12.

LEAD chose Option B (default-to-draft + gate filter + explicit promotion CLI) over Option A (gate exempts boilerplate stories) and Option C (LLM-enriched generation by default) because Option B has the smallest blast radius, the cleanest audit trail (status field is canonical), and the easiest rollback (single ALTER COLUMN SET DEFAULT reverse).

See `project_crongenius_first_venture_pilot_2026_05_27.md` for the full pilot narrative.
