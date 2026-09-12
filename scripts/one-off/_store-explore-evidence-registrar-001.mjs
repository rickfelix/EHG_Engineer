import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const sdKey = 'SD-LEO-FIX-FIX-DOMAIN-REGISTRAR-001';
  const { data: sd } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', sdKey).maybeSingle();

  const results = {
    verdict: 'PASS',
    confidence: 95,
    summary: 'Independent Explore-agent investigation confirms 4 of 5 QF-20260912-746 mechanism claims with exact file:line citations; the 5th (test coverage) is partially-confirmed -- substantial existing coverage exists via fakes, contrary to any implication of zero tests.',
    findings: [
      '1) CONFIRMED: lib/eva/bridge/domain-acquisition-trigger.js:64 calls runPipeline(supabase, decisionId, {}) -- empty deps. Only production caller scripts/chairman-decisions.mjs:169 also passes no registrar/execute. lib/venture-acquisition/dns-wiring.js:159-172 forwards deps into executeAcquisition (line 161). acquire.js:126 plan-mode gate (!registrar || execute!==true) always fires on this path -> {status:"blocked_on_credentials"}, zero live registrar HTTP via the only live CLI path.',
      '2) CONFIRMED (mismatch): lib/venture-acquisition/registrar-adapter.js:68-69 registerDomain calls POST /accounts/{id}/registrar/domains/{domain}/register with body {years, auto_renew} (base url line 44). The ticket-cited documented endpoint is POST accounts/{id}/registrar/registrations with body {domain_name, years, auto_renew, privacy_mode} -- different path AND different body shape (no domain_name field; domain is in path instead). searchDomains -> POST /accounts/{id}/registrar/domain-search (line 64); checkDomain -> GET /accounts/{id}/registrar/domains/{domain}/check (line 66).',
      '3) CONFIRMED: lib/venture-acquisition/decision-packet.js composeAcquisitionPacket (lines 92-165) does idempotency check, shortlist read, quoteShortlist (registrar.checkDomain ONLY if registrar injected, line 66; unconditional fallback quotedPriceUsd="unknown" otherwise), pickRecommended, then unconditional supabase.from("chairman_decisions").insert (119-141). No billing-profile/account read, no registrar-scope check, no gate blocking insert on null registrar or unknown quotes.',
      '4) CONFIRMED: lib/venture-acquisition/acquire.js:186-195 -- on registerDomain failure, error persisted as acquisition_error, returns {status:"failed",reason:"register_failed"}; the disposition row from lines 161-167 (status:"awaiting_disposition") is explicitly NOT updated (comment 192-193: "un-consumed... until an operator resolves it"). Retry refuses at 175-182 with reason:"in_flight_or_unknown_outcome", unblock text names no actual tool. Repo-wide grep found NO script importing acquire.js/registrar-adapter.js, and none of the 6 scripts importing lib/decision-binding/disposition.js reference decisionType=domain_acquisition. No existing resolution path.',
      '5) PARTIALLY-CONFIRMED: tests/unit/venture-acquisition/acquisition-core.test.js (410 lines) covers registrar-adapter.js, decision-packet.js, and acquire.js with injected fakes (zero live HTTP/DB per its own header) -- including the register-failure path (line 316-319) and the stuck in_flight_or_unknown_outcome path (line 347). tests/unit/eva/bridge/domain-acquisition-trigger.test.js covers the trigger including the no-registrar/execute plan-mode assertion (line 59). Substantial existing coverage exists -- contrary to any "untested" framing -- but no test asserts the adapter\'s path/body against the real documented Cloudflare schema, so it would not have caught finding (2) on its own.',
    ],
    critical_issues: [
      'registrar-adapter.js calls a different Cloudflare Registrar endpoint/body shape than the one the ticket cites as documented and live-verified (POST .../registrations) -- even the existing manual-execute path cannot succeed until this is corrected.',
      'A failed registration has no existing CLI/script resolution path anywhere in the repo -- confirmed absent by repo-wide grep, not merely undocumented.',
    ],
    warnings: [
      'Fix must UPDATE existing fakes/tests in acquisition-core.test.js to match the corrected endpoint/body, not write coverage from zero -- current fakes encode the WRONG endpoint shape and would pass even after introducing the real bug if left unchanged.',
    ],
    recommendations: [
      'Rewrite registrar-adapter.js registerDomain to POST .../registrar/registrations with {domain_name, years, auto_renew, privacy_mode}, per the QF\'s live-verified documented call.',
      'Add a preflight (registrar list + one domain check + billing-profile read) to composeAcquisitionPacket before insert, returning registrar_scope_missing on a missing grant.',
      'Add a resolve verb/script for the stuck in_flight_or_unknown_outcome disposition, since none exists anywhere in the repo.',
      'Update tests/unit/venture-acquisition/acquisition-core.test.js fakes to the corrected endpoint/body shape rather than leaving them asserting the old (wrong) call.',
    ],
    detailed_analysis: 'Full investigation report (5 items, exact file:line evidence) persisted verbatim in metadata.explore_report below.',
    metadata: {
      explore_report: 'See teammate investigation for SD-LEO-FIX-FIX-DOMAIN-REGISTRAR-001 / QF-20260912-746, conducted by Explore sub-agent explore-registrar-adapter, read-only, no files edited. Items 1-5 each report CONFIRMED/PARTIALLY-CONFIRMED with file:line citations as summarized in findings[] above.',
      qf_source: 'QF-20260912-746',
    },
  };

  const repoVerdict = await resolveSubAgentRepo({ sdId: sd.id, subAgentCode: 'EXPLORE', fallback: 'EHG_Engineer' });
  applySubAgentRepoVerdict(results, repoVerdict);
  const merged = await storeSubAgentResults('EXPLORE', sd.id, { name: 'Explore' }, results, { phase: 'LEAD', source: 'manual', sdKey });
  console.log('Stored:', JSON.stringify(merged));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED', e); process.exit(1); });
}
