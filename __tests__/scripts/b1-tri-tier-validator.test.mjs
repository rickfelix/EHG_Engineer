// B1 (SD-LEO-INFRA-LEO-UPSTREAM-DECISION-001): Always/Ask First/Never validator tests
// Run: node __tests__/scripts/b1-tri-tier-validator.test.mjs

import { validateTriTierBoundaries, formatTriTierWarnings } from '../../lib/eva/tri-tier-section-validator.js';

const tests = [
  // ── PASSING (all 3 sections present) ────────────────────────────────────────
  {
    name: 'P-1: All 3 sections present (level-2 headings)',
    content: '# Vision: Foo\n\n## Always\n- Always do X\n\n## Ask First\n- Ask First Y\n\n## Never\n- Never Z',
    expectedIssueCount: 0
  },
  {
    name: 'P-2: All 3 sections present (level-3 headings)',
    content: '# Vision\n## Boundaries\n### Always\n- Run database-agent\n\n### Ask First\n- New deps\n\n### Never\n- Modify auth tables',
    expectedIssueCount: 0
  },
  {
    name: 'P-3: All 3 sections present with extra content interleaved',
    content: '# Vision\n## Executive Summary\nText\n## Always\nA1\n## Personas\nP1\n## Ask First\nQ1\n## Open Questions\nOQ\n## Never\nN1',
    expectedIssueCount: 0
  },
  // ── FAILING (missing sections) ──────────────────────────────────────────────
  {
    name: 'F-1: Missing all 3 sections',
    content: '# Vision\n## Executive Summary\nText only',
    expectedIssueCount: 3
  },
  {
    name: 'F-2: Missing only Always',
    content: '# Vision\n## Ask First\n- Q1\n## Never\n- N1',
    expectedIssueCount: 1
  },
  {
    name: 'F-3: Missing only Ask First',
    content: '# Vision\n## Always\n- A1\n## Never\n- N1',
    expectedIssueCount: 1
  },
  {
    name: 'F-4: Missing only Never',
    content: '# Vision\n## Always\n- A1\n## Ask First\n- Q1',
    expectedIssueCount: 1
  },
  {
    name: 'F-5: Missing 2 of 3 (only Always present)',
    content: '# Vision\n## Always\n- Run database-agent for schema changes',
    expectedIssueCount: 2
  },
  // ── EDGE CASES ──────────────────────────────────────────────────────────────
  {
    name: 'E-1: Empty content → 0 issues (skipped)',
    content: '',
    expectedIssueCount: 0
  },
  {
    name: 'E-2: null content → 0 issues',
    content: null,
    expectedIssueCount: 0
  },
  {
    name: 'E-3: Heading "Ask First" with extra whitespace',
    content: '## Always\n## Ask  First\n## Never',
    expectedIssueCount: 1 // Double-space "Ask  First" should not match the regex
  },
  {
    name: 'E-4: Heading case mismatch (case-insensitive — should pass)',
    content: '## ALWAYS\n## ask first\n## NeVeR',
    expectedIssueCount: 0
  },
  {
    name: 'E-5: Sections only mentioned in body text (not as headings)',
    content: 'Vision says we should always do X, ask first about Y, and never Z',
    expectedIssueCount: 3
  },
  {
    name: 'E-6: "Always" appears in another section heading like "## Always Validate"',
    content: '## Always Validate\n## Ask First\n## Never',
    expectedIssueCount: 1 // "Always Validate" does not match exact "Always" pattern
  }
];

let passed = 0;
let failed = 0;
const results = [];

for (const t of tests) {
  const r = validateTriTierBoundaries(t.content);
  const ok = r.issues.length === t.expectedIssueCount;
  if (ok) passed++;
  else failed++;
  results.push({ name: t.name, expected: t.expectedIssueCount, actual: r.issues.length, ok, issueSections: r.issues.map(i => i.section) });
}

console.log('B1 tri-tier section validator test results:');
console.log('-------------------------------------------');
for (const r of results) {
  const icon = r.ok ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${r.name}`);
  console.log(`       expected ${r.expected} missing, got ${r.actual} (missing: ${r.issueSections.join(', ') || 'none'})`);
}
console.log('-------------------------------------------');
console.log(`Total: ${tests.length} | Passed: ${passed} | Failed: ${failed}`);

// Smoke-test the formatter
const sample = validateTriTierBoundaries('# Vision\n## Executive Summary');
const formatted = formatTriTierWarnings(sample.issues);
console.log('\nFormatter smoke test (3 missing sections):');
console.log(formatted ? formatted.split('\n').slice(0, 3).join('\n') + '\n...' : 'NO_OUTPUT');

process.exit(failed === 0 ? 0 : 1);
