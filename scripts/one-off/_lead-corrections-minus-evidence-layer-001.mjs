// SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001 — LEAD-phase strategic corrections.
//
// Applies the findings of an Explore premise-verification pass + risk-agent (row c73332a0) +
// validation-agent (row 8bb1f901) at LEAD. The SD's own pre-fix evidence text contained a wrong
// number (34/1,796, actual measured 483/1,796) and FR-1 as written is not executable against the
// live table (930 legacy rows collapse into 46 groups; the key omits venture_id). This is the
// SD-UAT-002-pattern LEAD correction: verify claims against reality before handing scope to PLAN.
//
// Dry-run by default; pass --apply to write.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const APPLY = process.argv.includes('--apply');
const SD_KEY = 'SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001';

const RISKS = [
  {
    risk: "FR-1's proposed unique constraint (run_id, stage_number, gate_type, attempt_number) is not naively backfillable. Live measurement: of 1,796 rows, the 930 legacy venture_id-NULL rows collapse into only 46 distinct (stage_number, gate_type) groups (max 37 rows/group) — a sentinel legacy run_id would produce ~884 unique-violation errors and abort CREATE UNIQUE INDEX. FR-7's quarantine VIEW does not help: a unique index is enforced on the base table, not filtered by a view.",
    impact: 'critical',
    likelihood: 'high',
    mitigation: 'Do NOT backfill run_id from correlationId — correlationId is minted per-stage-invocation (879 distinct IDs across 1,313 rows, ~1.5 rows/ID), not a run identity; backfilling would permanently encode a wrong semantic. LEAD must decide the legacy-row disposition (e.g. a distinct legacy sentinel scheme, or exclude legacy rows from the new constraint entirely) before any DDL is authored.',
  },
  {
    risk: "FR-1's literal key (run_id, stage_number, gate_type, attempt_number) omits venture_id — a forward-looking defect independent of backfill. The 866 non-legacy rows are unique only because venture_id happens to already scope them; two ventures evaluated within what the design calls one 'run' would collide under the stated key. eva-orchestrator.js:127-128 mints correlationId inside processStage({ventureId, stageId}) — i.e. per-(venture,stage) — confirming there is no existing 'run' concept that is venture-scoped by construction.",
    impact: 'high',
    likelihood: 'high',
    mitigation: 'Either add venture_id to the unique key, or produce a normative definition of "run" with a proven single-venture functional dependency before DDL is authored.',
  },
  {
    risk: 'FR-6 (existing-table-vs-side-table decision, reader census) is sequenced AFTER FR-1/FR-2 in the FR list, but FR-1/FR-2 already specify DDL against the EXISTING eva_stage_gate_results table — directly contradicting FR-6 treating that decision as still open. A prior sibling SD (SD-LEO-INFRA-VENTURE-INTAKE-GATE-PACK-001) independently avoided writing to this table specifically because of its existing 3-column-unique-index + gate_type CHECK design, corroborating that the current schema is already a known constraint on new work.',
    impact: 'critical',
    likelihood: 'high',
    mitigation: 'Resolve FR-6 FIRST as an explicit LEAD-level decision before any DDL is authored. A side table is the leading candidate given the blast-radius findings in R3-R5, materially reducing risk to the 5 known existing readers/writers of the current table.',
  },
  {
    risk: "Enabling FR-2's finalize-immutability trigger before the INSERT-per-attempt cutover is fully complete breaks live production code. recordGateOverride (stage-execution-worker.js:852, production-reachable) UPDATEs gate_criteria on rows that may already be finalized, and the CURRENT recordGateResult() write path (artifact-persistence-service.js:359-388) is itself an UPSERT (ON CONFLICT DO UPDATE) — enabling the trigger ahead of cutover guarantees write failures. A pre-existing BEFORE INSERT OR UPDATE trigger (trigger_enforce_kill_gate_threshold) also fires at the same timing; Postgres fires same-timing triggers alphabetically, so the new trigger's name determines execution order relative to it.",
    impact: 'high',
    likelihood: 'high',
    mitigation: 'Land the new writer, both index changes, the immutability trigger, and all 5 known existing readers as ONE atomic, single-transaction change. Never enable the trigger ahead of the writer cutover. Name the new trigger deliberately relative to trigger_enforce_kill_gate_threshold.',
  },
  {
    risk: "FR-2 requires in-flight attempts to be distinguishable (resolved_outcome NULL) from finalized ones, but the existing `passed` column is `boolean NOT NULL DEFAULT false` — an unfinalized attempt is stored identically to a machine FAIL under FR-3's 'passed = machine-verdict-only' framing. This is a genuine tri-state contradiction, not a naming issue.",
    impact: 'high',
    likelihood: 'high',
    mitigation: 'Resolve explicitly before FR-2/FR-3 implementation: either DROP NOT NULL on passed (nullable = in-flight), or add a distinct attempt-status column. The SD does not currently state either.',
  },
  {
    risk: "FR-3's proposed 7-term resolved_outcome enum (machine_pass|machine_fail|override|chairman_adjudicated|skip|cannot_evaluate|not_exercised) collides semantically with the EXISTING resolved_outcome column, added by SD-LEO-INFRA-S3-SOFT-GATE-REDESIGN-001 FR-5 (migration 20260625_eva_stage_gate_results_outcome.sql), whose documented enum is survived|killed|pivoted|exited|false_kill|false_pass — a venture-outcome calibration axis with an explicit 'do not tighten before ~50 resolved outcomes' guard, orthogonal to FR-3's evaluation-disposition axis. Runtime blast radius is LOW today (0/1,796 rows populated, zero readers/views/RPCs/TS types depend on the old enum — recordGateOutcome, its only writer, has zero production callers), but this is a live reservation with a documented forward commitment, not a free column — and 2 sibling T-minus SDs (P3, P5) have already hard-coded FR-3's NEW enum terms in their own plan content, so the decision cannot be deferred past this SD.",
    impact: 'medium',
    likelihood: 'medium',
    mitigation: 'LEAD decides explicitly: add a NEW column for FR-3 (recommended — also fixes the outcome_resolved_at naming mismatch, since that column name implies the S3 semantic), or formally retire SD-LEO-INFRA-S3-SOFT-GATE-REDESIGN-001 FR-5 intent on the record before reusing the column.',
  },
  {
    risk: "FR-3's proposed resolved_outcome writer function name collides with a DIFFERENT, live, production-wired recordGateOutcome export already present in lib/eva/experiments/gate-outcome-bridge.js:66.",
    impact: 'low',
    likelihood: 'medium',
    mitigation: 'Name the new writer distinctly from the existing gate-outcome-bridge.js export.',
  },
  {
    risk: "P1's own pre-fix evidence text states the eva-orchestrator.js:128 correlationId-dropped-at-persistence defect affects '34/1,796' rows. This is WRONG. Live measurement (strict JSON-parse of all 1,796 notes fields): 483/1,796 rows (464 exit + 19 entry) actually lack a correlationId. 34 does not correspond to any measured quantity found (not distinct correlationIds [879], not distinct venture_ids [47]) — likely a stale/miscounted figure from an earlier informal check.",
    impact: 'low',
    likelihood: 'high',
    mitigation: 'Correct all future citations of this defect to 483/1,796. Also note FOR THE RECORD: two unique indexes already exist on this table (idx_eva_stage_gate_results_unique on (venture_id,stage_number,gate_type), and a second on the same columns plus evaluated_at) — FR-1 as originally written implied none did.',
  },
];

const KEY_CHANGES = [
  {
    change: "FR-5 (lib/eva/launch-workflow/index.js dead-reader fix — 3 queries at lines 44/96/136 select nonexistent reasoning/score columns, silently swallow the resulting 42703 error since neither destructure binds `error`, and compute launch readiness/checklist over an empty result set) SPLIT OUT as an independent, immediately-shippable PR with ZERO schema/DDL dependency and ZERO chairman-gated ceremony. Un-quarantining tests/eva/launch-workflow.test.js (quarantined since 2026-06-11, error_signature 'AssertionError: expected false to be true', mocks bake in the same phantom fields) is part of this fix. Some ventures will correctly flip from false-positive 'launch ready' to 'not ready' post-fix — document as the intended correction, not a regression.",
    impact: 'high',
  },
  {
    change: 'FR-6 (existing-table-vs-side-table decision + reader census) is promoted to a LEAD-level decision made BEFORE FR-1/FR-2 DDL is authored, not left open for PLAN/EXEC discovery — resolving the direct contradiction where FR-1/FR-2 already assume DDL against the existing table while FR-6 treats that choice as unresolved.',
    impact: 'high',
  },
  {
    change: "Removed a duplicate scope clause from FR-3 ('JS/SQL verb-set alignment') that belongs to sibling SD P3 (whose own pre-fix evidence explicitly cites a JS/SQL verb-set disagreement; P1's pre-fix evidence never mentions verb sets) — orphan clause in P1, not P1's defect to fix.",
    impact: 'low',
  },
];

const SUCCESS_CRITERIA = [
  {
    criterion: 'FR-6 (table-vs-side-table decision) is resolved and documented BEFORE any FR-1/FR-2 DDL is authored in the PRD or migration files.',
    measure: 'PRD explicitly states the decision and its rationale; migration file(s), if any, target the decided location only.',
  },
  {
    criterion: "FR-1's unique-key legacy-row backfill is proven non-destructive against the live 930-legacy-row / 46-group collision before the constraint is applied.",
    measure: 'A dry-run / staging proof (row-count-preserving, zero unique-violation) is captured as evidence before the chairman-gated DDL apply.',
  },
  {
    criterion: 'The writer/index/trigger/reader cutover for FR-1/FR-2 lands as one atomic, single-transaction change — the immutability trigger is never enabled ahead of the INSERT-per-attempt writer cutover.',
    measure: 'Migration + code deploy sequencing documented in the PRD; a live-code grep for recordGateOverride and the current UPSERT call site confirms both are updated in the same change.',
  },
  {
    criterion: 'FR-3 explicitly resolves the resolved_outcome semantic-collision decision (new column vs. retiring the S3 intent) rather than silently repurposing the existing column.',
    measure: "PRD names the decision and, if reusing the column, records the S3-FR-5 intent as formally superseded rather than silently overwritten.",
  },
  {
    criterion: "FR-5's launch-workflow fix ships independently of the FR-1/FR-2/FR-3 DDL package, with no dependency ordering between them.",
    measure: 'FR-5 has its own PR / handoff evidence, mergeable and shippable regardless of P1 DDL ceremony timing.',
  },
];

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sd, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, risks, key_changes, success_criteria')
    .eq('sd_key', SD_KEY)
    .single();

  if (fetchErr) {
    console.error('[FETCH FAILED]', fetchErr.message);
    process.exit(1);
  }

  const newRisks = [...(sd.risks || []), ...RISKS];
  const newKeyChanges = [...KEY_CHANGES, ...(sd.key_changes || [])];
  const newSuccessCriteria = [...SUCCESS_CRITERIA, ...(sd.success_criteria || [])];

  console.log(`[OK] Prepared ${RISKS.length} new risks (total ${newRisks.length}), ${KEY_CHANGES.length} new key_changes (total ${newKeyChanges.length}), ${SUCCESS_CRITERIA.length} new success_criteria (total ${newSuccessCriteria.length}).`);

  if (!APPLY) {
    console.log('\n[DRY RUN] Pass --apply to write these changes.');
    return;
  }

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ risks: newRisks, key_changes: newKeyChanges, success_criteria: newSuccessCriteria })
    .eq('sd_key', SD_KEY);

  if (updateErr) {
    console.error('[UPDATE FAILED]', updateErr.message);
    process.exit(1);
  }

  console.log('[APPLIED] SD risks/key_changes/success_criteria updated.');
}

if (isMainModule(import.meta.url)) main();
