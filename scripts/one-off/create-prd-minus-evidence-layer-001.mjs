// SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001 -- PRD creation via the canonical
// addPRDToDatabase() contentOverride hook (SD-FDBK-INFRA-ADD-PRD-DATABASE-001).
// Pre-authored content (LEAD-corrected scope per risk-agent c73332a0 + validation-agent 8bb1f901
// + Explore evidence 7aef10b0), so LLM generation is skipped but grounding + quality gates still run.
import { addPRDToDatabase } from '../prd/index.js';

const SD_KEY = 'SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001';
const TITLE = 'T-minus P1 — Evidence Layer: run identity, attempt history, outcome semantics';

const content = {
  executive_summary: "Builds a durable, attributable, immutable-once-final evidence layer for W3 gate evaluations via a NEW side table (not a retrofit of the live eva_stage_gate_results table), because the originally-chartered retrofit is not naively executable: 930 legacy rows collapse into 46 duplicate groups under the proposed key, the key itself omits venture_id (a forward-looking defect), and enabling an immutability trigger ahead of a full cutover would break the live UPSERT write path and a production-reachable override function. The launch-workflow dead-reader bug (false-positive 'launch ready' results) ships independently and immediately, with zero DDL dependency.",

  functional_requirements: [
    {
      id: 'FR-1',
      requirement: "Ship the launch-workflow dead-reader fix (formerly bundled as a dependent item) as an immediate, independent PR with zero schema/DDL dependency.",
      description: "lib/eva/launch-workflow/index.js's 3 queries (lines 44, 96, 136) select nonexistent `reasoning`/`score` columns (real columns: `notes`, `overall_score`). All 3 destructure only `{ data }` — never `error` — so the resulting live 42703 (undefined_column) error is silently swallowed and `(gateResults || [])`/`(gates || [])` become `[]`. Fix: correct the column names, bind and check `error` (fail loud, never coerce to []), and un-quarantine tests/eva/launch-workflow.test.js (quarantined since 2026-06-11, error_signature 'AssertionError: expected false to be true' — its own mocks bake in the same phantom fields and a second phantom, `current_stage`, that the real code doesn't read). Live effect: some ventures currently report false-positive 'launch ready'/checklist-complete purely because the broken query always returns zero gates; post-fix they correctly flip to not-ready. Document this explicitly as the intended correction in the PR description, not a regression to be investigated.",
      priority: 'CRITICAL',
      acceptance_criteria: [
        'All 3 queries at launch-workflow/index.js:44/96/136 select notes and overall_score, never reasoning/score',
        'Each query site binds `error` and throws/logs loudly on a non-null error — never silently coerces to an empty array',
        'tests/eva/launch-workflow.test.js is un-quarantined (removed from tests/quarantine-manifest.json) and passes against corrected mocks that match the live schema',
        'A live-data regression check confirms at least one previously-false-positive-ready venture now correctly reports not-ready (or explicitly documents that none exist in current data, with the query used to check)',
      ],
    },
    {
      id: 'FR-2',
      requirement: "LEAD DECISION (per risk-agent c73332a0 + validation-agent 8bb1f901): the evidence layer is a NEW side table, `eva_stage_gate_attempts`, NOT a retrofit of the existing eva_stage_gate_results table.",
      description: "The originally-chartered plan assumed DDL against the existing table. That is not safe: (a) 930 legacy venture_id-NULL rows collapse into only 46 distinct (stage_number,gate_type) groups (max 37/group) — a legacy-row backfill under a (run_id,stage_number,gate_type,attempt_number) key produces ~884 unique-violation errors and aborts CREATE UNIQUE INDEX; (b) the existing table has 5+ live consumers assuming today's UPSERT-overwrite semantics (checkGateDebt with no dedupe, v_venture_gate_debt whose own COMMENT states the upsert-overwrite assumption verbatim and propagates it to v_venture_state_canonical and the chairman surface, recordGateOverride at stage-execution-worker.js:852 which UPDATEs gate_criteria in production) — an immutability trigger enabled ahead of a full atomic cutover breaks all of them; (c) two unique indexes already exist on the table and would need explicit disposal, not silent replacement. A new, empty side table sidesteps every one of these: no legacy rows to backfill (historical evaluations stay in the old table, unmigrated, as a permanent legacy record), a clean key design from day one (see FR-3), and zero interaction with the old table's existing triggers/indexes/UPSERT writers.",
      priority: 'CRITICAL',
      acceptance_criteria: [
        'A new table eva_stage_gate_attempts exists via a chairman-gated migration, with no ALTER/DROP against eva_stage_gate_results',
        'The existing eva_stage_gate_results table, its 2 unique indexes, its trigger_enforce_kill_gate_threshold, and its 5 known readers/writers (recordGateResult UPSERT, recordGateOverride, checkGateDebt, v_venture_gate_debt, v_venture_state_canonical) are verified byte-for-behavior unchanged after this SD ships',
        '1,796 pre-existing rows in eva_stage_gate_results are NOT migrated, backfilled, or altered by this SD — this is an explicit, documented scope boundary, not an oversight',
      ],
    },
    {
      id: 'FR-3',
      requirement: 'eva_stage_gate_attempts schema: run_id, venture_id, stage_number, gate_type, attempt_number, with a real unique constraint on (run_id, venture_id, stage_number, gate_type, attempt_number) and live duplicate-rejection proof.',
      description: "The originally-chartered key (run_id, stage_number, gate_type, attempt_number) omits venture_id — a forward-looking defect independent of legacy backfill: eva-orchestrator.js:128 mints correlationId inside processStage({ventureId, stageId}), i.e. per-(venture,stage), confirming there is no existing venture-scoped 'run' concept the key could safely omit venture_id against. Including venture_id in the new table's key from day one closes this. run_id itself is a NEW identity minted by the orchestrator for a traversal run — it is explicitly NOT backfilled from the existing correlationId (which is per-stage-invocation, ~1.5 rows/ID measured live, not a run identity) and NOT retrofitted onto historical rows (per FR-2).",
      priority: 'CRITICAL',
      acceptance_criteria: [
        'UNIQUE constraint on (run_id, venture_id, stage_number, gate_type, attempt_number) exists and a live test proves a duplicate INSERT is rejected, not silently upserted',
        'eva-orchestrator.js mints a genuine run_id (new identity, not reusing correlationId) once per traversal run and threads it through to every attempt INSERT for that run',
        'INSERT-per-attempt: each traversal writes a NEW row per (stage,gate_type) evaluation, never UPSERTs over a prior attempt',
      ],
    },
    {
      id: 'FR-4',
      requirement: 'Attempt lifecycle on eva_stage_gate_attempts: row created with resolved_outcome=NULL; ONE atomic NULL→final update carrying evidence+evaluator in the same statement; finalize-immutability trigger; interrupted attempts stay NULL-visible; recovery = attempt n+1; authoritative = highest finalized attempt number.',
      description: 'Because this lands on the NEW table (FR-2), the immutability trigger has zero interaction with the existing UPSERT write path or recordGateOverride — there is no live code path to break. The trigger blocks any UPDATE to a row once resolved_outcome is non-NULL. A `passed` boolean is NOT reused from the old table\'s tri-state-incompatible design (see FR-5 for the enum that replaces it) — the new table has no NOT-NULL boolean forcing an in-flight attempt to read as a machine fail.',
      priority: 'HIGH',
      acceptance_criteria: [
        'A row inserted with resolved_outcome=NULL is queryable and visibly distinct from a finalized row',
        'The NULL->final update sets resolved_outcome, evidence, and evaluator in one atomic UPDATE statement',
        'A live test proves an UPDATE attempt against an already-finalized row is rejected by the immutability trigger',
        'An interrupted attempt (never finalized) does not block a subsequent attempt_number+1 from being created for the same (run_id,venture_id,stage,gate_type)',
        'A query pattern for "the authoritative result" (highest finalized attempt_number per key) is documented and demonstrated',
      ],
    },
    {
      id: 'FR-5',
      requirement: "resolved_outcome writer for the canonical 7-term enum (machine_pass|machine_fail|override|chairman_adjudicated|skip|cannot_evaluate|not_exercised) on the NEW table's own resolved_outcome column — the EXISTING eva_stage_gate_results.resolved_outcome column (added by SD-LEO-INFRA-S3-SOFT-GATE-REDESIGN-001) is explicitly NOT reused or repurposed.",
      description: "That existing column already carries a documented, different enum in its migration comment — survived|killed|pivoted|exited|false_kill|false_pass (venture-outcome calibration, with an explicit 'do not tighten before ~50 resolved outcomes' guard) — orthogonal to this SD's evaluation-disposition axis. Runtime blast radius of repurposing it would have been LOW today (0/1,796 populated, zero readers), but it is a live reservation with a documented forward commitment, and 2 sibling T-minus SDs (P3, P5) already hard-code FR-3's new enum terms — this decision could not be deferred. Building the new enum on the NEW table's own column entirely sidesteps the collision. Name the new writer function distinctly from the existing `recordGateOutcome` export already live in lib/eva/experiments/gate-outcome-bridge.js:66 to avoid a naming collision.",
      priority: 'HIGH',
      acceptance_criteria: [
        'eva_stage_gate_attempts.resolved_outcome has a CHECK constraint enforcing exactly the 7 terms (the original S3 column had none, and none should be added there either since it remains untouched)',
        'The new writer function has a name distinct from lib/eva/experiments/gate-outcome-bridge.js:66\'s recordGateOutcome',
        'passed (if carried forward as a convenience field on the new table) is derived as true only for machine_pass, and the schema allows NULL for in-flight/non-machine outcomes — no NOT NULL DEFAULT false forcing a false reading for an unfinalized attempt',
      ],
    },
    {
      id: 'FR-6',
      requirement: 'Decision linkage — chairman_decisions.context and venture_artifacts.metadata stamp the same run_id (from eva_stage_gate_attempts) when a chairman_adjudicated or override outcome is recorded.',
      description: 'Ensures a chairman decision or manual override is traceable back to the exact attempt row it resolved, closing the loop the original SD scope named FR-4.',
      priority: 'MEDIUM',
      acceptance_criteria: [
        'A chairman_adjudicated or override resolved_outcome write also stamps the same run_id into chairman_decisions.context and/or venture_artifacts.metadata',
        'A live query joins a chairman_decisions row back to its originating eva_stage_gate_attempts row via run_id',
      ],
    },
    {
      id: 'FR-7',
      requirement: 'Dual-write cutover: new gate evaluations write to BOTH the existing eva_stage_gate_results (unchanged UPSERT behavior, preserving all 5 existing readers) AND the new eva_stage_gate_attempts (durable evidence layer) — not a hard cutover.',
      description: 'This is the scoped MVP that satisfies "every future W3 gate evaluation is a durable, attributable, immutable-once-final record" without requiring this SD to migrate the 5 existing readers of eva_stage_gate_results (checkGateDebt, v_venture_gate_debt, v_venture_state_canonical, recordGateOverride, launch-workflow post-FR-1) in the same change. Migrating those readers to consume the new table is explicitly OUT OF SCOPE for this SD and is the natural follow-up once the evidence layer is proven live.',
      priority: 'HIGH',
      acceptance_criteria: [
        'recordGateResult() (or its call site) is extended to also write an eva_stage_gate_attempts row on every gate evaluation, without changing its existing eva_stage_gate_results UPSERT behavior',
        'A live test evaluates one gate and confirms both tables received a corresponding row',
        'The 5 known existing readers of eva_stage_gate_results are verified unaffected (same query shape, same results) after this change ships',
      ],
    },
    {
      id: 'FR-8',
      requirement: 'Reader census of eva_stage_gate_results AND eva_stage_gate_attempts consumers, published as a durable artifact, to inform the follow-up SD that migrates existing readers onto the new evidence layer.',
      description: "Enumerate every current reader of eva_stage_gate_results (at minimum: checkGateDebt, v_venture_gate_debt, v_venture_state_canonical, recordGateOverride, launch-workflow) plus any new readers of eva_stage_gate_attempts introduced by this SD (FR-6's chairman-linkage query). This directly satisfies the original SD's FR-6 concern by making it explicit and durable rather than an open, unresolved question blocking DDL — the table-location decision it originally gated (FR-2/this-SD) has already been made and de-risked by NOT retrofitting the live table.",
      priority: 'MEDIUM',
      acceptance_criteria: [
        'A committed artifact (doc or code comment block) lists every known reader of both tables with file:line citations',
        'The artifact explicitly recommends the readers most worth migrating first in a follow-up SD, ranked by risk/value',
      ],
    },
  ],

  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'The eva_stage_gate_attempts migration and its chairman-gated apply follow this repo\'s standard database/chairman-gated/ ceremony (4 ordered guards, --issue-token mode switch, --allow-any-path, two invocations, <1h token) — never --no-tx, since a partial-failure state under --no-tx has no rollback and the original CRIT-1 finding (unique-violation abort) demonstrated exactly this failure mode is reachable if the wrong approach were retried.',
    },
    {
      id: 'TR-2',
      requirement: 'The finalize-immutability trigger is named to sort deliberately relative to the existing trigger_enforce_kill_gate_threshold in same-timing (BEFORE INSERT OR UPDATE) alphabetical firing order — verified, not assumed, since it lands on a different table (eva_stage_gate_attempts) and this concern only applies if a future SD adds a similarly-timed trigger to the same table.',
    },
    {
      id: 'TR-3',
      requirement: "FR-1's launch-workflow fix ships as its own PR/handoff, mergeable independently of FR-2 through FR-8's chairman-gated DDL package — no dependency ordering between them.",
    },
    {
      id: 'TR-4',
      requirement: 'The schema-reference-snapshot.json and docs/reference/schema/engineer/tables/eva_stage_gate_results.md are stale relative to the live DB (both omit resolved_outcome/outcome_resolved_at, added by SD-LEO-INFRA-S3-SOFT-GATE-REDESIGN-001). Regenerate both before or alongside this SD\'s EXEC work so the new eva_stage_gate_attempts table is captured accurately from day one, and the pre-existing drift is closed rather than compounded.',
    },
  ],

  system_architecture: {
    overview: 'A new, standalone table (eva_stage_gate_attempts) sits alongside the existing eva_stage_gate_results table. Gate-evaluation code (eva-orchestrator.js and its call sites) writes to both: the existing table via its unchanged UPSERT path (backward compatibility for existing readers), and the new table via INSERT-per-attempt (the durable evidence layer). A finalize-immutability trigger on the new table only enforces the NULL-to-final atomic transition. Existing readers are unaffected; new consumers (chairman-decision linkage, a future reader-migration SD) read the new table. No historical data crosses between the two tables.',
    components: [
      { name: 'eva_stage_gate_attempts (new table)', responsibility: 'Durable, attributable, immutable-once-final evidence record per gate-evaluation attempt', technology: 'PostgreSQL, chairman-gated DDL' },
      { name: 'finalize-immutability trigger', responsibility: 'Blocks any UPDATE to a row once resolved_outcome is non-NULL', technology: 'PostgreSQL trigger, new table only — zero interaction with existing triggers' },
      { name: 'Dual-write path in eva-orchestrator.js', responsibility: 'Writes both the existing UPSERT (eva_stage_gate_results) and the new INSERT-per-attempt (eva_stage_gate_attempts) for every gate evaluation', technology: 'Node.js, lib/eva/eva-orchestrator.js + artifact-persistence-service.js' },
      { name: 'launch-workflow/index.js (FR-1)', responsibility: 'Corrected column references (notes/overall_score) and fail-loud error handling, independent of the new table', technology: 'Node.js, lib/eva/launch-workflow/index.js' },
    ],
  },

  test_scenarios: [
    { id: 'TS-1', scenario: 'Duplicate-attempt insert rejection', description: 'INSERT two rows with identical (run_id, venture_id, stage_number, gate_type, attempt_number) on eva_stage_gate_attempts; the second is rejected by the unique constraint.' },
    { id: 'TS-2', scenario: 'Post-finalize update rejection', description: 'Finalize an attempt row (resolved_outcome set non-NULL), then attempt to UPDATE its evidence field; the update is rejected by the immutability trigger.' },
    { id: 'TS-3', scenario: 'Interrupted-attempt recovery', description: 'Create an attempt row, leave resolved_outcome NULL (simulate interruption), then create attempt_number+1 for the same key; both rows persist, the authoritative result is the highest finalized attempt.' },
    { id: 'TS-4', scenario: 'Dual-write parity', description: 'Evaluate one real gate; confirm a corresponding row lands in BOTH eva_stage_gate_results (UPSERT, unchanged shape) and eva_stage_gate_attempts (new INSERT-per-attempt row).' },
    { id: 'TS-5', scenario: 'Existing-reader non-regression', description: 'Run checkGateDebt, v_venture_gate_debt, and v_venture_state_canonical queries before and after this SD ships against the same venture; results are byte-identical.' },
    { id: 'TS-6', scenario: 'recordGateOverride non-regression', description: 'Call recordGateOverride against a live gate row; confirm it succeeds exactly as before (no interaction with the new table or trigger).' },
    { id: 'TS-7', scenario: 'launch-workflow fix (FR-1)', description: 'getLaunchStatus/getChecklist against a venture with real gate rows returns real computed status, no 42703 in logs; a previously-false-positive-ready venture (if any exists in live data) now correctly reports not-ready.' },
    { id: 'TS-8', scenario: '7-term enum CHECK constraint', description: "INSERT a resolved_outcome value outside the 7 canonical terms into eva_stage_gate_attempts; the write is rejected by the CHECK constraint." },
    { id: 'TS-9', scenario: 'Legacy table untouched', description: 'Row count, schema (columns, indexes, triggers), and every existing row\'s content in eva_stage_gate_results are identical before and after this SD ships.' },
  ],

  acceptance_criteria: [
    'FR-1 (launch-workflow fix) is merged and shippable independently, with tests/eva/launch-workflow.test.js un-quarantined and passing',
    'eva_stage_gate_attempts exists with the corrected (run_id, venture_id, stage_number, gate_type, attempt_number) unique key, live duplicate-rejection and post-finalize-update-rejection proofs captured as evidence',
    'eva_stage_gate_results (schema, indexes, triggers, and all 1,796 existing rows) is verified unchanged after this SD ships',
    'Dual-write is live: one gate evaluation produces a row in both tables',
    'resolved_outcome on the new table uses the 7-term enum with a CHECK constraint; the existing S3 resolved_outcome column and its distinct enum are left untouched',
    'A committed reader census (FR-8) exists identifying every consumer of both tables and recommending migration priority for a follow-up SD',
  ],

  risks: [
    {
      risk: "Dual-write (FR-7) introduces a partial-failure mode: the existing-table UPSERT succeeds but the new-table INSERT fails (or vice versa), leaving the two tables disagreeing about whether an attempt was recorded.",
      impact: 'medium',
      mitigation: 'Wrap both writes in a single transaction where the calling code path allows it; where it does not (e.g. cross-service calls), define and document which table is authoritative on partial failure, and log the divergence loudly rather than silently.',
    },
    {
      risk: 'A future SD attempting to migrate the 5 existing readers onto eva_stage_gate_attempts inherits the same blast-radius risks this SD avoided (v_venture_gate_debt upsert-overwrite assumption, recordGateOverride production-reachability) — deferring the risk, not eliminating it.',
      impact: 'medium',
      mitigation: 'FR-8\'s reader census explicitly documents this for the follow-up SD, including the specific file:line citations and the upsert-overwrite assumption baked into v_venture_gate_debt\'s own COMMENT.',
    },
    {
      risk: 'Sibling T-minus SDs (P2, P3, P5) may have authored their own plan_content assuming columns land on the EXISTING eva_stage_gate_results table rather than a new side table.',
      impact: 'medium',
      mitigation: 'Flagged to the coordinator (signal 9ce3b52e) for cross-SD visibility. All 3 siblings have zero PRDs authored yet (validation-agent 8bb1f901 confirmed), so they can incorporate the new-table decision into their own PLAN phase without needing rework.',
    },
    {
      risk: 'The chairman-gated DDL ceremony for eva_stage_gate_attempts still carries standard migration-apply risk (ACCESS EXCLUSIVE lock during the transaction, live writers with lock_timeout=8s).',
      impact: 'low',
      mitigation: 'Standard TR-1 ceremony discipline (never --no-tx, rehearse on a scratch file first) applies; risk is materially lower than the original retrofit plan since the new table has zero pre-existing writers to contend with during creation.',
    },
  ],

  implementation_approach: 'EXEC ships FR-1 (launch-workflow fix) first as an independent PR — zero DDL, immediately mergeable. In parallel or sequentially, EXEC authors and chairman-gates the eva_stage_gate_attempts migration (FR-2/FR-3/FR-4/FR-5), then wires the dual-write (FR-7) and chairman-decision linkage (FR-6), and finally publishes the reader census (FR-8). No changes are made to eva_stage_gate_results\'s schema, data, indexes, or triggers at any point in this SD.',

  integration_operationalization: {
    consumers: [
      { name: 'eva-orchestrator.js gate-evaluation flow', interaction: 'Additive write to eva_stage_gate_attempts alongside the existing eva_stage_gate_results UPSERT — not a replacement', frequency: 'Every stage gate evaluation' },
      { name: 'checkGateDebt / v_venture_gate_debt / v_venture_state_canonical / chairman surface', interaction: 'Continue reading eva_stage_gate_results unchanged; unaffected by this SD', frequency: 'Continuous, existing cadence' },
      { name: 'launch-workflow module (post-FR-1)', interaction: 'Continues reading eva_stage_gate_results, now with corrected column names and fail-loud error handling', frequency: 'Every launch-readiness check' },
      { name: 'Follow-up reader-migration SD (future, out of scope here)', interaction: 'Will migrate specific readers onto eva_stage_gate_attempts per FR-8\'s prioritized census', frequency: 'One-time, future SD' },
    ],
    dependencies: [
      { name: 'eva-orchestrator.js', type: 'upstream', contract: 'Mints a genuine run_id per traversal run and threads it into every attempt write for that run', failure_handling: 'If run_id minting fails, the attempt write must fail loud, never silently write a NULL/placeholder run_id' },
      { name: 'eva_stage_gate_results (existing table)', type: 'sibling', contract: 'Schema, indexes, triggers, and all 1,796 existing rows remain byte-for-behavior unchanged', failure_handling: 'Any migration touching this table beyond the dual-write INSERT is out of scope and must be rejected in review' },
      { name: 'chairman_decisions / venture_artifacts', type: 'downstream', contract: 'Stamped with the same run_id on a chairman_adjudicated or override outcome (FR-6)', failure_handling: 'A missing run_id stamp on these writes is a defect, not a degraded-mode acceptable state' },
    ],
    data_contracts: [
      { name: 'eva_stage_gate_attempts unique key', shape: '(run_id, venture_id, stage_number, gate_type, attempt_number)', notes: 'Corrects the originally-chartered key, which omitted venture_id' },
      { name: 'resolved_outcome enum', shape: 'machine_pass|machine_fail|override|chairman_adjudicated|skip|cannot_evaluate|not_exercised', notes: 'Enforced by a CHECK constraint on the NEW table only; the existing eva_stage_gate_results.resolved_outcome column and its distinct survived|killed|pivoted|exited|false_kill|false_pass enum are untouched' },
    ],
    runtime_config: [
      { name: 'Chairman-gated migration ceremony', detail: 'Standard database/chairman-gated/ 4-guard ceremony, --issue-token, <1h token, transactional (never --no-tx)' },
    ],
    observability_rollout: [
      { name: 'Dual-write parity check', detail: 'Post-deploy, verify one gate evaluation produces matching rows in both tables before declaring the rollout complete (TS-4)' },
      { name: 'Existing-reader non-regression check', detail: 'Post-deploy, verify checkGateDebt/v_venture_gate_debt/v_venture_state_canonical results are byte-identical to pre-deploy (TS-5)' },
    ],
  },

  exploration_summary: 'LEAD-phase Explore + risk-agent (c73332a0) + validation-agent (8bb1f901) verified the SD\'s own pre-fix evidence against the live database (1,796 rows: entry=898/exit=898/kill=0) and current codebase. 4/5 stated claims confirmed TRUE; the correlationId-drop count was corrected from a stated "34/1,796" to a measured 483/1,796. The originally-chartered retrofit-the-existing-table approach was found not executable (930 legacy rows collapse into 46 groups; proposed key omits venture_id; enabling an immutability trigger ahead of cutover breaks live recordGateOverride and the existing UPSERT path). No duplicate/overlapping SD or PRD exists for this scope; 4 sibling T-minus SDs created the same day consume (not duplicate) this SD\'s evidence layer, though none have authored a PRD yet. Full findings recorded in sub_agent_execution_results rows 7aef10b0 (EXPLORE), c73332a0 (RISK), 8bb1f901 (VALIDATION), all phase=LEAD.',
};

addPRDToDatabase(SD_KEY, TITLE, content).then((result) => {
  console.log('PRD_RESULT=' + JSON.stringify(result?.success !== undefined ? { success: result.success, prdId: result.prdId || result.id } : result));
}).catch((err) => {
  console.error('PRD_CREATION_FAILED:', err.message);
  process.exit(1);
});
