import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-PHASE-DESIGN-OKR-001';

async function main() {
  const { data: sd, error } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (error) throw error;

  const results = {
    verdict: 'PASS',
    confidence_score: 90,
    summary: 'Surveyed the OKR/prioritization substrate before authoring the design scope. Confirmed no "okrs" table exists (SD condition was wrong); real substrate is objectives+key_results (43 KR rows live). Found the day-28 hard stop already fully specified in KR-GOV-3.3. Found TWO parallel, undocumented prioritization mechanisms with a duplicated implementation between them, plus a dormant, unscheduled sync script.',
    detailed_analysis: {
      files_read: [
        'scripts/lib/priority-scorer.js',
        'scripts/wsjf-priority-fetcher.js',
        'scripts/okr-priority-sync.js',
        'scripts/modules/sd-next/SDNextSelector.js (grep for priority-scorer usage)',
        'docs/design/competitive-vigilance-observed-baseline-design.md (Phase-0 design template precedent)',
        'package.json (prio:top3 script mapping)',
        '.github/workflows/, scripts/cron/ (grepped for okr-priority-sync scheduling -- none found)'
      ],
      key_findings: [
        'No "okrs" table exists live (information_schema query); substrate tables are objectives, key_results (43 rows), plus okr_snapshots/okr_alignments/okr_generation_log/v_okr_scorecard/v_sd_okr_context/v_okr_hierarchy.',
        'KR-2026-02-01 "Improve okr_driven_prioritization score from 60% to 80%" is the live-tracked KR for this exact capability, currently status=at_risk.',
        'KR-GOV-3.3 "Monthly OKR automation operational" fully specifies the day-28 hard stop: "Auto-generate draft OKRs (day 1-5), schedule Chairman review meeting (day 15), hard-stop SD creation (day 28)" -- current_value=0, target_value=3, all 3 stages stale/never-run.',
        'scripts/lib/priority-scorer.js (calculatePriorityScore, rankSDs, krUrgency weighting) is the primary OKR-aware scorer, but SDNextSelector.js has an "Inline implementation matching priority-scorer.js" (a DUPLICATED, not shared, copy -- drift risk).',
        'npm run prio:top3 uses a COMPLETELY DIFFERENT file, scripts/wsjf-priority-fetcher.js -- two unreconciled prioritization mechanisms exist side by side.',
        'scripts/okr-priority-sync.js (npm run okr:sync) would persist OKR-driven priority adjustments to strategic_directives_v2.priority_score, but has zero cron/workflow scheduling anywhere -- dormant since authorship.',
        'docs/design/competitive-vigilance-observed-baseline-design.md is a real, completed Phase-0 design deliverable precedent: premise-correction table, unknowns settled, child-SD decomposition proposal -- the template this SD should follow.'
      ]
    },
    metadata: {
      repo_path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer',
      executed_from_cwd: process.cwd()
    }
  };

  await storeSubAgentResults('Explore', sd.id, { code: 'Explore', name: 'Explore' }, results, { source: 'manual', phase: 'LEAD' });
  console.log('OK stored Explore evidence for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
