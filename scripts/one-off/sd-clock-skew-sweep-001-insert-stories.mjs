#!/usr/bin/env node
// PLAN phase: user stories for SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001, one per FR, each carrying
// implementation_context (BMAD gate requires >=80% coverage).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001';
const PRD_ID = `PRD-${SD_KEY}`;

const { data: sd, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
if (sdErr) { console.error('SD_LOOKUP_FAILED', sdErr); process.exit(1); }

function ctx({ files, approach, tests }) {
  return `## Implementation Guidance\n\n**Files to modify:**\n${files.map((f) => `- ${f}`).join('\n')}\n\n**Approach:**\n${approach}\n\n**Test coverage:**\n${tests}`;
}

const stories = [
  {
    key: 'US-001',
    title: 'Absolute TEST_CLOCK_PIN_ISO pin, reapplied per-test (FR-1)',
    user_role: 'Test infrastructure maintainer',
    user_want: 'pin the system clock to an exact absolute instant for a test run, not just a relative offset',
    user_benefit: 'reproduce time-of-day-specific defects (DST transitions, quiet-window boundaries) that a moving offset pin cannot reach',
    priority: 'critical',
    acceptance_criteria: [
      { scenario: 'Malformed pin fails safe', given: 'TEST_CLOCK_PIN_ISO is an invalid date string', when: 'tests/setup.clock-skew.js loads', then: 'ACTIVE_MODE is null, behavior is identical to unset' },
      { scenario: 'Pin reapplies per test', given: 'TEST_CLOCK_PIN_ISO is a valid future instant', when: 'a sibling test resets to real timers', then: 'the next test in the same file still observes the pinned instant' },
    ],
    implementation_context: ctx({
      files: ['tests/setup.clock-skew.js'],
      approach: 'Add parsePinMs(raw) mirroring the existing parseOffsetMs fail-safe contract. Derive ACTIVE_MODE = pin > offset > null. In beforeEach, branch on ACTIVE_MODE and set vi.setSystemTime(new RealDate(PIN_MS)) for pin mode; append a ledger line with mode:"pin".',
      tests: 'tests/unit/hygiene/clock-skew-reapplication.spawn.test.js (nested-vitest, out-of-process ledger read).',
    }),
  },
  {
    key: 'US-002',
    title: 'Sweep matrix covers +45d-class and SMS-quiet-window instants (FR-2)',
    user_role: 'Test infrastructure maintainer',
    user_want: 'the clock-skew sweep to exercise a specific ET quiet-window instant, not only a generic future offset',
    user_benefit: 'catch a DST-transition-class or SMS-quiet-window-boundary bug the existing offset-only sweep cannot reach',
    priority: 'high',
    acceptance_criteria: [
      { scenario: 'Quiet-window instant verified', given: 'the chosen pin ISO string', when: 'converted to America/New_York', then: 'hour is >= 22 or < 6' },
      { scenario: 'Precedence when both vars set', given: 'both TEST_CLOCK_PIN_ISO and TEST_CLOCK_OFFSET_MS are set', when: 'the setup hook loads', then: 'PIN wins and a stdout line names the ignored offset' },
    ],
    implementation_context: ctx({
      files: ['tests/unit/hygiene/clock-skew-reapplication.spawn.test.js', 'tests/setup.clock-skew.js (header comment fix: stale non-.spawn. filename reference)'],
      approach: 'Reuse the existing runChildVitest/readLedger helpers already in the spawn test file; add 4 new it() cases exactly mirroring the existing offset-mode cases\' shape.',
      tests: 'Self-verifying (this IS the test suite); run via npx vitest run tests/unit/hygiene/clock-skew-reapplication.spawn.test.js.',
    }),
  },
  {
    key: 'US-003',
    title: 'wall-clock-test-lint.mjs file-level diff-mode detector (FR-3)',
    user_role: 'Any engineer adding a new test',
    user_want: 'a lint that flags a new test calling a time-sensitive chairman entry point with no fake-clock token',
    user_benefit: 'catch the exact silent-real-clock-dependency class SD-LEO-FIX-SECOND-WALL-CLOCK-001 already had to fix once, before it ships',
    priority: 'critical',
    acceptance_criteria: [
      { scenario: 'Pure predicate correctness', given: 'a fixture file referencing an entry point with no token', when: 'isViolation(source) is called', then: 'returns true' },
      { scenario: 'Baseline partition', given: 'a file already violating at the merge base', when: 'diff mode runs', then: 'the file is reported preExisting, not blocking' },
    ],
    implementation_context: ctx({
      files: ['scripts/lint/wall-clock-test-lint.mjs', 'scripts/lint/wall-clock-test-lint.test.js (new)'],
      approach: 'Mirror scripts/lint/shell-injection-argv-lint.mjs\'s structure: makeHardenedGitRunner for all git ops, collectDiffTestFiles (name-status touched files), readAtMergeBase (git show blob), isViolation (pure, file-level not line-level), runDiffMode partitioning new vs preExisting.',
      tests: 'Unit tests for isViolation (fixture strings) and runDiffMode (injected fake git runner), plus an --all census smoke assertion.',
    }),
  },
  {
    key: 'US-004',
    title: 'retryOrAlert coverage documented as transitive (FR-4)',
    user_role: 'Future maintainer reading the lint tool',
    user_want: 'to understand why retryOrAlert is absent from the direct entry-point list',
    user_benefit: 'avoid "fixing" the omission back to a name that can never match (it is module-private, unexported)',
    priority: 'medium',
    acceptance_criteria: [
      { scenario: 'Documented omission', given: 'scripts/lint/wall-clock-test-lint.mjs\'s header comment', when: 'read', then: 'it states retryOrAlert is module-private and unreachable directly, covered transitively via reconcileOutboundSms' },
    ],
    implementation_context: ctx({
      files: ['scripts/lint/wall-clock-test-lint.mjs (header comment only)'],
      approach: 'No code change beyond the comment already written in FR-3\'s implementation.',
      tests: 'N/A -- documentation-only acceptance criterion, verified by code review.',
    }),
  },
  {
    key: 'US-005',
    title: 'Piece (b) explicitly deferred with a machine-readable blocker (FR-5)',
    user_role: 'LEAD / future sweep of deferred SD pieces',
    user_want: 'a durable, queryable record of why piece (b) was cut and what unblocks it',
    user_benefit: 'the deferral is never silently forgotten, unlike a prose-only note',
    priority: 'high',
    acceptance_criteria: [
      { scenario: 'Deferral recorded', given: 'strategic_directives_v2.metadata for this SD', when: 'queried', then: 'deferred_pieces contains {piece:"b", blocked_by_sd_key:"SD-LEO-FIX-TESTS-QUARANTINE-MANIFEST-001"}' },
      { scenario: 'No workflow file diff', given: 'this SD\'s git diff', when: 'inspected', then: '.github/workflows/unit-tier-clock-skew.yml has zero changed lines' },
    ],
    implementation_context: ctx({
      files: ['strategic_directives_v2 (metadata.deferred_pieces, via scripts/one-off/sd-clock-skew-sweep-001-lead-scope-reduction.mjs)'],
      approach: 'A DB metadata write, not a code change -- already applied at LEAD phase.',
      tests: 'N/A -- verified by DB query, not a test file.',
    }),
  },
];

const rows = stories.map((s) => ({
  story_key: `${SD_KEY}:${s.key}`,
  prd_id: PRD_ID,
  sd_id: sd.id,
  title: s.title,
  user_role: s.user_role,
  user_want: s.user_want,
  user_benefit: s.user_benefit,
  priority: s.priority,
  status: 'ready',
  acceptance_criteria: s.acceptance_criteria,
  implementation_context: s.implementation_context,
  validation_status: 'validated',
  created_by: 'PLAN_LEAD_MANUAL',
}));

const { error } = await supabase.from('user_stories').upsert(rows, { onConflict: 'story_key' });
if (error) { console.error('STORIES_INSERT_FAILED', error); process.exit(1); }
console.log('Inserted', rows.length, 'user stories for', SD_KEY);
