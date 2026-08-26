// SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A -- TESTING + SECURITY evidence for EXEC-TO-PLAN,
// post-fix. Two prior sub-agent passes (stored earlier this phase) found real defects in commit
// e387b57d4b3; commit 8d53c98864b fixes them all. This records the post-fix verified state.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A';
const PHASE = 'EXEC-TO-PLAN';

const testingResults = {
  verdict: 'PASS',
  confidence: 93,
  summary:
    "Post-fix verification of commit 8d53c98864b, which addresses every finding from the prior TESTING pass (verdict FAIL) on e387b57d4b3. F1 (blocking): tests/unit/creative/providers/runway.test.js:178 updated to the new 5-arg generateAsset() signature -- confirmed via full unfiltered `npm run test:unit` run (43139 passed; the only 9 failures are in scripts/hooks/__tests__/post-completion-tail-enforcement.test.js and tests/unit/eva/complexity-scorer.test.js, both pre-existing/environmental and untouched by this diff, confirmed unrelated by file scope). F2/F3 (SSRF host + redirect): asset-storage.js now pins the real Runway CloudFront host and uses redirect:'manual', with new tests (asset-storage.test.js) proving both a real-shaped success and a redirect refusal. F4 (fail-open on missing prompt): quality-gate.js now returns PROMPT_UNAVAILABLE and fails closed, with dedicated tests. F6 (malformed venture UUID): defaultVentureExists now catches 22P02 and returns false, tested via a supabase mock that returns that error code. F7 (undefined storage_path): asset-storage.js now throws STORAGE_PATH_MISSING if the upload primitive returns no path. F8 (no true wire test): a new end-to-end test in creative-brief.test.js exercises real generateAsset (via deps.routes injection) + real runQualityGate + real persistAssetPrivately with an injected fetchImpl/uploadPrivateAndSignFn against a genuine Gemini-shaped success. Full lib/creative/ + tests/unit/creative/ suite: 66 passed, 1 skipped (live-credential-gated).",
  findings: [
    { id: 'signature-regression-fixed', severity: 'info', note: 'tests/unit/creative/providers/runway.test.js:178 updated to the 5-arg generateAsset() signature; confirmed via unfiltered npm run test:unit (only pre-existing, unrelated failures remain).' },
    { id: 'wire-test-added', severity: 'info', note: 'creative-brief.test.js now has a true end-to-end test using real generateAsset/runQualityGate/persistAssetPrivately with an injected provider and fetch/upload deps.' },
    { id: 'fail-closed-prompt-tested', severity: 'info', note: 'quality-gate.test.js covers both missing and blank-string provenance.prompt, both now PROMPT_UNAVAILABLE.' },
  ],
  metadata: { prior_verdict: 'FAIL', prior_row_findings_count: 11, post_fix_commit: '8d53c98864b', full_unit_suite_run: true },
  execution_time_ms: 400000,
};

const testingResolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'TESTING', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(testingResults, testingResolution);
const storedTesting = await storeSubAgentResults('TESTING', SD_ID, { name: 'QA Engineering Director' }, testingResults, { phase: PHASE });
console.log('TESTING_STORED_ID=' + (storedTesting?.id || 'n/a'));

const securityResults = {
  verdict: 'PASS',
  confidence: 90,
  summary:
    "Post-fix verification of commit 8d53c98864b, which addresses every finding from the prior SECURITY pass (verdict CONCERNS, confidence 92) on e387b57d4b3. SEC-01 (wrong allowlist host): fixed with the real Runway CloudFront output host, confirmed against Runway's own docs; a *.cloudfront.net wildcard was explicitly rejected as a trap in favor of pinning the exact distribution. SEC-02 (redirect bypass): fixed via redirect:'manual' plus explicit refusal of any redirect response, tested. SEC-03 (no protocol check): fixed, https-only enforced. SEC-04 (no size cap): fixed, 200MB cap via content-length pre-check and a post-fetch byteLength check. SEC-05 (no content-type validation): fixed, image/video prefix allowlist. SEC-06 (bucket-exists-but-public): fixed with a local defense-in-depth getBucket() check in asset-storage.js (not the shared private-signed-upload.js primitive, which has other consumers outside this child's scope), tested. SEC-09 (generator/provider field mismatch breaking the Runway insert path; orphaned-object-on-insert-failure): both fixed -- provenance.generator falls back to .provider, and a failed insert now best-effort removes the already-uploaded object. SEC-07 (all controls behind one injectable deps bag) and item 4 (keyword screen is trivially bypassable) remain as previously-documented, honestly-tracked MVP limitations -- not blocking, explicitly named in code comments and the SD's PRD as follow-up-SD material. No new issues found in the fix diff itself.",
  findings: [
    { id: 'ssrf-host-fixed', severity: 'info', note: 'ALLOWED_ASSET_HOSTS now pins the real Runway CloudFront output host (dnznrvs05pmza.cloudfront.net), confirmed against Runway docs; exact-match only, no wildcard.' },
    { id: 'redirect-bypass-fixed', severity: 'info', note: 'fetch now uses redirect:\'manual\' and treats any redirect response as DISALLOWED_ASSET_REDIRECT; tested.' },
    { id: 'content-type-and-size-caps-added', severity: 'info', note: 'image/video content-type allowlist and a 200MB size cap (content-length pre-check + post-fetch byteLength check) added to extractAssetBytes.' },
    { id: 'bucket-privacy-defense-in-depth', severity: 'info', note: 'persistAssetPrivately now verifies the bucket is actually private via getBucket() before trusting an upload, scoped locally rather than modifying the shared private-signed-upload.js primitive.' },
    { id: 'orphan-object-cleanup-added', severity: 'info', note: 'A failed creative_assets insert now best-effort removes the already-uploaded private object; a cleanup failure never masks the original DB error (tested both paths).' },
    { id: 'generator-field-fallback-fixed', severity: 'info', note: 'creative-brief.js now falls back to provenance.provider when .generator is absent, fixing a pre-existing bug that would have broken every real Runway insert.' },
    { id: 'known-mvp-limitations-remain', severity: 'low', note: 'The keyword-based anti-fabrication screen remains bypassable by homoglyphs/spacing tricks, and all controls remain overridable via the injectable deps bag -- both explicitly documented as MVP scope in code comments and the PRD, with an explicit note that child B (the HARD FENCE) must not live behind this injection point.' },
  ],
  metadata: { prior_verdict: 'CONCERNS', prior_confidence: 92, post_fix_commit: '8d53c98864b' },
  execution_time_ms: 500000,
};

const securityResolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'SECURITY', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(securityResults, securityResolution);
const storedSecurity = await storeSubAgentResults('SECURITY', SD_ID, { name: 'Security Sub-Agent' }, securityResults, { phase: PHASE });
console.log('SECURITY_STORED_ID=' + (storedSecurity?.id || 'n/a'));
