#!/usr/bin/env node
// SD-LEO-INFRA-CHANGELOG-CONTENTION-PARALLEL-001 LEAD phase: corrects the SD's proposed
// mechanism (a new per-SD fragment-file + assembler subsystem) to a measurement-verified,
// dramatically smaller fix. The premise (CHANGELOG.md merge conflicts under parallel fleet
// sessions) is CONFIRMED -- LEAD independently reproduced it shipping PR #7502 this same
// session. But the SD's own framing ("the contention is purely structural, band-aids won't
// work") was NOT measured before being encoded. VALIDATION sub-agent evidence + LEAD's own
// independent git reproduction (see .claude/session-state.md) both confirm a one-line
// `.gitattributes CHANGELOG.md merge=union` rule resolves the exact reported conflict pattern
// (concurrent same-date/same-category entry appends) cleanly, with both entries preserved in
// order, zero new infrastructure. LEAD additionally discovered a real deployment precondition
// the sub-agent's test didn't isolate: the merge=union attribute must be present in the git
// COMMON ANCESTOR of the two branches being merged to take effect -- a branch forked before
// this change lands on main will not get union behavior until it syncs main first (normal
// workflow for every worker this session already does this before shipping).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CHANGELOG-CONTENTION-PARALLEL-001';

export async function correctLeadScope() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const description = `CHANGELOG.md contention: parallel sessions collide nearly every merge -- LEAD-corrected from a new fragment+assembler subsystem to a one-line .gitattributes merge=union fix, after measurement refuted the "purely structural, band-aids won't work" framing the SD was submitted with.

## Problem (confirmed -- LEAD independently reproduced this shipping PR #7502 this same session)
Parallel fleet worker sessions hand-edit the single CHANGELOG.md at merge time. When two sessions concurrently append entries under the same date/category section, git's default merge strategy conflicts because the insertion point (the line immediately after the last existing entry) is ambiguous between the two diffs. 105 commits touched CHANGELOG.md in the last 30 days (~31% of all repo churn in that window); named reconciliation events include an explicit "resolve CHANGELOG conflict with concurrent docs PR" merge commit, plus this SD's own provenance (Golf-3, 2 conflicts in one session) and LEAD's own PR #7502 experience.

## Mechanism correction (LEAD, based on VALIDATION sub-agent evidence + LEAD's own independent git reproduction)
The as-submitted plan proposed per-SD changelog fragment files (changelog/<sd-key>.md) folded by a new canonical assembler script, framed as necessary because "the contention is purely structural (one shared append point)" -- implying git merge-driver band-aids were considered and rejected. That framing was not measured. LEAD built an isolated fixture reproducing this repo's real CHANGELOG.md structure (TOC + newest-first \`## YYYY-MM-DD\` -> \`### Category\` sections) and confirmed: with \`CHANGELOG.md merge=union\` in .gitattributes, a same-date/same-category concurrent-append merge that conflicts under the default strategy resolves BYTE-CORRECTLY with both entries present, in the right nested position, zero conflict markers. VALIDATION sub-agent evidence (this SD's Explore/VALIDATION rows) independently reached the same conclusion across 4 scenarios. This is a genuine one-line structural fix, not a heuristic patch over a problem that requires new machinery.

## Scope (LEAD-corrected -- drastically reduced from the as-submitted fragment/assembler design)
- FR-1: Add \`CHANGELOG.md merge=union\` to .gitattributes, with a code comment explaining the mechanism, the precondition (must be present in the merge-base commit for a given merge to honor it -- already-open branches get it on their next main-sync, which is normal workflow), and the accepted residual risk (see Out of scope).
- FR-2: Regression fixture reproducing the exact reported failure mode as an isolated temp-repo test: (a) confirm the DEFAULT (no merge=union) strategy conflicts on a same-date/same-category concurrent append -- documents the problem this fixes; (b) confirm WITH merge=union present in the common ancestor, the same scenario merges cleanly with both entries preserved and correctly ordered; (c) confirm the precondition -- .gitattributes added only on one side of a merge (not in the common ancestor) does NOT activate union behavior, so the fixture doesn't silently pass for the wrong reason.
- FR-3 (light): update .claude/commands/document.md's CHANGELOG guidance to note the merge=union protection is in place (workers keep hand-editing CHANGELOG.md exactly as before -- no fragment-path migration needed since the write mechanism did not change, only the merge behavior).

## Explicitly out of scope (LEAD decision, deferred -- not proactively building for a theoretical risk)
- The fragment-file + assembler subsystem as originally proposed. union-merge's known residual risk (two sessions editing/rewording the SAME existing entry silently keep both copies instead of conflicting; a revert-then-remerge can duplicate an entry) is real but LOW frequency (changelog entries are rarely edited post-hoc) -- if this is ever actually observed in practice, it is grounds for revisiting the fragment approach as a follow-up SD, not for building it now against a measured-cheaper alternative.
- Deterministic TOC (re-)generation and DOCMON auto-fixer (D07) coexistence with an assembler -- moot once the assembler is out of scope; the existing hand-maintained TOC is unaffected by this fix.
- The stale \`## [Unreleased]\` example format in .claude/commands/document.md's Release Documentation section (does not match this repo's live \`## YYYY-MM-DD\` format) -- a real, pre-existing, UNRELATED doc inaccuracy found during LEAD verification, filed as a completion flag rather than folded into this diff.
- Verifying whether GitHub's server-side merge button (as opposed to local \`git merge\`) honors merge=union -- the reported conflicts are from LOCAL \`git merge origin/main\` operations during shipping, which unambiguously honor .gitattributes; out of scope to chase an unconfirmed secondary path.`;

  const key_changes = [
    { change: 'Add `CHANGELOG.md merge=union` to .gitattributes, documented with the merge-base precondition and accepted residual risk', type: 'fix', impact: 'Resolves the measured concurrent-append conflict pattern with zero new infrastructure' },
    { change: 'Regression fixture proving the default strategy conflicts and merge=union resolves the same scenario cleanly, including a precondition-sensitivity check', type: 'testing', impact: 'Directly demonstrates the fix (not just asserts the attribute is set) and guards against a future accidental attribute removal' },
    { change: 'Light doc note in .claude/commands/document.md confirming the protection is in place; no fragment-path migration needed', type: 'docs', impact: 'Keeps the workflow guidance accurate without introducing a new write mechanism for workers to learn' },
  ];

  const strategic_objectives = [
    'Eliminate CHANGELOG.md concurrent-append merge conflicts across parallel fleet worker sessions using the smallest change that measurably solves the reported problem',
    'Avoid building new shared infrastructure (a fragment/assembler subsystem) where a one-line git merge-driver configuration is proven sufficient',
  ];

  const success_criteria = [
    { criterion: 'The default git merge strategy conflicts on a same-date/same-category concurrent CHANGELOG.md append (documents the problem)', measure: 'Isolated temp-repo fixture: two branches from a common base each append a distinct entry under the same `## YYYY-MM-DD` / `### Category`; default merge produces CONFLICT (content)' },
    { criterion: 'With `merge=union` present in the common ancestor, the identical scenario merges with zero conflicts and both entries preserved in order', measure: 'Same fixture, .gitattributes with the rule committed on the common base commit; merge succeeds automatically, resulting file contains both entries nested under one heading, no conflict markers' },
    { criterion: 'The precondition (attribute must be in the merge-base) is real and the fixture does not silently pass for the wrong reason', measure: 'Fixture variant: .gitattributes added only on one side after divergence (not in the common ancestor); assert the merge still conflicts, proving the fixture is sensitive to the real git mechanism and not a false-positive pass' },
  ];

  const risks = [
    { risk: 'Union merge silently keeps both copies when two sessions edit/reword the SAME existing entry (rather than each appending a new one), instead of conflicting to force a human decision', impact: 'low', likelihood: 'low', mitigation: 'Explicitly accepted and documented as an out-of-scope residual risk; changelog entries are rarely edited post-hoc, and this is far less costly than the every-merge conflict rate being fixed. Revisit with the fragment/assembler design if this is ever actually observed.' },
    { risk: 'Already-open branches forked before this .gitattributes change lands on main will not get union behavior until they sync main first', impact: 'low', likelihood: 'high', mitigation: 'This matches the existing, already-required workflow -- every worker fetches/merges origin/main before shipping (documented and observed repeatedly this session). No new process burden.' },
    { risk: 'GitHub server-side merge (as opposed to local git merge) may not honor merge=union the same way', impact: 'low', likelihood: 'low', mitigation: 'Out of scope per this SD -- the reported conflicts are from local git merge operations during shipping prep, not server-side merges. If this SD\'s fix proves insufficient in practice for a different merge path, that is measurable follow-up work.' },
  ];

  const success_metrics = [
    { metric: 'CHANGELOG merge conflict rate', target: 'Zero same-date/same-category concurrent-append conflicts across parallel sessions, measured over the week following adoption (baseline: 2 conflicts in one Golf-3 session same day this SD was filed, plus LEAD independently reproducing one shipping PR #7502 this same session)' },
    { metric: 'Implementation completeness', target: '100% of the corrected 3-FR scope implemented' },
    { metric: 'Zero regressions', target: '0 existing tests broken; CHANGELOG.md remains root-pinned, human-readable, and unchanged in write mechanism' },
  ];

  const { data: existing, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const metadata = {
    ...existing.metadata,
    lead_scope_correction: {
      corrected_at: new Date().toISOString(),
      corrected_by: 'LEAD (session 9a78de7f-f379-460a-8a47-b2e5e5c5618f)',
      basis: 'VALIDATION sub-agent evidence (this SD, LEAD-TO-PLAN) + LEAD\'s own independent git reproduction of merge=union behavior against a realistic CHANGELOG.md fixture',
      reason: 'as-submitted plan proposed a new fragment-file + assembler subsystem, framed as necessary because "the contention is purely structural" -- that framing was not measured. A one-line .gitattributes merge=union rule was measured to resolve the exact reported conflict pattern with zero new infrastructure. Scope reduced from a multi-file new subsystem to a 1-line config change + regression fixture + light doc note.',
    },
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      description,
      key_changes,
      strategic_objectives,
      success_criteria,
      risks,
      success_metrics,
      scope_reduction_percentage: 90,
      metadata,
    })
    .eq('id', existing.id);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log(`Corrected LEAD-phase scope for ${SD_KEY} (id=${existing.id}).`);
  return { sdId: existing.id };
}

if (isMainModule(import.meta.url)) {
  correctLeadScope().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
