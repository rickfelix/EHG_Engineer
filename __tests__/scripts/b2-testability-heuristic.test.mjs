// B2 (SD-LEO-INFRA-LEO-UPSTREAM-DECISION-001): Testable Success Criteria heuristic tests
// Run: node __tests__/scripts/b2-testability-heuristic.test.mjs

import { validateSuccessCriteriaTestability } from '../../lib/eva/testable-criteria-heuristic.js';

const tests = [
  // ── PASSING (testable criteria — no issues) ─────────────────────────────────
  {
    name: 'P-1: Pseudo-code block (fenced) makes whole section testable',
    sections: { success_criteria: '- Login form validates input\n- ```js\nconst result = validate(input);\nexpect(result.ok).toBe(true);\n```' },
    expectedIssueCount: 0
  },
  {
    name: 'P-2: Measurable assertion with "must equal"',
    sections: { success_criteria: '- API response must equal 200\n- Latency must complete within 100ms' },
    expectedIssueCount: 0
  },
  {
    name: 'P-3: Given/When/Then BDD format',
    sections: { success_criteria: '- Given a logged-in user, When they click submit, Then the form posts' },
    expectedIssueCount: 0
  },
  {
    name: 'P-4: Numbered E2E steps',
    sections: { success_criteria: '- Step 1: Navigate to /dashboard\n- Step 2: Click Create Venture\n- Step 3: Fill form' },
    expectedIssueCount: 0
  },
  {
    name: 'P-5: Numeric thresholds',
    sections: { success_criteria: '- Coverage >= 80%\n- Build time < 60 seconds\n- Memory usage < 512mb' },
    expectedIssueCount: 0
  },
  {
    name: 'P-6: SQL query reference',
    sections: { success_criteria: '- SELECT COUNT(*) FROM users WHERE active = true returns >= 100' },
    expectedIssueCount: 0
  },
  {
    name: 'P-7: Within-unit assertion',
    sections: { success_criteria: '- API responds within 200 milliseconds for all requests' },
    expectedIssueCount: 0
  },
  // ── FAILING (vague criteria — should produce issues) ────────────────────────
  {
    name: 'F-1: Single vague verb "improve performance"',
    sections: { success_criteria: '- Improve performance' },
    expectedIssueCount: 1
  },
  {
    name: 'F-2: Multiple vague criteria',
    sections: { success_criteria: '- Better UX\n- Faster load times\n- More reliable' },
    expectedIssueCount: 3
  },
  {
    name: 'F-3: Mixed pass + vague (1 fail)',
    sections: { success_criteria: '- API must complete within 100ms\n- Better user experience\n- Coverage >= 80%' },
    expectedIssueCount: 1
  },
  // ── EDGE CASES ──────────────────────────────────────────────────────────────
  {
    name: 'E-1: Empty success_criteria → 0 issues',
    sections: { success_criteria: '' },
    expectedIssueCount: 0
  },
  {
    name: 'E-2: Missing section → 0 issues',
    sections: {},
    expectedIssueCount: 0
  },
  {
    name: 'E-3: Long descriptive criterion (≥80 chars) without signals → not flagged (over-cautious mode)',
    sections: { success_criteria: '- The system shall provide a comprehensive view of all active strategic directives in the queue display, including their current phase and progress percentage' },
    expectedIssueCount: 0
  }
];

let passed = 0;
let failed = 0;
const results = [];

for (const t of tests) {
  const r = validateSuccessCriteriaTestability(t.sections);
  const ok = r.issues.length === t.expectedIssueCount;
  if (ok) passed++;
  else failed++;
  results.push({ name: t.name, expected: t.expectedIssueCount, actual: r.issues.length, ok, issues: r.issues });
}

console.log('B2 testability heuristic test results:');
console.log('--------------------------------------');
for (const r of results) {
  const icon = r.ok ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${r.name}`);
  console.log(`       expected ${r.expected} issues, got ${r.actual}`);
  if (!r.ok && r.issues.length > 0) {
    r.issues.forEach(i => console.log(`         - "${i.criterion}" — ${i.reason.slice(0, 80)}`));
  }
}
console.log('--------------------------------------');
console.log(`Total: ${tests.length} | Passed: ${passed} | Failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
