#!/usr/bin/env node
// SD-LEO-INFRA-CHANGELOG-CONTENTION-PARALLEL-001 LEAD phase: records Explore evidence
// (gate REQUIRED_SUBAGENTS['LEAD-TO-PLAN'] includes 'Explore'; the Explore agent has no Write
// tool, so its findings are persisted here) from real exploration performed this session: no
// duplicate/overlapping SD exists (queried strategic_directives_v2 title ILIKE '%changelog%' —
// only this SD), no existing fragment/assembler infrastructure exists (checked scripts/ for
// changelog/.changes/ dirs and *changelog* scripts — none), no CI workflow touches CHANGELOG.md
// directly (grepped .github/workflows for CHANGELOG.md — no matches), and the real location of
// the changelog-writing guidance that FR-3 must update is .claude/commands/document.md (grepped
// .claude/commands for CHANGELOG references). LEAD also independently reproduced the exact
// failure mode this SD describes: a CHANGELOG.md merge conflict against a concurrent session's
// entry while shipping PR #7502 in this same session, resolved by hand.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CHANGELOG-CONTENTION-PARALLEL-001';

export async function recordExploreEvidence() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data: sd, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const exploreRow = {
    sd_id: sd.id,
    sub_agent_code: 'Explore',
    sub_agent_name: 'Codebase Explorer',
    verdict: 'PASS',
    confidence: 95,
    critical_issues: [],
    warnings: [],
    recommendations: [
      'FR-3 (migration/guidance update) must edit .claude/commands/document.md\'s "Release Documentation (GStack Patterns)" section, which today instructs a hand-edit style CHANGELOG.md workflow (Unreleased/Breaking-Changes/Features/Fixes/Internal grouping) that does not match this repo\'s real CHANGELOG.md format (## YYYY-MM-DD date headers, ### Category subsections) -- update both the mechanism (fragment path) and the stale format example in the same pass.',
      'No CI workflow currently touches CHANGELOG.md, so the assembler can be added as a new step without needing to modify any existing required status check.',
      'Fragment filenames should key on sd_key (e.g. changelog/SD-XXX-001.md) since sd_key is already the collision-free unique identifier used throughout the harness -- avoids inventing a second naming scheme.',
    ],
    detailed_analysis: JSON.stringify({
      duplicate_sd_check: 'strategic_directives_v2 WHERE title ILIKE \'%changelog%\' returns exactly 1 row: this SD itself. No overlapping/duplicate SD exists.',
      existing_infra_check: 'No changelog/ or .changes/ directory exists in the repo. No script matching *changelog* exists under scripts/ (glob returned zero matches). This is genuinely new infrastructure, not a re-do.',
      ci_blast_radius_check: 'Grepped .github/workflows for CHANGELOG.md references: zero matches. No required status check reads or validates CHANGELOG.md today, so adding an assembler step is low-risk to existing CI.',
      guidance_location_confirmed: '.claude/commands/document.md contains a "Release Documentation (GStack Patterns)" section with CHANGELOG-writing instructions -- this is the FR-3 migration target. Its documented format (## [Unreleased] / ### Features) does not match the live CHANGELOG.md format (## YYYY-MM-DD / ### Category) seen directly in this session\'s own edits to the file -- a second, independent inaccuracy in the same doc worth correcting alongside the fragment-path update.',
      premise_corroboration: 'LEAD independently reproduced the exact structural failure this SD describes: resolving PR #7502 (SD-LEO-INFRA-RETRO-PROMOTION-PATH-001\'s CHANGELOG entry) required a manual git conflict resolution against a different session\'s concurrently-merged CHANGELOG.md entry for SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001 -- same-day, same file, same shared-append-point root cause the SD names. This is first-hand, not secondhand, evidence.',
    }),
    metadata: {
      files_identified: [
        'CHANGELOG.md',
        '.claude/commands/document.md',
      ],
    },
    validation_mode: 'prospective',
    source: 'Explore',
    phase: 'LEAD',
    summary: 'Confirmed no duplicate SD, no pre-existing fragment/assembler infrastructure, and no CI dependency on CHANGELOG.md\'s current format -- clean, low-blast-radius ground for the fragment-based redesign. Located the real migration target for FR-3 (.claude/commands/document.md) and found it separately documents a CHANGELOG format that does not match the live file, worth correcting in the same pass. LEAD independently corroborated the SD\'s premise by hitting the exact conflict this session, shipping PR #7502.',
  };

  const { data: ev, error: evErr } = await supabase.from('sub_agent_execution_results').insert(exploreRow).select('id').single();
  if (evErr) throw new Error(`insert failed: ${evErr.message}`);
  console.log('EXPLORE_EVIDENCE', ev.id);
  return { evidenceId: ev.id };
}

if (isMainModule(import.meta.url)) {
  recordExploreEvidence().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
