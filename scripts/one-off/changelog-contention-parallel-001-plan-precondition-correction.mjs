#!/usr/bin/env node
// SD-LEO-INFRA-CHANGELOG-CONTENTION-PARALLEL-001 PLAN phase: corrects a factual error in the
// LEAD-phase scope description that PLAN-phase TESTING sub-agent review caught and PLAN
// independently re-verified with a decisive isolated-repo reproduction (not taken on the
// sub-agent's word alone).
//
// WRONG (LEAD's original claim): "the merge=union rule must be present in the git MERGE-BASE
// commit of the two branches being merged to take effect."
//
// CORRECT (measured): git reads .gitattributes from the CHECKED-OUT ("ours") side's working
// tree/history AT MERGE TIME -- the merge-base is irrelevant. Decisive test: committing the
// attribute ONLY on the checked-out branch's own history (added AFTER it diverged from a
// common ancestor that never had it, merging in an incoming branch that also never had it)
// still resolves the union merge cleanly. Conversely, a checked-out branch that lacks the
// attribute in its own history CONFLICTS even when merging in a branch that DOES carry it
// (this is the real "first sync after the fix lands" case -- NOT self-resolving as originally
// claimed; it is one final conflict per already-open branch, then clean thereafter once that
// branch's own tip includes the attribute).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CHANGELOG-CONTENTION-PARALLEL-001';

export async function correctPrecondition() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: existing, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, description, key_changes, risks, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const description = existing.description
    .replaceAll(
      'the precondition (attribute must be in the merge-base) is real and the fixture does not silently pass for the wrong reason',
      'the precondition (attribute must be present in the CHECKED-OUT/"ours" side\'s history at merge time, NOT the merge-base) is real and the fixture does not silently pass for the wrong reason'
    )
    .replaceAll(
      'with a code comment explaining the mechanism, the precondition (must be present in the merge-base commit for a given merge to honor it -- already-open branches get it on their next main-sync, which is normal workflow),',
      'with a code comment explaining the mechanism and the real precondition: git reads .gitattributes from the CHECKED-OUT ("ours") side\'s working tree/history at merge time -- NOT the merge-base. A branch forked before this change lands on main gets ONE final conflict on its first sync (its own checked-out history still lacks the attribute at that moment), then clean thereafter once that sync brings the attribute into its own tip.'
    )
    .replaceAll(
      'FR-2: Regression fixture reproducing the exact reported failure mode as an isolated temp-repo test: (a) confirm the DEFAULT (no merge=union) strategy conflicts on a same-date/same-category concurrent append -- documents the problem this fixes; (b) confirm WITH merge=union present in the common ancestor, the same scenario merges cleanly with both entries preserved and correctly ordered; (c) confirm the precondition -- .gitattributes added only on one side of a merge (not in the common ancestor) does NOT activate union behavior, so the fixture doesn\'t silently pass for the wrong reason.',
      'FR-2: Regression fixture reproducing the exact reported failure mode as an isolated temp-repo test (using the repo\'s existing realgit fixture pattern -- fs.mkdtempSync + fs.realpathSync + per-repo git identity config + explicit core.autocrlf=false -- to avoid the portability/env-leakage pitfalls documented at tests/unit/fleet/source-tree-identity-realgit.test.js): (a) confirm the DEFAULT (no merge=union) strategy conflicts on a same-date/same-category concurrent append -- documents the problem this fixes; (b) confirm WITH merge=union present in the checked-out branch\'s own history at merge time, the same scenario merges cleanly with both entries preserved (asserted as "both present, correct heading, zero conflict markers" -- NOT a fixed order, since union output order tracks merge direction); (c) TS-3a: the attribute present ONLY on the incoming ("theirs") side, absent from the checked-out ("ours") side, still CONFLICTS -- proves ours-side presence is what actually matters, not mere existence somewhere in the merge; (d) TS-3b: the attribute present ONLY on the checked-out ("ours") side (added after divergence from a common ancestor that never had it), merging in an incoming branch that never had it, still resolves CLEANLY -- the decisive, stronger sensitivity check.'
    );

  const key_changes = (existing.key_changes || []).map((kc) => {
    if (typeof kc?.change === 'string' && kc.change.includes('documented with the merge-base precondition')) {
      return { ...kc, change: kc.change.replace('documented with the merge-base precondition', 'documented with the real precondition (checked-out/"ours" side\'s history at merge time, not the merge-base)') };
    }
    if (typeof kc?.change === 'string' && kc.change.includes('proving the default strategy conflicts and merge=union resolves the same scenario cleanly, including a precondition-sensitivity check')) {
      return { ...kc, change: kc.change.replace('including a precondition-sensitivity check', 'including TS-3a/TS-3b precondition-sensitivity checks (theirs-only still conflicts; ours-only resolves cleanly)') };
    }
    return kc;
  });

  const risks = (existing.risks || []).map((r) => {
    if (typeof r?.risk === 'string' && r.risk.includes('Already-open branches forked before this .gitattributes change lands on main will not get union behavior until they sync main first')) {
      return {
        ...r,
        mitigation: 'One final conflict on the first sync per already-open branch (the branch\'s own checked-out history still lacks the attribute at that moment), then clean thereafter once that sync brings the attribute into its own tip. This matches the existing, already-required pre-ship main-sync workflow -- one extra conflict resolution per open branch, not an ongoing burden.',
      };
    }
    return r;
  });

  const success_criteria_note = '\n\nNote (PLAN-phase TESTING correction): the "zero conflicts" success criterion is scoped to LOCAL git merge/rebase operations (the actual path that produces the reported pain -- shipping prep, main-sync before /ship). GitHub\'s server-side PR-merge button does not apply .gitattributes merge drivers to its own conflict detection; this SD does not claim to fix that separate path.';

  const metadata = {
    ...existing.metadata,
    plan_precondition_correction: {
      corrected_at: new Date().toISOString(),
      corrected_by: 'PLAN (session 9a78de7f-f379-460a-8a47-b2e5e5c5618f)',
      basis: 'PLAN-phase TESTING sub-agent evidence (12 real isolated-repo git scenarios) + PLAN\'s own independent decisive reproduction of both corrections before accepting them',
      reason: 'LEAD\'s original claim that merge=union requires the attribute in the git MERGE-BASE was factually wrong -- git reads .gitattributes from the checked-out ("ours") side\'s working tree/history at merge time. Also corrected: the "self-resolving" framing for already-open branches was wrong -- there is one real conflict on first sync, not zero.',
    },
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      description: description + success_criteria_note,
      key_changes,
      risks,
      metadata,
    })
    .eq('id', existing.id);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log(`Corrected precondition wording for ${SD_KEY} (id=${existing.id}).`);
  return { sdId: existing.id };
}

if (isMainModule(import.meta.url)) {
  correctPrecondition().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
