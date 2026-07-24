/**
 * Unified Persistence Service for Venture Artifact Pipeline
 *
 * SD-EVA-INFRA-UNIFIED-PERSIST-SVC-001
 *
 * Three canonical write paths:
 *   writeArtifact()    → venture_artifacts (dual-write: content + artifact_data)
 *   recordGateResult() → eva_stage_gate_results
 *   advanceStage()     → fn_advance_venture_stage RPC
 *
 * ALL writes to these tables MUST go through this service.
 */

import { persistADRs } from './adr-extractor.js';
import { isValidArtifactType } from './artifact-types.js';
import { checkExitGates } from './lifecycle/exit-gate-enforcer.js';
import { checkThesisKillGate } from './lifecycle/thesis-kill-gate.js';
import { classifyGateRow } from './gate-enforcement.js';
// SD-LEO-INFRA-EAGER-SYNTHESIS-VISION-DIMS-EXTRACT-001: populate extracted_dimensions + sections so
// eager-synthesized visions pass eva_vision_documents_active_rich_check on promotion.
import { parseMarkdownToSections, buildDefaultMapping } from '../../scripts/eva/markdown-to-sections-parser.mjs';
import { extractDimensions } from './vision-dimensions-extractor.js';

/**
 * Write a venture artifact with dual-write (content TEXT + artifact_data JSONB).
 * Handles is_current deduplication: marks prior rows is_current=false before insert.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} opts
 * @param {string} opts.ventureId - Venture UUID
 * @param {number} opts.lifecycleStage - Stage number (1-26)
 * @param {string} opts.artifactType - e.g. 'stage_analysis', 'devils_advocate_review'
 * @param {string} opts.title - Human-readable title
 * @param {Object|null} [opts.artifactData] - JSONB payload
 * @param {string|null} [opts.content] - TEXT content (auto-derived from artifactData if omitted)
 * @param {Object|null} [opts.metadata] - Additional metadata JSONB
 * @param {string} [opts.source='artifact-persistence-service'] - Source identifier
 * @param {number} [opts.qualityScore=70] - Quality score (0-100)
 * @param {string} [opts.validationStatus='validated'] - Validation status
 * @param {string|null} [opts.validatedBy] - Who validated
 * @param {boolean} [opts.isCurrent=true] - Mark as current version
 * @param {boolean} [opts.skipDedup=false] - Skip is_current dedup (used by batch)
 * @param {string|null} [opts.idempotencyKey] - Idempotency key for dedup
 * @param {string|null} [opts.epistemicClassification] - Four Buckets classification
 * @param {Array|null} [opts.epistemicEvidence] - Four Buckets evidence
 * @param {string|null} [opts.visionKey] - EVA vision key — triggers eager synthesis upsert
 * @param {string|null} [opts.planKey] - EVA architecture plan key — triggers eager synthesis upsert
 * @returns {Promise<string>} Inserted artifact ID
 */
export async function writeArtifact(supabase, opts) {
  const {
    ventureId,
    lifecycleStage,
    artifactType,
    title,
    artifactData = null,
    content = null,
    metadata = null,
    source = 'artifact-persistence-service',
    qualityScore = 70,
    validationStatus = 'validated',
    validatedBy = null,
    isCurrent = true,
    skipDedup = false,
    idempotencyKey = null,
    epistemicClassification = null,
    epistemicEvidence = null,
    visionKey = null,
    planKey = null,
  } = opts;

  // SD-MAN-FIX-FIX-VENTURE-ARTIFACTS-001: Validate artifact type against registry
  if (!isValidArtifactType(artifactType) && !/^stage_\d+_analysis$/.test(artifactType)) {
    console.warn(`[artifact-persistence-service] WARNING: artifact type '${artifactType}' is not in ARTIFACT_TYPES registry. This may cause CHECK constraint violation.`);
  }

  // Dedup: if a current artifact of the same type exists for this stage,
  // UPDATE it instead of creating a duplicate row.
  // SD-MAN-FIX-PIPELINE-HEALTH-GAPS-ORCH-001-C: prevents duplicate artifacts at S10/S12/S15.
  // SD-S17-DESIGN-INTELLIGENCE-ORCH-001-A: scope dedup by metadata.screenId when present,
  // matching the idx_unique_current_artifact index that uses COALESCE(metadata->>'screenId', '__no_screen__').
  if (isCurrent && !skipDedup) {
    let dedupQuery = supabase
      .from('venture_artifacts')
      .select('id')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', lifecycleStage)
      .eq('artifact_type', artifactType)
      .eq('is_current', true);

    // Scope by screenId if present in metadata — matches the unique index discriminator
    const screenId = metadata?.screenId;
    if (screenId) {
      dedupQuery = dedupQuery.eq('metadata->>screenId', screenId);
    }

    const { data: existing } = await dedupQuery
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Update existing artifact instead of creating duplicate
      const resolvedArtifactData = artifactData ?? (content ? tryParse(content) : null);
      const resolvedContent = content ?? deriveContent(artifactData);
      const { error: updateError } = await supabase
        .from('venture_artifacts')
        .update({
          title: title || `Stage ${lifecycleStage} ${artifactType}`,
          artifact_data: resolvedArtifactData,
          content: resolvedContent,
          source,
          quality_score: qualityScore,
          validation_status: validationStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (updateError) {
        console.warn(`[artifact-persistence] Dedup update failed: ${updateError.message}`);
      }
      return existing.id;
    }
  }

  // Dual-write: ensure both content and artifact_data are populated
  // Hardened: never allow content=NULL when artifactData is provided (SD-EVA-INFRA-PERSIST-SVC-BYPASS-FIX-001)
  const resolvedArtifactData = artifactData ?? (content ? tryParse(content) : null);
  const resolvedContent = content ?? deriveContent(artifactData);

  const row = {
    venture_id: ventureId,
    lifecycle_stage: lifecycleStage,
    artifact_type: artifactType,
    title: title || `Stage ${lifecycleStage} ${artifactType}`,
    artifact_data: resolvedArtifactData,
    content: resolvedContent,
    is_current: isCurrent,
    source,
    quality_score: qualityScore,
    validation_status: validationStatus,
  };

  if (metadata) row.metadata = metadata;
  if (validatedBy) row.validated_by = validatedBy;
  if (idempotencyKey) row.idempotency_key = idempotencyKey;
  if (epistemicClassification) row.epistemic_classification = epistemicClassification;
  if (epistemicEvidence) row.epistemic_evidence = epistemicEvidence;
  if (visionKey) row.supports_vision_key = visionKey;
  if (planKey) row.supports_plan_key = planKey;

  // INSERT with unique partial index safety net (idx_unique_current_artifact).
  // The pre-INSERT check above handles the common case. If a concurrent writer
  // sneaks in between our check and this INSERT, the unique index rejects the
  // duplicate — we catch that and fall back to an UPDATE.
  let { data, error } = await supabase
    .from('venture_artifacts')
    .insert(row)
    .select('id')
    .single();

  // Handle unique constraint violation from idx_unique_current_artifact.
  // Fix: use PostgreSQL error code 23505 (unique_violation) instead of broad regex
  // that could misroute CHECK constraint or other errors into this fallback path.
  const isUniqueViolation = error && (
    error.code === '23505' ||
    /idx_unique_current_artifact|duplicate key value violates unique constraint/i.test(error.message)
  );
  if (isUniqueViolation) {
    // Include screenId in fallback query to match the per-screen unique index
    // (idx_unique_current_artifact includes COALESCE(metadata->>'screenId', '__no_screen__'))
    const screenId = row.metadata?.screenId;
    console.info(`[artifact-persistence] Unique constraint hit — falling back to UPDATE for ${artifactType} at S${lifecycleStage} (screenId=${screenId ?? 'none'})`);
    let query = supabase
      .from('venture_artifacts')
      .select('id')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', lifecycleStage)
      .eq('artifact_type', artifactType)
      .eq('is_current', true);
    if (screenId) {
      query = query.eq('metadata->>screenId', screenId);
    }
    const { data: existing } = await query.limit(1).maybeSingle();
    if (existing) {
      await supabase.from('venture_artifacts').update({
        title: row.title, artifact_data: row.artifact_data, content: row.content,
        metadata: row.metadata, source: row.source, quality_score: row.quality_score,
        validation_status: row.validation_status, updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
      return existing.id;
    }
    // Existing row not found despite unique violation — re-throw the original error
    throw new Error(
      '[artifact-persistence-service] writeArtifact failed: INSERT hit unique constraint ' +
      `but no existing row found for ${artifactType} at S${lifecycleStage} ` +
      `(screenId=${screenId ?? 'none'}). Original error: ${error.message}`
    );
  }

  // Graceful degradation: retry without optional columns if they cause schema errors
  if (error && (row.idempotency_key || row.epistemic_classification)) {
    delete row.idempotency_key;
    delete row.epistemic_classification;
    delete row.epistemic_evidence;
    const retry = await supabase
      .from('venture_artifacts')
      .insert(row)
      .select('id')
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    throw new Error(`[artifact-persistence-service] writeArtifact failed: ${error.message}`);
  }

  // Eager synthesis: upsert EVA governance records when vision/plan keys provided.
  // Wrapped in try/catch — failure is logged but NEVER blocks artifact persistence.
  if (visionKey) {
    try {
      await upsertEvaVisionFromArtifacts(supabase, visionKey, ventureId, lifecycleStage);
    } catch (evaErr) {
      console.warn(`[artifact-persistence-service] EVA vision upsert failed (non-blocking): ${evaErr.message}`);
    }
  }
  if (planKey) {
    try {
      await upsertEvaArchFromArtifacts(supabase, planKey, ventureId, lifecycleStage);
    } catch (evaErr) {
      console.warn(`[artifact-persistence-service] EVA arch upsert failed (non-blocking): ${evaErr.message}`);
    }
  }

  // Stage 14 ADR extraction hook (SD-LEO-INFRA-STREAM-ACTIVATE-DORMANT-001-A)
  // When Stage 14 artifacts contain extractedADRs, persist them to leo_adrs
  // and update the architecture plan's adr_ids array.
  if (lifecycleStage === 14 && resolvedArtifactData?.extractedADRs?.length > 0) {
    try {
      const { data: archPlan } = await supabase
        .from('eva_architecture_plans')
        .select('id')
        .eq('venture_id', ventureId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      await persistADRs(
        supabase,
        resolvedArtifactData.extractedADRs,
        archPlan?.id || null,
        { logger: console }
      );
    } catch (adrErr) {
      console.warn('[artifact-persistence-service] ADR persistence failed (non-blocking):', adrErr.message);
    }
  }

  if (!data?.id) {
    throw new Error(
      '[artifact-persistence-service] writeArtifact completed but returned no ID ' +
      `for ${artifactType} at S${lifecycleStage} (venture=${ventureId})`
    );
  }
  return data.id;
}

/**
 * Write multiple artifacts in a batch (used by persistArtifacts migration).
 * Marks all prior is_current rows for the stage as false, then inserts all artifacts.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @param {number} lifecycleStage
 * @param {Array<Object>} artifacts - Array of { artifactType, title, payload, source, qualityScore, ... }
 * @param {string|null} [idempotencyKey]
 * @param {Object} [opts] - Optional EVA governance keys for eager synthesis
 * @param {string|null} [opts.visionKey] - Vision key
 * @param {string|null} [opts.planKey] - Architecture plan key
 * @returns {Promise<string[]>} Array of inserted artifact IDs
 */
export async function writeArtifactBatch(supabase, ventureId, lifecycleStage, artifacts, idempotencyKey = null, { visionKey = null, planKey = null } = {}) {
  // Dedup: mark prior is_current rows for each artifact type in this batch as false.
  // Scoped per artifact_type so multiple types within a stage coexist as is_current.
  const uniqueTypes = [...new Set(artifacts.map(a => a.artifactType))];
  for (const artType of uniqueTypes) {
    await supabase
      .from('venture_artifacts')
      .update({ is_current: false })
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', lifecycleStage)
      .eq('artifact_type', artType)
      .eq('is_current', true);
  }

  const ids = [];
  for (const art of artifacts) {
    const id = await writeArtifact(supabase, {
      ventureId,
      lifecycleStage,
      artifactType: art.artifactType,
      title: art.title || art.artifactType || `Stage ${lifecycleStage} Analysis`,
      artifactData: art.payload,
      source: art.source || 'eva-orchestrator',
      qualityScore: art.qualityScore ?? 70,
      validationStatus: 'validated',
      idempotencyKey,
      epistemicClassification: deriveEpistemicClassification(art.payload),
      epistemicEvidence: art.payload?.fourBuckets?.classifications || null,
      isCurrent: true,
      skipDedup: true, // already deduped once for entire batch above
      visionKey,
      planKey,
    });
    ids.push(id);
  }
  return ids;
}

/**
 * Record a stage gate evaluation result.
 * Uses upsert with venture_id + stage_number + gate_type as conflict key.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} opts
 * @param {string} opts.ventureId - Venture UUID
 * @param {number} opts.stageNumber - Stage number
 * @param {string} opts.gateType - e.g. 'stage_gate', 'reality_gate', 'advisory'
 * @param {boolean} opts.passed - Whether the gate passed
 * @param {number|null} [opts.score] - Gate score (0-100)
 * @param {string|null} [opts.reasoning] - Gate reasoning
 * @param {Object|null} [opts.metadata] - Additional metadata
 * @returns {Promise<string>} Inserted/updated row ID
 */
export async function recordGateResult(supabase, opts) {
  const {
    ventureId,
    stageNumber,
    gateType,
    passed,
    score = null,
    reasoning = null,
    metadata = null,
    // SD-LEO-FIX-PERSIST-KILL-GATE-001: full scoring evidence. `criteria` lands
    // in gate_criteria (jsonb: inputs/threshold snapshots, evaluated thresholds,
    // DA input, venture flags) and `evaluatedBy` records the scorer identity.
    // Before this fix 1,096 gate rows carried gate_criteria={} and
    // evaluated_by=NULL — the 72/72 S3 kill-gate pass rate was unfalsifiable.
    criteria = null,
    // SD-LEO-FIX-MAKE-VENTURE-STAGE-001: provenance. All 1,102 historical rows have
    // evaluated_by NULL — no record of WHAT evaluated a gate. New rows always carry it:
    // callers pass their identity; fallback chain ends at 'eva-orchestrator' so a row
    // can never be written with NULL provenance again. Historical NULLs stand (no backfill).
    evaluatedBy = null,
    source = null,
  } = opts;

  // Map code-level gate types to DB check constraint values ('entry', 'exit', 'kill')
  const GATE_TYPE_MAP = {
    stage_gate: 'exit',
    reality_gate: 'entry',
    entry: 'entry',
    exit: 'exit',
    kill: 'kill',
    // Taste gates map to 'exit' (CronPulse RCA #5: taste_gate_s* not in CHECK constraint)
    taste_gate: 'exit',
  };
  // Handle taste_gate_sN patterns (e.g., taste_gate_s15, taste_gate_s17)
  const mappedGateType = GATE_TYPE_MAP[gateType]
    || (/^taste_gate_s\d+$/.test(gateType) ? 'exit' : gateType);

  const row = {
    venture_id: ventureId,
    stage_number: stageNumber,
    gate_type: mappedGateType,
    passed,
    evaluated_by: evaluatedBy || source || 'eva-orchestrator',
  };

  if (score !== null) row.overall_score = score;
  if (reasoning || metadata) row.notes = reasoning || (typeof metadata === 'string' ? metadata : JSON.stringify(metadata));
  if (criteria !== null && typeof criteria === 'object') row.gate_criteria = criteria;

  const { data, error } = await supabase
    .from('eva_stage_gate_results')
    .upsert(row, { onConflict: 'venture_id,stage_number,gate_type' })
    .select('id')
    .single();

  if (error) {
    throw new Error(`[artifact-persistence-service] recordGateResult failed: ${error.message}`);
  }

  // SD-MAN-INFRA-GATE-BAR-REGIME-001: evidence-existence bars on chairman-gate
  // stages, OBSERVE-ONLY — evaluated and recorded after every verdict persist.
  // A bar failure (or recording failure) never blocks the verdict write above.
  try {
    const { evaluateGateBars, recordGateBarObservation, CHAIRMAN_GATE_STAGES } = await import('./gate-bars.js');
    if (CHAIRMAN_GATE_STAGES.has(Number(stageNumber))) {
      const evaluation = await evaluateGateBars(row);
      await recordGateBarObservation(supabase, { ventureId, gateRowId: data.id }, evaluation);
    }
  } catch (barErr) {
    console.warn(`[artifact-persistence-service] gate-bar observation skipped (non-blocking): ${barErr.message}`);
  }

  return data.id;
}

/**
 * Record the EVENTUAL resolved outcome of a prior gate verdict (FR-5 data foundation,
 * SD-LEO-INFRA-S3-SOFT-GATE-REDESIGN-001). Additive UPDATE on the existing gate row.
 * NEVER blocks: it is defensive — if the additive FR-5 columns are not yet migrated, or
 * no matching verdict row exists, it warns and returns null. Lets future calibration join
 * verdict -> outcome to measure false-kill / false-pass rates. Do NOT empirically tighten
 * any kill threshold before >= ~50 outcome-resolved ventures.
 *
 * @param {Object} supabase
 * @param {Object} opts
 * @param {string} opts.ventureId - Venture UUID
 * @param {number} opts.stageNumber - Stage number of the gate
 * @param {string} opts.gateType - code-level gate type ('kill','exit','entry',...)
 * @param {string} opts.outcome - resolved outcome (e.g. 'survived','killed','false_kill')
 * @param {string|null} [opts.resolvedAt] - ISO timestamp; defaults to now
 * @returns {Promise<string|null>} updated row id, or null if not recorded
 */
export async function recordGateOutcome(supabase, { ventureId, stageNumber, gateType, outcome, resolvedAt = null }) {
  const GATE_TYPE_MAP = { stage_gate: 'exit', reality_gate: 'entry', entry: 'entry', exit: 'exit', kill: 'kill', taste_gate: 'exit' };
  const mappedGateType = GATE_TYPE_MAP[gateType] || (/^taste_gate_s\d+$/.test(gateType) ? 'exit' : gateType);
  try {
    const { data, error } = await supabase
      .from('eva_stage_gate_results')
      // resolved_outcome/outcome_resolved_at are added by this SD's ship-only additive migration
      // (supabase/migrations/20260625_eva_stage_gate_results_outcome.sql), not yet in the schema snapshot.
      .update({ resolved_outcome: outcome, outcome_resolved_at: resolvedAt || new Date().toISOString() }) // schema-lint-disable-line
      .eq('venture_id', ventureId)
      .eq('stage_number', stageNumber)
      .eq('gate_type', mappedGateType)
      .select('id')
      .maybeSingle();
    if (error) {
      console.warn(`[artifact-persistence-service] recordGateOutcome skipped (non-blocking): ${error.message}`);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.warn(`[artifact-persistence-service] recordGateOutcome error (non-blocking): ${err.message}`);
    return null;
  }
}

/**
 * Merge a chairman override into an EXISTING gate row's evidence.
 * SD-LEO-FIX-PERSIST-KILL-GATE-001 (FR-5): a chairman push past a failed gate
 * is deliberate build-out scaffolding — this RECORDS it first-class (who/why/
 * when + the decision row), making forced passes auditable and excludable from
 * threshold-calibration datasets. Override = recording, never a guardrail.
 *
 * jsonb-merge semantics: existing evidence is preserved; only the `override`
 * key is added/replaced. Fail-soft: a missing gate row logs and returns null
 * (overrides can arrive for legacy rows that predate evidence persistence).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} opts
 * @param {string} opts.ventureId
 * @param {number} opts.stageNumber
 * @param {string} opts.gateType - DB-level gate type ('entry'|'exit'|'kill')
 * @param {{decision_id:string, decided_by?:string, rationale?:string, at?:string}} opts.override
 * @returns {Promise<string|null>} gate row id, or null when no row matched
 */
export async function recordGateOverride(supabase, opts) {
  const { ventureId, stageNumber, gateType, override } = opts;
  if (!override?.decision_id) {
    throw new Error('[artifact-persistence-service] recordGateOverride requires override.decision_id');
  }

  const { data: existing, error: readErr } = await supabase
    .from('eva_stage_gate_results')
    .select('id, gate_criteria')
    .eq('venture_id', ventureId)
    .eq('stage_number', stageNumber)
    .eq('gate_type', gateType)
    .maybeSingle();

  if (readErr || !existing) {
    console.warn(`[artifact-persistence-service] recordGateOverride: no gate row for ${ventureId} S${stageNumber}/${gateType}${readErr ? ` (${readErr.message})` : ''}`);
    return null;
  }

  const merged = { ...(existing.gate_criteria || {}), override };
  const { error: updErr } = await supabase
    .from('eva_stage_gate_results')
    .update({ gate_criteria: merged })
    .eq('id', existing.id);

  if (updErr) {
    throw new Error(`[artifact-persistence-service] recordGateOverride failed: ${updErr.message}`);
  }
  return existing.id;
}

/**
 * Advance a venture to the next stage via fn_advance_venture_stage RPC.
 * Wraps the RPC call with structured error handling.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} opts
 * @param {string} opts.ventureId - Venture UUID
 * @param {number} opts.fromStage - Current stage
 * @param {number} opts.toStage - Target stage
 * @param {Object} opts.handoffData - JSONB handoff payload
 * @param {string|null} [opts.idempotencyKey] - Idempotency key
 * @returns {Promise<{success: boolean, wasDuplicate: boolean, result: Object}>}
 */
/**
 * SD-LEO-FIX-MAKE-VENTURE-STAGE-001: gate-debt check for the binding advance path.
 *
 * Reads the (latest — the table upserts per (venture, stage, gate_type)) gate
 * evaluations for the stage being exited, classifies each via the enforcement
 * registry, and reports whether any BLOCKING gate is failed AND unresolved
 * (no approved chairman_decisions row for the venture+stage — an approved row of
 * ANY decision value, incl. 'override', resolves the debt: it is the auditable
 * record of the chairman's call).
 *
 * Error semantics: fail-OPEN with a loud audit-write-guard log on query errors
 * (transient DB blips must not strand the pipeline); fail-CLOSED only on
 * confirmed failed blocking gates.
 *
 * @param {object} supabase
 * @param {{ventureId: string, fromStage: number}} params
 * @returns {Promise<{blocked: boolean, failedGates: Array<object>}>}
 */
export async function checkGateDebt(supabase, { ventureId, fromStage }) {
  try {
    const { data: gateRows, error: gateErr } = await supabase
      .from('eva_stage_gate_results')
      .select('gate_type, passed, overall_score, notes')
      .eq('venture_id', ventureId)
      .eq('stage_number', fromStage);
    if (gateErr) throw gateErr;

    const failedBlocking = (gateRows || []).filter(
      (r) => r.passed === false && classifyGateRow(r) === 'blocking'
    );
    if (failedBlocking.length === 0) return { blocked: false, failedGates: [] };

    // Failed blocking gate(s) exist — resolved only by an approved chairman decision
    // for this venture+stage (decision='override' is the deliberate-forcing record).
    const { data: decisions, error: decErr } = await supabase
      .from('chairman_decisions')
      .select('id, decision, status')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', fromStage)
      .eq('status', 'approved')
      .limit(1);
    if (decErr) throw decErr;

    if (decisions && decisions.length > 0) return { blocked: false, failedGates: [] };
    return { blocked: true, failedGates: failedBlocking };
  } catch (err) {
    // Fail-open on uncertainty — but LOUDLY (the phantom-column class taught us
    // silent catches hide real failures for months).
    try {
      const { logAuditWriteFailure } = await import('../audit-write-guard.js');
      logAuditWriteFailure('artifact-persistence.checkGateDebt', err, { ventureId, fromStage });
    } catch { /* guard must never break the advance path */ }
    return { blocked: false, failedGates: [], error: err?.message };
  }
}

/**
 * SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A (FR-3): liveness-only emergency un-block for a
 * stuck high-consequence gate. Built on the SAME chairman_decisions audit substrate as
 * recordGateOverride()/checkGateDebt() above -- deliberately NOT a parallel mechanism.
 *
 * Per SEC-COORD-1 (security-agent, EXEC-TO-PLAN parent review, CONDITIONAL_PASS carried into
 * this child's PRD): this is a NON-RESOLVING action. It re-opens/un-sticks a stuck PENDING
 * decision -- retains blocking=true, writes a distinct audit marker -- and must NEVER write an
 * approving `decision` value and must NEVER itself invoke any stage-advance RPC. This matters
 * because checkGateDebt() (above) and the high-consequence chokepoints treat ANY row that
 * transitions to an approved/decided state as resolving the block -- if this function ever
 * produced one, it would silently function as a one-click bypass of chairman authority over a
 * high-consequence stage, defeating the entire point of the mechanism.
 *
 * For an IRREVERSIBLE gate (venture_stages.is_irreversible=true at the decision's
 * lifecycle_stage -- decoupled from is_high_consequence; Stage-24-class Go-Live is the
 * canonical example), this function still performs the liveness re-open (a stuck irreversible
 * gate must remain unstickable, e.g. if the SMS bridge or chairman channel is down for days) but
 * additionally returns requiresManualConfirmation:true. There is NO single-call path from this
 * function to an actual advance -- until Child C's WebAuthn step-up console exists, advancing an
 * irreversible gate requires a SEPARATE, out-of-band, manually-confirmed chairman console action
 * with its own distinct audit marker. This function only unsticks; it never approves.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} decisionId - chairman_decisions.id to re-open
 * @param {{actorId?: string, reason?: string}} [actorContext] - who/why, folded into the audit marker
 * @returns {Promise<{ok: boolean, error?: string, decisionId?: string, isIrreversible?: boolean, requiresManualConfirmation?: boolean}>}
 */
export async function emergencyUnblockGate(supabase, decisionId, actorContext = {}) {
  if (!decisionId) {
    throw new Error('[artifact-persistence-service] emergencyUnblockGate requires decisionId');
  }

  const { data: decision, error: readErr } = await supabase
    .from('chairman_decisions')
    .select('id, venture_id, lifecycle_stage, status, blocking, decision')
    .eq('id', decisionId)
    .maybeSingle();

  if (readErr || !decision) {
    return { ok: false, error: 'decision_not_found', decisionId };
  }

  // Precondition: must currently be a stuck, blocking, pending decision. Refuse on anything
  // else (non-blocking row, or one already approved/rejected/overridden) -- this function exists
  // to unstick a HOLD, not to touch a decision that was never blocking or has already been
  // resolved one way or another.
  if (decision.status !== 'pending' || decision.blocking !== true) {
    return {
      ok: false,
      error: 'not_blocking_or_already_decided',
      decisionId,
      status: decision.status,
      blocking: decision.blocking,
    };
  }

  // FR-3: irreversibility is a signal independent of is_high_consequence -- read it fresh,
  // scoped to THIS decision's stage. Fail-open to false (not irreversible) on a read error so a
  // transient DB blip cannot itself block the liveness re-open below (the re-open must remain
  // available precisely when infrastructure is flaky) -- the requiresManualConfirmation flag is
  // advisory to the caller, not the mechanism that prevents auto-advance (that guarantee comes
  // from this function never calling an advance RPC at all, unconditionally).
  let isIrreversible = false;
  try {
    const { data: stageRow, error: stageErr } = await supabase
      .from('venture_stages')
      .select('is_irreversible')
      .eq('stage_number', decision.lifecycle_stage)
      .maybeSingle();
    if (stageErr) throw stageErr;
    isIrreversible = stageRow?.is_irreversible === true;
  } catch (e) {
    console.warn(`[artifact-persistence-service] emergencyUnblockGate: is_irreversible lookup failed for stage ${decision.lifecycle_stage}, defaulting to false: ${e.message}`);
  }

  // Idempotent: re-asserts pending/blocking/decision='pending' even if this decision was already
  // exactly in that state (e.g. a second emergency-unblock call before the chairman acts) --
  // calling this twice in a row on the same still-pending row produces the same successful,
  // non-approving result both times.
  const marker = 'EMERGENCY_UNBLOCK: liveness re-open, not an approval';
  const { error: updErr } = await supabase
    .from('chairman_decisions')
    .update({
      status: 'pending',
      blocking: true,
      decision: 'pending',
      // Distinct marker (TR-3 audit parity) -- distinguishable from a normal chairman decision
      // or an override. Deliberately does NOT touch decision_type (used elsewhere as a lookup/
      // matching key by createOrReusePendingDecision) -- approval_type is the free-form audit
      // slot for "what kind of action touched this row last".
      approval_type: 'emergency_liveness_unblock',
      override_reason: actorContext.reason ? `${marker} (${actorContext.reason})` : marker,
    })
    .eq('id', decisionId);

  if (updErr) {
    throw new Error(`[artifact-persistence-service] emergencyUnblockGate failed: ${updErr.message}`);
  }

  return {
    ok: true,
    decisionId,
    isIrreversible,
    // Never a signal to auto-advance -- for an irreversible gate, the caller MUST route to a
    // separate, manually-confirmed chairman console action; this function has no code path that
    // itself calls fn_advance_venture_stage or any equivalent RPC, irreversible or not.
    requiresManualConfirmation: isIrreversible,
  };
}

export async function advanceStage(supabase, opts) {
  const {
    ventureId,
    fromStage,
    toStage,
    handoffData,
    idempotencyKey = null,
  } = opts;

  // SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A PA-2: gate the RPC on declared
  // exit-gates. checkExitGates reads lifecycle_stage_config.metadata.gates.exit
  // for fromStage and runs each declared verifier against runtime DB state.
  // Includes verifyVentureResourceUrlsPopulated (now ventures-only after the
  // PA-2 verifier fix) which blocks Stage 18 -> 19 advance when the venture
  // lacks repo_url + deployment_url. Feature-flagged via
  // LEO_S19_EXIT_GATE_ENFORCER (default ON).
  const gateResult = await checkExitGates({ supabase, ventureId, fromStage });
  if (!gateResult.allowed) {
    throw new Error(
      '[artifact-persistence-service] advanceStage blocked by exit-gate enforcer. ' +
      `Venture: ${ventureId}, From: ${fromStage}, To: ${toStage}. ` +
      `Blocked by: ${gateResult.blocked_by.join('; ')}. ` +
      `Gates checked: [${gateResult.gates_checked.join(', ')}].`
    );
  }

  // SD-LEO-INFRA-KILL-GATE-TIER-001: Tier-B per-venture thesis-kill seam. Evaluates armed
  // kill_criteria (ventures.metadata.kill_criteria) whose stage_by is at/before toStage.
  // Ships OBSERVE-ONLY by default (LEO_THESIS_KILL_GATE unset/=observe): a FIRED criterion is
  // logged + surfaced as a chairman decision but never blocks here. KNOWN COVERAGE GAP
  // (documented, not silent — prospective testing-agent review 2026-07-11): this is the
  // primary general-advance call path, but NOT the only one — the direct-RPC chairman-
  // approval path (chairman-decision-watcher / review-gate-mint / chairman-product-review)
  // and handoff-operations.js's approveHandoff (which runs stage-gates.js's validateStageGate
  // instead) do not route through advanceStage() and are NOT covered by this wiring. Tracked
  // as a follow-on scope item, not assumed closed.
  const thesisKillResult = await checkThesisKillGate({ supabase, ventureId, fromStage, toStage });
  if (!thesisKillResult.allowed) {
    throw new Error(
      '[artifact-persistence-service] advanceStage blocked by thesis-kill gate (Tier-B). ' +
      `Venture: ${ventureId}, From: ${fromStage}, To: ${toStage}. ` +
      `Blocked by: ${thesisKillResult.blocked_by.join('; ')}. ` +
      'Override via: node scripts/eva-decisions.js approve <decisionId> --override-kill --override-reason "<reason>".'
    );
  }

  // SD-LEO-FIX-MAKE-VENTURE-STAGE-001: BINDING gate-debt check. The gate system
  // evaluated and logged (1,102 eva_stage_gate_results rows) but a FAILED verdict
  // never had consequence — DataDistill failed 10 gates and advanced anyway. From
  // here, a failed BLOCKING evaluation (per lib/eva/gate-enforcement.js) blocks the
  // RPC until the gate re-evaluates green OR an approved chairman_decisions row
  // exists for this venture+stage (incl. decision='override' — the one-step,
  // auditable recording of deliberate chairman build-out forcing; chairman context
  // 2026-06-10). Each (venture, stage, gate_type) row IS the latest evaluation
  // (recordGateResult upserts on that key). Fail-CLOSED on confirmed failed
  // blocking gates; fail-OPEN (loudly) on query errors — a transient DB blip must
  // not strand every venture in the pipeline.
  const debt = await checkGateDebt(supabase, { ventureId, fromStage });
  if (debt.blocked) {
    const gateList = debt.failedGates
      .map((g) => `${g.gate_type}(score=${g.overall_score ?? 'n/a'})`)
      .join(', ');
    const err = new Error(
      '[artifact-persistence-service] advanceStage blocked by failed stage gate(s). ' +
      `Venture: ${ventureId}, Stage: ${fromStage}. Failed blocking gates: [${gateList}]. ` +
      'Remediation: re-run the stage so the gate re-evaluates green, OR record a chairman ' +
      "override (INSERT chairman_decisions row: venture_id, lifecycle_stage, decision='override', " +
      "status='approved', override_reason='<why>') to advance with an auditable forcing record."
    );
    err.code = 'GATE_BLOCKED';
    err.failedGates = debt.failedGates;
    throw err;
  }

  const rpcParams = {
    p_venture_id: ventureId,
    p_from_stage: fromStage,
    p_to_stage: toStage,
    p_handoff_data: handoffData,
  };

  if (idempotencyKey) {
    rpcParams.p_idempotency_key = idempotencyKey;
  }

  const { data: result, error } = await supabase.rpc('fn_advance_venture_stage', rpcParams);

  if (error) {
    throw new Error(
      `[artifact-persistence-service] advanceStage failed: ${error.message}. ` +
      `Venture: ${ventureId}, From: ${fromStage}, To: ${toStage}. ` +
      'Gateway fn_advance_venture_stage() is required for audit trail compliance.'
    );
  }

  // Check RPC-level success (EXCEPTION WHEN OTHERS returns {success:false} as HTTP 200)
  if (result && result.success === false) {
    // SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001: this RPC choke point (23->24) blocks correctly,
    // but being plpgsql it cannot itself mint the chairman decision or send the review email —
    // so a manual-advance/clone-run venture that never also passes through the daemon walk's
    // _advanceStage() would be blocked with nobody ever having asked the chairman. Ensure the ask
    // has been made. Idempotent (see chairman-product-review.js); never masks the original block.
    if (result.error === 'product_review_required') {
      try {
        const { requestProductReview } = await import('./chairman-product-review.js');
        await requestProductReview(supabase, ventureId);
      } catch (askError) {
        console.warn(`[artifact-persistence-service] requestProductReview failed (non-fatal): ${askError.message}`);
      }
    }
    throw new Error(
      `[artifact-persistence-service] advanceStage RPC returned failure: ${result.error}. ` +
      `Venture: ${ventureId}, From: ${fromStage}, To: ${toStage}.`
    );
  }

  // SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-001 FR-A: rewire post-advance reset.
  // The RPC bumps ventures.current_lifecycle_stage but historically left the
  // worker-visible state stuck (orchestrator_state='blocked' from a prior run,
  // and a venture_stage_work row in the impossible-state pattern
  // stage_status='in_progress' + completed_at NOT NULL). _pollForWork at
  // lib/eva/stage-execution-worker.js:456-476 filters on orchestrator_state='idle',
  // so without (b) below the worker silently ignores the venture even though
  // the RPC succeeded. Three-layer reset; idempotent; errors are non-fatal
  // (reset failure must NOT undo a successful stage advance).
  const resetSummary = await resetStaleStageWork(supabase, { ventureId, toStage });

  return {
    success: true,
    wasDuplicate: result?.was_duplicate === true,
    result,
    reset: resetSummary,
  };
}

/**
 * Reset stale state that blocks the Stage Execution Worker after a successful
 * stage advance. Three layers, all idempotent:
 *   (a) venture_stage_work: reset the row for `toStage` to runnable state IFF
 *       it is in the impossible-state pattern (stage_status='in_progress' AND
 *       completed_at IS NOT NULL). Fresh in-progress rows are NEVER touched.
 *   (b) ventures.orchestrator_state: force to 'idle' IFF current state is
 *       'blocked' or 'failed'. Never trample 'processing' (a legitimate
 *       in-flight worker run).
 *   (c) ventures.orchestrator_lock_id: clear IFF non-null (releases stale lock).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} opts
 * @param {string} opts.ventureId
 * @param {number} opts.toStage
 * @returns {Promise<{stage_work_reset: boolean, orchestrator_state_reset: boolean, lock_cleared: boolean, errors: string[]}>}
 */
export async function resetStaleStageWork(supabase, { ventureId, toStage }) {
  const summary = { stage_work_reset: false, orchestrator_state_reset: false, lock_cleared: false, errors: [] };
  if (!supabase || !ventureId || typeof toStage !== 'number') {
    summary.errors.push('resetStaleStageWork: missing supabase/ventureId/toStage');
    return summary;
  }

  // (a) venture_stage_work — reset only if impossible-state
  try {
    const { data: row } = await supabase
      .from('venture_stage_work')
      .select('id, stage_status, completed_at')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', toStage)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (row && row.stage_status === 'in_progress' && row.completed_at != null) {
      const { error } = await supabase
        .from('venture_stage_work')
        .update({
          stage_status: 'not_started',
          completed_at: null,
          health_score: null,
          started_at: null,
          advisory_data: null,
        })
        .eq('id', row.id);
      if (error) summary.errors.push(`stage_work_reset: ${error.message}`);
      else summary.stage_work_reset = true;
    }
  } catch (err) {
    summary.errors.push(`stage_work_reset_check: ${err.message}`);
  }

  // (b) ventures.orchestrator_state — only reset stuck states; (c) lock_id alongside
  try {
    const { data: v } = await supabase
      .from('ventures')
      .select('orchestrator_state, orchestrator_lock_id')
      .eq('id', ventureId)
      .maybeSingle();
    if (v) {
      const stuck = v.orchestrator_state === 'blocked' || v.orchestrator_state === 'failed';
      const update = {};
      if (stuck) update.orchestrator_state = 'idle';
      if (v.orchestrator_lock_id != null) update.orchestrator_lock_id = null;
      if (Object.keys(update).length > 0) {
        const { error } = await supabase.from('ventures').update(update).eq('id', ventureId);
        if (error) summary.errors.push(`venture_reset: ${error.message}`);
        else {
          if (stuck) summary.orchestrator_state_reset = true;
          if (v.orchestrator_lock_id != null) summary.lock_cleared = true;
        }
      }
    }
  } catch (err) {
    summary.errors.push(`venture_reset_check: ${err.message}`);
  }

  return summary;
}

// ── Internal Helpers ──

function tryParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return { raw: str };
  }
}

/**
 * Derive TEXT content from artifactData, ensuring non-NULL result.
 * Handles edge cases: undefined, null, empty objects, circular refs.
 * @param {*} artifactData
 * @returns {string|null}
 */
function deriveContent(artifactData) {
  if (artifactData === null || artifactData === undefined) return null;
  try {
    const str = typeof artifactData === 'string' ? artifactData : JSON.stringify(artifactData);
    return str || '';
  } catch {
    // Circular reference or non-serializable — return type description
    return `[non-serializable ${typeof artifactData}]`;
  }
}

// ── EVA Eager Synthesis ──

// SD-LEO-INFRA-REAL-VENTURE-VISION-ENRICH-UNDERPRODUCTION-S19-001-A: a standard section counts as
// "substantive" once it clears the SAME 50-char floor trg_auto_validate_vision_quality uses to flag
// stub sections (database/migrations/20260314_quality_validation_vision_docs.sql) — reusing the
// gate's own threshold keeps this merge and that trigger's section_coverage count in agreement.
const SUBSTANTIVE_SECTION_MIN_CHARS = 50;

/**
 * Merge freshly-synthesized sections into the existing sections JSONB, additively. An existing
 * key with a substantive (>=50 char) value is NEVER overwritten — eager-synthesis re-fires on every
 * artifact write and previously produced only ~3/10 standard keys from a sparse source, so a naive
 * wholesale replace clobbers any section a prior repair pass (or a richer artifact set) had filled
 * in. A missing or stub (<50 char) key IS replaced/filled from the new synthesis, so coverage still
 * improves over time — this only prevents regression, it doesn't cap growth.
 *
 * @param {Record<string, string>|null} existingSections
 * @param {Record<string, string>|null} newSections
 * @returns {Record<string, string>|null}
 */
export function mergeVisionSections(existingSections, newSections) {
  const existing = existingSections && typeof existingSections === 'object' ? existingSections : {};
  const incoming = newSections && typeof newSections === 'object' ? newSections : {};
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    const existingValue = existing[key];
    const existingIsSubstantive = typeof existingValue === 'string' && existingValue.length >= SUBSTANTIVE_SECTION_MIN_CHARS;
    if (!existingIsSubstantive) {
      merged[key] = value;
    }
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

/**
 * Upsert eva_vision_documents by synthesizing content from all linked artifacts.
 * Fetches all current artifacts with matching supports_vision_key, synthesizes
 * structured content, and upserts the vision record (incrementing version).
 */
// Exported for unit testing (SD-LEO-INFRA-EAGER-SYNTHESIS-VISION-DIMS-EXTRACT-001); still invoked
// internally by the artifact-write path.
export async function upsertEvaVisionFromArtifacts(supabase, visionKey, ventureId, triggerStage) {
  const { data: artifacts } = await supabase
    .from('venture_artifacts')
    .select('lifecycle_stage, artifact_type, content, quality_score')
    .eq('supports_vision_key', visionKey)
    .eq('is_current', true)
    .order('lifecycle_stage', { ascending: true });

  if (!artifacts?.length) return;

  const synthesized = synthesizeFromArtifacts(artifacts, 'vision');

  const { data: existing } = await supabase
    .from('eva_vision_documents')
    .select('id, version, addendums, extracted_dimensions, status, chairman_approved, sections')
    .eq('vision_key', visionKey)
    .single();

  // SD-LEO-INFRA-S19-HELD-STATE-NOT-IDEMPOTENT-CLOBBER-001: IDEMPOTENCY guard. A venture HELD at S19
  // (hold-until-build-complete) re-fires this synthesis on EVERY poll tick. Re-synthesizing an
  // already-ACTIVE+APPROVED L2 vision re-parses the sparse source artifacts back to ~3/10 sections and
  // UPDATEs content/sections — trg_auto_validate_vision_quality then recomputes quality_checked=false
  // (the row stays active but degrades 10/10 -> 3/10 every tick; a repaired vision is clobbered). Once
  // the vision is active+chairman_approved it is FROZEN: skip the re-synthesis write entirely (do NOT
  // even append an addendum — the held-state ticks would grow it unbounded). Any pre-active shape
  // (draft/draft_seed) still synthesizes/updates normally, so the going-forward path is unchanged.
  if (existing && existing.status === 'active' && existing.chairman_approved === true) {
    return;
  }
  // FR-2 decision record (SD-LEO-INFRA-REAL-VENTURE-VISION-ENRICH-UNDERPRODUCTION-S19-001-A): this
  // freeze is intentionally LEFT AS-IS rather than widened to also cover a repaired-but-unpromoted
  // (quality_checked=true, still draft) vision. FR-1's mergeVisionSections makes the write below
  // additive, so a repair-then-resynthesize on a not-yet-promoted vision is now a safe no-op on
  // every already-substantive section regardless of freeze state — widening the freeze would be
  // redundant defense, not a required fix. The freeze's actual job (skip active+approved ticks
  // entirely, including the addendum-growth avoidance) is unrelated to the clobber race and stays.

  // SD-LEO-INFRA-EAGER-SYNTHESIS-VISION-DIMS-EXTRACT-001: populate sections (deterministic, always)
  // and extracted_dimensions (LLM, extract-once + fail-soft) so the vision passes the active-rich
  // CHECK on promotion. synthesizeFromArtifacts already emits ## headings → parseMarkdownToSections.
  let sections = null;
  try {
    sections = parseMarkdownToSections(synthesized, buildDefaultMapping());
  } catch (sErr) {
    console.warn(`[artifact-persistence-service] section parse failed (${visionKey}): ${sErr.message}`);
  }
  // Extract dimensions at most ONCE per vision: on insert (no existing), or on update only when the
  // existing row still lacks them. Fail-soft: a null/failed extraction never blocks the content write.
  const existingHasDims = Array.isArray(existing?.extracted_dimensions) && existing.extracted_dimensions.length > 0;
  let extractedDimensions = null;
  if (!existingHasDims) {
    try {
      extractedDimensions = await extractDimensions(synthesized);
    } catch (dErr) {
      console.warn(`[artifact-persistence-service] dimension extraction failed (${visionKey}): ${dErr.message}`);
      extractedDimensions = null;
    }
  }

  // SD-LEO-FIX-FIX-PHANTOM-COLUMN-002: eva_vision_documents has NO metadata column —
  // the addendums entries already carry evidence_count/stage_number for HEAL traceability.
  // The phantom metadata key made every one of these writes fail silently (whole row lost).
  if (existing) {
    const newVersion = (existing.version || 1) + 1;
    const addendums = existing.addendums || [];
    addendums.push({
      stage_number: triggerStage,
      artifact_count: artifacts.length,
      evidence_count: artifacts.length,
      timestamp: new Date().toISOString(),
    });
    // FR-1 (SD-LEO-INFRA-REAL-VENTURE-VISION-ENRICH-UNDERPRODUCTION-S19-001-A): merge, don't
    // overwrite. A raw `sections` replace clobbers any standard key a prior repair/richer artifact
    // pass had already filled — mergeVisionSections keeps every existing substantive (>=50 char)
    // section and only fills genuinely missing/stub ones from this tick's synthesis.
    const mergedSections = sections ? mergeVisionSections(existing.sections, sections) : existing.sections;
    const { error: updateError } = await supabase.from('eva_vision_documents').update({
      content: synthesized,
      version: newVersion,
      addendums,
      ...(mergedSections ? { sections: mergedSections } : {}),
      // Only write dims when we newly extracted them (existing lacked them); never clobber with null.
      ...(extractedDimensions ? { extracted_dimensions: extractedDimensions } : {}),
      updated_at: new Date().toISOString(),
    }).eq('vision_key', visionKey);
    if (updateError) console.warn(`[artifact-persistence-service] eva_vision_documents update failed (${visionKey}): ${updateError.message}`);
  } else {
    const { error: insertError } = await supabase.from('eva_vision_documents').insert({
      vision_key: visionKey,
      level: 'L2',
      venture_id: ventureId,
      content: synthesized,
      version: 1,
      status: 'draft',
      created_by: 'eager-synthesis',
      ...(sections ? { sections } : {}),
      ...(extractedDimensions ? { extracted_dimensions: extractedDimensions } : {}),
      addendums: [{ stage_number: triggerStage, artifact_count: artifacts.length, evidence_count: artifacts.length, timestamp: new Date().toISOString() }],
    });
    if (insertError) console.warn(`[artifact-persistence-service] eva_vision_documents insert failed (${visionKey}): ${insertError.message}`);
  }
}

/**
 * Upsert eva_architecture_plans by synthesizing content from all linked artifacts.
 */
async function upsertEvaArchFromArtifacts(supabase, planKey, ventureId, triggerStage) {
  const { data: artifacts } = await supabase
    .from('venture_artifacts')
    .select('lifecycle_stage, artifact_type, content, quality_score')
    .eq('supports_plan_key', planKey)
    .eq('is_current', true)
    .order('lifecycle_stage', { ascending: true });

  if (!artifacts?.length) return;

  const synthesized = synthesizeFromArtifacts(artifacts, 'architecture');

  const { data: existing } = await supabase
    .from('eva_architecture_plans')
    .select('id, version, addendums')
    .eq('plan_key', planKey)
    .single();

  // SD-LEO-FIX-FIX-PHANTOM-COLUMN-002: eva_architecture_plans has NO metadata column —
  // the addendums entries already carry evidence_count/stage_number for HEAL traceability.
  // The phantom metadata key made every one of these writes fail silently (whole row lost).
  if (existing) {
    const newVersion = (existing.version || 1) + 1;
    const addendums = existing.addendums || [];
    addendums.push({
      stage_number: triggerStage,
      artifact_count: artifacts.length,
      evidence_count: artifacts.length,
      timestamp: new Date().toISOString(),
    });
    const { error: updateError } = await supabase.from('eva_architecture_plans').update({
      content: synthesized,
      version: newVersion,
      addendums,
      updated_at: new Date().toISOString(),
    }).eq('plan_key', planKey);
    if (updateError) console.warn(`[artifact-persistence-service] eva_architecture_plans update failed (${planKey}): ${updateError.message}`);
  } else {
    // SD-LEO-INFRA-S15-WIREFRAME-LLM-UNPARSEABLE-001 FR-4: eva_architecture_plans.vision_id is NOT NULL
    // (FK -> eva_vision_documents.id). This eager-synthesis INSERT previously OMITTED vision_id, so it
    // failed silently (insertError swallowed) for EVERY venture, and for a vision=none clone there is no
    // vision document at all (ARCH-MARKETLENS-001). Resolve the venture's current vision document; when
    // none exists (vision=none), SKIP arch-plan synthesis rather than attempt a NOT NULL-violating insert.
    let visionId = null;
    try {
      const { data: vdoc } = await supabase
        .from('eva_vision_documents')
        .select('id')
        .eq('venture_id', ventureId)
        .order('version', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      visionId = vdoc?.id || null;
    } catch { /* fall through to skip */ }
    if (!visionId) {
      console.warn(`[artifact-persistence-service] eva_architecture_plans insert skipped (${planKey}): no vision document for venture ${ventureId} (vision=none) — arch-plan synthesis requires a vision (FR-4).`);
      return;
    }
    const { error: insertError } = await supabase.from('eva_architecture_plans').insert({
      plan_key: planKey,
      vision_id: visionId,
      venture_id: ventureId,
      content: synthesized,
      version: 1,
      status: 'draft',
      created_by: 'eager-synthesis',
      addendums: [{ stage_number: triggerStage, artifact_count: artifacts.length, evidence_count: artifacts.length, timestamp: new Date().toISOString() }],
    });
    if (insertError) console.warn(`[artifact-persistence-service] eva_architecture_plans insert failed (${planKey}): ${insertError.message}`);
  }
}

/**
 * Deterministic synthesis: compose structured content from venture artifacts.
 * Routes content into sections based on artifact_type. No LLM call.
 * @param {Array} artifacts - Sorted by lifecycle_stage
 * @param {'vision'|'architecture'} docType
 * @returns {string} Synthesized markdown content
 */
export function synthesizeFromArtifacts(artifacts, docType) {
  const VISION_SECTIONS = {
    truth_idea_brief: 'Problem Statement & Initial Vision',
    truth_ai_critique: 'Multi-Agent Critique',
    truth_validation_decision: 'Validation Assessment',
    truth_competitive_analysis: 'Competitive Landscape',
    truth_financial_model: 'Financial Model & Unit Economics',
    engine_risk_matrix: 'Risk Assessment',
    engine_pricing_model: 'Revenue Architecture',
    engine_business_model_canvas: 'Business Model',
    engine_exit_strategy: 'Exit Strategy',
    identity_persona_brand: 'Customer Personas & Brand',
    identity_naming_visual: 'Visual Identity',
    identity_gtm_sales_strategy: 'Go-to-Market Strategy',
    blueprint_product_roadmap: 'Product Roadmap',
  };

  const ARCH_SECTIONS = {
    blueprint_technical_architecture: 'Technical Architecture',
    blueprint_api_contract: 'API Contracts',
    blueprint_schema_spec: 'Schema Specification',
    blueprint_data_model: 'Data Model',
    blueprint_erd_diagram: 'Entity-Relationship Diagram',
    blueprint_wireframes: 'Wireframes & UI Structure',
    blueprint_user_story_pack: 'User Stories',
    blueprint_risk_register: 'Risk Register',
    blueprint_product_roadmap: 'Product Roadmap Context',
  };

  const sectionMap = docType === 'vision' ? VISION_SECTIONS : ARCH_SECTIONS;
  const title = docType === 'vision' ? 'Vision Document' : 'Architecture Plan';
  const sections = [];

  for (const artifact of artifacts) {
    const heading = sectionMap[artifact.artifact_type] || `Stage ${artifact.lifecycle_stage}: ${artifact.artifact_type}`;
    const body = typeof artifact.content === 'string'
      ? artifact.content.substring(0, 5000)
      : JSON.stringify(artifact.content)?.substring(0, 5000) || '';
    if (body.trim()) {
      sections.push(`## ${heading}\n\n${body}`);
    }
  }

  return `# ${title} (Auto-Synthesized)\n\n*Synthesized from ${artifacts.length} artifacts across stages ${artifacts[0]?.lifecycle_stage}-${artifacts[artifacts.length - 1]?.lifecycle_stage}*\n\n${sections.join('\n\n---\n\n')}`;
}

function deriveEpistemicClassification(payload) {
  const fb = payload?.fourBuckets;
  if (!fb?.classifications?.length) return null;

  const s = fb.summary || {};
  const bucketCounts = [
    ['fact', s.facts || 0],
    ['assumption', s.assumptions || 0],
    ['simulation', s.simulations || 0],
    ['unknown', s.unknowns || 0],
  ];
  bucketCounts.sort((a, b) => b[1] - a[1]);
  return bucketCounts[0][0];
}
