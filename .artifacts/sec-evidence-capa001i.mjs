import 'dotenv/config';
import { storeSubAgentResults } from '../lib/sub-agent-executor/index.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const SD = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I';

const SEC1 = [
  'SEC-1 (HIGH, lib/eva/bridge/stack-scan-reader.js:79): venture_resources.resource_identifier is interpolated raw into the GitHub API URL with zero validation.',
  'PROVEN by executing the real module: resource_identifier="rickfelix/altifyai/actions/workflows/always-green.yml/runs?branch=main&status=completed&per_page=1&x=" causes the reader to GET /repos/rickfelix/altifyai/actions/workflows/always-green.yml/runs and return {available:true, conclusion:"success"} AS THE STACK-SCAN CONCLUSION.',
  'This defeats the module docstring and unit test invariant ("never falls back to any other workflow run... so a failing stack-scan can never be silently swallowed behind an unrelated passing workflow"), and the substituted value is persisted into chairman_decisions.brief_data via chairman-product-review.js:304 -> requestProductReview, i.e. it corrupts a durable governance record.',
  'Path traversal also proven: "../../orgs/some-org/repos" resolves to /orgs/some-org/repos/... sending the factory GITHUB_TOKEN to an unintended endpoint. NOT SSRF (GITHUB_API_BASE host is fixed and uninfluenceable).',
  'REACHABILITY: venture_resources is service-role-write-only, so this is not externally reachable today. BUT this codebase has already adjudicated this exact column as untrusted: stage-20-code-quality.js:186 and :288 (PR #3450 round 1 adversarial review) state verbatim that repoUrl from "venture_resources.resource_identifier or ventures.repo_url" is "all attacker-influenceable", and guard it with isSafeRepoUrl(). The new module diverges from that established standard without justification.',
  'FIX: validate with the existing REPO_SHORTHAND_RE shape (owner/repo, chars [A-Za-z0-9_.-], exactly one slash) or encodeURIComponent each segment before interpolation.',
].join(' ');

const SEC2 = [
  'SEC-2 (MEDIUM, lib/eva/bridge/stack-scan-reader.js:34-38): the venture_resources read omits both guards the established stage-20 reader applies.',
  '(a) No .eq("status","active") -- the table has status IN (active,cleaned,failed,orphaned) and deleteVentureFully marks rows "cleaned" rather than deleting, so this reader can treat a decommissioned repo as authoritative.',
  '(b) .maybeSingle() with no .order/.limit(1) -- the UNIQUE constraint is (venture_id, resource_type, resource_identifier), NOT (venture_id, resource_type), so multiple github_repo rows per venture are legitimate (re-provisioning); >1 row makes maybeSingle return PGRST116 and the reader silently degrades to {available:false, reason:"venture_resources_read_error"}.',
  'Compare stage-20-code-quality.js:742-750 which correctly does .eq("status","active").order("created_at",{ascending:false}).limit(1).',
].join(' ');

const SEC3 = [
  'SEC-3 (MEDIUM, lib/eva/legal-doc-producer.js:90): the FR-1 fallback feeds ventures.metadata?.live_url into extractBareDomain.',
  'The reuse is safe for STRING inputs (WHATWG .hostname discards userinfo/path/protocol exactly as it does for companies.website, so the cbfb8391 fix holds), but companies.website is a TEXT column while metadata.live_url is JSONB and can be a non-string.',
  'MEASURED: 12345 -> "0.0.48.57", true -> "true", ["a"] -> "a" -- all garbage-but-TRUTHY, so they slip past the fail-closed guard at :95 (if (!companyDomain) missingFields.push("COMPANY_DOMAIN")) and bake COMPANY_DOMAIN / CONTACT_EMAIL=legal@0.0.48.57 into a chairman-visible legal document.',
  'A JSONB object input throws TypeError ("rawWebsite.replace is not a function") from INSIDE the catch block; that throw is contained by the caller try/catch at stage-23-dedicated-venture-uat.js:54, so it fails soft.',
  'FIX: typeof rawWebsite !== "string" -> return null.',
  'CONFIRMED NOT reachable to outbound email: generated_content is only written to venture_legal_overrides and only generated_at is read downstream (stage-23-launch-readiness.js:185); no send path exists.',
].join(' ');

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary: 'EXEC security review of the 6-commit CAPA changeset (FR-1..FR-6). RLS on all 3 new tables is correct and matches the same-day sibling precedent; no SQL injection (all supabase-parameterized); FR-3 override authorization is sound; secrets handling is clean. CONDITIONAL on 1 HIGH + 2 MEDIUM findings, all in non-RLS code: an empirically-proven URL-injection in stack-scan-reader.js that lets a crafted venture_resources.resource_identifier substitute a different GitHub workflow (defeating the module own tested "never falls back to any other workflow" invariant) and traverse to unintended api.github.com endpoints with the factory token; a missing status/ordering filter on the same read; and a new JSONB input source in legal-doc-producer.js that bypasses the COMPANY_DOMAIN fail-closed guard.',
  critical_issues: [SEC1],
  warnings: [
    SEC2,
    SEC3,
    'OBSERVATION (not a defect): recordCapabilityOverride has no production caller (tests only) -- so FR-3 presents no authorization exposure today, but the override write path is exported-but-unwired and nothing can populate venture_capability_overrides in production.',
  ],
  recommendations: [
    'Required before merge: fix SEC-1 by validating resource_identifier against the strict owner/repo shorthand shape before URL interpolation, and add a unit test with a hostile resource_identifier asserting the reader refuses rather than querying a substituted workflow (the existing "never falls back to any other workflow" test only covers a well-formed value).',
    'Recommended: fix SEC-2 by mirroring stage-20 exactly -- .eq("status","active").order("created_at",{ascending:false}).limit(1).maybeSingle().',
    'Recommended: fix SEC-3 with a typeof-string guard in extractBareDomain so a non-string JSONB live_url fails closed to COMPANY_DOMAIN-missing instead of producing a bogus domain.',
    'No action needed on RLS, SQL injection, FR-3 authorization, or secrets handling -- all verified correct.',
  ],
  detailed_analysis: {
    rls_review: 'PASS. All 3 new tables (venture_screen_dispositions, venture_screen_reconciliation, venture_capability_overrides) ENABLE ROW LEVEL SECURITY and carry an identical, correct policy pair: SELECT TO authenticated scoped via ventures.company_id -> user_company_access WHERE user_id = auth.uid(), plus FOR ALL TO service_role. Consistent with the same-day sibling precedent database/migrations/20260913_mock_outreach_personas.sql:34-45. Deny-by-default holds: no INSERT/UPDATE/DELETE policy is granted to authenticated, so authenticated users are read-only. user_company_access is a long-established table (database/migrations/20251130_ehg_app_schema_migration.sql:163) and an empty/missing access row fails CLOSED. FK to ventures(id) ON DELETE CASCADE is correct; no cross-schema FK. CHECK constraints correctly bound disposition_class/disposition_status/reconciliation_status.',
    injection_review: 'PASS for the 3 new tables. screen_id, capability_id, override_reason and evidence_ref are only ever passed as values through the supabase-js client (.eq()/.insert()/.update() object literals) in stage-15-coverage-disposition-reader.js, screen-reconciliation-builder.js and validate-venture-default-capabilities.js -- never string-interpolated into raw SQL, and there is no .rpc() or raw SQL path touching them. The one injection defect in this changeset is URL injection, not SQL injection (SEC-1).',
    fr3_authorization: 'PASS. The override path is correctly bounded: stage-23-launch-readiness.js builds SIGNAL_BACKED_CAPABILITY_IDS from WIRED_CAPABILITY_FEEDBACK_TYPES plus telemetry-analytics and consults overrides ONLY for capabilities with no ground-truth signal, so an override can never fake a capability that has real wiring evidence. validateOverrideReason is a single shared trim+fail-closed rule reused from the already-reviewed Stage-19 path rather than a divergent second copy. precheckCapabilities is fail-closed (a throwing check degrades to wired:false). The whole checklist is gated behind LEO_S24_CAPABILITY_CHECKLIST_REQUIRED, default OFF. Same authorization surface as the existing pattern, not a new exposure.',
    secrets_review: 'PASS. GITHUB_TOKEN is read from process.env as a default parameter and placed only in the Authorization header, never in the URL, never logged, and never returned. Error returns are shape-only (github_api_error_<status>, venture_resources_read_error, no_github_token_configured); the one message-bearing return carries undici transport text which is not token-bearing. No credential reaches chairman_decisions.brief_data.',
    tests: 'tests/unit/eva/bridge/stack-scan-reader.test.js, tests/unit/eva/capability-override.test.js, tests/unit/eva/legal-doc-producer.test.js -- 3 files, 39 tests, all passing. Gap: no test exercises a malformed/hostile resource_identifier, which is why SEC-1 survived.',
    method: 'Read the full 6-commit diff (git diff main...HEAD, 19 files, +1808/-23). Proved SEC-1 and SEC-3 by executing the real modules with crafted inputs rather than reasoning about them; compared SEC-1/SEC-2 against the codebase own prior adversarial-review decisions (stage-20-code-quality.js isSafeRepoUrl, resolve-venture-repo.js SAFE_GITHUB_HTTPS); compared RLS against the sibling migration; traced stackScan and generated_content to their persistence/consumption sites.',
  },
  metadata: {
    phase: 'EXEC',
    files_reviewed: [
      'database/migrations/20260913_venture_screen_disposition_reconciliation.sql',
      'lib/eva/bridge/stack-scan-reader.js',
      'lib/eva/legal-doc-producer.js',
      'lib/eva/utils/validate-venture-default-capabilities.js',
      'lib/eva/chairman-product-review.js',
      'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js',
      'lib/eva/stage-templates/analysis-steps/stage-15-coverage-disposition-reader.js',
      'lib/eva/stage-templates/screen-reconciliation-builder.js',
    ],
    findings_count: { high: 1, medium: 2, observation: 1 },
    proven_by_execution: ['SEC-1 workflow substitution', 'SEC-1 path traversal', 'SEC-3 non-string JSONB coercion'],
  },
  validation_mode: 'prospective',
  execution_time_ms: 0,
};

const resolution = await resolveSubAgentRepo({ sdId: SD, subAgentCode: 'SECURITY', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('SECURITY', SD, { name: 'Chief Security Architect' }, results, { phase: 'EXEC', sdKey: SD });
console.log('STORED id=', stored?.id, 'verdict=', stored?.verdict, 'phase=', stored?.phase);
console.log('repo_path=', stored?.metadata?.repo_path);
console.log('executed_from_cwd=', stored?.metadata?.executed_from_cwd);
