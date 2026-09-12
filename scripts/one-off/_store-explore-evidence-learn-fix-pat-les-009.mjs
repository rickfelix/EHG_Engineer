#!/usr/bin/env node
/**
 * GATE_SUBAGENT_EVIDENCE requires Explore evidence for SD-LEARN-FIX-ADDRESS-PAT-LES-009's
 * LEAD-TO-PLAN handoff. An Explore sub-agent (Task tool) independently investigated the SD's
 * defect claim and the documentation edits already made; persisting its actual findings here
 * per CLAUDE.md prologue #11 (metadata.repo_path + executed_from_cwd, no top-level columns).
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..', '..'), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-009';
const { data: sd, error: sdErr } = await supabase
  .from('strategic_directives_v2').select('id, sd_key, target_application').eq('sd_key', SD_KEY).maybeSingle();
if (sdErr || !sd) { console.error('SD lookup failed', sdErr); process.exit(1); }

const results = {
  verdict: 'PASS',
  confidence: 95,
  summary: 'Independently verified the SD\'s defect claim against lib/eva/decision-filter-engine.js: PREFERENCE_KEYS.chairman_review_score (line 63) -> filter.chairman_review_score, DEFAULTS[\'filter.chairman_review_score\'] = 3.0 (line 75) -- the SD\'s claimed "default 9" is FALSE, actual default is 3.0. Confirmed the two-tier low_score/chairman_review_score evaluation logic (lines 259-287) and STAGE_SCORE_THRESHOLDS overrides (lines 38-41). Verified the doc edits already made to reference/filter-triggers.md and reference/gate-thresholds.md match source exactly (values and two-tier logic). Found one additional real gap the first pass missed: docs/guides/workflow/cli-venture-lifecycle/03-decision-filter-engine.md (the narrative doc, not under reference/) still lacked chairman_review_score AND had a stale min_score default (7 vs actual 2.0) -- fixed in the same session as a third file. Also identified lib/eva/chairman-dfe-feedback-loop.js as an additional code path that reads AND writes filter.chairman_review_score via chairman-preference feedback learning (SCORE_PREFERENCE_KEYS, applyDecisionFeedback) -- not a doc gap, noted for completeness.',
  findings: [
    {
      id: 'PAT-LES-5fdc0399f479-PREMISE',
      severity: 'MEDIUM',
      title: 'SD premise stated a wrong default value ("9"); actual source default is 3.0',
      detail: 'lib/eva/decision-filter-engine.js:75 DEFAULTS[\'filter.chairman_review_score\'] = 3.0. The core documentation-gap complaint is still valid and was fixed using the VERIFIED value (3.0), not the SD\'s stated "9".',
    },
    {
      id: 'PAT-LES-5fdc0399f479-THIRD-FILE',
      severity: 'INFO',
      title: 'A third documentation file (03-decision-filter-engine.md) had the same gap plus a second stale default',
      detail: 'Narrative doc at docs/guides/workflow/cli-venture-lifecycle/03-decision-filter-engine.md:375-436 lacked chairman_review_score and showed min_score default as 7 instead of 2.0. Fixed alongside the two reference/ files.',
    },
  ],
  critical_issues: [],
  warnings: [],
  recommendations: ['Proceed to PLAN-TO-EXEC / EXEC verification -- documentation-only fix, no code behavior change.'],
  detailed_analysis: 'Exploration scope: lib/eva/decision-filter-engine.js (PREFERENCE_KEYS, DEFAULTS, STAGE_SCORE_THRESHOLDS, evaluation logic lines 259-287), lib/eva/chairman-dfe-feedback-loop.js (SCORE_PREFERENCE_KEYS, applyDecisionFeedback), and every docs/ markdown file referencing decision-filter preference keys (filter-triggers.md, gate-thresholds.md, 03-decision-filter-engine.md, 05-chairman-preferences.md, and ~10 other files matched only on generic terms with no threshold documentation, confirmed out of scope).',
  metadata: {
    phase: 'LEAD',
    sd_key: SD_KEY,
    gate: 'LEAD-TO-PLAN sub-agent evidence (Explore)',
    files_verified: [
      'lib/eva/decision-filter-engine.js',
      'lib/eva/chairman-dfe-feedback-loop.js',
      'docs/guides/workflow/cli-venture-lifecycle/reference/filter-triggers.md',
      'docs/guides/workflow/cli-venture-lifecycle/reference/gate-thresholds.md',
      'docs/guides/workflow/cli-venture-lifecycle/03-decision-filter-engine.md',
    ],
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sd.id,
  targetApplication: sd.target_application || 'EHG_Engineer',
  subAgentCode: 'EXPLORE',
  fallback: 'EHG_Engineer',
  probeExistsRelative: 'package.json',
  supabase,
});
console.log('Repo resolution:', JSON.stringify(resolution, null, 2));

applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('EXPLORE', sd.id, { name: 'Explore' }, results, {
  phase: 'LEAD',
  source: 'manual',
  sdKey: SD_KEY,
});

console.log('\n=== STORED ===');
console.log(JSON.stringify(stored, null, 2));
