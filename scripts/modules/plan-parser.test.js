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
  // Description contains "fix" which would make inferSDType return 'fix'.
  // Explicit header should override that.
  const content = '# Title\n\n## Type\n\ninfrastructure\n\n## Summary\n\nFix some bug in the parser system.';
  const parsed = parsePlanFile(content);
  assert.equal(parsed.type, 'infrastructure', 'explicit header overrides keyword heuristic');
  // Sanity: without the header, inferSDType would have returned fix
  assert.equal(inferSDType('## Summary\n\nFix some bug.'), 'fix');
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
  // foobar invalid → falls through to inferSDType which detects 'security'+'fix'
  assert.equal(parsed.type, 'fix');
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
