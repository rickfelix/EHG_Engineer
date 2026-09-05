import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', 'SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-E')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: "Run: node -e \"import('./lib/quality/gate-threshold-shadow.js').then(m => console.log(m.resolveLiveRescoreThreshold('feature','prd')))\"",
    expected_outcome: "Prints 65 (the LIVE config.js value for feature/prd), not 60 (the pre-raise historical value the view's current_threshold column still carries for older rows).",
  },
  {
    step_number: 2,
    instruction: "Run: npx vitest run tests/unit/quality/gate-threshold-shadow.test.js",
    expected_outcome: "All existing tests plus the new FR-1/FR-3 tests pass; the coverage-completeness test fails if a mutation removes a SD_TYPE_PASS_THRESHOLDS pair, proving it discriminates.",
  },
  {
    step_number: 3,
    instruction: "Run: node scripts/gate-threshold-shadow-rescore.mjs and inspect the printed line for feature/prd",
    expected_outcome: "The candidate population query now filters ai_quality_assessments on pass_threshold=65 (live), reporting n and pass-rate figures consistent with sibling -B's independently hand-verified n=10/90.0% (not the pre-fix vacuous n=34/33-row ghost-population numbers already marked DO-NOT-cite in config.js).",
  },
];

const success_criteria = [
  {
    criterion: 'gate-threshold-shadow-rescore.mjs\'s population filter uses the LIVE threshold (scoring.js getPassThreshold), never the view\'s historical current_threshold column',
    measure: 'Verified: lib/quality/gate-threshold-shadow.js exports resolveLiveRescoreThreshold(); scripts/gate-threshold-shadow-rescore.mjs\'s query uses it in place of c.current_threshold at the former line 59; TS-1 unit test proves a stale fixture current_threshold (60) is ignored in favor of the live value (65)',
  },
  {
    criterion: 'Every raised (sd_type, content_type) pair carries a live-threshold-verified pass-rate annotation in config.js, extending sibling -B\'s existing 3-pair coverage',
    measure: 'Verified live: config.js comments cite a directly-queried (pass_threshold=<live value>) n/pass-rate/window for every raised pair; any newly-confirmed-vacuous pre-fix shadow_rescore feedback row for a previously-uncovered pair carries a DO-NOT-cite note matching sibling -B\'s pattern',
  },
  {
    criterion: 'A CI-run unit test enumerates every configured SD_TYPE_PASS_THRESHOLDS pair and asserts each resolves via resolveLiveRescoreThreshold, and demonstrably fails on a coverage-removing mutation',
    measure: 'Verified: tests/unit/quality/gate-threshold-shadow.test.js runs in the existing Unit Tier CI job (no new workflow file); the mutation test (TS-2) is run and confirmed to fail before the fix, pass after',
  },
  {
    criterion: 'Zero regressions: no threshold value changes, no existing test breaks',
    measure: 'Verified: full relevant test suite run clean; config.js diff contains comment-only changes, no SD_TYPE_PASS_THRESHOLDS value edits',
  },
];

const key_changes = [
  { change: 'lib/quality/gate-threshold-shadow.js gains resolveLiveRescoreThreshold(sdType, contentType), a pure wrapper around scoring.js getPassThreshold', impact: 'Gives the re-score script a live-threshold source instead of trusting the view\'s historical current_threshold column' },
  { change: 'scripts/gate-threshold-shadow-rescore.mjs\'s population filter query switched from the view\'s historical current_threshold to the new live-resolved value', impact: 'Fixes the root defect: post-apply audit runs of this script now genuinely re-score the live population instead of a stale ghost group, for any already-raised pair' },
  { change: 'config.js gains DO-NOT-cite / live-verified comment annotations for the raised pairs sibling -B did not already cover', impact: 'Extends the existing hand-verification pattern to full coverage so no raised pair is left citing a vacuous shadow row as safety evidence' },
  { change: 'New CI-run unit test asserting every configured threshold pair resolves via the live getter', impact: 'Prevents a future config.js edit from silently adding an unresolvable pair, which would make the population filter itself wrong without any test noticing' },
];

const strategic_objectives = [
  'Give child D of this same parent SD a non-vacuous instrument before it hand-inspects the two three-flip pairs and rules SOUND/UNSOUND -- D explicitly sequences after this child for exactly this reason',
  'Close the specific, verified defect (population filter keyed to a historical column instead of the live threshold) without touching threshold values, view SQL, or building new CI infrastructure beyond one test file',
];

const risks = [
  {
    risk: "FR-2's live re-verification queries could surface a pair where the raise looks unsound under the live threshold",
    impact: 'medium', likelihood: 'low',
    mitigation: 'This SD only documents/annotates -- sound/unsound decisions are explicitly child D\'s job, sequenced after this one',
  },
  {
    risk: "config.js's shape changes (new sd_type/content_type) before this SD merges",
    impact: 'low', likelihood: 'low',
    mitigation: "FR-3's own coverage test fails loudly in CI if a configured pair is unresolvable, catching drift immediately",
  },
];

const mechanism_verifications = [
  { verified_by: 'fork-investigation', verified_at: 'scripts/gate-threshold-shadow-rescore.mjs:59' },
  { verified_by: 'fork-investigation', verified_at: 'database/chairman-gated/20260804_ai_quality_tuning_symmetric_guards.sql:92' },
  { verified_by: 'fork-investigation', verified_at: 'scripts/modules/ai-quality-evaluator/scoring.js:90' },
  { verified_by: 'fork-investigation', verified_at: 'scripts/modules/ai-quality-evaluator.js:139' },
  { verified_by: 'fork-investigation', verified_at: 'scripts/modules/ai-quality-evaluator/storage.js:112' },
  { verified_by: 'fork-investigation', verified_at: 'lib/quality/gate-threshold-shadow.js:29' },
];

const scope_decision = "FR-2's original addendum text asked to mark ALL pre-fix shadow rows do-not-cite; investigation found sibling -B already did this by hand for 3 of the raised pairs directly in config.js (feature/prd, security/user_story, bugfix/prd), so FR-2 is narrowed to the remaining uncovered pairs, avoiding duplicate work.";

const newMetadata = { ...sd.metadata, mechanism_verifications, scope_decision };

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ smoke_test_steps, success_criteria, key_changes, strategic_objectives, risks, metadata: newMetadata })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-E: smoke_test_steps, success_criteria, key_changes, strategic_objectives, risks, and metadata.mechanism_verifications updated.');
