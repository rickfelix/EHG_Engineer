// C1 (SD-LEO-INFRA-LEO-UPSTREAM-DECISION-001): Smoke tests for detectNonVertical
// Tests the vertical-slice heuristic against known horizontal/vertical patterns.
// Run: node __tests__/scripts/detect-non-vertical.test.cjs

// Inline copy of detectNonVertical for ESM-free smoke testing
// (Source of truth: scripts/create-orchestrator-from-plan.js)
function detectNonVertical(title, description, content) {
  const haystack = `${title || ''} ${description || ''} ${content || ''}`.toLowerCase();
  const backendPatterns = [
    /\b(database|schema|migration|postgres|supabase|sql|table|column|index|rls|trigger)\b/,
    /\b(rpc|function|stored procedure|backend|server|api endpoint|rest|graphql)\b/,
    /\b(model|orm|persistence|repository|query)\b/
  ];
  const frontendPatterns = [
    /\b(ui|component|page|route|view|layout|form|button|modal|dashboard|panel)\b/,
    /\b(react|tsx|jsx|tailwind|shadcn|frontend|browser|client-side)\b/,
    /\b(wireframe|mockup|design|responsive|accessibility|a11y)\b/
  ];
  const hasBackend = backendPatterns.some(re => re.test(haystack));
  const hasFrontend = frontendPatterns.some(re => re.test(haystack));
  if (hasBackend && hasFrontend) return { non_vertical: false, justification: null };
  if (hasBackend && !hasFrontend) return { non_vertical: true, justification: 'backend-only' };
  if (hasFrontend && !hasBackend) return { non_vertical: true, justification: 'frontend-only' };
  return { non_vertical: false, justification: null };
}

const tests = [
  // Vertical slices (touch both backend and frontend) → non_vertical=false
  {
    name: 'V-1: Full-stack feature touches DB + UI',
    title: 'User profile editing',
    description: 'Add new schema column for bio, expose REST endpoint, build profile edit form component',
    expected: false
  },
  {
    name: 'V-2: End-to-end auth flow',
    title: 'Email verification',
    description: 'Database table for verification tokens, API endpoint to issue/verify, login page UI updates',
    expected: false
  },
  // Horizontal: backend-only → non_vertical=true
  {
    name: 'H-B-1: Database migration only',
    title: 'Add audit columns to user table',
    description: 'Migration to add created_by, updated_by, RLS policies for new columns',
    expected: true
  },
  {
    name: 'H-B-2: Backend logic only',
    title: 'Update RPC function with new validation',
    description: 'Modify stored procedure to enforce business rule on inserts',
    expected: true
  },
  {
    name: 'H-B-3: API endpoint only',
    title: 'New REST endpoint for analytics',
    description: 'GraphQL query, Supabase RLS for new table, server-side aggregation',
    expected: true
  },
  // Horizontal: frontend-only → non_vertical=true
  {
    name: 'H-F-1: UI component only',
    title: 'New dashboard panel layout',
    description: 'React component with Tailwind, responsive design, accessibility audit',
    expected: true
  },
  {
    name: 'H-F-2: Wireframe and design only',
    title: 'Onboarding flow wireframes',
    description: 'Design wireframes for 3 screens, button styles, modal layouts',
    expected: true
  },
  // Logic-only / content-light → non_vertical=false (do not over-flag)
  {
    name: 'N-1: Pure business logic',
    title: 'Implement scoring algorithm',
    description: 'Add validation rule for X, update workflow orchestration, integration adapter',
    expected: false
  },
  {
    name: 'N-2: Empty / minimal description',
    title: 'Phase 1',
    description: '',
    expected: false
  }
];

let passed = 0;
let failed = 0;
const results = [];

for (const t of tests) {
  const r = detectNonVertical(t.title, t.description, '');
  const ok = r.non_vertical === t.expected;
  if (ok) passed++;
  else failed++;
  results.push({ name: t.name, expected: t.expected, actual: r.non_vertical, justification: r.justification, ok });
}

console.log('C1 detectNonVertical heuristic test results:');
console.log('-------------------------------------------');
for (const r of results) {
  const icon = r.ok ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${r.name}`);
  console.log(`       expected=${r.expected}, actual=${r.actual}` + (r.justification ? ` (${r.justification})` : ''));
}
console.log('-------------------------------------------');
console.log(`Total: ${tests.length} | Passed: ${passed} | Failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
