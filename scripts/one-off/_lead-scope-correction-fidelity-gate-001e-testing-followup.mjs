import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FIX-IMPLEMENTATION-FIDELITY-GATE-001';

const { data: row, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata, success_criteria')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) { console.error('fetch error:', fetchErr); process.exit(1); }

const followup = `Prospective TESTING sub-agent follow-up (2026-09-11, sub_agent_execution_results id=6abb244c-be82-4f79-96fc-5ec2c9a54143, PASS): empirically reproduced the defect against live code (3 FRs, 1 approver-descoped, 0 stories, 0 TESTING rows -> has_work_product=false -> still emits the false "sibling FRs are referenced" line). Confirms VALIDATION+RISK's has_work_product===undefined-in-fixtures hazard and the strict === false requirement independently (>=9 fixtures, including the TS-10 byte-identical pair). Confirms has_work_product is computed once SD-wide (not per-FR) -- all undelivered FRs in an SD share one value, so no mixed-branch case exists, BUT has_work_product=false does NOT imply undelivered===total (a descope needs no work product) -- the new message must use the undelivered count, never total. Confirms zero consumers outside the module (both gate callers read only passed/score/required/details; warnings are display-only, never persisted). Confirms no existing test pins the old aggregate text (the 4 at-risk assertions match only FR ids or /undelivered/i, satisfied by the per-FR list lines -- the fix MUST keep emitting that list in both branches or those 4 break).

HAZARD-2 (MEDIUM, must respect): tests/unit/handoff/gates/fr-delivery-classifier.test.js:844-899 runs a hermetic mutation test asserting THREE exact anchor strings each occur EXACTLY ONCE in fr-delivery-classifier.js: (1) "const deliveredBy = validated.find((s) => frReferencesId(s, id));", (2) "import { specFileExists } from '../../../../lib/stories/e2e-path-guard.js';", (3) "import { safeQuery } from '../../../../lib/db/safe-query.mjs';". New code/comments added by this fix must not duplicate any of these three literal substrings anywhere else in the file (none are near the projectGateResult message or the stale fallthrough comment this fix also touches, but this constrains how any refactor/comment-copy is worded).

BASELINE (runner-produced, pre-change, for EXEC's regression comparison): 4 test files, 118 tests passed, 0 failed. Artifact sha256 e1834bb0a28dc0a339e83ee899288b59020fd0b610bfcd5b1d76a09632f48c9f.

ADDITIONAL IN-SCOPE FIX (tiny, same file, same root-cause class as the main defect, flagged directly by TESTING): the comment above the final fallthrough branch in classifyFrDelivery (near the "why" ternary, ~line 582-589) incorrectly claims that branch is reachable "only when unmeasurable===false and hasWorkProduct===true" -- this is factually wrong, the has_work_product=false case also reaches this same fallthrough (that IS the bug this SD fixes: the ternary's own has_work_product?...:... already correctly branches the per-FR evidence text there, only the comment describing it is stale/wrong). Correct the comment to describe both reachable cases accurately. Zero behavior change, comment-only.

EXPLICITLY OUT OF SCOPE (TESTING's own observations, recorded so EXEC does not widen scope):
(1) The persisted fr_classification metadata field carries convention_in_use but not has_work_product -- nice-to-have for future debugging, not required for this fix (counts already disambiguate).
(2) An SD with zero work product whose FRs are ALL approver-descoped scores 100 with zero warnings today -- arguably correct by design (descope is a legitimate human-reviewed disposition regardless of work product), but flagged as its own potential future ticket, NOT touched here.

Recommended test additions (6, folded into success_criteria[1].measure): both branches (false/true), the mixed-count descope edge (e.g. 2/3 undelivered, not 3/3, under has_work_product=false), a legacy-shape guard (absent has_work_product field keeps OLD/true-branch text, proving the strict === false direction), a mutual-exclusivity invariant pin (undelivered>0 and unverifiable>0 never both true), and a non-regression pin that passed/score/required/over_ceiling are byte-identical before and after.`;

const newMetadata = {
  ...(row.metadata || {}),
  lead_scope_correction: `${row.metadata?.lead_scope_correction || ''}\n\n${followup}`,
  pre_change_test_baseline: {
    measured_by: 'testing-prospective-fidelity-gate',
    measured_at: '2026-09-11T23:00:00Z',
    test_files: 4,
    tests_passed: 118,
    tests_failed: 0,
    artifact_sha256: 'e1834bb0a28dc0a339e83ee899288b59020fd0b610bfcd5b1d76a09632f48c9f',
  },
  mutation_test_anchor_constraint: {
    file: 'tests/unit/handoff/gates/fr-delivery-classifier.test.js',
    lines: '844-899',
    anchors_must_remain_unique: [
      'const deliveredBy = validated.find((s) => frReferencesId(s, id));',
      "import { specFileExists } from '../../../../lib/stories/e2e-path-guard.js';",
      "import { safeQuery } from '../../../../lib/db/safe-query.mjs';",
    ],
  },
};

// success_criteria[1] measure gets the 6 recommended tests + the two hazards; criteria[1].criterion
// gets the tiny stale-comment fix folded in as additional, same-root-cause, comment-only scope.
const criteria = row.success_criteria;
criteria[1].criterion += ' Additionally (comment-only, zero behavior change): the stale comment above the fallthrough branch in classifyFrDelivery, which incorrectly claims that branch is reachable "only when has_work_product===true", is corrected to describe both reachable cases (has_work_product true AND false) accurately -- this is the same reasoning error as the main defect, left behind in a comment, flagged directly by prospective TESTING review.';
criteria[1].measure = 'Six new tests (per prospective TESTING review, evidence 6abb244c-be82-4f79-96fc-5ec2c9a54143): (1) has_work_product===false branch emits the corrected message with the UNDELIVERED count (never total -- a descope needs no work product so undelivered can be < total even when has_work_product=false); (2) has_work_product===true branch byte-identical to current/pre-fix message; (3) strict `=== false` proven via a legacy-shape fixture with has_work_product absent/undefined, which must route through the TRUE/existing branch (not the new one); (4) the mixed-count descope edge (e.g. 2 of 3 undelivered under has_work_product=false); (5) a mutual-exclusivity invariant pin (undelivered>0 and unverifiable>0 never both true in one classification); (6) a non-regression pin that passed/score/required/over_ceiling are byte-identical before and after this change. All 4 pre-existing at-risk assertions (matching FR ids or /undelivered/i via the per-FR list lines) must continue to pass unmodified -- the per-FR list must still be emitted in both branches. New code/comments must not duplicate any of the 3 mutation-test anchor strings recorded in metadata.mutation_test_anchor_constraint. Baseline for EXEC regression comparison: 118/118 passing across 4 files pre-change (metadata.pre_change_test_baseline). No change to passed/score/required/blocking computation (independently confirmed safe by RISK). No feature flag.';

const { error: updErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: newMetadata, success_criteria: criteria })
  .eq('sd_key', SD_KEY);
if (updErr) { console.error('update error:', updErr); process.exit(1); }

console.log('OK: TESTING follow-up folded in (baseline, mutation-test constraint, 6 tests, stale-comment fix, out-of-scope notes) for', SD_KEY);
