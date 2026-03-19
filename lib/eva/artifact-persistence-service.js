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

/**
 * Write a venture artifact with dual-write (content TEXT + artifact_data JSONB).
 * Handles is_current deduplication: marks prior rows is_current=false before insert.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} opts
 * @param {string} opts.ventureId - Venture UUID
 * @param {number} opts.lifecycleStage - Stage number (1-25)
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
  } = opts;

  // Dedup: mark prior is_current=true rows as false (skipped in batch mode)
  if (isCurrent && !skipDedup) {
    await supabase
      .from('venture_artifacts')
      .update({ is_current: false })
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', lifecycleStage)
      .eq('is_current', true);
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

  let { data, error } = await supabase
    .from('venture_artifacts')
    .insert(row)
    .select('id')
    .single();

  // Graceful degradation: retry without epistemic columns if they cause constraint violation
  if (error && row.epistemic_classification) {
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
 * @returns {Promise<string[]>} Array of inserted artifact IDs
 */
export async function writeArtifactBatch(supabase, ventureId, lifecycleStage, artifacts, idempotencyKey = null) {
  // Dedup: mark all prior is_current rows for this stage as false (once for entire batch)
  await supabase
    .from('venture_artifacts')
    .update({ is_current: false })
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', lifecycleStage)
    .eq('is_current', true);

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
  } = opts;

  const row = {
    venture_id: ventureId,
    stage_number: stageNumber,
    gate_type: gateType,
    passed,
  };

  if (score !== null) row.score = score;
  if (reasoning) row.reasoning = reasoning;
  if (metadata) row.metadata = metadata;

  const { data, error } = await supabase
    .from('eva_stage_gate_results')
    .upsert(row, { onConflict: 'venture_id,stage_number,gate_type' })
    .select('id')
    .single();

  if (error) {
    throw new Error(`[artifact-persistence-service] recordGateResult failed: ${error.message}`);
  }

  return data.id;
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
export async function advanceStage(supabase, opts) {
  const {
    ventureId,
    fromStage,
    toStage,
    handoffData,
    idempotencyKey = null,
  } = opts;

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

  return {
    success: true,
    wasDuplicate: result?.was_duplicate === true,
    result,
  };
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
