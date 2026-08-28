import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prd, error: e1 } = await supabase
  .from('product_requirements_v2')
  .select('id,functional_requirements,risks')
  .eq('id', 'PRD-SD-LEO-INFRA-STAGE-RENUMBER-DRIFT-001')
  .single();
if (e1) throw e1;

const frs = [...prd.functional_requirements];

// Amend FR-1 with testing-agent's dead-export / separate-query findings
const fr1 = frs.find(f => f.id === 'FR-1');
fr1.description += ' TESTING sub-agent evidence b57c4b17 (prospective, PLAN phase) found: lib/eva/gate-constants.js:32 exports MAX_STAGE but NOTHING imports it -- the live ceiling is a SEPARATE local `const MAX_STAGE = 26` at stage-execution-worker.js:103; both must be fixed (the dead export should either be wired in or removed, not left as a second uncorrected source of truth). getStageGovernance()._publicView.totalStages is a STAGE-COUNT (cardinality), not a ceiling -- add an explicit maxStageNumber field (MAX(stage_number), not COUNT(*)) so a future non-contiguous stage set cannot silently produce a wrong ceiling.';
fr1.acceptance_criteria.push('lib/eva/gate-constants.js MAX_STAGE export is either wired to a real consumer or removed -- no orphaned second source of truth');
fr1.acceptance_criteria.push('stage-governance.js exposes an explicit maxStageNumber (MAX(stage_number)) distinct from totalStages (count)');

// Amend FR-2 with the additional separate-query / SQL-side consumer findings
const fr2 = frs.find(f => f.id === 'FR-2');
fr2.description += ' TESTING sub-agent evidence b57c4b17 found TWO additional consumers that a stage-governance-only fix would miss: (a) lib/eva/stage-work-sync.js:29-36 runs its OWN separate chairman_dashboard_config query (stage-execution-worker.js:4958 just delegates to it) -- must be repointed too, not assumed covered by the worker-level fix; (b) a SQL-side reader, the can_auto_advance() Postgres function (database/migrations/20260512_can_auto_advance_rpc.sql:109), reads hard_gate_stages directly in-database and is unreachable by any JS-layer refactor -- must be verified/corrected independently (e.g. by fixing the underlying config row so both readers see the same corrected value, or by updating the function if it embeds its own copy).';
fr2.acceptance_criteria.push('lib/eva/stage-work-sync.js:29-36 reads the same corrected/derived gate set as stage-execution-worker.js, not a separate stale query');
fr2.acceptance_criteria.push('can_auto_advance() Postgres function (20260512_can_auto_advance_rpc.sql:109) verified against the corrected hard_gate_stages value');

// New FR-9 consolidating the remaining testing-agent findings
frs.push({
  id: 'FR-9',
  title: 'Additional structural gaps found by prospective TESTING review (evidence b57c4b17)',
  description: "eva-master-scheduler.js:462 hardcodes totalStages: 25 -- a THIRD distinct literal value invisible to any grep for '26', found only by direct file review; must be corrected to the derived value. lib/eva/content-classifier.js:211 is a SYNCHRONOUS function with no supabase client available -- getStageGovernance() is async, so this consumer needs a sync-accessible cached value (e.g. a pre-warmed module-level snapshot) rather than a naive await-based repoint; design this explicitly rather than discovering the sync/async mismatch during EXEC. tests/unit/lint/gate-stage-hardcoded-literal-lint.test.js provides NO safety net for this class of literal: its BANNED_NAMES covers only 4 kill/promotion collection names via a Set(...)/array-literal write-pattern regex, and a scalar `const MAX_STAGE = 26` (or `totalStages: 25`) is invisible to it regardless of any allowlist; RUNTIME_DIRS also excludes src/, database/, docs/. Existing test fixtures assume the old numbers and will need updating alongside source: stage-execution-worker.test.js:248 sets stage 26 and asserts markCompleted (inverts under the fix; its own :266 comment already says '25', an internal contradiction to resolve), and stage-work-sync.test.js:24-28 mocks the chairman_dashboard_config chain in a way that would pass vacuously once repointed to stage-governance unless the mock itself is updated to assert the derived value.",
  priority: 'high',
  acceptance_criteria: [
    'eva-master-scheduler.js:462 totalStages value corrected to the derived/live stage count, not a hardcoded 25',
    'lib/eva/content-classifier.js:211 has an explicit sync-safe access path to the corrected stage ceiling (documented design decision, not an ad-hoc await added under a sync function)',
    'stage-execution-worker.test.js:248/:266 internal contradiction resolved and fixture updated to the new scheme',
    'stage-work-sync.test.js:24-28 mock updated to assert the corrected/derived gate set, not left passing vacuously'
  ]
});

const risks = [...(prd.risks || [])];
risks.push({
  risk: 'MAX_STAGE=26 / hard_gate_stages=[...23...] correction is a live BEHAVIOR CHANGE for any venture reaching stage 23+ (stage 27 currently never executes; gates 16/26 currently unenforced, gate 23 currently spuriously fires) -- not a cosmetic refactor, despite reading like one.',
  mitigation: 'RISK sub-agent evidence 8bfae0b7 measured zero live ventures above stage 20 as of 2026-08-28 (AltifyAI at 19) -- re-verify this immediately before EXEC in case a venture has since advanced, and treat every acceptance criterion above as a behavior-correctness check, not a lint-style literal swap.'
});

const { error: e2 } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements: frs, risks })
  .eq('id', 'PRD-SD-LEO-INFRA-STAGE-RENUMBER-DRIFT-001');
if (e2) throw e2;
console.log('PRD amended: FR count now', frs.length, ', risks count now', risks.length);
