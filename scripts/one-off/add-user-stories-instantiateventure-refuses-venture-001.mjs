#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001';
const PRD_ID = 'PRD-SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001';
const SD_ID = '0667ff2f-c224-4359-92a7-d156a0a414b1';

const stories = [
  {
    story_key: `${SD_KEY}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Add VentureNotFoundError + defaultVentureExists helper, mirroring the proven creative-brief.js pattern',
    user_role: 'Developer maintaining lib/agents/venture-ceo-factory.js',
    user_want: 'a VentureNotFoundError class and a defaultVentureExists(supabase, ventureId) helper, replicating the exact shape already shipped in lib/creative/creative-brief.js (a named Error subclass with a .code property, and a maybeSingle()-based helper that treats Postgres 22P02 as "does not exist" rather than a raw DB error)',
    user_benefit: 'instantiateVenture() gets a reusable, independently unit-testable way to distinguish a nonexistent venture id from a genuine database failure, without re-deriving error handling for malformed ids from scratch',
    priority: 'critical',
    status: 'ready',
    story_points: 2,
    acceptance_criteria: [
      "AC-1: VentureNotFoundError is a proper Error subclass with .name='VentureNotFoundError' and .code='VENTURE_NOT_FOUND', message including the passed ventureId.",
      "AC-2: defaultVentureExists returns false (not a thrown error) when Postgres returns error.code '22P02' (a malformed/non-UUID id).",
      'AC-3: defaultVentureExists returns true only when the ventures table has a matching row for the given id.',
    ],
    definition_of_done: [
      'VentureNotFoundError and defaultVentureExists added to lib/agents/venture-ceo-factory.js',
      'Shape verified against lib/creative/creative-brief.js:31-50 (same .name/.code contract, same 22P02 handling)',
      'Unit tests TS-3 and TS-4 pass',
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'lib/creative/creative-brief.js already solves this exact problem (refuse an operation for a nonexistent venture, testable without a DB) for a different call site (requestCreativeAsset). Do not import its classes directly — different domain, different error message — replicate the shape instead.',
    implementation_approach: "Add `export class VentureNotFoundError extends Error` near the top of venture-ceo-factory.js, and a module-private `async function defaultVentureExists(supabase, ventureId)` using `.select('id').eq('id', ventureId).maybeSingle()`.",
    implementation_context: JSON.stringify({
      technical_approach: "Add `export class VentureNotFoundError extends Error { constructor(ventureId) { super(`Venture ${ventureId || '(missing)'} does not exist`); this.name = 'VentureNotFoundError'; this.code = 'VENTURE_NOT_FOUND'; } }` near the top of lib/agents/venture-ceo-factory.js (alongside the existing WELL_KNOWN_IDS/imports block). Add a module-private (non-exported) `async function defaultVentureExists(supabase, ventureId) { const { data, error } = await supabase.from('ventures').select('id').eq('id', ventureId).maybeSingle(); if (error) { if (error.code === '22P02') return false; throw error; } return !!data; }` — this is a line-for-line mirror of lib/creative/creative-brief.js:31-50, not an import from it (different domain, different error message).",
      files_to_create: [],
      files_to_modify: ['lib/agents/venture-ceo-factory.js'],
      dependencies: ['lib/creative/creative-brief.js (source pattern for VentureNotFoundError + defaultVentureExists, lines 31-50 — precedent found by LEAD-TO-PLAN VALIDATION)'],
      integration_points: [],
      edge_cases: [
        'ventureId is undefined/null — .eq(\'id\', undefined) must not silently match; the caller-side guard in FR-2 covers this via `!ventureId ||`',
        'Non-22P02 Postgres errors (e.g. connection failure) must propagate, not be swallowed as "not found" (TS-4)',
      ],
      estimated_effort: 'small (30-45 minutes)',
    }),
    test_scenarios: ['TS-3', 'TS-4'],
    e2e_test_status: 'not_created',
    validation_status: 'pending',
    architecture_references: ['lib/creative/creative-brief.js'],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: [],
    implementation_status: 'pending',
    metadata: { fr_id: 'FR-1' },
  },
  {
    story_key: `${SD_KEY}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Guard instantiateVenture() at the top so a nonexistent venture id writes zero rows',
    user_role: "Caller of VentureFactory.instantiateVenture() (e.g. eva-coo-integration.js's onboardVenture())",
    user_want: 'instantiateVenture() to check venture existence before any side effect — before the template lookup, before any agent/identity/relationship/tool-grant row is created, and before any progress log line',
    user_benefit: 'I never observe a partially-instantiated venture (orphan rows across agent_registry / org_agent_identities / org_agent_relationships / tool_access_grants) when the venture id turns out not to exist — this is the exact root cause of the measured 18,340 orphan rows',
    priority: 'critical',
    status: 'ready',
    story_points: 2,
    acceptance_criteria: [
      'AC-1: Calling instantiateVenture() with a ventureId that has no ventures row throws VentureNotFoundError and creates zero agent_registry / org_agent_identities / org_agent_relationships / tool_access_grants rows.',
      "AC-2: The guard runs before the _getTemplate() call and before any console.log side effect describing progress — a caller sees only the VentureNotFoundError, no partial 'Instantiating venture...' log output implying work began.",
      'AC-3: Calling instantiateVenture() with a ventureId that DOES have a ventures row proceeds exactly as before — zero behavior change on the legitimate path, confirmed by the pre-existing 2 tests in tests/unit/venture-ceo-factory.test.js continuing to pass (after their mock is updated per FR-3).',
    ],
    definition_of_done: [
      'Guard added at the very top of instantiateVenture(), before _getTemplate() and before the first console.log',
      'deps.ventureExistsFn injection seam added (mirrors creative-brief.js)',
      'TS-1 and TS-2 pass; pre-existing 2 tests still pass once FR-3 lands',
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Ordering matters: a caller must never observe a partial instantiation for a venture id that turns out not to exist. The venture-existence resolver is injectable via deps.ventureExistsFn (mirrors deps.ventureExistsFn in creative-brief.js), passed as an optional second argument to instantiateVenture so existing single-argument call sites are unaffected.',
    implementation_approach: 'Change instantiateVenture(options) to instantiateVenture(options, deps = {}); resolve ventureExistsFn = deps.ventureExistsFn || defaultVentureExists; throw VentureNotFoundError before _getTemplate().',
    implementation_context: JSON.stringify({
      technical_approach: "At the very top of `async instantiateVenture(options)` (lib/agents/venture-ceo-factory.js:273), before the `console.log('\\n📦 VentureFactory: Instantiating venture...')` line and before the `this._getTemplate(templateId)` call, add a second parameter `deps = {}`: `async instantiateVenture(options, deps = {})`. Then: `const ventureExistsFn = deps.ventureExistsFn || defaultVentureExists; const { ventureId } = options; if (!ventureId || !(await ventureExistsFn(this.supabase, ventureId))) { throw new VentureNotFoundError(ventureId); }` — same shape as requestCreativeAsset in creative-brief.js:88-93. Destructuring ventureId happens twice (once for the guard, once in the existing options destructure a few lines down) or the guard is placed after the existing destructure but strictly before console.log/`_getTemplate`; either is acceptable as long as no side effect precedes the check.",
      files_to_create: [],
      files_to_modify: ['lib/agents/venture-ceo-factory.js'],
      dependencies: ['FR-1 (VentureNotFoundError class + defaultVentureExists helper must exist first)'],
      integration_points: [
        'eva-coo-integration.js onboardVenture() — existing call site, single-argument, unaffected by the new optional deps parameter',
        'scripts/harness/spine-verify-first-run.mjs — existing call site, single-argument, unaffected',
      ],
      edge_cases: [
        'Existing call sites that pass only options (no deps) must be unaffected — deps defaults to {} and ventureExistsFn defaults to defaultVentureExists',
        'The guard must precede _getTemplate() specifically — an invalid templateId error must never mask a VentureNotFoundError',
      ],
      estimated_effort: 'small (30 minutes)',
    }),
    test_scenarios: ['TS-1', 'TS-2'],
    e2e_test_status: 'not_created',
    validation_status: 'pending',
    architecture_references: ['lib/creative/creative-brief.js', 'lib/agents/venture-ceo-factory.js:273'],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: [],
    implementation_status: 'pending',
    metadata: { fr_id: 'FR-2' },
  },
  {
    story_key: `${SD_KEY}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Update the 2 pre-existing instantiateVenture tests so they keep passing under the new guard',
    user_role: 'Maintainer of tests/unit/venture-ceo-factory.test.js',
    user_want: "the 2 pre-existing tests in the 'VentureFactory.instantiateVenture with mocked Supabase' describe block (6-executive-agents, 28-total-agents, using synthetic ventureIds with no real ventures row) to continue passing once FR-2's guard is live",
    user_benefit: "these tests keep proving instantiation succeeds for a legitimate venture — their fixture now actually represents a legitimate (existing) venture, instead of incorrectly throwing VentureNotFoundError against the shared mock's default maybeSingle() response of {data: null, error: null}",
    priority: 'high',
    status: 'ready',
    story_points: 1,
    acceptance_criteria: [
      'AC-1: Both pre-existing tests (6-executive-agents, 28-total-agents) pass after the update, unmodified in their actual assertions — only the venture-existence stub/mock changes.',
      'AC-2: The update does not silently make the guard a no-op for these tests — a companion new test (FR-4) proves the guard DOES fire when the stub returns false, confirming the stub mechanism itself is load-bearing.',
    ],
    definition_of_done: [
      'Both tests inject a ventureExistsFn stub resolving true',
      'TS-5 passes',
      'No change to the shared mockSupabase.maybeSingle default (other call sites, e.g. instantiateSharedOperators, still rely on it)',
    ],
    depends_on: [],
    blocks: [],
    technical_notes: "Confirmed: instantiateVenture() never called .maybeSingle() before this SD — the file's ONE existing .maybeSingle() call (line 481) is in the unrelated instantiateSharedOperators() method. This is a required fix to the test's own setup, not a weakening.",
    implementation_approach: "Pass a second `deps` argument `{ ventureExistsFn: async () => true }` to each of the 2 existing instantiateVenture() calls in the 'with mocked Supabase' describe block.",
    implementation_context: JSON.stringify({
      technical_approach: "In the `describe('VentureFactory.instantiateVenture with mocked Supabase')` block (tests/unit/venture-ceo-factory.test.js, lines ~171-195), change each of the 2 existing calls from `await factory.instantiateVenture({ ventureName, ventureId })` to `await factory.instantiateVenture({ ventureName, ventureId }, { ventureExistsFn: async () => true })`. This targets only these 2 call sites via the deps.ventureExistsFn injection seam added in FR-2, rather than changing the shared `mockSupabase.maybeSingle` default (which defaults to `{data: null, error: null}` and is also read by the unrelated instantiateSharedOperators() method at line 481) — a targeted per-test stub avoids a cross-cutting mock change for what is fundamentally a fixture-only fix.",
      files_to_create: [],
      files_to_modify: ['tests/unit/venture-ceo-factory.test.js'],
      dependencies: ['FR-1 (the ventureExistsFn stub shape must match defaultVentureExists’s signature)'],
      integration_points: ["describe('VentureFactory.instantiateVenture with mocked Supabase') block, tests/unit/venture-ceo-factory.test.js"],
      edge_cases: [
        'Must not touch the shared mockSupabase.maybeSingle default, since instantiateSharedOperators() (line 481) depends on its existing behavior',
        'Only the venture-existence stub changes — the 2 tests’ actual assertions (executive count, total agent count) stay byte-identical',
      ],
      estimated_effort: 'small (15-20 minutes)',
    }),
    test_scenarios: ['TS-5'],
    e2e_test_status: 'not_created',
    validation_status: 'pending',
    architecture_references: ['tests/unit/venture-ceo-factory.test.js:150-195'],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: [],
    implementation_status: 'pending',
    metadata: { fr_id: 'FR-3' },
  },
  {
    story_key: `${SD_KEY}:US-004`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Add regression tests (zero-row write, malformed id, real call-site patterns) plus a mutation test proving the guard is load-bearing',
    user_role: 'PR reviewer / QA engineer verifying this SD closes the orphan-row defect',
    user_want: 'new regression tests proving (a) a nonexistent-venture stub throws VentureNotFoundError and writes zero rows, (b) a malformed (non-UUID) ventureId is refused the same way rather than leaking a raw Postgres error, (c) the 2 real call sites’ calling patterns (eva-coo-integration.js onboardVenture, spine-verify-first-run.mjs) are represented and the guard does not fire for them, and a mutation test that disables the guard and confirms test (a) then fails',
    user_benefit: 'the fix is proven non-vacuous with evidence, directly closing E3 (design feedback 20b858dc section 8) and the exact root cause of the measured 18,340 orphan rows — not just claimed by inspection',
    priority: 'critical',
    status: 'ready',
    story_points: 3,
    acceptance_criteria: [
      "AC-1: Test (a) asserts zero calls to mockSupabase.insert and mockSupabase.upsert after the thrown error — proving 'writes no rows', not just 'throws before completing'.",
      'AC-2: Test (b) proves the malformed-id path returns the SAME VentureNotFoundError type as the genuinely-nonexistent path, not a raw 22P02 Postgres error escaping to the caller.',
      "AC-3: A mutation test (per this session's established discipline) that disables the guard (comments out or short-circuits the check) confirms test (a) then fails — proving the guard is load-bearing, not vacuous.",
    ],
    definition_of_done: [
      'New tests (a)/(b)/(c) added and green',
      'Mutation test run once against a temporarily-disabled guard, confirmed test (a) fails, guard restored byte-identical, TS-6 documented as evidence',
      'TS-1 and TS-6 both represented',
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'The 2 real call sites differ in pattern: eva-coo-integration.js’s onboardVenture() fetches a real venture row before calling instantiateVenture(); spine-verify-first-run.mjs creates a real ventures row before calling instantiateVenture(). Each needs its own representative test.',
    implementation_approach: 'Add it() blocks covering zero-row-write, malformed-id, both real call-site patterns (guard does not fire), and a manual mutation-test pass restoring the guard afterward.',
    implementation_context: JSON.stringify({
      technical_approach: "Add to tests/unit/venture-ceo-factory.test.js: (a) `it('refuses a nonexistent venture id and writes zero rows', ...)` — stub `ventureExistsFn: async () => false`, assert `await expect(factory.instantiateVenture({...}, {ventureExistsFn})).rejects.toThrow(VentureNotFoundError)` then assert `mockSupabase.insert).not.toHaveBeenCalled()` and `mockSupabase.upsert).not.toHaveBeenCalled()`; (b) `it('refuses a malformed (non-UUID) venture id via the same typed error', ...)` — mock `maybeSingle` to resolve `{data: null, error: {code: '22P02', message: 'invalid input syntax for type uuid'}}` and assert the SAME VentureNotFoundError (not a raw error) is thrown; (c) two tests, one stubbing a real-venture-fetch-first pattern (mirroring eva-coo-integration.js’s onboardVenture) and one stubbing a real-venture-create-first pattern (mirroring spine-verify-first-run.mjs), both with `ventureExistsFn` resolving true, asserting instantiation proceeds normally (guard does not fire). Mutation test: temporarily comment out/short-circuit the FR-2 guard line, re-run test (a), confirm it now fails (proving the guard was actually preventing the write path), then restore the original line and diff against git to confirm byte-identical restoration — this is a manual verification pass documented in the SD’s evidence, not a permanently-committed mutant.",
      files_to_create: [],
      files_to_modify: ['tests/unit/venture-ceo-factory.test.js'],
      dependencies: [
        'FR-1 (VentureNotFoundError, defaultVentureExists)',
        'FR-3 (the ventureExistsFn stub mechanism proven load-bearing by the 2 pre-existing tests must land first, since these new tests reuse the same injection seam)',
      ],
      integration_points: [
        'eva-coo-integration.js onboardVenture() — represented by test (c)',
        'scripts/harness/spine-verify-first-run.mjs — represented by test (c)',
      ],
      edge_cases: [
        'mockSupabase.insert/.upsert must be spies (vi.fn) already wired in beforeEach so "not called" assertions are meaningful',
        'The mutation-test pass is manual/one-off evidence, not a permanent test-suite mutant — the guard line must be restored byte-identical afterward',
      ],
      estimated_effort: 'medium (60-90 minutes, includes the mutation-test discipline)',
    }),
    test_scenarios: ['TS-1', 'TS-6'],
    e2e_test_status: 'not_created',
    validation_status: 'pending',
    architecture_references: ['tests/unit/venture-ceo-factory.test.js', 'lib/agents/eva-coo-integration.js', 'scripts/harness/spine-verify-first-run.mjs'],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: [],
    implementation_status: 'pending',
    metadata: { fr_id: 'FR-4' },
  },
  {
    story_key: `${SD_KEY}:US-005`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: "Confirm the SD's diff stays scoped to exactly the 2 target files — no orphan-row cleanup, no other table touched",
    user_role: 'LEAD reviewer approving this SD’s completion',
    user_want: "confirmation that this SD's entire diff touches only lib/agents/venture-ceo-factory.js and tests/unit/venture-ceo-factory.test.js (plus this SD's own one-off evidence scripts), with zero DELETE/UPDATE statements against org_agent_identities, agent_registry, org_agent_relationships, or tool_access_grants anywhere in the diff",
    user_benefit: "the SD's blast radius stays exactly '1 production file + 1 test file' per the design's own C2 text ('refuse at the entry point', not 'clean up history') — the 18,340 pre-existing orphan rows are explicitly NOT retroactively touched by this SD",
    priority: 'medium',
    status: 'ready',
    story_points: 1,
    acceptance_criteria: [
      "AC-1: git diff for this SD touches only lib/agents/venture-ceo-factory.js and tests/unit/venture-ceo-factory.test.js (plus this SD's own one-off evidence scripts).",
      'AC-2: No DELETE or UPDATE statement against org_agent_identities/agent_registry/org_agent_relationships/tool_access_grants appears anywhere in this SD’s diff.',
    ],
    definition_of_done: [
      'git diff --stat captured and attached as completion evidence',
      'No DELETE/UPDATE against the four named tables found in the diff',
    ],
    depends_on: [],
    blocks: [],
    technical_notes: "Explicitly out of scope per the design's own C2 text. This is a verification gate, not a code change.",
    implementation_approach: 'Run git diff --stat / --name-only against the SD branch and grep for DELETE/UPDATE statements against the 4 named tables; attach as evidence.',
    implementation_context: JSON.stringify({
      technical_approach: "No production code change of its own — run as a verification gate at EXEC-complete / PLAN-verification time: `git diff --stat main...HEAD` (or `--name-only`) to confirm the only non-evidence-script paths touched are lib/agents/venture-ceo-factory.js and tests/unit/venture-ceo-factory.test.js; separately `git diff main...HEAD | grep -iE 'DELETE FROM|UPDATE .*(org_agent_identities|agent_registry|org_agent_relationships|tool_access_grants)'` and assert zero matches. Attach the `git diff --stat` output as this story's completion evidence rather than asserting scope discipline from memory.",
      files_to_create: [],
      files_to_modify: [],
      dependencies: [
        'FR-1', 'FR-2', 'FR-3', 'FR-4 (the diff this check validates is the union of all four preceding stories’ changes)',
      ],
      integration_points: [],
      edge_cases: [
        "This SD's own one-off evidence scripts (e.g. scripts/one-off/add-user-stories-instantiateventure-refuses-venture-001.mjs) are expected diff noise and are explicitly excluded from the 2-file check",
      ],
      estimated_effort: 'trivial (5-10 minutes, evidence capture only)',
    }),
    test_scenarios: [],
    e2e_test_status: 'not_created',
    validation_status: 'pending',
    architecture_references: [],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: [],
    implementation_status: 'pending',
    metadata: { fr_id: 'FR-5' },
  },
];

// depends_on is a uuid[] column, resolved from story_key after insert (a story
// cannot reference a sibling's uuid before it exists). Wiring per task instructions:
// FR-2/FR-3/FR-4 depend on FR-1; FR-4 also depends on FR-3; FR-5 depends on all others.
const GRAPH = {
  [`${SD_KEY}:US-001`]: { depends_on: [] },
  [`${SD_KEY}:US-002`]: { depends_on: [`${SD_KEY}:US-001`] },
  [`${SD_KEY}:US-003`]: { depends_on: [`${SD_KEY}:US-001`] },
  [`${SD_KEY}:US-004`]: { depends_on: [`${SD_KEY}:US-001`, `${SD_KEY}:US-003`] },
  [`${SD_KEY}:US-005`]: { depends_on: [`${SD_KEY}:US-001`, `${SD_KEY}:US-002`, `${SD_KEY}:US-003`, `${SD_KEY}:US-004`] },
};

async function main() {
  const { data, error } = await supabase.from('user_stories').insert(stories).select('id, story_key, title');
  if (error) throw error;
  console.log('Inserted user stories:', JSON.stringify(data, null, 2));

  const byKey = Object.fromEntries(data.map((r) => [r.story_key, r.id]));
  for (const [key, edges] of Object.entries(GRAPH)) {
    const payload = { depends_on: edges.depends_on.map((k) => byKey[k]) };
    const { error: upErr } = await supabase.from('user_stories').update(payload).eq('id', byKey[key]);
    if (upErr) throw upErr;
    console.log(`Linked ${key}: depends_on=${payload.depends_on.length}`);
  }

  // Coverage check: 100% of stories should carry a real implementation_context
  const { data: ctxRows, error: ctxErr } = await supabase
    .from('user_stories')
    .select('id, story_key, implementation_context')
    .in('id', data.map((r) => r.id));
  if (ctxErr) throw ctxErr;
  const withCtx = ctxRows.filter((r) => {
    if (!r.implementation_context) return false;
    try {
      const parsed = typeof r.implementation_context === 'string' ? JSON.parse(r.implementation_context) : r.implementation_context;
      return !!(parsed && parsed.technical_approach && parsed.technical_approach.length > 20);
    } catch {
      return false;
    }
  });
  console.log(`implementation_context coverage: ${withCtx.length}/${ctxRows.length}`);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
