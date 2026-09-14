#!/usr/bin/env node
/**
 * GATE_MECHANISM_CLAIM_VERIFIER (QF-20260727-982, LEAD-TO-PLAN) requires a NAME plus a
 * file:line citation for every file+function mechanism claim in the SD spine -- a boolean
 * attestation is explicitly rejected. Records the real file:line locations actually opened
 * and verified during this SD's investigation, by the party who opened each one.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isMainModule } from '../../lib/utils/is-main-module.js';

dotenv.config();

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-014';

const mechanismVerifications = [
  {
    verified_by: 'Bravo (primary session)',
    verified_at: 'scripts/modules/handoff/executors/exec-to-plan/retrospective.js:338-343',
    note: 'confirmed the actionItemsWithDefaults block (owner/deadline/verification defaults on every action_item) is live in the current file, byte-identical to the fix landed in commit 6448b82f (2026-02-19) that closed the origin incident PAT-AUTO-2ffdd791'
  },
  {
    verified_by: 'Explore sub-agent (Task-tool, independent verification)',
    verified_at: 'scripts/modules/handoff/executors/exec-to-plan/retrospective.js (git log --follow)',
    note: 'confirmed commits 6448b82f/12c19da2/31156113 are real, correctly dated 2026-02-19/20, and merge-base --is-ancestor of HEAD (not stranded); confirmed by reading the current file content, not by grepping a commit message'
  },
  {
    verified_by: 'Bravo (primary session)',
    verified_at: 'scripts/modules/handoff/retro-filters.js (getFilteredRetrospective, retro_type=\'SD_COMPLETION\' filter)',
    note: 'confirmed the EXEC-TO-PLAN rich retro is deliberately written with retro_type=\'HANDOFF\' (SD-LEO-INFRA-NORMALIZE-HANDOFF-RETROSPECTIVE-001) and therefore never matched by getFilteredRetrospective; this is the origin pattern\'s literal mechanism'
  },
  {
    verified_by: 'Explore sub-agent (Task-tool, independent verification)',
    verified_at: 'scripts/modules/handoff/executors/plan-to-lead/index.js (runPreflightRetroCheck -> generateFn -> executeSubAgent(\'RETRO\', ...))',
    note: 'confirmed PLAN-TO-LEAD\'s own preflight auto-generates a fresh, genuinely SD-specific completion retro inline via lib/sub-agents/retro/generators.js::generateRetrospective() when no qualifying SD_COMPLETION retro exists -- structurally closes the "discovered as a blocker" half of the origin pattern independently of the EXEC-TO-PLAN retro_type gap'
  },
  {
    verified_by: 'VALIDATION sub-agent (independent re-verification)',
    verified_at: 'lib/sub-agents/retro/generators.js (generateRetrospective signature and body: extractPRDInsights, sub-agent pass/fail sequence, handoff timeline)',
    note: 'independently confirmed the fresh-build completion-retro path is genuinely data-driven (real PRD FR text, real sub-agent verdicts, real test pass rates), not "gate IDs and metrics only" as the stale origin-pattern text claimed'
  },
  {
    verified_by: 'VALIDATION sub-agent (independent re-verification, mutation-tested)',
    verified_at: 'tests/unit/handoff/executors/exec-to-plan/retrospective.test.js:183-229 (3 new tests)',
    note: 'mutation-tested all 3 new regression assertions against production code (removing the verification default, swapping the SD-specificity string, disabling the git-derived-learning branch) -- confirmed 1:1 mutation-to-test-kill mapping, no cross-contamination, production restored (git diff empty) after each mutation'
  },
  {
    verified_by: 'Bravo (primary session)',
    verified_at: 'lib/quality/filter.mjs:32,147 (SINGLE_SD_SEVERITY_BYPASS) and checkSingleSDStaleOpenSource',
    note: 'confirmed critical/high patterns deliberately bypass checkSingleSDClosedSource by design (SD-FDBK-ENH-LEARNING-LOOP-DESTROYS-001/FR-6), and that checkSingleSDStaleOpenSource\'s existing age threshold returns null for closed sources -- the systemic root cause of the backlog-cron false-positive burst that produced this SD\'s own pattern'
  }
];

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: existing, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();

  if (readErr) { console.error('READ FAILED:', readErr.message); process.exit(1); }

  const metadata = { ...existing.metadata, mechanism_verifications: mechanismVerifications };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata })
    .eq('sd_key', SD_KEY)
    .select('sd_key')
    .single();

  if (error) { console.error('FAILED:', error.message); process.exit(1); }

  console.log('UPDATED:', data.sd_key, '-- mechanism_verifications count:', mechanismVerifications.length);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
