// SD-FDBK-ENH-COMPLETION-FLAG-HARNESS-001 -- TESTING evidence writer (PLAN phase).
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';

const SD_ID = 'SD-FDBK-ENH-COMPLETION-FLAG-HARNESS-001';
const PHASE = 'PLAN';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  summary:
    'PLAN-phase testing-strategy review of tests/unit/venture-acquisition/dns-wiring-e2e.test.js (11 baseline tests, ' +
    'all green, none quarantined). Found 3 load-bearing corrections to the PRD test plan before EXEC: (1) the source ' +
    'emits a LOWERCASE `authorization` header key (dns-wiring.js:43), not "Authorization" -- PRD scenarios must assert ' +
    'the lowercase key or they silently pass against `undefined`. (2) TS-1 must probe listRecords (the actually-broken ' +
    'call, /dns_records), not listZones (succeeds with both tokens per the corrected SD text -- NOT the discriminator). ' +
    '(3) TS-4 (live API probe) cannot be a vitest file: the unit tier deliberately does not load .env, and the ' +
    'integration/db tier\'s db-tier-gate.js refuses fetch/net to any non-loopback host -- must ship as a standalone ' +
    'opt-in script (scripts/one-off/_probe-*.mjs), never wired into CI. (4) TS-6 as originally scenario-ed is FALSE ' +
    'against the source: wireDomainDns() only returns blocked_on_credentials when the adapter itself is null; a ' +
    'createZone 403 THROWS uncaught through wireDomainDns (line 94), it is not caught and downgraded -- TS-6 must ' +
    'assert the throw propagates, not that a blocked_on_credentials value is returned. Also confirmed the existing ' +
    'secret-scan regex will NOT false-positive on a `||` fallback expression, but flagged that a naive extension to ' +
    'the new token (still using bare `\\s*=`) WOULD false-positive on a destructuring-default or JSDoc-default shape -- ' +
    'recommended a quote-anchored regex instead. 5 additional coverage gaps found (G1-G5): DNS-token-only case ' +
    'untested, TS-3\'s two guards (token vs accountId) not isolated, `||` vs `??` empty-string precedence unpinned, ' +
    'dual-token redaction not asserted, and the live-probe evidence needs durable storage (not just terminal output).',
  recommendations: [
    'lib/venture-acquisition/dns-wiring.js:34 -> const token = env.CLOUDFLARE_DNS_API_TOKEN || env.CLOUDFLARE_REGISTRAR_API_TOKEN; (property access only, never destructuring) + a fenced comment for the createZone/zone.create gap.',
    'New describe block after line 123 (not touching the existing 118-122/200-208 tests): TS-1 via listRecords asserting lowercase authorization header + /dns_records URL; TS-2 adding the header assertion; G1 (DNS-token-only); G2 (isolate token vs accountId guards); G3 (empty-string precedence, use || not ??); TS-6 rewritten as a throw-propagation assertion.',
    'Extend the secret-scan (lines 210-219) with a quote-anchored regex per name (TOKEN_NAME\\s*=\\s*[\'"`]) looped over both CLOUDFLARE_REGISTRAR_API_TOKEN and CLOUDFLARE_DNS_API_TOKEN.',
    'Add TS-5 (dual-token redaction) adjacent to the existing redaction test at 200-208.',
    'Move TS-4 to scripts/one-off/_probe-cloudflare-dns-token.mjs -- manual/opt-in, never CI-wired; store its output as durable AC#2 evidence.',
    'Doc-only: correct registrar-adapter.js:15\'s stale DNS-edit-scope claim.',
    'Re-run npx vitest run --project unit tests/unit/venture-acquisition/dns-wiring-e2e.test.js after the change: expect all 11 baseline + ~8 new tests green.',
  ],
  metadata: {
    testing_mode: 'plan_phase_test_strategy_review',
    baseline_test_count: 11,
    baseline_test_status: 'green',
    corrections_to_prd_test_scenarios: {
      TS1: 'must probe listRecords not listZones; assert lowercase authorization header key',
      TS4: 'not a vitest file -- unit tier has no .env, db-tier-gate blocks non-loopback fetch; move to standalone opt-in script',
      TS6: 'mis-specified -- createZone 403 throws uncaught through wireDomainDns, is not downgraded to blocked_on_credentials; rewrite as throw-propagation test',
    },
    coverage_gaps_found: ['G1: DNS-token-only untested', 'G2: TS-3 conflates token+accountId guards', 'G3: || vs ?? empty-string precedence unpinned', 'G4: dual-token redaction not asserted', 'G5: live-probe evidence not durably stored'],
    secret_scan_hazard: 'naive \\s*= extension to the new token false-positives on destructuring-default/JSDoc-default shapes -- recommend quote-anchored regex',
    test_execution: buildTestExecution({
      executed: 11,
      passed: 11,
      failed: 0,
      skipped: 0,
      runner: 'vitest --project unit',
      source: 'fresh',
    }),
  },
  execution_time_ms: 233414,
};

const resolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'TESTING', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('TESTING', SD_ID, { name: 'Enhanced QA Engineering Director v2.4.0' }, results, { phase: PHASE, source: 'manual' });
console.log('TESTING_STORED_VERDICT=' + results.verdict);
console.log('TESTING_STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('REPO_PATH=' + results.metadata.repo_path);
