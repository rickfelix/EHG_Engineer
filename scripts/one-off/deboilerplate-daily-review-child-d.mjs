import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-D';

const key_changes = [
  {
    change: 'Add lib/chairman/daily-review/gantt-renderer.js exporting renderGanttPng(waves) -> Buffer, composed of buildGanttSvg(waves) (pure, hand-rolled SVG string generation from Child A\'s plan_of_record.waves shape: {title, status, progress_pct, item_counts}) + rasterizeSvgToPng(svgString) using the already-installed `sharp` package (sharp(Buffer.from(svg)).png().toBuffer()) -- no new dependency needed. CORRECTION to the parent SD\'s PRD FR-3 prose: scripts/lib/visualization-provider.js (cited there as a reuse target) is a generative-AI image tool (Gemini/DALL-E from a text prompt), not a chart renderer, and the repo has zero deterministic charting libraries -- a real Gantt renderer must be hand-built, which this SD does.',
    impact: 'Produces the actual Gantt PNG bytes to upload/MMS -- the one missing piece the parent PRD assumed already existed via visualization-provider.js.',
  },
  {
    change: 'Add lib/storage/private-signed-upload.js exporting uploadPrivateAndSign(supabase, {bucket, path, buffer, contentType, expiresInSeconds}) -> {path, signedUrl} -- creates/uses a bucket with public:false, uploads via .storage.from(bucket).upload(path, buffer, {contentType, upsert:true}), then .storage.from(bucket).createSignedUrl(path, expiresInSeconds). CORRECTION to the parent SD\'s PRD FR-3 prose: the cited precedent files (lib/eva/logo-image-generator.js, lib/eva/stage-handlers/s11.js) are actually PUBLIC-bucket examples (createBucket public:true + getPublicUrl) -- the opposite of this SD\'s hard, chairman-ratified requirement (\"NEVER a public URL\"). grep -rl createSignedUrl over lib/ and scripts/ returns zero hits repo-wide -- there was no existing private+signed precedent to reuse, so this SD builds the pattern from first principles.',
    impact: 'Closes the confidentiality-critical gap: without this, the only existing bucket-upload precedent in the repo is public, which would leak the chairman\'s roadmap data if copied naively.',
  },
  {
    change: 'Extend lib/messaging/providers/twilio-provider.js send({to, body}) to send({to, body, mediaUrl}) -- when mediaUrl is present, set the Twilio MediaUrl form param before the POST, mirroring the existing optional StatusCallback pattern in the same function (line ~31-60).',
    impact: 'Gives the Twilio send path MMS capability; a null/absent mediaUrl is fully backward-compatible with today\'s text-only sends.',
  },
  {
    change: 'Add a nullable media_url TEXT column (+ matching COMMENT ON COLUMN) to the NOT-YET-APPLIED database/migrations/20260718_sms_outbound_obligations_STAGED.sql file, immediately before the closing CREATE TABLE paren, preserving the file\'s existing STAGED/chairman-apply-ceremony header verbatim. Thread mediaUrl through lib/chairman/sms-bridge.js enqueueChairmanSms() (new optional param, added to the inserted row) and lib/chairman/sms-outbound-worker.js reconcileOutboundSms() (select the column, pass row.media_url to provider.send()).',
    impact: 'Completes the owed-state plumbing so an MMS obligation carries its image URL end-to-end from enqueue through the reconcile-and-send worker, without a second migration file or a parallel delivery path.',
  },
];

const strategic_objectives = [
  'Deliver the Gantt-chart IMAGE leg of the daily-review automation via the existing hardened owed-state SMS/MMS path (enqueueChairmanSms -> sms_outbound_obligations -> reconcileOutboundSms), never a fresh fire-and-forget send.',
  'Guarantee the roadmap image is never publicly reachable -- private bucket + short-TTL signed URL only, matching the chairman-ratified confidentiality requirement (a public-URL attempt was already correctly blocked once, 2026-07-18).',
];

const success_criteria = [
  {
    criterion: 'renderGanttPng(waves) returns a valid PNG Buffer built from Child A\'s plan_of_record.waves data (per-wave title, status, progress_pct rendered as bars), with no external network/AI-generation call.',
    measure: 'Unit test asserts the returned Buffer starts with the PNG magic bytes (0x89504E47) and that buildGanttSvg(waves) output is well-formed SVG containing each wave\'s title text.',
  },
  {
    criterion: 'uploadPrivateAndSign() creates/uses a bucket with public:false and returns a signedUrl from createSignedUrl(), never calling getPublicUrl() or creating a public:true bucket anywhere in this SD\'s code.',
    measure: 'Unit test (mocked Supabase Storage client) asserts createBucket is called with public:false and that createSignedUrl (not getPublicUrl) is the source of the returned URL; a grep-based static assertion confirms zero getPublicUrl/public:true occurrences in the new files.',
  },
  {
    criterion: 'twilio-provider.js send() sets the Twilio MediaUrl form param only when mediaUrl is provided, and omits it (unchanged from today\'s behavior) when mediaUrl is absent.',
    measure: 'Unit test asserts the constructed form body contains MediaUrl when passed and does not when omitted, without altering any existing To/Body/MessagingServiceSid/StatusCallback assertions in the current test suite.',
  },
  {
    criterion: 'The STAGED migration file gains exactly one nullable media_url TEXT column (no new table, no second migration file) and mediaUrl flows enqueueChairmanSms() -> the inserted obligations row -> reconcileOutboundSms() -> provider.send({mediaUrl}).',
    measure: 'Unit tests on sms-bridge.js and sms-outbound-worker.js (extending their existing test files) assert media_url is threaded through both functions; a diff-based check confirms only one migration file changed.',
  },
];

const implementation_guidelines = [
  'Use the already-installed `sharp` package for SVG-to-PNG rasterization -- do not add a new charting/canvas dependency; hand-roll the SVG string generation as a pure function (buildGanttSvg) so it is unit-testable without any image library.',
  'Build the private-bucket + signed-URL helper from first principles per the PRD\'s corrected FR (the two files the parent PRD cited as precedent are public-bucket examples and must NOT be mirrored) -- public:false at bucket creation, createSignedUrl with a short TTL (minutes, not hours) for the returned URL.',
  'Amend the existing STAGED migration file in place -- do not create a second migration -- and preserve its chairman-apply-ceremony header exactly so the apply runbook stays valid when the chairman eventually applies it.',
  'twilio-provider.js, sms-bridge.js, and sms-outbound-worker.js changes must be strictly additive/backward-compatible: every existing call site that omits mediaUrl must behave identically to today.',
  'This SD does not attempt to apply the STAGED migration or perform a real Twilio send -- both are gated on the chairman-apply ceremony and real credentials respectively; unit tests use mocked Supabase Storage/Twilio clients throughout.',
];

const success_metrics = [
  { metric: 'Test coverage', target: '>=80% coverage across lib/chairman/daily-review/gantt-renderer.js, lib/storage/private-signed-upload.js, and the twilio-provider.js/sms-bridge.js/sms-outbound-worker.js diffs' },
  { metric: 'Zero regressions', target: '0 existing tests broken (full-repo regression pass), especially the existing twilio/sms-bridge/sms-outbound-reconcile test suites' },
  { metric: 'Confidentiality invariant', target: 'Zero getPublicUrl/public:true occurrences anywhere in the new gantt-renderer.js/private-signed-upload.js files (grep-verified)' },
];

const smoke_test_steps = [
  {
    instruction: 'Run renderGanttPng(waves) against a seeded waves array (from a live Child A buildRoadmapStatusDoc() call) and write the resulting Buffer to a local PNG file.',
    expected_outcome: 'A valid, viewable PNG image showing per-wave bars/labels is produced -- no thrown error, no external network call made.',
  },
  {
    instruction: 'Call uploadPrivateAndSign() against a test Supabase project/bucket with a small PNG buffer, then attempt to fetch the bucket object directly (no signed token) and separately fetch the returned signedUrl.',
    expected_outcome: 'The direct/unsigned fetch is denied (403/404); the signedUrl fetch succeeds and returns the PNG bytes.',
  },
  {
    instruction: 'Run the extended unit test suites: `npx vitest run tests/unit/chairman/daily-review-gantt-renderer.test.js tests/unit/storage/private-signed-upload.test.js` plus the existing `tests/unit/chairman/sms-bridge.test.js tests/unit/chairman/sms-outbound-reconcile.test.js` (now extended with mediaUrl cases) and any twilio-provider.js test coverage.',
    expected_outcome: 'All tests pass, with no regressions in the pre-existing text-only-SMS test cases.',
  },
];

const risks = [
  {
    risk: 'A hand-rolled SVG Gantt renderer could produce a visually broken or unreadable chart (wrong proportions, overlapping labels) since there is no existing charting library or design precedent in the repo to build against.',
    impact: 'medium',
    likelihood: 'medium',
    mitigation: 'Keep the SVG generation simple and deterministic (fixed-width bars scaled by progress_pct, one row per wave, plain text labels) and verify visually via the smoke_test_steps PNG-file-write step before considering this SD chairman-review-ready.',
  },
  {
    risk: 'The corrected reuse plan (building the private-bucket+signed-URL pattern from scratch, since no repo precedent exists) could be missed by a reviewer who only reads the parent SD\'s PRD prose (which cites now-known-wrong precedent files) and assumes those files were correctly mirrored.',
    impact: 'high',
    likelihood: 'low',
    mitigation: 'This SD\'s own key_changes/success_criteria explicitly document the correction and add a grep-based static test asserting zero getPublicUrl/public:true occurrences in the new files, so any accidental copy-paste from the wrong precedent fails CI, not just review.',
  },
];

async function main() {
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({
      key_changes,
      strategic_objectives,
      success_criteria,
      implementation_guidelines,
      success_metrics,
      smoke_test_steps,
      risks,
    })
    .eq('sd_key', SD_KEY);
  if (error) { console.error(error); process.exit(1); }
  console.log(`De-boilerplated ${SD_KEY}.`);
}

main();
