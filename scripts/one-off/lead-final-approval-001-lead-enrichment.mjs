#!/usr/bin/env node
// SD-LEO-FIX-LEAD-FINAL-APPROVAL-001 LEAD phase: enriches placeholder fields with the real
// FR-1..FR-4 scope, and adds mechanism_verifications for the two confirmed injection sinks.
// LEAD independently verified the premise directly against live code (scripts/modules/handoff/
// executors/lead-final-approval/gates.js) before writing this -- unlike the two preceding SDs
// this session, the as-submitted premise is NOT contradicted by measurement: both cited sinks
// (:887, :898) are real, execSync with unguarded template-literal interpolation of a branch name
// sourced from `git branch -r` filtered only by branchBelongsToSd (lib/git/branch-owner.js),
// which imposes no charset constraint. The already-fixed sibling sink at :1132 (from
// SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001) establishes the exact remediation pattern to reuse:
// execFileSync('git', [...argv], opts) with git's `--` end-of-options marker, never a shell.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-LEAD-FINAL-APPROVAL-001';

export async function enrichLeadScope() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const key_changes = [
    { change: 'Convert the two confirmed shell-injection sinks (gates.js:887 git rev-list --count, gates.js:898 gh pr list --head) from execSync template-literal interpolation to execFileSync with an argv array, reusing the exact pattern already established at gates.js:1132', type: 'fix', impact: 'Closes a live, execution-confirmed RCE reachable by any push-access principal who names a branch with shell metacharacters' },
    { change: 'Add a ref-charset allowlist guard so a malformed branch ref is rejected before it reaches ANY sink, current or future -- defense-in-depth beyond the two known sinks', type: 'fix', impact: 'Prevents the same defect class from recurring at a not-yet-discovered third sink' },
    { change: 'Negative regression test replaying the exact PoC (a branch named feat/<KEY>-a&whoami) asserting zero injected commands execute', type: 'testing', impact: 'Directly proves the fix, not just the absence of the old code pattern' },
    { change: 'Audit gates.js + sibling LEAD-FINAL-APPROVAL executors for any other shell-interpolated sink fed by repo-controlled strings; report the count, convert or explicitly justify each', type: 'security', impact: 'Closes the class, not just the two reported instances -- prevents a fourth sink from surviving this SD the way two survived the prior MV fix' },
  ];

  const strategic_objectives = [
    'Close a live, execution-confirmed remote-code-execution vulnerability in the LEAD-FINAL-APPROVAL gate reachable by any push-access principal',
    'Establish a defense-in-depth charset guard so the same defect class cannot recur at an undiscovered sink',
    'Audit for and account for every remaining shell-interpolation sink in this gate file, not just the two reported',
  ];

  const success_criteria = [
    { criterion: 'Both confirmed sinks (gates.js:887, :898) use execFileSync with an argv array; the exact `&whoami` PoC branch name runs zero injected commands', measure: 'Regression fixture replays the PoC branch name through the real code path (or an isolated harness reproducing it) and asserts no side-effect command executes' },
    { criterion: 'A malformed ref (containing shell metacharacters) is rejected before reaching any sink', measure: 'Fixture: a branch name with shell metacharacters is passed to the charset guard; asserted rejected/inert before any execSync/execFileSync call is reached' },
    { criterion: 'FR-4 audit is complete and its findings are recorded, not just implied', measure: 'A count of all shell-interpolated sinks fed by repo-controlled strings in gates.js and sibling executors, with each one either converted to execFileSync-array or explicitly justified as safe (e.g. a hardcoded, non-attacker-controlled value) — target 0 unaccounted-for sinks' },
  ];

  const risks = [
    { risk: 'Converting execSync to execFileSync changes error/output shape in a way that breaks a downstream caller expecting shell-specific behavior (e.g. glob expansion, pipe, quoting)', impact: 'medium', likelihood: 'low', mitigation: 'Both confirmed sinks call plain git/gh commands with no shell features (no pipes, no globs, no quoting-dependent behavior) — verified by reading each call site directly before converting; the established sibling pattern at gates.js:1132 already proves this conversion is safe for this exact code style in this exact file.' },
    { risk: 'The ref-charset guard is too strict and rejects a legitimate branch name (e.g. one containing characters valid in git refs but outside the chosen allowlist)', impact: 'low', likelihood: 'medium', mitigation: 'Base the allowlist on the actual character set this repo\'s own branch-naming convention produces (feat/QF/docs/chore prefixes + SD-key + optional suffix), verified against a live census of real branch names before finalizing the regex, not an arbitrary restrictive guess.' },
    { risk: 'FR-4\'s audit finds additional sinks whose fix would expand this SD beyond its current small, well-scoped diff', impact: 'low', likelihood: 'low', mitigation: 'Confirmed at LEAD: the other execSync template-literal call sites in gates.js (lines 601-602, 763-764, 1015-1016) interpolate a hardcoded repo-name constant (["rickfelix/ehg","rickfelix/EHG_Engineer"]), not attacker-controlled input — real remaining risk surface is narrow. If FR-4 nonetheless finds a genuinely new attacker-controlled sink, convert it in the same diff (small, mechanical fix); only split into a follow-up SD if the finding is unexpectedly large.' },
  ];

  const success_metrics = [
    { metric: 'Injection sink count', target: '0 remaining shell-interpolation sinks fed by repo-controlled strings in gates.js and sibling LEAD-FINAL-APPROVAL executors (measured by FR-4 audit)' },
    { metric: 'PoC replay', target: 'The exact `&whoami` branch-name PoC executes zero injected commands post-fix' },
    { metric: 'Zero regressions', target: '0 existing tests broken; PR merge verification / branch scan behavior unchanged for well-formed branch names' },
  ];

  const { data: existing, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const metadata = {
    ...existing.metadata,
    lead_enrichment: {
      enriched_at: new Date().toISOString(),
      enriched_by: 'LEAD (session 9a78de7f-f379-460a-8a47-b2e5e5c5618f)',
      reason: 'As-submitted premise independently verified directly against live code: both cited sinks (gates.js:887, :898) confirmed real, execSync with unguarded template-literal branch-name interpolation, branchBelongsToSd imposes no charset constraint. The other execSync template-literal sites in the same file (601-602, 763-764, 1015-1016) interpolate a hardcoded repo-name constant, not attacker-controlled -- narrows FR-4\'s real remaining scope. key_changes/strategic_objectives/risks were auto-generated [UNPOPULATED] placeholders per metadata.needs_enrichment, replaced with the real FR-1..FR-4 scope.',
    },
    needs_enrichment: [],
    mechanism_verifications: [
      { verified_by: 'LEAD (session 9a78de7f-f379-460a-8a47-b2e5e5c5618f)', verified_at: 'scripts/modules/handoff/executors/lead-final-approval/gates.js:887' },
      { verified_by: 'LEAD (session 9a78de7f-f379-460a-8a47-b2e5e5c5618f)', verified_at: 'scripts/modules/handoff/executors/lead-final-approval/gates.js:898' },
      { verified_by: 'LEAD (session 9a78de7f-f379-460a-8a47-b2e5e5c5618f)', verified_at: 'scripts/modules/handoff/executors/lead-final-approval/gates.js:1132' },
      { verified_by: 'LEAD (session 9a78de7f-f379-460a-8a47-b2e5e5c5618f)', verified_at: 'lib/git/branch-owner.js:257' },
    ],
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      key_changes,
      strategic_objectives,
      success_criteria,
      risks,
      success_metrics,
      metadata,
    })
    .eq('id', existing.id);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log(`Enriched LEAD-phase scope for ${SD_KEY} (id=${existing.id}).`);
  return { sdId: existing.id };
}

if (isMainModule(import.meta.url)) {
  enrichLeadScope().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
