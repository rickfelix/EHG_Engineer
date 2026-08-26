#!/usr/bin/env node

/**
 * ENHANCE RETROSPECTIVE - SD-LEO-INFRA-COMPLETION-INTEGRITY-REPAIR-001
 *
 * Enriches the auto-generated (generate-retrospective.js) SD_COMPLETION retrospective
 * with the process/design learnings that handoff + sub-agent-result auto-extraction
 * could not surface on their own: the extraction-for-testability pattern forced by a
 * 6-round adversarial PRD critique, the "don't trust the literal success criterion"
 * false-completion-census finding, the ghost-completion RCA discovery, and the
 * adversarial-critique diminishing-returns observation.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const RETRO_ID = '1ee0c6e3-854f-4731-9ede-8dd1227742ab';

console.log('\nENHANCING RETROSPECTIVE - SD-LEO-INFRA-COMPLETION-INTEGRITY-REPAIR-001');
console.log('='.repeat(70));

async function enhanceRetrospective() {
  const { data: existing, error: fetchError } = await supabase
    .from('retrospectives')
    .select('what_went_well, key_learnings, action_items, what_needs_improvement')
    .eq('id', RETRO_ID)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch existing retrospective: ${fetchError.message}`);
  }

  const newAchievements = [
    { achievement: 'Fixed 3 concrete runtime defects in orchestrator-completion-guardian.js: createRetrospective() was aggregating boilerplate handoff-time child retros instead of filtering to retro_type=SD_COMPLETION and left action_items/improvement_areas empty; completeDeliverable() wrote a verified_by value that violated the VARCHAR(20) column cap; recordPatternSuccess() called a nonexistent supabase.sql tagged-template method that crashed synchronously.', is_boilerplate: false },
    { achievement: 'Fixed retro-filters.js freshness gate (getFilteredRetrospective + isValidPreflightRetro) to accept updated_at as well as created_at, so a legitimate in-place retro UPDATE (enhanceRetrospective()) is no longer invisible to the retrospective-existence/quality gates.', is_boilerplate: false },
    { achievement: 'Extracted 3 previously-inline pieces of logic (build-retrospective-content.js, resolve-pattern-success-update.js, dedupe-mixed.js) into pure, independently unit-tested lib/quality modules specifically because untestable inline logic inside class methods with a module-level supabase singleton was the repeated finding of a 6-round adversarial PRD critique.', is_boilerplate: false },
    { achievement: 'Built false-completion-predicate.js + false-completion-census.mjs on a portfolio-measured predicate (current_phase != COMPLETED) after discovering the SD\'s own literal originally-proposed predicate (progress=0 OR completion_date IS NULL) was noise against the full live population — 76.5%/12.4% of ALL completed SDs, not a targeted defect signal.', is_boilerplate: false },
    { achievement: 'RCA into the SD\'s 3 named target SDs (SD-LEO-ORCH-EVA-IDEA-PROCESSING-001D/E/F) correctly overturned this session\'s own earlier (incorrect) conclusion of "stale bookkeeping on genuine work" by checking handoff provenance directly, finding all 3 are ADMIN_OVERRIDE-forged ghost completions (real UNIFIED-HANDOFF-SYSTEM attempts rejected at score=0, then accepted seconds later via ADMIN_OVERRIDE).', is_boilerplate: false },
    { achievement: '71 passing unit tests across 9 files cover the 3 guardian fixes, the retro-filters freshness change, and the 3 newly extracted pure modules.', is_boilerplate: false }
  ];

  const newLearnings = [
    { learning: 'Extraction-for-testability as a process pattern: when an adversarial PRD critique repeatedly flags the same class of finding (untestable logic inline in a class method backed by a module-level singleton), the fix is to extract that logic into a pure, independently unit-testable module rather than trying to mock around the singleton at test time — the critique converged on this exact shape 3 separate times before extraction was accepted as the right response.', is_boilerplate: false },
    { learning: 'Do not trust a literal pre-written success criterion at face value — measure it against the full population first. The SD\'s own originally-proposed false-completion predicate (progress=0 OR completion_date IS NULL) looked targeted on paper but, measured against the full live 4633-row strategic_directives_v2 population, flagged 76.5% and 12.4% of ALL completed SDs respectively — pure noise. The portfolio-measured replacement (current_phase != COMPLETED) was adopted only after that measurement discredited the literal spec.', is_boilerplate: false },
    { learning: 'A "stale bookkeeping on genuine work" conclusion reached without checking handoff provenance can be flatly wrong in the opposite, more serious direction: the RCA into SD-LEO-ORCH-EVA-IDEA-PROCESSING-001D/E/F found the 3 named target SDs are ADMIN_OVERRIDE-forged ghost completions — real UNIFIED-HANDOFF-SYSTEM handoff attempts rejected at score=0, then an ADMIN_OVERRIDE accepted equivalent handoffs seconds later. Provenance (who accepted the handoff, and by what path) is a required check before accepting a completion status at face value, not an optional deep-dive.', is_boilerplate: false },
    { learning: 'Adversarial LLM-driven critique gates show diminishing returns after the first few rounds even when finding-counts keep oscillating rather than monotonically converging: this SD\'s LEAD-phase PRD critique ran 6 rounds (finding counts 6/5/4/4/4/5/4) before an audited override was used. Early rounds (1-3) caught genuinely real gaps; rounds 4-6 re-surfaced variations of the same already-addressed findings rather than new ones — a useful signal for when to invoke a documented override instead of continuing to iterate.', is_boilerplate: false },
    { learning: 'A correct root-fix for a discovered defect (revertSD() via the already-registered lib/sd/revert.js canonical writer, to undo the 3 ghost completions) can be fully diagnosed and specified while still being deliberately deferred pending explicit chairman/user sign-off — documented scope deferral on a state-mutating action is not the same failure class as an oversight, and should be recorded as such rather than either silently applied or silently dropped.', is_boilerplate: false }
  ];

  const newActionItems = [
    { action: 'Obtain explicit chairman/user sign-off, then execute revertSD() (lib/sd/revert.js canonical writer) against the 3 confirmed ADMIN_OVERRIDE-forged ghost completions: SD-LEO-ORCH-EVA-IDEA-PROCESSING-001D/E/F.', category: 'follow-up', is_boilerplate: false },
    { action: 'Audit other ADMIN_OVERRIDE-accepted handoffs portfolio-wide for the same forged-completion pattern (a real handoff rejected at score=0 immediately followed by an ADMIN_OVERRIDE acceptance of an equivalent handoff) — the 3 found here may not be isolated.', category: 'process', is_boilerplate: false },
    { action: 'When an adversarial critique gate oscillates without converging (finding count neither strictly decreasing nor stabilizing) for 4+ rounds, treat that as the trigger to invoke the documented audited-override path rather than continuing to iterate — document this threshold in the LEAD-phase critique guidance.', category: 'protocol', is_boilerplate: false }
  ];

  // DB check constraints cap each array (what_went_well<=25, key_learnings<=30,
  // action_items<=25) -- trim the pre-existing auto-extracted tail to make room for the
  // new narrative items prepended above, keeping the total within each cap.
  const wentWell = [...newAchievements, ...(existing.what_went_well || [])].slice(0, 25);
  const learnings = [...newLearnings, ...(existing.key_learnings || [])].slice(0, 30);
  const actions = [...newActionItems, ...(existing.action_items || [])].slice(0, 25);

  const enhanced = {
    title: 'SD-LEO-INFRA-COMPLETION-INTEGRITY-REPAIR-001: Completion-Integrity Repair Retrospective',
    description:
      'Fixed 3 runtime defects in orchestrator-completion-guardian.js (retro-aggregation filtering, a VARCHAR(20) column-length violation, and a crash from a nonexistent supabase.sql API), fixed the retro-filters.js freshness gate to accept updated_at, and extracted 3 pieces of previously-inline logic into pure unit-tested modules after a 6-round adversarial PRD critique repeatedly flagged them as untestable. Built a portfolio-measured false-completion census after discrediting the SD\'s own originally-proposed literal predicate as noise, and an RCA into the SD\'s 3 named target SDs found them to be ADMIN_OVERRIDE-forged ghost completions rather than stale bookkeeping — the correct revertSD() fix is diagnosed and deliberately deferred pending chairman sign-off. 71 unit tests across 9 files.',

    what_went_well: wentWell,
    key_learnings: learnings,
    action_items: actions,
    what_needs_improvement: existing.what_needs_improvement,

    success_patterns: [
      'Extraction-for-testability: repeated adversarial-critique findings about untestable inline logic resolved by extracting to pure, independently unit-tested modules rather than mocking around a module-level singleton',
      'Measure a literal pre-written success criterion against the full population before trusting it — the SD\'s own proposed false-completion predicate was discredited as 76.5%/12.4% noise before being replaced',
      'RCA into named target SDs checked handoff provenance directly rather than accepting a "stale bookkeeping" first impression, correctly overturning it to a more serious ADMIN_OVERRIDE-forged ghost-completion finding',
      'A diagnosed root-fix (revertSD()) for a discovered defect was deliberately deferred pending explicit chairman sign-off rather than silently applied or silently dropped'
    ],
    failure_patterns: [
      'Initial RCA pass concluded "stale bookkeeping on genuine work" for the 3 target SDs before handoff provenance was checked — the correct, more serious ADMIN_OVERRIDE-forged-completion finding only surfaced on the second pass',
      'LEAD-phase PRD critique oscillated across 6 rounds (6/5/4/4/4/5/4 finding counts) without monotonic convergence before an audited override was used'
    ],
    business_value_delivered: 'HIGH',
    tags: ['completion-integrity', 'orchestrator-guardian', 'retro-freshness-gate', 'false-completion-census', 'ghost-completion-rca', 'adversarial-critique']
  };

  const { data, error } = await supabase
    .from('retrospectives')
    .update(enhanced)
    .eq('id', RETRO_ID)
    .select('id, quality_score, team_satisfaction, status, retro_type, created_at, updated_at')
    .single();

  if (error) {
    throw new Error(`Failed to update retrospective: ${error.message}`);
  }

  console.log('\nRetrospective enhanced successfully!');
  console.log(JSON.stringify(data, null, 2));
  return data;
}

enhanceRetrospective()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
