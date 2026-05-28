// Tests for plan-parser.js — SD-LEO-INFRA-CREATION-PARSER-HARDENING-001 FR1+FR2+FR6.
// Covers AC-1a through AC-3c from the PRD.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractExplicitType,
  extractExplicitPriority,
  extractSummary,
  parsePlanFile,
  inferSDType,
  extractKeyChanges,
  extractStrategicObjectives,
  extractRisks,
  extractSuccessCriteria,
  extractKeyPrinciples,
  extractSmokeTestSteps,
  extractSuccessMetrics,
  extractScope,
  extractExplicitTargetApplication,
  SUMMARY_CAP,
  EXPLICIT_TYPE_ENUM,
  EXPLICIT_PRIORITY_ENUM,
} from './plan-parser.js';

// ---------- extractExplicitType (FR1, AC-1) ----------

test('extractExplicitType: returns "infrastructure" for explicit header', () => {
  const content = '# Plan\n\n## Type\n\ninfrastructure\n\n## Summary\n\nDetails.';
  assert.equal(extractExplicitType(content), 'infrastructure');
});

test('extractExplicitType: accepts all canonical sd_type values', () => {
  for (const value of EXPLICIT_TYPE_ENUM) {
    const content = `## Type\n\n${value}\n`;
    assert.equal(extractExplicitType(content), value, `should accept ${value}`);
  }
});

test('extractExplicitType: case-insensitive — "INFRASTRUCTURE" normalizes to lowercase', () => {
  const content = '## Type\n\nINFRASTRUCTURE\n';
  assert.equal(extractExplicitType(content), 'infrastructure');
});

test('extractExplicitType: AC-1c — unknown value returns null (falls through to inferSDType)', () => {
  const content = '## Type\n\nfoobar\n';
  assert.equal(extractExplicitType(content), null);
});

test('extractExplicitType: AC-1d — no header returns null', () => {
  const content = '# Plan\n\nJust some bug fix text.';
  assert.equal(extractExplicitType(content), null);
});

test('extractExplicitType: ignores `## Type of change` (not an exact Type header)', () => {
  const content = '## Type of change\n\nfeature\n';
  assert.equal(extractExplicitType(content), null);
});

test('extractExplicitType: null/empty input returns null', () => {
  assert.equal(extractExplicitType(null), null);
  assert.equal(extractExplicitType(''), null);
});

// ---------- extractExplicitPriority (FR1, AC-2) ----------

test('extractExplicitPriority: returns "high" for explicit header', () => {
  const content = '## Priority\n\nhigh\n';
  assert.equal(extractExplicitPriority(content), 'high');
});

test('extractExplicitPriority: accepts all 4 canonical values', () => {
  for (const value of EXPLICIT_PRIORITY_ENUM) {
    const content = `## Priority\n\n${value}\n`;
    assert.equal(extractExplicitPriority(content), value, `should accept ${value}`);
  }
});

test('extractExplicitPriority: case-insensitive — "HIGH" normalizes', () => {
  assert.equal(extractExplicitPriority('## Priority\n\nHIGH\n'), 'high');
});

test('extractExplicitPriority: unknown value returns null', () => {
  assert.equal(extractExplicitPriority('## Priority\n\nurgent\n'), null);
});

test('extractExplicitPriority: no header returns null', () => {
  assert.equal(extractExplicitPriority('# Plan\n\nbody'), null);
});

// ---------- extractSummary (FR2, AC-3) ----------

test('extractSummary: AC-3a — multi-paragraph 1500-char summary returns all paragraphs', () => {
  const p1 = 'First paragraph text. '.repeat(25);  // ~575 chars
  const p2 = 'Second paragraph with more detail. '.repeat(15); // ~525 chars
  const p3 = 'Third paragraph wrapping up the overview. '.repeat(10); // ~420 chars
  const content = `# Title\n\n## Summary\n\n${p1}\n\n${p2}\n\n${p3}\n\n## Next Section\n\nOther.`;
  const out = extractSummary(content);
  assert.ok(out, 'returns a value');
  assert.ok(out.length > 500, `returns more than 500 chars (got ${out.length})`);
  assert.ok(out.length <= SUMMARY_CAP, `respects cap (got ${out.length})`);
  assert.ok(out.includes('Second paragraph'), 'contains paragraph 2');
  assert.ok(out.includes('Third paragraph'), 'contains paragraph 3');
});

test('extractSummary: AC-3b — summary over cap truncates at paragraph boundary with ...', () => {
  // Build 4 paragraphs of 700 chars each = 2800 chars; cap is 2000.
  const p = (n) => `Paragraph ${n} content. `.repeat(35); // ~700 chars each
  const content = `## Summary\n\n${p(1)}\n\n${p(2)}\n\n${p(3)}\n\n${p(4)}\n\n## End`;
  const out = extractSummary(content);
  assert.ok(out.length <= SUMMARY_CAP, `respects cap (got ${out.length})`);
  assert.ok(out.endsWith('...'), 'ends with ellipsis');
  // Must not contain paragraph 4 (would mean > cap).
  assert.ok(!out.includes('Paragraph 4 content'), 'does NOT contain paragraph 4 (truncated at boundary)');
});

test('extractSummary: AC-3c — short summary under cap returns unchanged', () => {
  const content = '## Summary\n\nA short summary paragraph.\n\n## Next';
  const out = extractSummary(content);
  assert.equal(out, 'A short summary paragraph.');
  assert.ok(!out.endsWith('...'), 'no ellipsis on short summary');
});

test('extractSummary: matches ## Goal alias', () => {
  const out = extractSummary('## Goal\n\nDeliver X by Q4.\n\n## Risks\n\nNone.');
  assert.equal(out, 'Deliver X by Q4.');
});

test('extractSummary: matches ## Executive Summary alias', () => {
  const out = extractSummary('## Executive Summary\n\nScope and impact.\n\n## Plan\n\nSteps.');
  assert.equal(out, 'Scope and impact.');
});

test('extractSummary: missing section returns null', () => {
  assert.equal(extractSummary('# Title\n\nNo summary here.'), null);
});

// ---------- parsePlanFile integration ----------

test('parsePlanFile: explicit Type wins over inferred (bugfix keyword present)', () => {
  // Description contains "fix" which would make inferSDType return 'bugfix'.
  // Explicit header should override that.
  const content = '# Title\n\n## Type\n\ninfrastructure\n\n## Summary\n\nFix some bug in the parser system.';
  const parsed = parsePlanFile(content);
  assert.equal(parsed.type, 'infrastructure', 'explicit header overrides keyword heuristic');
  // Sanity: without the header, inferSDType returns canonical 'bugfix' (SD-FDBK-INFRA-TYPE-SOURCE-TRUTH-001)
  assert.equal(inferSDType('## Summary\n\nFix some bug.'), 'bugfix');
});

test('parsePlanFile: no explicit Type falls through to inferSDType', () => {
  const content = '# Title\n\n## Summary\n\nRefactor the module.';
  const parsed = parsePlanFile(content);
  assert.equal(parsed.type, 'refactor');
});

test('parsePlanFile: explicit Priority threaded into return value', () => {
  const content = '## Type\n\ninfrastructure\n\n## Priority\n\nhigh\n\n## Summary\n\nX.';
  const parsed = parsePlanFile(content);
  assert.equal(parsed.priority, 'high');
});

test('parsePlanFile: no Priority header yields null priority', () => {
  const content = '## Summary\n\nX.';
  const parsed = parsePlanFile(content);
  assert.equal(parsed.priority, null);
});

test('parsePlanFile: empty content returns default shape with priority:null', () => {
  const parsed = parsePlanFile('');
  assert.equal(parsed.type, 'feature');
  assert.equal(parsed.priority, null);
  assert.equal(parsed.summary, null);
  assert.deepEqual(parsed.steps, []);
});

test('parsePlanFile: invalid explicit type value falls through, priority honored', () => {
  const content = '## Type\n\nfoobar\n\n## Priority\n\ncritical\n\n## Summary\n\nSecurity vulnerability fix.';
  const parsed = parsePlanFile(content);
  // foobar invalid → falls through to inferSDType which detects 'security'+'fix' → returns canonical 'bugfix'
  assert.equal(parsed.type, 'bugfix');
  assert.equal(parsed.priority, 'critical');
});

// ---------- SD-LEO-INFRA-AUTO-GENERATED-PRD-001 (FR-1, FR-2) ----------

test('extractSuccessCriteria: AC-1.1 — present with bullets returns {criterion, measure}[]', () => {
  const content = '## Acceptance\n- Criterion A\n- Criterion B\n';
  const result = extractSuccessCriteria(content);
  assert.deepEqual(result, [
    { criterion: 'Criterion A', measure: 'See plan for details' },
    { criterion: 'Criterion B', measure: 'See plan for details' },
  ]);
});

test('extractSuccessCriteria: AC-1.2 — absent section returns null (not [])', () => {
  const content = '# Plan\n\n## Summary\n\nNo acceptance section here.';
  assert.equal(extractSuccessCriteria(content), null);
});

test('extractSuccessCriteria: AC-1.3 — parsePlanFile exposes successCriteria', () => {
  const content = '# Plan\n\n## Success Criteria\n- The thing works\n';
  const parsed = parsePlanFile(content);
  assert.ok(Array.isArray(parsed.successCriteria));
  assert.equal(parsed.successCriteria[0].criterion, 'The thing works');
});

test('extractKeyChanges: AC-2.1 — no ## Changes section AND no files → null', () => {
  const content = '# Plan\n\n## Summary\n\nNothing about changes.\n';
  assert.equal(extractKeyChanges(content), null);
});

test('extractKeyChanges: AC-2.2 — header only, no bullets → []', () => {
  const content = '# Plan\n\n## Changes\n\n';
  const result = extractKeyChanges(content);
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

test('extractKeyChanges: AC-2.3 — bullets present → objects (unchanged behavior)', () => {
  const content = '## Changes\n- Add new feature\n- Fix bug\n';
  const result = extractKeyChanges(content);
  assert.equal(result.length, 2);
  assert.equal(result[0].change, 'Add new feature');
});

test('extractStrategicObjectives: absent section returns null (removed summary fallback)', () => {
  const content = '# Plan\n\n## Summary\n\nSome purpose without objectives section.';
  assert.equal(extractStrategicObjectives(content), null);
});

test('extractRisks: absent section returns null', () => {
  const content = '## Summary\n\nNo risks section here.';
  assert.equal(extractRisks(content), null);
});

// ---------- SD-FDBK-INFRA-LEO-CREATE-PLAN-001 (FR-1, FR-3) ----------

// extractKeyPrinciples (FR-1)

test('extractKeyPrinciples: present with bullets returns string[]', () => {
  const content = '## Key Principles\n- Keep it backward compatible\n- Fail fast on bad input\n';
  assert.deepEqual(extractKeyPrinciples(content), [
    'Keep it backward compatible',
    'Fail fast on bad input',
  ]);
});

test('extractKeyPrinciples: matches ## Principles alias', () => {
  const content = '## Principles\n- One principle\n';
  assert.deepEqual(extractKeyPrinciples(content), ['One principle']);
});

test('extractKeyPrinciples: absent section returns null (not [])', () => {
  const content = '# Plan\n\n## Summary\n\nNo principles section here.';
  assert.equal(extractKeyPrinciples(content), null);
});

// extractSmokeTestSteps (FR-1)

test('extractSmokeTestSteps: present with bullets returns {step_number, instruction, expected_outcome}[]', () => {
  const content = '## Smoke Test Steps\n- Run the parser on a fixture\n- Confirm null when section absent\n';
  assert.deepEqual(extractSmokeTestSteps(content), [
    { step_number: 1, instruction: 'Run the parser on a fixture', expected_outcome: 'See plan for details' },
    { step_number: 2, instruction: 'Confirm null when section absent', expected_outcome: 'See plan for details' },
  ]);
});

test('extractSmokeTestSteps: matches ## Smoke Test alias', () => {
  const content = '## Smoke Test\n- Single step\n';
  const out = extractSmokeTestSteps(content);
  assert.equal(out.length, 1);
  assert.equal(out[0].instruction, 'Single step');
});

test('extractSmokeTestSteps: absent section returns null (not [])', () => {
  const content = '# Plan\n\n## Summary\n\nNo smoke test section here.';
  assert.equal(extractSmokeTestSteps(content), null);
});

// extractSuccessMetrics (FR-1)

test('extractSuccessMetrics: TS-1 — present returns {metric, target}[]', () => {
  const content = '## Success Metrics\n- Parser extracts all 4 fields\n- Zero placeholder gate failures\n';
  assert.deepEqual(extractSuccessMetrics(content), [
    { metric: 'Parser extracts all 4 fields', target: 'See plan for details' },
    { metric: 'Zero placeholder gate failures', target: 'See plan for details' },
  ]);
});

test('extractSuccessMetrics: matches ## Metrics alias', () => {
  const content = '## Metrics\n- Latency under 100ms\n';
  assert.deepEqual(extractSuccessMetrics(content), [
    { metric: 'Latency under 100ms', target: 'See plan for details' },
  ]);
});

test('extractSuccessMetrics: TS-2 — absent section returns null (not [])', () => {
  const content = '# Plan\n\n## Summary\n\nNo success metrics section here.';
  assert.equal(extractSuccessMetrics(content), null);
});

// extractScope (FR-1)

test('extractScope: present returns trimmed body string', () => {
  const content = '## Scope\n\nModify plan-parser.js and leo-create-sd.js only.\n\n## Next\n\nOther.';
  assert.equal(extractScope(content), 'Modify plan-parser.js and leo-create-sd.js only.');
});

test('extractScope: strips markdown emphasis', () => {
  const content = '## In Scope\n\n**Bold** scope text.\n';
  assert.equal(extractScope(content), 'Bold scope text.');
});

test('extractScope: absent section returns null', () => {
  const content = '# Plan\n\n## Summary\n\nNo scope section here.';
  assert.equal(extractScope(content), null);
});

// TS-3: each new extractor returns parsed value when present and null when absent (composite)

test('TS-3: extractScope, extractKeyPrinciples, extractSmokeTestSteps each parse-when-present / null-when-absent', () => {
  const present = '## Scope\n\nNarrow.\n\n## Key Principles\n- P1\n\n## Smoke Test Steps\n- S1\n';
  assert.equal(extractScope(present), 'Narrow.');
  assert.deepEqual(extractKeyPrinciples(present), ['P1']);
  assert.equal(extractSmokeTestSteps(present).length, 1);

  const absent = '# Plan\n\n## Summary\n\nNothing else.';
  assert.equal(extractScope(absent), null);
  assert.equal(extractKeyPrinciples(absent), null);
  assert.equal(extractSmokeTestSteps(absent), null);
});

// parsePlanFile integration — new fields exposed

test('parsePlanFile: exposes keyPrinciples, smokeTestSteps, successMetrics, planScope', () => {
  const content = [
    '# Plan',
    '## Scope',
    'Narrow scope.',
    '## Key Principles',
    '- Backward compatible',
    '## Smoke Test Steps',
    '- Run it',
    '## Success Metrics',
    '- It works',
  ].join('\n\n');
  const parsed = parsePlanFile(content);
  assert.equal(parsed.planScope, 'Narrow scope.');
  assert.deepEqual(parsed.keyPrinciples, ['Backward compatible']);
  assert.equal(parsed.smokeTestSteps[0].instruction, 'Run it');
  assert.equal(parsed.successMetrics[0].metric, 'It works');
});

test('parsePlanFile: new fields are null when sections absent', () => {
  const parsed = parsePlanFile('# Plan\n\n## Summary\n\nNothing.');
  assert.equal(parsed.planScope, null);
  assert.equal(parsed.keyPrinciples, null);
  assert.equal(parsed.smokeTestSteps, null);
  assert.equal(parsed.successMetrics, null);
});

test('parsePlanFile: empty content default shape includes null new fields', () => {
  const parsed = parsePlanFile('');
  assert.equal(parsed.keyPrinciples, null);
  assert.equal(parsed.smokeTestSteps, null);
  assert.equal(parsed.successMetrics, null);
  assert.equal(parsed.planScope, null);
});

// extractExplicitTargetApplication (FR-3)

test('extractExplicitTargetApplication: TS-4 — front-matter-only plan resolves from front-matter', () => {
  const content = '<!-- Type: feature, target_application: EHG -->\n\n# Plan\n\n## Summary\n\nBody.';
  assert.equal(extractExplicitTargetApplication(content), 'EHG');
});

test('extractExplicitTargetApplication: front-matter multi-line comment resolves', () => {
  const content = '<!--\nType: infrastructure\ntarget_application: EHG_Engineer\n-->\n# Plan';
  assert.equal(extractExplicitTargetApplication(content), 'EHG_Engineer');
});

test('extractExplicitTargetApplication: TS-5 — both H2 header and front-matter resolve to the H2 value (precedence)', () => {
  const content = '<!-- target_application: EHG -->\n\n# Plan\n\n## Target Application\n\nEHG_Engineer\n\n## Summary\n\nBody.';
  assert.equal(extractExplicitTargetApplication(content), 'EHG_Engineer');
});

test('extractExplicitTargetApplication: H2-only plan unchanged (byte-identical legacy path)', () => {
  const content = '# Plan\n\n## Target Application\n\nEHG_Engineer (Stage 0 venture engine)\n';
  assert.equal(extractExplicitTargetApplication(content), 'EHG_Engineer');
});

test('extractExplicitTargetApplication: TS-6 — neither present returns null (default path applies)', () => {
  const content = '# Plan\n\n## Summary\n\nNo target signal anywhere.';
  assert.equal(extractExplicitTargetApplication(content), null);
});

test('extractExplicitTargetApplication: HTML comment without target_application key returns null', () => {
  const content = '<!-- Type: feature, Priority: high -->\n\n# Plan\n\n## Summary\n\nBody.';
  assert.equal(extractExplicitTargetApplication(content), null);
});

test('extractExplicitTargetApplication: front-matter is case-insensitive on the key', () => {
  const content = '<!-- Target_Application: EHG -->\n# Plan';
  assert.equal(extractExplicitTargetApplication(content), 'EHG');
});
