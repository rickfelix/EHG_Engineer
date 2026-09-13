// SD-FDBK-ENH-COMPLETION-FLAG-HARNESS-001 -- EXPLORE + VALIDATION evidence writers (LEAD phase).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-FDBK-ENH-COMPLETION-FLAG-HARNESS-001';
const PHASE = 'LEAD';

const exploreResults = {
  verdict: 'PASS',
  confidence: 90,
  summary:
    'Explored EHG_Engineer (worktree .worktrees/SD-FDBK-ENH-COMPLETION-FLAG-HARNESS-001, branch ' +
    'feat/SD-FDBK-ENH-COMPLETION-FLAG-HARNESS-001). Only two createDnsAdapter() consumers exist ' +
    '(dns-wiring.js itself, and lib/venture-email/provision-venture-email.js:219) -- neither overrides ' +
    'the token, both are transparent to a token-resolution change inside the factory. ' +
    'CLOUDFLARE_DNS_API_TOKEN is unreferenced anywhere in code/tests/docs/CI (only a literal value in ' +
    '.env:168) -- a brand-new but unwired credential; the repo already has precedent for multiple ' +
    'distinct scoped Cloudflare tokens (CLOUDFLARE_API_TOKEN for analytics, CF_EMAIL_ROUTING_TOKEN for ' +
    'email), so adding a DNS-scoped one is consistent, not a new idiom. Existing test ' +
    'tests/unit/venture-acquisition/dns-wiring-e2e.test.js:120 asserts non-null using ONLY the registrar ' +
    'token -- a DNS-token-preferred/registrar-fallback design preserves this. The source secret-scan test ' +
    '(lines 210-222) regexes literal `CLOUDFLARE_REGISTRAR_API_TOKEN\\s*=` assignment -- a `||` fallback ' +
    'read does not match it and stays green, but must extend coverage to the new var. registrar-adapter.js ' +
    'confirmed OUT OF SCOPE: its only HTTP surface is /domain-search, /domains/{d}/check, /domains, account ' +
    'billing, and /registrations -- never /zones or /dns_records.',
  recommendations: [
    'Preserve dns-wiring-e2e.test.js:119/120/203 exactly -- registrar-token-only construction must stay non-null.',
    'Extend the source secret-scan test to also guard CLOUDFLARE_DNS_API_TOKEN.',
    'No .env.example or docs currently reference either token by name -- pre-existing gap for the whole Cloudflare-token family, not newly introduced by this fix; optional doc-comment update only.',
  ],
  metadata: {
    exploration_mode: 'dns_wiring_credential_scope_recon',
    consumers_of_create_dns_adapter: [
      { file: 'lib/venture-acquisition/dns-wiring.js', line: 33, note: 'definition + default export' },
      { file: 'lib/venture-email/provision-venture-email.js', line: 219, note: 'passes env through unchanged, no token override' },
    ],
    existing_tests_file: 'tests/unit/venture-acquisition/dns-wiring-e2e.test.js',
    existing_tests_lines_to_preserve: [119, 120, 203],
    secret_scan_test_lines: [210, 222],
    registrar_adapter_out_of_scope: true,
    cloudflare_dns_api_token_prior_references_in_repo: 0,
  },
  execution_time_ms: 180000,
};

const validationResults = {
  verdict: 'PASS',
  confidence: 85,
  summary:
    'CONDITIONAL PASS: re-probed both tokens live against api.cloudflare.com/client/v4 non-mutating ' +
    'endpoints (listZones, listRecords, createZone dry checks). Corrected the SD\'s original stated ' +
    'symptom: GET /zones succeeds (200) with BOTH tokens -- it is NOT the discriminator. The real, ' +
    'measured failure is at /zones/{id}/dns_records: CLOUDFLARE_REGISTRAR_API_TOKEN returns 403 code ' +
    '10000 "Authentication error"; CLOUDFLARE_DNS_API_TOKEN succeeds/is authorized. Separately, NEITHER ' +
    'token can createZone (403, missing zone.create permission) -- an unfixable-by-token-swap ops gap that ' +
    'must be fenced, not silently left to fail for brand-new venture domains. Fix shape (prefer DNS token, ' +
    'fallback to registrar token) is sound, minimal (~2 LOC), non-breaking against existing tests, and LOWERS ' +
    'blast radius (DNS token is strictly narrower-scoped than the registrar token, confirmed 403 on ' +
    '/accounts/{id}). Tier 3 / feature classification is protocol-correct regardless of LOC size because ' +
    '"credentials" is a risk keyword (CLAUDE.md forces Tier 3), independent of the sd_type mislabel note below.',
  recommendations: [
    'Correct the SD description before PLAN so the false /zones-lookup symptom does not propagate into the PRD (done, this same LEAD pass).',
    'Acceptance criteria must discriminate on listRecords/createRecord, never on listZones (listZones is a false discriminator -- passes with both tokens).',
    'Add a token-precedence unit test asserting the exact Authorization header value per token-presence combination, not just non-null.',
    'Explicitly fence the createZone/zone.create permission gap in the PRD as blocked_on_credentials, out of scope for this fix.',
    'Extend the secret-scan test to CLOUDFLARE_DNS_API_TOKEN; fix the stale registrar-adapter.js:15 comment claiming DNS-edit scope.',
  ],
  metadata: {
    validation_mode: 'lead_phase_premise_and_fix_shape_check',
    live_reprobe_performed: true,
    corrected_symptom: 'listZones succeeds with both tokens (200); the real 403 is on dns_records endpoints with the registrar token only',
    unfixable_gap_found: 'createZone 403s with both tokens -- missing zone.create permission, an ops action not a code fix',
    blast_radius: 'low -- DNS token is narrower-scoped than the registrar token',
    adjacent_out_of_scope_finding: 'CLOUDFLARE_API_TOKEN (cloudflare-cost-adapter.js, venture-cause-capture.js) is absent from .env -- same-class credential-wiring drift in different modules, flagged not fixed',
  },
  execution_time_ms: 342418,
};

async function storeOne(code, agentName, results) {
  const resolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: code, targetApplication: 'EHG_Engineer' });
  applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults(code, SD_ID, { name: agentName }, results, { phase: PHASE, source: 'manual' });
  console.log(`${code}_STORED_VERDICT=${results.verdict}`);
  console.log(`${code}_STORED_ROW_ID=${stored?.id || stored?.data?.id || JSON.stringify(stored)}`);
  console.log(`${code}_REPO_PATH=${results.metadata.repo_path}`);
}

await storeOne('EXPLORE', 'Explore (Claude Code built-in)', exploreResults);
await storeOne('VALIDATION', 'Principal Systems Analyst v3.0.0', validationResults);
