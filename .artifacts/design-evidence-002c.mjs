#!/usr/bin/env node
// PLAN-phase DESIGN verdict for SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C.
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..'), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const SD_ID = '591400cf-7b88-4974-832a-6043e4f59152';
const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C';

const F = (id, severity, surface, title, detail, action) => ({ id, severity, surface, title, detail, action });

const findings = [
  F('D-1', 'HIGH', 'cli-operator-experience',
    'Mirroring runOAuthFlow opens the browser BEFORE binding port 3456, and server.listen has no error handler - an EADDRINUSE burns the chairman grant after he has already consented',
    'oauth-manager.js:185 execs the browser; :193 creates the server; :214 calls server.listen(REDIRECT_PORT) with no .on("error"). An unhandled listen "error" event throws. TR-7 states the YouTube module and the chairman module share port 3456 and must never run concurrently - but nothing enforces it, and any process holding 3456 produces the same result: the chairman completes the Google consent screen, the callback lands on a dead port, and the process dies with EADDRINUSE. That is exactly the failure class FR-4 pre-flights against for TABLES_ABSENT ("a consent completed into an unrecordable store burns a chairman grant"), reached by a different route the FR does not cover.',
    'FR-4: bind first, open the browser only from inside the server.listen callback, and register server.on("error") mapping EADDRINUSE to refusal code REDIRECT_PORT_IN_USE (exit 2). Add "port 3456 bindable" as pre-flight 5 after the TABLES_ABSENT probe. Unit-testable by injecting a listen that emits EADDRINUSE and asserting no browser exec occurred.'),

  F('D-2', 'MEDIUM', 'cli-operator-experience',
    '--status without --json prints a raw JSON blob under the precedent emit(), contradicting FR-4 prose',
    'lib/michael/db.mjs:115-119 - emit(result,{json:false}) prints "REFUSED <code>: <message>" only when result.ok === false; every other result falls through to console.log(JSON.stringify(result)). FR-4 says --status "prints identifier, scopes, expires_at, last_refreshed_at, last_error, key_fingerprint and hours_to_expiry", and its 4th acceptance criterion cites "the pure render function", but no FR text says the human path bypasses emit. Implemented literally against the precedent, the seven-day re-consent runbook hands the chairman an unformatted one-line JSON dump.',
    'FR-4: name renderStatus(row, now) -> string[] as a pure export. Print those lines when --json is absent; call emit(result,{json:true}) only for --json. Refusals keep going through emit so the REFUSED line stays byte-identical to every other michael verb.'),

  F('D-3', 'MEDIUM', 'api-contract-child-H',
    '404/503 bodies carry code alone; the house error shape in server/routes is { error, message, code }',
    'FR-6 specifies 404 { code:"NO_CREDENTIAL" } and 503 { code:"TABLES_ABSENT" }. The repo precedent carries a human-readable message beside the code: protocol-lint.js:52-56 returns { error:"Forbidden", message:"Admin role required", code:"NOT_ADMIN" }, eva-economic-lens.js:24-27 returns { error, message }. A code-only body forces child H to maintain its own enum-to-string map or render the raw constant, and the map will drift from this route.',
    'FR-6: 404 { error:"No credential", message:"No chairman Google grant is stored. Run node scripts/michael/google-consent.mjs on the host.", code:"NO_CREDENTIAL" }; 503 { error:"Table absent", message:"michael_credentials is not applied yet (child B migration is chairman-gated).", code:"TABLES_ABSENT" }. Putting the runbook command in the message makes the dashboard state self-documenting.'),

  F('D-4', 'MEDIUM', 'api-contract-child-H',
    'hours_to_expiry has no pinned type contract, and the route exposes no derived health field - child G and child H will each re-implement the 48h threshold',
    'FR-6 adds hours_to_expiry without stating its type, its value when expires_at is null, or its sign once expiry has passed. Separately, spec section 9 defines health as last_error = "invalid_grant" OR expires_at < now() + 48h; the system_architecture note says child G reads the columns directly while child H reads this route. Two consumers deriving the same predicate from raw columns is one threshold definition too few - a later change to 48h lands in one place and not the other.',
    'FR-6: pin hours_to_expiry as number|null (null when expires_at is null, negative when already expired, one decimal). Add status: "healthy"|"expiring"|"invalid_grant"|"never_consented" computed by a pure exported function (e.g. classifyOauthHealth(row, now)) in server/routes/michael.js, so child G imports the predicate instead of restating it and child H renders a field rather than a rule.'),

  F('D-5', 'LOW', 'api-contract-child-H',
    'No Cache-Control on a credential-status endpoint a dashboard polls',
    'A cached 200 on /api/michael/oauth/status shows a healthy grant after it has expired - the single failure this endpoint exists to surface.',
    'FR-6: res.set("Cache-Control", "no-store") on all three responses. One line.'),

  F('D-6', 'MEDIUM', 'browser-callback-page',
    'The one rendered surface in this child mirrors an inaccessible precedent: no doctype, no lang, no title, no charset, and the failure page drops the reason',
    'oauth-manager.js:200 and :208 emit "<html><body><h1>...</h1><p>...</p></body></html>" with res.writeHead(200,{"Content-Type":"text/html"}). Against WCAG 2.1 that fails 3.1.1 Language of Page (Level A, no lang attribute) and 2.4.2 Page Titled (Level A, no title element); the missing charset leaves encoding to browser sniffing. The error branch (:200) discards the ?error= value, so the chairman sees "Authorization Failed" with no reason and no next step. Also: a request carrying neither code nor error never reaches res.end (:193-211), so a stray browser request hangs the socket. NOTE the PRD cites "oauth-manager.js:190-205" for this page; the actual markup is at :199-208 and the server starts at :193.',
    'FR-4: emit a full document with doctype, html lang="en", head with meta charset utf-8 and a title, then the h1 and p; set Content-Type "text/html; charset=utf-8"; echo the HTML-escaped error param plus the re-run command on the failure page; answer a no-parameter request with 204. Roughly four lines; no framework, no assets, no styling. Correct the PRD line citation to :199-208.'),

  F('D-7', 'MEDIUM', 'module-api-ergonomics',
    'The { sb, enc } injection is the right call over the oauth-manager singleton, with two constraints the PRD does not state: call-time defaults, and memoizing past a 100k-iteration PBKDF2 per call',
    'The precedent (oauth-manager.js) holds module-level state and offers no seam, which is why its own test must reach for real AES-GCM to pin the algorithm. The PRD { sb, enc } parameters are strictly better and satisfy TR-6 injected-factory tests. Two risks: (a) if the defaults are written as module-level consts rather than default parameters, constructing HostKeyEncryption at import reads MICHAEL_ENCRYPTION_KEY at load and breaks TR-5 import-time purity - the exact condition gmail-act.mjs:36-39 converts into exit 1 instead of the designed exit-2 refusal; (b) encryption.cjs:19 sets 100,000 PBKDF2-SHA256 iterations and :61 derives on every encrypt (:69) and every decrypt (:118), so each getAuthenticatedClient() pays a fresh derivation. gmail-act calls modifyThread once per thread, so an N-thread triage loop pays N derivations for one unchanging grant.',
    'FR-3/FR-5: express defaults as default parameters ({ sb = createMichaelClient(), enc = new HostKeyEncryption() } = {}), never module-level consts. Memoize the authenticated client in module scope after first construction, cleared by forceReauth. Add a test asserting a second modifyThread call does not re-decrypt.'),

  F('D-8', 'LOW', 'module-api-ergonomics',
    'getStoredTokens returns three shapes and callers must discriminate structurally',
    'FR-3 has it return null for "no row / no blob / decrypt failed", { error:"KEY_FINGERPRINT_MISMATCH" } for a wrong key, and the token object otherwise. Every michael verb otherwise speaks the { ok, refusal, message } envelope of lib/michael/db.mjs:110-113. The null contract is deliberately pinned to oauth-manager.js:83-88, so this is a note, not a condition.',
    'If the tri-shape stays, FR-3 should state the caller predicate explicitly (tokens && !tokens.error) and the tests should cover all three branches at the call site, not just inside the module.'),

  F('D-9', 'MEDIUM', 'component-sizing',
    'Every file lands under 300 lines, but the aggregate non-test diff is roughly 40 percent over the 400-LOC ceiling FR-7 itself invokes, and the PRD publishes no per-file budget',
    'Precedent sizes in this repo: oauth-manager.js 233, protocol-lint.js 255, largest michael verb rule-encode.mjs 171, oauth-manager.test.js 205. chairman-oauth.js carries everything oauth-manager.js does plus the fingerprint, the venue guard, injection and the invalid_grant path. Realistic budget: encryption.cjs +2, chairman-oauth.js ~240, google-consent.mjs ~170, gmail-client.mjs ~60, server/routes/michael.js ~90, server/index.js +2 = ~564 non-test. FR-7 acceptance asks only for a justification in the PR body, which does not make 564 fit under a stated max of 400. Per-file sizing is healthy; the aggregate is the problem.',
    'Pick one: (a) publish per-file LOC budgets in the PRD summing under 400 non-test, or (b) split on the phase boundary the implementation_approach already draws - PR 1 = Phase 1 (encryption export + chairman-oauth.js + its test, ~242 non-test), PR 2 = Phase 2+3 (CLI + gmail client + route + mount, ~322 non-test). Both clear 400. Option (b) is the recommendation; the requireAuth mount test rides with PR 2 and still guards the mount line.'),

  F('D-10', 'INFO', 'ui-surface-confirmation',
    'No UI components and no WCAG-scoped component surface - component-sizing-for-React and accessibility checks skipped with reason',
    'product_requirements_v2.ui_ux_requirements is [] for this PRD. Every deliverable is .js/.mjs/.cjs: lib/security/encryption.cjs (+1 export), lib/integrations/google/chairman-oauth.js, scripts/michael/google-consent.mjs, lib/michael/gmail-client.mjs, server/routes/michael.js, server/index.js (mount line). No .tsx/.jsx, no Shadcn import, no route in a React router. EHG_Engineer serves a backend API only per SD-ARCH-EHG-007; the dashboard that consumes GET /api/michael/oauth/status belongs to child H in the sibling ehg app, which is where WCAG applies. The only rendered markup in this child is the OAuth callback page, assessed at D-6.',
    'Record skip_reason no_ui_components_in_child_scope for the React component-sizing and WCAG 2.1 AA component checks. The WCAG 2.1 Level A defects at D-6 are in scope and actionable in about four lines.'),
];

const conditions = [
  'FR-4: bind port 3456 and register server.on("error") BEFORE opening the browser; add refusal code REDIRECT_PORT_IN_USE (D-1).',
  'FR-4: name a pure renderStatus() for the human --status path so it does not fall through the emit() JSON branch (D-2).',
  'FR-6: 404/503 bodies carry { error, message, code } per the protocol-lint.js:52-56 house shape, message naming the re-consent command (D-3).',
  'FR-6: pin hours_to_expiry (number|null, negative when expired) and add a derived status field from one exported predicate shared with child G (D-4).',
  'FR-4: the callback HTML gets doctype, lang="en", title, charset, the echoed error reason, and a 204 for parameterless requests (D-6).',
  'FR-3/FR-5: call-time default parameters, never module-level construction; memoize the authenticated client past the 100k-iteration PBKDF2 (D-7).',
  'FR-7: publish per-file LOC budgets under 400 non-test, or split PR 1 = Phase 1 / PR 2 = Phase 2+3 (D-9).',
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  justification:
    'The architecture is sound and the injectable { sb, enc } seam is a real improvement on the oauth-manager singleton it generalizes. Seven conditions, all cheap and all on surfaces the child genuinely has. The one that matters most is D-1: mirroring runOAuthFlow opens the browser before binding port 3456 and never handles a listen error, so a port collision (which TR-7 says is possible by construction) burns a chairman grant AFTER he has consented - the same harm FR-4 already pre-flights against for an unapplied table, reached by a path the FR does not cover.',
  conditions,
  findings,
  recommendations: conditions,
  metadata: {
    phase: 'PLAN',
    sd_key: SD_KEY,
    sd_id: SD_ID,
    prd_id: 'PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C',
    review_type: 'PLAN-phase DESIGN review of a UI-less backend child: CLI operator experience, API contract for a downstream dashboard, module API ergonomics, component sizing',
    findings_total: findings.length,
    findings_high: findings.filter((f) => f.severity === 'HIGH').length,
    findings_medium: findings.filter((f) => f.severity === 'MEDIUM').length,
    findings_low: findings.filter((f) => f.severity === 'LOW').length,
    findings_info: findings.filter((f) => f.severity === 'INFO').length,
    ui_surface_question: {
      answer: 'No UI components. ui_ux_requirements is [] in the PRD; every deliverable is .js/.mjs/.cjs; EHG_Engineer serves a backend API only (SD-ARCH-EHG-007). The dashboard consuming this route is child H in the sibling ehg app.',
      rendered_surfaces_in_child: ['the OAuth callback HTML served on localhost:3456 by runConsentFlow (assessed at D-6)'],
      react_components: 0,
      tsx_jsx_files: 0,
      shadcn_imports: 0,
      wcag_scope: 'WCAG 2.1 AA component checks do not apply; WCAG 2.1 Level A 3.1.1 (Language of Page) and 2.4.2 (Page Titled) DO apply to the callback page and currently fail in the precedent being mirrored.',
    },
    skipped_checks: [
      { check: 'React component sizing (300-600 LOC sweet spot)', skip_reason: 'no_ui_components_in_child_scope', note: 'Module-level sizing assessed instead at D-9; every file lands under 300, the aggregate PR does not.' },
      { check: 'WCAG 2.1 AA component audit (contrast, focus order, ARIA, keyboard nav)', skip_reason: 'no_ui_components_in_child_scope' },
      { check: 'Responsive design / viewport testing', skip_reason: 'no_ui_components_in_child_scope' },
      { check: 'Shadcn UI pattern conformance', skip_reason: 'no_ui_components_in_child_scope' },
      { check: 'Playwright visual verification', skip_reason: 'no_ui_components_in_child_scope' },
    ],
    component_sizing: {
      unit: 'non-test LOC, estimated from repo precedents',
      precedents: { 'lib/integrations/youtube/oauth-manager.js': 233, 'server/routes/protocol-lint.js': 255, 'scripts/michael/rule-encode.mjs': 171, 'lib/michael/db.mjs': 119, 'lib/integrations/youtube/oauth-manager.test.js': 205 },
      estimates: { 'lib/security/encryption.cjs': 2, 'lib/integrations/google/chairman-oauth.js': 240, 'scripts/michael/google-consent.mjs': 170, 'lib/michael/gmail-client.mjs': 60, 'server/routes/michael.js': 90, 'server/index.js': 2 },
      estimated_total_non_test: 564,
      stated_ceiling: 400,
      per_file_verdict: 'all under 300 - PASS',
      aggregate_verdict: 'approximately 40 percent over the ceiling FR-7 itself cites - see D-9',
    },
    api_contract_review: {
      endpoint: 'GET /api/michael/oauth/status',
      consumers: ['child H dashboard (over HTTP)', 'child G michael-oauth-health gauge (reads the columns directly)'],
      fields_reviewed: ['identifier', 'scopes', 'expires_at', 'last_refreshed_at', 'last_error', 'key_fingerprint', 'hours_to_expiry'],
      no_token_material: 'confirmed - encrypted_blob and encryption_metadata are excluded by FR-6 and asserted by its test',
      gaps: ['error body shape (D-3)', 'hours_to_expiry type contract (D-4)', 'no derived status field, duplicating the 48h predicate across two consumers (D-4)', 'no Cache-Control (D-5)'],
      mount_position: 'FR-6 is correct to require the mount inside the requireAuth block before the /api optionalAuth mount at server/index.js:272 - verified the optionalAuth dashboardRoutes mount does sit at the end of the block.',
    },
    files_read: [
      'lib/integrations/youtube/oauth-manager.js:150-233 (the mirrored consent flow and callback page)',
      'lib/michael/db.mjs (parseArgs/refusal/emit/readRows/writeRows - the verb shape)',
      'scripts/michael/gmail-act.mjs (the lazy-import contract this child must satisfy)',
      'lib/security/encryption.cjs:14-80,247 (getMasterKey self-generation, PBKDF2 cost, singleton export)',
      'server/routes/protocol-lint.js:27-60, server/routes/eva-economic-lens.js:20-34 (house error shape)',
      'server/index.js:238-278 (the requireAuth mount block)',
    ],
    analysis_tree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C',
    plan_conditions: conditions,
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'DESIGN',
  fallback: 'EHG_Engineer',
  probeExistsRelative: 'package.json',
  supabase,
});
console.log('Repo resolution:', JSON.stringify(resolution, null, 2));

applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('DESIGN', SD_ID, { name: 'DESIGN', code: 'DESIGN' }, results, {
  phase: 'PLAN',
  source: 'sub_agent_executor',
  sdKey: SD_KEY,
});

console.log('\n=== STORED ===');
console.log(JSON.stringify({
  id: stored?.id,
  verdict: stored?.verdict,
  phase: stored?.phase,
  repo_path: stored?.metadata?.repo_path,
  executed_from_cwd: stored?.metadata?.executed_from_cwd,
  session_id: stored?.metadata?.session_id,
  content_hash: stored?.metadata?.content_hash,
  evaluated_commit_sha: stored?.metadata?.evaluated_commit_sha,
  skip_reason: stored?.metadata?.skip_reason,
}, null, 2));
