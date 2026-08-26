import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E';
const SD_UUID = '25587be3-1522-49eb-9875-e6501789a469';
const PRD_ID = `PRD-${SD_KEY}`;

const executive_summary = "Dual-writes AltifyAI's usage-event tracking to the shared venture_usage_events RPC (owned by sibling Child A, not shipped yet) -- code + tests + a secret-provisioning runbook only. Corrects a false founding premise about Worker secrets and a real event_type vocabulary mismatch found in LEAD.";

const functional_requirements = [
  {
    id: 'FR-1',
    requirement: 'Add forwardUsageEventToSupabase(input, env, fetchImpl) to altifyai/lib/events/track.js',
    description: "Mirrors the already-shipped forwardFeedbackToSupabase (lib/feedback/submit.js) exactly: same env shape (EHG_ENGINEER_SUPABASE_URL, EHG_ENGINEER_SUPABASE_ANON_KEY, EHG_ENGINEER_INGEST_SECRET, VENTURE_ID), same fail-soft ok/not_configured/network_error/rejected/server_error contract, POSTs to <url>/rest/v1/rpc/fn_submit_venture_usage_event. venture_id and the ingest secret ALWAYS come from env, never from input -- structurally nothing a caller could spoof.",
    priority: 'HIGH',
    acceptance_criteria: [
      'Returns {ok:false, status:500, reason:"not_configured"} and never calls fetch when any of the four required env bindings is missing (today\'s real production state)',
      'A forged venture_id/ventureId on the input has zero effect on the outbound p_venture_id -- it always equals env.VENTURE_ID',
      'A 28000 (auth/unbound-secret) or 53400 (rate-limited) RPC error code both map to a single {ok:false, reason:"rejected"} result; a fetch rejection maps to {ok:false, reason:"network_error"} and never throws',
    ],
  },
  {
    id: 'FR-2',
    requirement: "Translate AltifyAI's local event_type vocabulary to the shared RPC's vocabulary before forwarding",
    description: "AltifyAI's local EVENT_TYPES is (page_view, conversion_event). Child A's own SD scope text states the shared venture_usage_events CHECK enum is (page_view, custom_event), explicitly warning \"'custom_event' not 'conversion_event'\". A verbatim pass-through would permanently fail the RPC's CHECK constraint for every non-page_view event once live -- fail-soft on the HTTP response, but silently defeating the dual-write's purpose for the traffic that matters most (real conversion signal). RPC_EVENT_TYPE (a Map, matching the anti-prototype-pollution precedent already established by PROPERTY_VALIDATORS in the same file) translates 'conversion_event' -> 'custom_event' and passes 'page_view' through unchanged.",
    priority: 'HIGH',
    acceptance_criteria: [
      "eventType='page_view' forwards as p_event_type='page_view'",
      "eventType='conversion_event' forwards as p_event_type='custom_event'",
      'This mapping is documented as a re-verify-once-Child-A-ships item, since Child A has not shipped a PRD or migration as of this writing',
    ],
  },
  {
    id: 'FR-3',
    requirement: 'Wire the forward call into recordEventHandler (altifyai/src/routes/events.js) as a fail-soft addition after the existing D1 write',
    description: "The call happens AFTER recordUsageEvent's D1 write succeeds and is wrapped in its own try/catch so a forward failure or throw can never change the HTTP response. recordUsageEvent itself (the D1 write) and listEventsHandler/listUsageEventsForUser (the GET /api/events -> UsageDashboard.jsx read path) are completely untouched by this SD -- the risk mitigation from the prior UsageDashboard.jsx 500 incident (SD-ALTIFYAI-MAN-FIX-USAGE-PANEL-500-001) is preserved by construction, not by convention.",
    priority: 'CRITICAL',
    acceptance_criteria: [
      'POST /api/events still returns 201 and the D1 row is still written when the forward is not configured (no fetch call attempted)',
      'POST /api/events still returns 201 and the D1 row is still written even when the forward IS configured but fails (network error)',
      'GET /api/events (the dashboard read path) still returns the just-written event in both of the above cases',
    ],
  },
  {
    id: 'FR-4',
    requirement: "Correct this SD's own founding premise about Cloudflare Worker secret provisioning and document the real human follow-up",
    description: 'The original description claimed wrangler is unauthenticated and no CI deploy/wrangler step exists -- found false by direct read of altifyai/.github/workflows/deploy.yml (authenticated wrangler deploy + D1 migrations on every push to main). A sibling SD (SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001) had already independently corrected the identical misconception for Stripe secrets. altifyai/docs/usage-event-ingest-secret-provisioning.md documents both a local wrangler secret put option and a CI-based one-shot-workflow option, mirroring the existing docs/stripe-secret-provisioning.md precedent.',
    priority: 'MEDIUM',
    acceptance_criteria: [
      'The runbook cites verified evidence (deploy.yml, the Stripe-secret sibling precedent) rather than repeating the original false premise',
      'The runbook explicitly states live end-to-end verification (a real Supabase row from a real deployed Worker) is a deferred human/chairman follow-up, not claimed as done by this SD',
    ],
  },
  {
    id: 'FR-5',
    requirement: 'Introduce zero new database migrations, zero new decision-audit tables, and zero new outreach/contact-capable code',
    description: 'This SD is scoped to exactly the dual-write forward function, its wiring, its tests, and the provisioning runbook. The RPC/schema (Child A), capability wiring (Child C), and stack-scan REQUIRED[] entry (Child D) are explicitly out of scope, owned by sibling children.',
    priority: 'CRITICAL',
    acceptance_criteria: [
      'git diff for this SD (altifyai repo) touches only lib/events/track.js, src/routes/events.js, tests/events-forward.test.js (new), tests/events-route.test.js, and docs/usage-event-ingest-secret-provisioning.md (new)',
      'No new database/migrations/*.sql file is added by this SD in either repo',
      'grep for new outbound/send/contact-capable function definitions in the diff returns zero matches beyond the existing forwardFeedbackToSupabase-mirrored RPC forward itself',
    ],
  },
];

const technical_requirements = [
  {
    id: 'TR-1',
    requirement: 'forwardUsageEventToSupabase must accept an injectable fetchImpl parameter (default: global fetch), matching forwardFeedbackToSupabase\'s exact signature',
    rationale: 'Enables deterministic, network-free unit testing (tests/events-forward.test.js) without requiring a live Supabase endpoint or mocking global fetch at the module level for every test.',
  },
  {
    id: 'TR-2',
    requirement: 'The RPC_EVENT_TYPE translation must live in lib/events/track.js as a Map, not an object literal, and must be re-verified against Child A\'s actual migration SQL once it exists',
    rationale: "Matches this same file's existing PROPERTY_VALIDATORS precedent (a Map, not an object literal, specifically to avoid prototype-chain lookup ambiguity for string keys). Child A is still in PLAN_PRD with no PRD or migration yet -- this SD's assumed contract is taken from Child A's SD-level scope text, not a finalized artifact.",
  },
  {
    id: 'TR-3',
    requirement: 'The forward call in recordEventHandler must be placed strictly AFTER the existing D1 recordUsageEvent call succeeds, wrapped in its own try/catch that only logs (never rethrows or alters the response)',
    rationale: "This is the load-bearing structural guarantee behind FR-3's acceptance criteria -- placing the call before the D1 write, or letting an uncaught forward exception propagate, would reintroduce exactly the class of regression risk this SD's own risk register (risks[0]) exists to prevent.",
  },
  {
    id: 'TR-4',
    requirement: 'dependencies must be populated with structured entries for Child A (predecessor) and Child D (coordination), not left as prose-only in the description',
    rationale: 'This repo\'s queue tooling (sd:next, AUTO-PROCEED skip/process, worker claim lanes, prio:top3) reads only the structured `dependencies` column, never description prose -- confirmed via an independent validation-agent finding during this SD\'s own LEAD phase.',
  },
];

const system_architecture = {
  overview: "A new forward function (forwardUsageEventToSupabase) in AltifyAI's existing lib/events/track.js composes with the existing D1-backed recordUsageEvent/listUsageEventsForUser functions without modifying either. recordEventHandler (src/routes/events.js) calls the D1 write first (unchanged), then fire-and-await-but-fail-soft calls the new forward function, wrapped so its outcome can never affect the HTTP response. The forward function itself mirrors the already-shipped forwardFeedbackToSupabase pattern exactly (same env-sourced venture_id/ingest-secret, same RPC-call shape), with one addition: an event_type translation map correcting a real vocabulary mismatch between AltifyAI's local enum and the shared RPC's enum, found during this SD's own LEAD-phase investigation.",
  components: [
    { name: 'altifyai/lib/events/track.js (modified)', responsibility: 'Adds forwardUsageEventToSupabase and its RPC_EVENT_TYPE translation map; recordUsageEvent/listUsageEventsForUser are unmodified', technology: 'Cloudflare Workers JS module' },
    { name: 'altifyai/src/routes/events.js (modified)', responsibility: 'recordEventHandler calls the new forward function after the existing D1 write, fail-soft; listEventsHandler is unmodified', technology: 'Cloudflare Workers route handler' },
    { name: 'altifyai/docs/usage-event-ingest-secret-provisioning.md (new)', responsibility: 'Human-facing runbook for the deferred live secret-provisioning follow-up', technology: 'Markdown documentation' },
  ],
  data_flow: "POST /api/events -> recordEventHandler -> (1) recordUsageEvent writes to D1 usage_events (unchanged, source of truth for the HTTP response and GET /api/events) -> (2) forwardUsageEventToSupabase POSTs to EHG_Engineer's Supabase fn_submit_venture_usage_event RPC (dormant until VENTURE_ID/EHG_ENGINEER_INGEST_SECRET are provisioned; today always short-circuits to not_configured) -> response is built from step (1) alone, regardless of step (2)'s outcome.",
  integration_points: [
    'altifyai/src/routes/events.js:89 (recordEventHandler, new call site after the existing recordUsageEvent await)',
    'EHG_Engineer Supabase project, /rest/v1/rpc/fn_submit_venture_usage_event (owned by sibling Child A, not yet shipped -- this SD\'s forward call is dormant until both the RPC exists and the Worker secrets are provisioned)',
  ],
};

const test_scenarios = [
  { id: 'TS-1', scenario: 'Outbound RPC payload correctness', test_type: 'unit', given: 'a valid parsed usage-event input and a fully-configured env', when: 'forwardUsageEventToSupabase is called with an injectable fetchImpl', then: 'it POSTs to .../rpc/fn_submit_venture_usage_event with p_venture_id/p_ingest_secret sourced from env and p_event_type/p_event_name/p_properties from input' },
  { id: 'TS-2', scenario: 'venture_id spoof resistance', test_type: 'unit', given: 'input forged with venture_id/ventureId fields', when: 'forwardUsageEventToSupabase is called', then: 'the outbound p_venture_id always equals env.VENTURE_ID, never the forged input value' },
  { id: 'TS-3', scenario: 'event_type translation', test_type: 'unit', given: "input.eventType is 'page_view' or 'conversion_event'", when: 'forwardUsageEventToSupabase is called', then: "p_event_type is 'page_view' or 'custom_event' respectively, never the untranslated 'conversion_event'" },
  { id: 'TS-4', scenario: 'Rejected/server-error/network-error/not-configured fail-soft mapping', test_type: 'unit', given: 'a 28000/53400 RPC response, a non-2xx/non-JSON response, a rejected fetch, or a missing env binding', when: 'forwardUsageEventToSupabase is called', then: 'it resolves (never throws) to the correctly-typed {ok:false, reason} result in each case' },
  { id: 'TS-5 (TS-8 in code)', scenario: 'Dual-write is a complete no-op today', test_type: 'integration', given: 'a real POST /api/events request through the composed worker.fetch, with env NOT carrying the forward secrets (today\'s real production state)', when: 'the request is handled', then: 'the response is still 201, the D1 row is still written, fetch is never called, and GET /api/events still returns the event' },
  { id: 'TS-6 (TS-8b in code)', scenario: 'Dual-write forward failure never regresses the response once configured', test_type: 'integration', given: 'a real POST /api/events request with the forward env configured but global fetch mocked to reject', when: 'the request is handled', then: 'the response is still 201, the D1 row is still written, and GET /api/events still returns the event' },
];

const acceptance_criteria = [
  'forwardUsageEventToSupabase exists in altifyai/lib/events/track.js, mirroring forwardFeedbackToSupabase\'s fail-soft contract exactly, with venture_id/ingest-secret sourced only from env',
  "AltifyAI's local event_type vocabulary is correctly translated to the shared RPC's vocabulary before forwarding ('conversion_event' -> 'custom_event')",
  'The dual-write call in recordEventHandler never regresses the pre-existing D1-backed POST /api/events response or the GET /api/events (UsageDashboard.jsx) read path, whether the forward is unconfigured or configured-but-failing',
  'A documented, actionable runbook exists for a human to provision the live secrets once Child A\'s RPC ships, citing verified evidence rather than this SD\'s own original false premise',
  'NOT claimed as met by this SD alone: live signal queryability (original success_criteria #2) -- remains explicitly UNMET pending the human/chairman secret-provisioning follow-up and a real end-to-end verification',
];

const risks = [
  {
    risk: 'A write-only cutover of recordUsageEvent would silently break the live, previously-incident-prone UsageDashboard.jsx read path (GET /api/events -> listUsageEventsForUser -> D1 usage_events)',
    impact: 'HIGH',
    probability: 'MEDIUM',
    mitigation: 'Dual-write: keep the existing D1 write in recordUsageEvent unchanged, and additionally call the new fn_submit_venture_usage_event RPC from recordEventHandler (src/routes/events.js), never from recordUsageEvent itself. TS-5/TS-6 (TS-8/TS-8b in code) verify the dashboard still returns non-empty results post-change, not just that the new RPC succeeds.',
    rollback_plan: 'Remove the forwardUsageEventToSupabase call (and its try/catch block) from recordEventHandler in src/routes/events.js. recordUsageEvent and UsageDashboard.jsx are untouched by that rollback, since they were never modified, only added to.',
  },
  {
    risk: "AltifyAI's local event_type vocabulary does not match Child A's shared venture_usage_events enum -- verbatim pass-through would make the RPC's CHECK constraint permanently reject every non-page_view event once live, silently defeating the dual-write's purpose for real conversion signal",
    impact: 'MEDIUM',
    probability: 'MEDIUM',
    mitigation: "An explicit RPC_EVENT_TYPE translation map (FR-2/TR-2) fixes this for the currently-known vocabulary, tested in TS-3. Documented as a re-verify-once-Child-A-ships item.",
    rollback_plan: "If Child A's actual shipped enum differs from this mapping, update the RPC_EVENT_TYPE Map in lib/events/track.js to match -- an isolated, single-map change, not a structural rollback.",
  },
  {
    risk: 'Child A (the RPC this dual-write targets) has not shipped a PRD or migration as of this SD\'s implementation -- its eventual contract (param names, enum values, error codes) could still change',
    impact: 'MEDIUM',
    probability: 'MEDIUM',
    mitigation: 'This SD\'s scope is explicitly limited to code + mocked-RPC tests + a documented runbook, never live end-to-end verification, precisely because of this unmet dependency. dependencies (TR-4) records the predecessor relationship so queue tooling surfaces it.',
    rollback_plan: 'Re-diff the assumed contract against Child A\'s finalized migration SQL once it ships; adjust RPC_EVENT_TYPE/param names as needed -- an isolated code change, not a structural rollback.',
  },
];

const implementation_approach = {
  phases: [
    { phase: 'Phase 1', description: 'LEAD due diligence: locate the real AltifyAI implementation (recordUsageEvent, its caller, the existing feedback/error-capture forward precedent), verify the deploy.yml/wrangler premise, cross-check Child A\'s live scope text for the RPC contract', deliverables: ['Corrected SD description', 'EXPLORE + VALIDATION sub-agent evidence'] },
    { phase: 'Phase 2', description: 'Implement forwardUsageEventToSupabase + RPC_EVENT_TYPE translation (FR-1, FR-2, TR-1, TR-2)', deliverables: ['altifyai/lib/events/track.js changes'] },
    { phase: 'Phase 3', description: 'Wire the fail-soft forward call into recordEventHandler (FR-3, TR-3) and prove non-regression', deliverables: ['altifyai/src/routes/events.js changes', 'tests/events-route.test.js TS-8/TS-8b'] },
    { phase: 'Phase 4', description: 'Document the human secret-provisioning follow-up (FR-4) and ship', deliverables: ['altifyai/docs/usage-event-ingest-secret-provisioning.md', 'Merged altifyai PR', 'Merged EHG_Engineer PR (protocol bookkeeping)'] },
  ],
  technical_decisions: [
    'The forward call is placed at the route-handler level (recordEventHandler), not inside recordUsageEvent itself, so recordUsageEvent\'s own signature and D1-write behavior remain provably unchanged',
    "AltifyAI's local event_type vocabulary is translated at the forwarding boundary rather than changed at its source, since EVENT_TYPES/EVENT_NAME_TO_TYPE are load-bearing for D1's own CHECK-constraint pairing invariant and must stay as-is",
    'No ctx.waitUntil() background-execution plumbing was added for the forward call (unlike lib/error-capture/capture.js) -- the closer structural precedent, lib/feedback/submit.js, awaits its forward call inline from the same route-handler shape, and recordEventHandler does not currently receive ctx at all; threading it through the router is out of this SD\'s scope',
  ],
};

const integration_operationalization = {
  consumers: [
    { name: 'altifyai/src/routes/events.js (recordEventHandler)', interaction: 'Calls forwardUsageEventToSupabase after every successful D1 write, fail-soft', frequency: 'Every POST /api/events request' },
  ],
  dependencies: [
    { name: 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A', type: 'predecessor', description: 'fn_submit_venture_usage_event RPC + venture_usage_events schema must exist and be named consistently before live end-to-end verification is possible' },
    { name: 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-D', type: 'coordination', description: 'Coordinates on which repo location (lib/ vs src/) the witness call lands in' },
    { name: 'Human/chairman follow-up', type: 'operational', description: 'Provision VENTURE_ID and EHG_ENGINEER_INGEST_SECRET via wrangler secret put or a one-shot CI workflow, per docs/usage-event-ingest-secret-provisioning.md' },
  ],
  data_contracts: [
    { name: 'fn_submit_venture_usage_event RPC params', shape: 'p_venture_id UUID, p_ingest_secret TEXT, p_event_type TEXT (page_view|custom_event), p_event_name TEXT, p_properties JSONB', source: "Child A's live SD scope text (SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A) -- not yet a finalized PRD or migration; re-verify once Child A ships" },
  ],
  runtime_config: {
    env_bindings_required: ['EHG_ENGINEER_SUPABASE_URL', 'EHG_ENGINEER_SUPABASE_ANON_KEY', 'EHG_ENGINEER_INGEST_SECRET', 'VENTURE_ID'],
    current_state: 'None of the four bindings are present in wrangler.toml or as live Worker secrets today -- the dual-write is a complete no-op in production until the deferred human follow-up runs',
  },
  observability_rollout: {
    rollout_strategy: 'Ship dormant (fail-soft, unconfigured) alongside already-dormant sibling features (error-capture, feedback) -- no separate feature flag needed since the forward function itself gates on env presence',
    monitoring: 'console.warn on forward failure (visible in Worker logs via observability, already enabled in wrangler.toml); no dedicated alerting added by this SD',
  },
};

const exploration_summary = {
  files_read: [
    'altifyai/lib/events/track.js',
    'altifyai/src/routes/events.js',
    'altifyai/lib/feedback/submit.js',
    'altifyai/lib/error-capture/capture.js',
    'altifyai/src/routes/feedback.js',
    'altifyai/.github/workflows/deploy.yml',
    'altifyai/docs/stripe-secret-provisioning.md',
    'altifyai/wrangler.toml',
    "SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A's live scope text (sibling Child A)",
    "SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-D's live scope text (sibling Child D)",
  ],
  patterns_identified: [
    "forwardFeedbackToSupabase (lib/feedback/submit.js) is the exact, already-shipped precedent this SD's forward function mirrors",
    'PROPERTY_VALIDATORS\' Map-not-object-literal convention (anti-prototype-pollution) is mirrored by RPC_EVENT_TYPE',
    "docs/stripe-secret-provisioning.md's Option A/local + Option B/CI-workflow structure is the established runbook convention for this exact class of human secret-provisioning follow-up",
  ],
  key_decisions: [
    "Corrected the SD's own false founding premise (wrangler unauthenticated / no deploy step) after direct inspection of deploy.yml",
    'Found and fixed a real event_type vocabulary mismatch (conversion_event vs custom_event) via cross-checking Child A\'s live scope text, before it could ship as a silent, permanent no-op for real conversion events',
    'Created an isolated git worktree for the altifyai repo rather than editing its shared main checkout directly, since another concurrent fleet session had uncommitted WIP there',
  ],
  exploration_date: new Date().toISOString().slice(0, 10),
};

async function main() {
  const { data: existingPrd } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .eq('id', PRD_ID)
    .maybeSingle();

  const prdRow = {
    id: PRD_ID,
    directive_id: SD_KEY,
    sd_id: SD_UUID,
    title: 'AltifyAI Dual-Write Usage-Event Witness PRD',
    version: '1.0',
    status: 'approved',
    category: 'Infrastructure',
    priority: 'high',
    executive_summary,
    goal_summary: executive_summary,
    functional_requirements,
    technical_requirements,
    system_architecture,
    test_scenarios,
    acceptance_criteria,
    risks,
    implementation_approach,
    integration_operationalization,
    exploration_summary,
    phase: 'PLAN',
    created_by: 'PLAN',
  };

  let result;
  if (existingPrd) {
    result = await supabase.from('product_requirements_v2').update(prdRow).eq('id', PRD_ID).select('id, status').single();
  } else {
    result = await supabase.from('product_requirements_v2').insert(prdRow).select('id, status').single();
  }
  if (result.error) {
    console.error('PRD_WRITE_FAILED', result.error);
    process.exit(1);
  }
  console.log('PRD_WRITTEN', JSON.stringify(result.data));

  const stories = functional_requirements.map((fr, idx) => ({
    story_key: `${SD_KEY}:US-${String(idx + 1).padStart(3, '0')}`,
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    title: fr.requirement,
    user_role: 'PLAN/EXEC engineer',
    user_want: fr.requirement,
    user_benefit: fr.description,
    story_points: fr.priority === 'CRITICAL' ? 5 : fr.priority === 'HIGH' ? 3 : 2,
    priority: fr.priority.toLowerCase(),
    status: 'ready',
    acceptance_criteria: fr.acceptance_criteria.map((ac, acIdx) => ({
      id: `AC-${String(acIdx + 1).padStart(3, '0')}`,
      type: 'functional',
      criteria: ac,
    })),
    implementation_context: JSON.stringify({
      prerequisites: fr.id === 'FR-2' || fr.id === 'FR-3' ? ['FR-1 (forwardUsageEventToSupabase) must exist'] : [],
      technical_notes: `Implements ${fr.id}: ${fr.requirement}`,
      tables_affected: [],
      estimated_complexity: fr.priority === 'CRITICAL' ? 'low' : 'medium',
    }),
    created_by: 'PLAN',
  }));

  for (const story of stories) {
    const { data: existingStory } = await supabase
      .from('user_stories')
      .select('id')
      .eq('story_key', story.story_key)
      .maybeSingle();
    let storyResult;
    if (existingStory) {
      storyResult = await supabase.from('user_stories').update(story).eq('story_key', story.story_key).select('story_key').single();
    } else {
      storyResult = await supabase.from('user_stories').insert(story).select('story_key').single();
    }
    if (storyResult.error) {
      console.error('STORY_WRITE_FAILED', story.story_key, storyResult.error);
      process.exit(1);
    }
    console.log('STORY_WRITTEN', storyResult.data.story_key);
  }

  console.log('DONE');
}

if (isMainModule(import.meta.url)) {
  main();
}
