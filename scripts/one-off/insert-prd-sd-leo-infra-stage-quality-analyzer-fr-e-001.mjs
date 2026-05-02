/**
 * Insert PRD for SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-E-001
 *
 * Pattern follows FR-C′ (PRD-SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001):
 * inline_llm_mode authoring → direct UPSERT into product_requirements_v2.
 *
 * SD scope: Extend FINDING_CATEGORIES enum with feedback_widget_present and
 * error_capture_wired; add detection functions; severity policies; pluggable
 * detector strategy + initial vendor list; positive/negative test fixtures.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_UUID = '70e60826-d514-4af5-9c54-fb9b21fa9b3c';
const SD_KEY = 'SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-E-001';
const PRD_ID = `PRD-${SD_KEY}`;

const FUNCTIONAL_REQUIREMENTS = [
  {
    id: 'FR-1',
    requirement: 'Extend FINDING_CATEGORIES enum with two new check-type values',
    description: "Add 'feedback_widget_present' and 'error_capture_wired' to the FINDING_CATEGORIES Object.freeze array in lib/eva/quality-findings/finding-shape.js. Update the file's leading JSDoc to document the two new categories under a new 'Vision Compliance' header. validateFindingShape continues to use FINDING_CATEGORIES.includes() — no other call sites need updating because the enum is a single source of truth. ESM, Node 22, no new deps. Maps to SD strategic_objective 'enforce vision mandate via stage-20'.",
    acceptance_criteria: [
      "FINDING_CATEGORIES exports the literal strings 'feedback_widget_present' and 'error_capture_wired' in addition to the existing 10",
      "JSDoc above the export documents both new categories with a one-line description each under a new 'Vision Compliance' grouping",
      "validateFindingShape rejects an unknown finding_category and accepts both new values — proven by a unit-test diff of FINDING_CATEGORIES.length (10 -> 12) and a positive-case validateFindingShape({finding_category:'feedback_widget_present',...}) returning {valid:true}",
      "Module loads under Node 22; no new dependency added to package.json (vitest suite imports it without errors)"
    ]
  },
  {
    id: 'FR-2',
    requirement: 'Severity policy + Tier mapping for the two new categories',
    description: "Add explicit rows in lib/eva/quality-findings/sd-generator.js TIER_MAP for both new categories (visible to Family A's resolveTier function used by Stage 20's per-finding generator). Both rows follow the convention: `{ critical: 3, high: 3, medium: 2, low: 1 }` so chairman-visible categories never escape Tier 2 (matching uat_signoff/secrets pattern). Severity assignments at finding-emission time are decided per-detector (FR-4) but the TIER_MAP rows make the policy explicit. Maps to SD risk #2 (analyzer findings escalate to LEAD review proportional to severity).",
    acceptance_criteria: [
      "TIER_MAP['feedback_widget_present'] returns Tier 3 for severity='critical' and Tier 2 for severity='medium'",
      "TIER_MAP['error_capture_wired'] returns Tier 3 for severity='critical' and Tier 2 for severity='medium'",
      "Both rows are reachable from the existing resolveTier(category, severity) export — proven by 4 unit-test cases (2 categories × {critical, medium})",
      "tierToSdType behavior unchanged for the new categories (default 'fix' path applies); no new sd_type mapping introduced"
    ]
  },
  {
    id: 'FR-3',
    requirement: 'Pluggable detector strategy + initial vendor signature list',
    description: "Add lib/eva/quality-findings/vision-detectors.js exposing `VENDOR_SIGNATURES` (Object.freeze) — a registry of vendor signatures used by both detection functions in FR-4. Each registry entry has shape `{ id, vendor, category: 'feedback_widget_present'|'error_capture_wired', detection_kind: 'package'|'env'|'file_pattern', signal: <regex|literal>, evidence_hint: <human description> }`. Include initial coverage for the two categories: feedback widgets (Sentry feedback widget, LogRocket, FullStory, Hotjar) and error capture wiring (Sentry SDK init, Bugsnag, Rollbar, Datadog RUM). The strategy is 'first match wins' — detectors iterate the registry. New vendors are added by extending VENDOR_SIGNATURES, not by editing detection logic. Maps to SD strategic_objective 'extensibility without code-edit churn'.",
    acceptance_criteria: [
      "vision-detectors.js exports VENDOR_SIGNATURES as a non-empty Object.freeze array",
      "Every entry in VENDOR_SIGNATURES has all six fields {id, vendor, category, detection_kind, signal, evidence_hint} non-null",
      "Initial registry includes ≥4 feedback_widget_present entries (covering Sentry, LogRocket, FullStory, Hotjar) and ≥4 error_capture_wired entries (covering Sentry SDK, Bugsnag, Rollbar, Datadog RUM)",
      "category values are restricted to the two new FINDING_CATEGORIES values added in FR-1 — proven by an assertion test that walks the registry and validates each entry.category against FINDING_CATEGORIES",
      "Adding a new vendor (test fixture) requires no edit to detection logic — only an append to VENDOR_SIGNATURES"
    ]
  },
  {
    id: 'FR-4',
    requirement: 'Detection functions for feedback_widget_present and error_capture_wired',
    description: "Add lib/eva/quality-findings/vision-detectors.js exports `detectFeedbackWidgetPresent(ctx)` and `detectErrorCaptureWired(ctx)`. Both take a `ctx` object of shape `{ packageJson: <parsed package.json>, envVars: <object>, fileSamples: <array of {path, content}> }` and return `{ found: boolean, vendor?: string, signature_id?: string, severity: 'critical'|'high'|'medium'|'low', evidence_pointer: object }`. Detection iterates VENDOR_SIGNATURES filtered by category, applies signature.signal against the matching ctx slice (package dep names for 'package', env var names for 'env', regex against fileSamples[i].content for 'file_pattern'), returns first match. When no match: returns `{ found: false, severity: 'critical', evidence_pointer: {reason: 'no_vendor_signature_matched', categories_checked: [...]} }` so Stage-20 can still emit a FAIL finding (vision mandate is positive — absence is the failure). Maps to SD strategic_objective 'detect ABSENCE of feedback/error capture, not presence of bugs'.",
    acceptance_criteria: [
      "Both functions accept ctx={packageJson, envVars, fileSamples}; calling them with empty ctx yields {found:false, severity:'critical'}",
      "When packageJson.dependencies includes '@sentry/react' (a fixture entry), detectErrorCaptureWired returns {found:true, vendor:'Sentry', signature_id:<id>}",
      "When fileSamples contains a string matching the LogRocket init regex, detectFeedbackWidgetPresent returns {found:true, vendor:'LogRocket'}",
      "Severity for the absence-case (found:false) is 'critical' (vision mandate violation); severity for found:true matches the matched signature's declared severity OR a default of 'low' (informational)",
      "Both functions are pure (no DB calls, no fs reads) — they consume ctx and emit a verdict; the caller (Stage 20 analyzer) is responsible for assembling ctx"
    ]
  },
  {
    id: 'FR-5',
    requirement: 'Positive + negative vitest fixtures covering both detectors and the enum extension',
    description: "Add tests/unit/eva/quality-findings/vision-detectors.test.js with ≥10 vitest test cases covering: (a) FINDING_CATEGORIES enum has the two new entries (length+inclusion); (b) validateFindingShape accepts both new values; (c) resolveTier returns expected tier for both new categories at all four severities (8 cases conceptually, condensed); (d) VENDOR_SIGNATURES registry shape invariants; (e) detectFeedbackWidgetPresent positive case with LogRocket fixture; (f) detectFeedbackWidgetPresent negative case with empty ctx; (g) detectErrorCaptureWired positive case with Sentry fixture; (h) detectErrorCaptureWired negative case with empty ctx; (i) absence-of-signal returns severity='critical' for both detectors. Tests are pure unit (no HAS_REAL_DB sentinel needed). Maps to SD strategic_objective 'shippable with regression coverage'.",
    acceptance_criteria: [
      "tests/unit/eva/quality-findings/vision-detectors.test.js exists and runs under `npx vitest run tests/unit/eva/quality-findings/vision-detectors.test.js` with all tests passing",
      "Test count is ≥10 (covers enum + tier + registry + 2 detectors × {positive, negative, absence-severity})",
      "No test depends on env vars beyond what vitest already provides (no HAS_REAL_DB gating; pure unit tests)",
      "Existing tests/unit/eva/quality-findings/finding-shape.test.js remains green (FINDING_CATEGORIES extension is additive — old tests should not require updates)",
      "Test runtime is ≤5s — detectors are pure, no fs/network/DB"
    ]
  }
];

const TEST_SCENARIOS = [
  { id: 'TS-1', name: 'Enum extension preserves existing categories and adds two new ones', type: 'unit', steps: ['Import FINDING_CATEGORIES', "Assert length === 12", "Assert includes 'feedback_widget_present' and 'error_capture_wired'", "Assert all 10 prior categories still present"], expected: 'All assertions pass; existing finding-shape.test.js remains green' },
  { id: 'TS-2', name: 'detectFeedbackWidgetPresent finds LogRocket via package.json', type: 'unit', steps: ["Build ctx with packageJson.dependencies={'logrocket':'^1.0.0'}", 'Call detectFeedbackWidgetPresent(ctx)'], expected: '{found:true, vendor:"LogRocket", severity:<signature severity>, evidence_pointer.kind:"package"}' },
  { id: 'TS-3', name: 'detectFeedbackWidgetPresent absence yields critical-severity FAIL', type: 'unit', steps: ['Build ctx with empty packageJson, envVars, fileSamples', 'Call detectFeedbackWidgetPresent(ctx)'], expected: '{found:false, severity:"critical", evidence_pointer.reason:"no_vendor_signature_matched"}' },
  { id: 'TS-4', name: 'detectErrorCaptureWired finds Sentry via package + init', type: 'unit', steps: ["Build ctx with packageJson.dependencies={'@sentry/react':'^7.0.0'}", "Add fileSamples entry referencing Sentry.init", 'Call detectErrorCaptureWired(ctx)'], expected: '{found:true, vendor:"Sentry", severity:<signature severity>}' },
  { id: 'TS-5', name: 'TIER_MAP reflects the two new categories', type: 'unit', steps: ['Import resolveTier from sd-generator.js', "Call resolveTier('feedback_widget_present', 'critical')", "Call resolveTier('error_capture_wired', 'medium')"], expected: 'Returns Tier 3 and Tier 2 respectively' },
  { id: 'TS-6', name: 'VENDOR_SIGNATURES registry shape invariant test', type: 'unit', steps: ['Import VENDOR_SIGNATURES', "Iterate every entry, assert shape {id, vendor, category, detection_kind, signal, evidence_hint} non-null", "Assert every entry.category is in FINDING_CATEGORIES"], expected: 'All entries pass shape validation' }
];

const ACCEPTANCE_CRITERIA = [
  { measure: "FINDING_CATEGORIES enum length grows from 10 to 12 and includes both new values", criterion: "Verifiable via `import { FINDING_CATEGORIES } from './lib/eva/quality-findings/finding-shape.js'; FINDING_CATEGORIES.length === 12 && FINDING_CATEGORIES.includes('feedback_widget_present') && FINDING_CATEGORIES.includes('error_capture_wired')`" },
  { measure: "Both detection functions exist as named ESM exports of vision-detectors.js and return the documented verdict shape", criterion: "Verifiable via vitest cases TS-2..TS-4 returning {found, severity, evidence_pointer} per spec" },
  { measure: "TIER_MAP includes both new categories with the chairman-visible policy {critical:3, high:3, medium:2, low:1}", criterion: "Verifiable via TS-5 plus a row-shape diff against the pre-PR TIER_MAP" },
  { measure: "VENDOR_SIGNATURES registry covers ≥4 vendors per category and is extensible without touching detection logic", criterion: "Verifiable via TS-6 plus a regression test fixture that appends a synthetic vendor and confirms detection picks it up without code change" },
  { measure: "≥10 vitest unit tests pass; runtime ≤5s; no HAS_REAL_DB gate needed", criterion: "Verifiable via `npx vitest run tests/unit/eva/quality-findings/vision-detectors.test.js` exit 0 with 10+ passing tests" }
];

const RISKS = [
  { risk: "Vendor signature drift — detector matches a vendor's old SDK pattern but misses the rewritten one (e.g., Sentry v8 init API differs from v7)", severity: 'medium', mitigation: "VENDOR_SIGNATURES entries carry an evidence_hint that documents the SDK version range. Future-FR can add a `min_version`/`max_version` field; out of scope for FR-E." },
  { risk: "False positive when a venture imports a vendor SDK but does not actually call init (the package is in node_modules but unused)", severity: 'low', mitigation: "FR-4's detection_kind='file_pattern' provides higher-precision signals (regex against init call sites). 'package' detection is intentionally permissive — Stage 20 analyzer can choose which detection_kind to run for each venture." },
  { risk: "Stage 20 analyzer integration is out of scope (FR-A territory) — adding the enum without an analyzer that emits findings could leave the new categories unused for some time", severity: 'low', mitigation: "Documented as a known limitation in the SD scope. FR-E ships the LIBRARY; FR-A or a follow-up SD wires Stage 20 to call detectors. The detectors are pure functions reusable by any caller." }
];

async function main() {
  console.log('Authoring PRD:', PRD_ID);

  const prd = {
    id: PRD_ID,
    sd_id: SD_UUID,
    directive_id: SD_KEY,
    title: 'Extend CHECK_TYPES enum with feedback_widget_present + error_capture_wired (FR-E′ from SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-001 follow-up tail)',
    version: '1.0',
    status: 'in_progress',
    category: 'infrastructure',
    priority: 'medium',
    executive_summary: "Ship two additive components to close the vision-mandate gap on Stage 20: (1) extend FINDING_CATEGORIES with feedback_widget_present + error_capture_wired so analyzer findings can be emitted under those check types, and (2) ship a pluggable vendor-signature detector library (vision-detectors.js) with initial coverage for feedback widgets (Sentry, LogRocket, FullStory, Hotjar) and error capture (Sentry SDK, Bugsnag, Rollbar, Datadog RUM). The library is pure functions consumed by Stage 20 (out of scope here) or any other caller; new vendors are added by appending to VENDOR_SIGNATURES, never by editing detection logic. TIER_MAP is updated so the new categories route to chairman-visible Tiers (medium=Tier 2, critical=Tier 3) matching the uat_signoff/secrets pattern. Five FRs deliver: enum extension, severity/tier policy, registry+strategy, two detectors, vitest coverage. Cadence deadline 2026-05-04T23:30Z. Standalone — not blocked by any FR sibling.",
    business_context: "Vision mandate (chairman feedback widget + error-capture wiring on every venture) is currently unenforced because Stage 20 analyzer's CHECK_TYPES enum has no values for these two checks. Adding them creates the contract surface that Stage 20 (FR-A territory or follow-up SD) wires onto. Bounded scope keeps the diff small and reversible — no Stage 20 analyzer changes, no FR-C′ generator changes, no FR-F′ aggregator changes. The work is pure library code + tests.",
    technical_context: "Existing module: lib/eva/quality-findings/finding-shape.js exports FINDING_CATEGORIES (10-entry Object.freeze) + validateFindingShape + computeFindingHash. Sibling module lib/eva/quality-findings/sd-generator.js exports TIER_MAP keyed on category. New module lib/eva/quality-findings/vision-detectors.js (FR-3..4) is additive and pure. No schema migrations. No new dependencies (vitest already in dev). Tests live under tests/unit/eva/quality-findings/ alongside existing finding-shape.test.js + sd-generator.test.js. Repo: EHG_Engineer (matches family-wide target_application).",
    functional_requirements: FUNCTIONAL_REQUIREMENTS,
    technical_requirements: { language: 'Node.js 22 (ESM only)', deps: 'no new package.json dependencies; vitest 3.x already present', purity: 'all FR-3..4 detection logic is pure (no fs/DB/network); ctx is supplied by caller', testability: 'unit tests run without HAS_REAL_DB gate', non_goals: 'Stage 20 analyzer integration; vendor min/max-version detection; runtime auto-discovery of new vendors' },
    system_architecture: "Three modules touched, all in lib/eva/quality-findings/:\n\n1. finding-shape.js — additive: 2 new strings appended to FINDING_CATEGORIES Object.freeze. JSDoc updated to document the new 'Vision Compliance' grouping. validateFindingShape unchanged (uses .includes()).\n\n2. sd-generator.js — additive: 2 new rows in TIER_MAP {feedback_widget_present, error_capture_wired} matching the chairman-visible severity policy. resolveTier and tierToSdType unchanged.\n\n3. vision-detectors.js — NEW file. Exports VENDOR_SIGNATURES (Object.freeze registry), detectFeedbackWidgetPresent(ctx), detectErrorCaptureWired(ctx). Both detectors iterate VENDOR_SIGNATURES filtered by category, apply signature.signal against the matching ctx slice, return first match. Absence-case (no signature matched) returns severity='critical' so Stage 20 can emit a FAIL finding (vision mandate is POSITIVE — absence is failure).\n\nExtensibility: new vendors are added by appending to VENDOR_SIGNATURES. No edits to detection logic. Future-FR can add detection_kind values (e.g., 'config_file') without breaking callers.\n\nTesting: pure-unit, no HAS_REAL_DB sentinel. Existing finding-shape.test.js + sd-generator.test.js continue to pass unchanged (additive enum + additive TIER_MAP rows).",
    data_model: {},
    implementation_approach: "1. Edit finding-shape.js: append two strings to FINDING_CATEGORIES, update JSDoc. 2. Edit sd-generator.js TIER_MAP: append two rows. 3. Create vision-detectors.js with VENDOR_SIGNATURES (≥4 per category, 8+ total) + 2 detection functions. 4. Create vision-detectors.test.js with 10+ unit tests covering enum, tier, registry, detectors, absence-severity. 5. Run `npx vitest run tests/unit/eva/quality-findings/` to verify all pass (existing 80+ tests + 10+ new). 6. Run lint. 7. Commit, push, /ship.",
    test_scenarios: TEST_SCENARIOS,
    acceptance_criteria: ACCEPTANCE_CRITERIA,
    performance_requirements: {},
    progress: 0,
    phase: 'plan_prd',
    phase_progress: {},
    risks: RISKS,
    metadata: {
      sd_key: SD_KEY,
      sd_uuid_id: SD_UUID,
      generated_at: new Date().toISOString(),
      generated_by: 'inline_llm_mode',
      precedent_prd: 'PRD-SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001',
      author_session_id: '4477af23-6dd3-4d3a-861a-e8bb7d5e70e7'
    },
    planning_section: { quality_gates: [], risk_analysis: {}, success_metrics: [], timeline_breakdown: {}, implementation_steps: [], reasoning_depth_used: 'standard', resource_requirements: {} },
    reasoning_analysis: {},
    complexity_analysis: {},
    reasoning_depth: 'standard',
    document_type: 'prd',
    created_by: 'PLAN'
  };

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .upsert(prd, { onConflict: 'id' })
    .select('id, status, phase, sd_id')
    .single();

  if (error) {
    console.error('UPSERT FAILED:', error.message);
    process.exit(1);
  }
  console.log('UPSERT OK:', JSON.stringify(data));
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
