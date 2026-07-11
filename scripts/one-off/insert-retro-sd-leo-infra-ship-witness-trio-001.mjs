#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '058c7ed7-34d1-4df0-843c-0e91023e81ed';
const SD_KEY = 'SD-LEO-INFRA-SHIP-WITNESS-TRIO-001';

const retro = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  learning_category: 'PROCESS_IMPROVEMENT',
  target_application: 'EHG_Engineer',
  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  quality_score: 90,
  title: `Retrospective: ${SD_KEY} — Closing the Merge-Work Witness Trio`,
  description:
    'The closure map (PR #5840, chairman-ratified) flagged three loose ends left by the prior ship-witness SDs as one coherent trio: (FR-1) the observation ladder built by SHIP-WITNESS-MERGEWORK-001 was only ever wired into /ship\'s own auto-merge path, leaving the quick-fix and worktree-merge lanes\'s direct `gh pr merge` calls completely unobserved; (FR-2) `ship_review_findings` had no actor-attribution columns, so P2\'s witness rung could not distinguish agent-authored from human-authored review findings; (FR-3) admin-override (`enforce_admins`) merges had zero dual-key audit trail. All three were delivered: `observeMergeWorkLadder()` (already exported from a prior SD) is now called from `scripts/modules/complete-quick-fix/git-operations.js`\'s `mergeToMain()` and `scripts/modules/shipping/worktree-merge.js`\'s merge path via two new best-effort, never-throw wrapper functions; `evaluateP2Witness()` gained an additive `actorSeparation` sub-field (backed by a new, still chairman-gated-pending `ship_review_findings.metadata` column) while its own top-level pass/fail stayed verdict-only, preserving TR-3 backward compatibility; and `evaluateP4ProtectionIntegrity()` gained an additive `escapeAuth` sub-field backed by a new chairman-gated-pending `ship_escape_audit` table with a schema-enforced (not just documented) dual-key NOT NULL constraint on both merge identity (pr_number+repo) and actor identity (session_id). The scope itself required correction before EXEC began: the closure map\'s own paraphrase mislabeled which retrospective contained the "actor columns" commitment — attributing it to SD-LEO-INFRA-SHIP-WITNESS-APPLICATIONS-001\'s retro (a50dd499) when the actual text lived in SD-LEO-INFRA-SHIP-WITNESS-MERGEWORK-001\'s retro (b119bba1) instead. This was caught by directly querying the retrospectives table rather than trusting the audit document\'s paraphrase — the same lesson the immediately-prior SD in this session (HARNESS-BACKLOG-DRAIN-POLICY-001) had itself just captured as an action item ("verify PRD-cited facts against live state before they drive implementation"), applied here to a chairman-ratified closure map rather than a PRD. A pre-existing structural gap unrelated to this SD\'s own logic was also fixed as a side effect: `worktree-merge.js` had no CLI-invocation guard at all (a bare `main()` call executed unconditionally at import time), which would have made the new `observeWorktreeMerge()` wrapper impossible to safely unit-test; added the same realpathSync-based ESM guard pattern already used elsewhere in the repo (`capture-completion-flags.js`).',
  affected_components: [
    'lib/ship/auto-merge.mjs',
    'lib/ship/merge-witness-ladder.mjs',
    'lib/ship/escape-auth.mjs',
    'lib/ship/ship-witness-enforcement.mjs',
    'scripts/modules/complete-quick-fix/git-operations.js',
    'scripts/modules/shipping/worktree-merge.js',
    'database/migrations/20260711_ship_review_findings_actor_metadata.sql',
    'database/migrations/20260711_ship_escape_audit.sql',
    'tests/unit/ship/merge-witness-ladder.test.js',
    'tests/unit/ship/escape-auth.test.js',
    'tests/unit/ship/merge-witness-trio-lane-extension.test.js',
  ],
  what_went_well: [
    'Independently verified a chairman-ratified closure map\'s own factual claim against the live retrospectives table before writing the PRD, rather than trusting the audit document\'s paraphrase at face value — found the "actor columns" commitment was attributed to the wrong retro (a50dd499 vs the correct b119bba1), and corrected the SD\'s scope with a documented metadata.scope_correction before any code was written. This is the exact "verify PRD-cited facts against live state" lesson the immediately-prior SD in this same session had just captured as its own action item, demonstrating it was genuinely internalized rather than a one-off catch.',
    'Preserved backward compatibility deliberately, not accidentally: both FR-2 and FR-3 add new sub-fields (`actorSeparation`, `escapeAuth`) to existing rung objects while explicitly keeping the parent rung\'s top-level `.status` computation byte-identical to pre-SD behavior — reasoned through and confirmed via `evaluateEnforcementDecision()`\'s own header comment (which already documented P4/escapeAuth wiring as deferred to "a future SD") that this SD could not regress the enforce-flip decision path.',
    'Made the FR-3 dual-key invariant real, not just documented: `writeEscapeAuditRow()` throws before attempting an insert if either half of the dual key (merge identity or actor identity) is missing, and the DDL itself has both halves as separate NOT NULL constraints — verified independently by the VALIDATION sub-agent as "enforced in code, not just documentation."',
    'Ran a REGRESSION sub-agent specifically targeting the one genuinely dangerous change in the diff (making `evaluateP4ProtectionIntegrity()` async, a breaking signature change to a pre-existing function) rather than treating TESTING\'s pass as sufficient — REGRESSION independently repo-wide-grepped every call site to confirm none read `.status` off an unawaited Promise, which is exactly the class of defect that would pass type-loose checks but silently corrupt behavior at runtime.',
    'Fixed a pre-existing, unrelated structural gap (no CLI-invocation guard on worktree-merge.js) discovered only because it blocked testing the new code, rather than working around it with a test-only hack — matched the guard pattern already established elsewhere in the repo instead of inventing a new one.',
  ],
  what_needs_improvement: [
    'The chairman-ratified closure map itself contained a factual error (misattributed retro ownership) that would have propagated into a wrongly-scoped PRD if not independently re-verified. Closure maps and other audit documents that paraphrase retrospective content should link the exact retro UUID/action-item index they are citing, not just a source SD key, so future scoping work does not have to re-derive which retro actually contains a given commitment.',
    'The PRD\'s terse test_scenario prose (TS-3, TS-5) described the intended verification at a coarser grain than what actually shipped — e.g. TS-3 said evaluateP2Witness() should "return pass or fail (not not_evaluable)" when the more correct design (preserving TR-3) put that distinction in a sub-field instead of the top-level status. The VALIDATION agent correctly judged the code against the FR text and out-of-scope declarations rather than the looser TS wording, but tighter TS prose naming the exact evaluation locus would have avoided the ambiguity entirely.',
  ],
  action_items: [
    {
      title: 'Closure maps should cite exact retro UUID + action-item index, not just source SD key',
      description: 'This SD\'s scope had to be corrected because the closure map paraphrased "the SD-LEO-INFRA-SHIP-WITNESS-APPLICATIONS-001 retro says X" without citing which specific action item, and the paraphrase turned out to name the wrong retro entirely. Future closure-map entries that reference a retrospective commitment should include the retro row id and action_items[] index so downstream PLAN work can verify instead of re-deriving.',
      priority: 'medium',
      owner_role: 'LEAD',
    },
    {
      title: 'Tighten PRD test_scenario prose to name the exact evaluation locus, not just the expected outcome',
      description: 'TS-3/TS-5 in this SD\'s PRD described outcomes ("returns pass not not_evaluable") without specifying whether that applies to a rung\'s top-level status or an additive sub-field — ambiguous when a design deliberately keeps top-level status unchanged for backward compatibility. Future ship-witness-family PRDs should name the exact field path being asserted.',
      priority: 'low',
      owner_role: 'PLAN',
    },
    {
      title: 'Apply the two chairman-gated migrations once a chairman is available',
      description: 'database/migrations/20260711_ship_review_findings_actor_metadata.sql and database/migrations/20260711_ship_escape_audit.sql are committed but not applied to prod by design (requires-chairman-apply). Both have companion pending-apply docs with exact apply commands and post-apply smoke tests. Code degrades gracefully (not_evaluable) until applied — no urgency, but tracked so it is not forgotten.',
      priority: 'low',
      owner_role: 'operator',
    },
  ],
  key_learnings: [
    'A chairman-ratified audit document (like a closure map) is still a paraphrase of underlying DB rows, not the DB rows themselves — the same "verify PRD-cited facts against live state" discipline that applies to a PRD\'s own claims applies equally to any audit/closure document that cites a retrospective or other source-of-truth row before that citation drives scope.',
    'Additive sub-fields on an existing rung/result object (rather than mutating the parent\'s existing pass/fail semantics) is the correct pattern for extending an already-consumed evaluation function — it lets new information ride along without any existing caller needing to change, and makes the "did this change actually preserve backward compatibility" question directly reviewable in a diff rather than requiring behavioral reasoning about the old vs new pass/fail logic.',
    'A sync-to-async signature change on a still-called production function is exactly the class of change that needs an explicit repo-wide caller grep as evidence, not just "the existing tests still pass after I added await" — tests only prove the call sites the test suite happens to cover; a REGRESSION-style exhaustive grep is the only way to positively rule out an unawaited caller elsewhere in the codebase.',
    'A dual-key invariant (two independent required identities on one audit row) is only real if the write path throws on either half missing, not merely if the DDL marks both columns NOT NULL — schema constraints catch it at the DB layer, but application-layer enforcement that fails fast before attempting the insert gives a clearer, more specific error at the point of the actual bug.',
  ],
  metadata: {
    sd_key: SD_KEY,
    source: 'manual_insert',
    pr_reference: 'PR #5876',
    scope_correction: 'closure map misattributed actor-columns commitment to retro a50dd499 (APPLICATIONS-001); correct source was retro b119bba1 (MERGEWORK-001) item #2',
  },
};

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: existing } = await supabase
  .from('retrospectives')
  .select('id')
  .eq('sd_id', SD_UUID)
  .eq('title', retro.title)
  .maybeSingle();

if (existing) {
  console.log(`[insert-retro] Already exists: ${existing.id} — skipping (idempotent no-op).`);
  process.exit(0);
}

const { data: inserted, error: insertErr } = await supabase
  .from('retrospectives')
  .insert(retro)
  .select('id, quality_score')
  .single();

if (insertErr) {
  console.error('[insert-retro] Insert failed:', insertErr.message);
  process.exit(1);
}

console.log(`[insert-retro] Inserted retrospective ${inserted.id} (initial quality_score=${inserted.quality_score})`);

if (inserted.quality_score !== retro.quality_score) {
  console.log(`[insert-retro] DB trigger computed quality_score=${inserted.quality_score} (target was ${retro.quality_score}) — keeping trigger's value, no correction needed.`);
}
