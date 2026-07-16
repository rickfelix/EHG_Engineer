import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const SD_KEY = 'SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001';

const { data: prd, error: fetchErr } = await supabase
  .from('product_requirements_v2')
  .select('id, functional_requirements')
  .eq('directive_id', SD_KEY)
  .single();
if (fetchErr) throw fetchErr;

const frs = prd.functional_requirements;
const fr2 = frs.find((f) => f.id === 'FR-2');
const fr3 = frs.find((f) => f.id === 'FR-3');

fr2.description += ' POST-REVIEW CORRECTION (adversarial-review finding, PR #6104): passing blocking=true alone does NOT make createOrReusePendingDecision mint a row — the function self-skips minting entirely for any stage where the pre-existing stage_creates_decision predicate (gate_type IN (\'kill\',\'promotion\') OR review_mode=\'review\') is false, which is exactly the gate_type=\'none\' case this feature exists to cover. The three callers therefore ALSO now pass forceDecisionCreation: isHighConsequence(stage) alongside blocking, so a high-consequence stage mints a decision even when it would otherwise self-skip. See FR-3\'s corrected description for the full minting-trigger fix (this was originally scoped as an FR-3 concern but the parameter lives in FR-2\'s function).';

fr3.description += ' POST-REVIEW CORRECTION (Deep-tier /ship adversarial review + RCA, PR #6104): the original FR-3 scope (both chokepoints HOLD on an existing pending blocking=true row) was necessary but not sufficient — it left the feature inert for its own headline case, because nothing ever MINTED that row for a stage classified high-consequence but not already kill/promotion/review (e.g. a first live-money/launch stage with gate_type=\'none\'). Fixed by extending the two existing mint-and-hold triggers in lib/eva/stage-execution-worker.js: (1) the review-mode-pause block (~line 1245, inside _processVenture) now ALSO triggers on isHighConsequence(stage) regardless of review_mode, and bypasses the _canAutoAdvance check entirely when high-consequence (autonomy can never auto-approve away a chairman-designated high-consequence stage — that would defeat the classification\'s purpose); (2) _handleChairmanGate (~line 2251, used for kill/promotion-gated stages) now skips BOTH its autonomy auto-approve shortcuts (checkAutonomy and _canAutoAdvance) when isHighConsequence(stage) is true, since a promotion_gate is otherwise auto-approved at L2+ autonomy, which would silently bypass a high-consequence promotion stage too. Both mint calls now pass forceDecisionCreation:true when high-consequence, defeating createOrReusePendingDecision\'s stage_creates_decision self-skip. Two secondary bugs found by the same review were also fixed: the JS chokepoint\'s _advanceStage backstop was destructuring only {data} (not {error}) on its two supabase reads, so a DB-level error (not a thrown exception) silently produced highConsequenceBlocked=false instead of triggering its own documented fail-closed contract — both reads now throw on a truthy error so the surrounding catch (which correctly fails closed) actually fires; and createOrReusePendingDecision\'s REUSE branch (when a pending decision already exists) never synced the blocking column to the caller\'s current classification, so a stage reclassified high-consequence after a non-blocking decision was already pending would stay blocking=false forever — the reuse branch now updates blocking whenever it differs from the existing row\'s value.';

const newAc = [
  'A stage that is high-consequence but NOT kill/promotion/review-mode/stage-23 (gate_type=\'none\') still gets a blocking=true chairman_decisions row minted, driven end-to-end through the real _processVenture daemon loop, with zero pre-existing pending decision to seed from',
  'A high-consequence stage is NEVER auto-approved away by the autonomy model at any autonomy level (L0-L4), for both the plain-gate (review-mode-block) and kill/promotion (_handleChairmanGate) mint paths',
  'A non-high-consequence stage\'s existing autonomy auto-approve behavior (including promotion_gate auto-approving at L2+) is completely unchanged (regression-pinned)',
  'The JS chokepoint fails CLOSED on a supabase {error} response from either of its two reads (flag read, decision read), not just on a thrown exception',
  'Reusing an existing pending decision syncs its blocking column to the caller\'s current classification when they differ, and leaves it untouched when they already match',
];
fr3.acceptance_criteria.push(...newAc);

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements: frs })
  .eq('id', prd.id);
if (updateErr) throw updateErr;

console.log('PRD updated: FR-2 + FR-3 corrected, FR-3 gained', newAc.length, 'new acceptance criteria.');
