#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B';

async function main() {
  const { data: row, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, test_scenarios, risks')
    .eq('id', PRD_ID)
    .single();
  if (fetchErr) throw fetchErr;
  const content = {
    functional_requirements: row.functional_requirements,
    test_scenarios: row.test_scenarios,
    risks: row.risks,
  };

  // FR-3: document the chairman-override path as an intentional one-shot escape hatch, and
  // require the S23 latest-attempt query to break ties with created_at DESC (TESTING finding:
  // NULL attempt_number sorts first under DESC in a future edge case).
  const fr3 = content.functional_requirements.find((f) => f.id === 'FR-3');
  fr3.description += ' A chairman-minted chairman_decisions row (decision_type=\'stage_gate_override\', override_key=the same namespaced actorId, matching venture_id, unexpired) is an INTENTIONAL one-shot escape hatch inherited from the shared predicate -- checkStageGate returns verdict=PASS/reason=\'chairman_override\' and, because armed:true is passed, the override is CONSUMED (one-shot) on that single evaluation. This SD does not suppress that behavior (it is the predicate\'s documented, fleet-wide sanctioned bypass), but it must be tested explicitly so it is never mistaken for a leak. The S23 latest-attempt chairman_decisions query breaks ties with a secondary `.order(\'created_at\', {ascending:false})` after attempt_number, defending against a future writer inserting a null attempt_number (which sorts first under a bare DESC).';
  fr3.acceptance_criteria.push('A chairman_decisions row with decision_type=\'stage_gate_override\' matching venture_id+the namespaced override_key permits exactly ONE authorized view; a second call after the first consumes the override is blocked again (one-shot, not standing access)');

  // FR-5: TTL input validation against non-finite/negative values.
  const fr5 = content.functional_requirements.find((f) => f.id === 'FR-5');
  fr5.description += ' ttlSeconds is validated before capping: a non-finite, NaN, zero, or negative value falls back to a DEFAULT_VIEW_URL_TTL_SECONDS constant BEFORE the Math.min cap is applied, so a caller bug (e.g. an accidental NaN) can never propagate an invalid TTL into createSignedUrl (mirrors the SECURITY finding M7 class the underlying stage-gate predicate documents for its own requiredStage validation).';
  fr5.acceptance_criteria.push('mintAssetViewUrl called with ttlSeconds=NaN (or a negative number) on an authorized venture returns expiresInSeconds equal to DEFAULT_VIEW_URL_TTL_SECONDS, never NaN or a negative value');

  // New test scenarios surfaced by the TESTING sub-agent's PLAN_TO_EXEC review.
  content.test_scenarios.push(
    { id: 'TS-11', scenario: 'A matching chairman_decisions stage_gate_override permits exactly one view; a second call after consumption is blocked again', type: 'unit', expected: 'First call: {allowed:true}. Second call (override already consumed): {allowed:false, reason:\'lifecycle_stage_gate_blocked\'}' },
    { id: 'TS-12', scenario: 'Latest S23 product_review attempt has status=\'pending\' (chairman has not yet decided)', type: 'unit', expected: '{allowed:false, reason:\'product_review_not_approved\'} -- a pending attempt is not an approval' },
    { id: 'TS-13', scenario: 'mintAssetViewUrl called with a non-finite/negative ttlSeconds on an authorized venture', type: 'unit', expected: 'expiresInSeconds falls back to DEFAULT_VIEW_URL_TTL_SECONDS, never NaN or negative' }
  );

  // Risk: pre-existing, unrelated infra gap discovered incidentally -- chairman_decisions.override_key
  // is also not live yet, making the override path (and TS-9/TS-11) inert against the real DB today,
  // though safely fail-closed (a missing-column error makes hasActiveOverride() return false, never a
  // false-positive override match).
  content.risks.push({
    risk: 'chairman_decisions.override_key does not exist live yet (a separate, pre-existing migration gap unrelated to this SD, found incidentally during PLAN_TO_EXEC TESTING review) -- the entire chairman-override path in stage-gate-predicate.js#hasActiveOverride is inert against the real DB today.',
    mitigation: 'Fails closed and safe: hasActiveOverride() catches the DB error and returns false, so a missing column can only ever cause an override to NOT apply, never a false-positive bypass. Documented here rather than silently assumed working; TS-9/TS-11 exercise it via mocks only until the column is applied.',
    severity: 'medium'
  });

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({
      functional_requirements: content.functional_requirements,
      test_scenarios: content.test_scenarios,
      risks: content.risks,
    })
    .eq('id', PRD_ID);
  if (updateErr) throw updateErr;
  console.log('Patched PRD (functional_requirements/test_scenarios/risks) with TESTING findings for', PRD_ID);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
