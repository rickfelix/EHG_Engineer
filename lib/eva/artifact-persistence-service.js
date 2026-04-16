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
  if (isCurrent && !skipDedup) {
    const { data: existing } = await supabase
      .from('venture_artifacts')
      .select('id')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', lifecycleStage)
      .eq('artifact_type', artifactType)
      .eq('is_current', true)
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

  // Handle unique constraint violation from idx_unique_current_artifact
  if (error && /unique|duplicate|idx_unique_current_artifact/i.test(error.message)) {
    console.info(`[artifact-persistence] Unique constraint hit — falling back to UPDATE for ${artifactType} at S${lifecycleStage}`);
    const { data: existing } = await supabase
      .from('venture_artifacts')
      .select('id')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', lifecycleStage)
      .eq('artifact_type', artifactType)
      .eq('is_current', true)
      .limit(1)
      .maybeSingle();
    if (existing) {
      await supabase.from('venture_artifacts').update({
        title: row.title, artifact_data: row.artifact_data, content: row.content,
        source: row.source, quality_score: row.quality_score,
        validation_status: row.validation_status, updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
      return existing.id;
    }
    // If we still can't find it, re-throw
    error = null;
    data = null;
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
  };

  if (score !== null) row.overall_score = score;
  if (reasoning || metadata) row.notes = reasoning || (typeof metadata === 'string' ? metadata : JSON.stringify(metadata));

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

  // Check RPC-level success (EXCEPTION WHEN OTHERS returns {success:false} as HTTP 200)
  if (result && result.success === false) {
    throw new Error(
      `[artifact-persistence-service] advanceStage RPC returned failure: ${result.error}. ` +
      `Venture: ${ventureId}, From: ${fromStage}, To: ${toStage}.`
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

// ── EVA Eager Synthesis ──

/**
 * Upsert eva_vision_documents by synthesizing content from all linked artifacts.
 * Fetches all current artifacts with matching supports_vision_key, synthesizes
 * structured content, and upserts the vision record (incrementing version).
 */
async function upsertEvaVisionFromArtifacts(supabase, visionKey, ventureId, triggerStage) {
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
    .select('id, version, addendums')
    .eq('vision_key', visionKey)
    .single();

  // SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001-B: Pre-compute evidence_count for HEAL traceability scoring
  const evidenceMetadata = { evidence_count: artifacts.length, last_evidence_stage: triggerStage };

  if (existing) {
    const newVersion = (existing.version || 1) + 1;
    const addendums = existing.addendums || [];
    addendums.push({
      stage_number: triggerStage,
      artifact_count: artifacts.length,
      evidence_count: artifacts.length,
      timestamp: new Date().toISOString(),
    });
    await supabase.from('eva_vision_documents').update({
      content: synthesized,
      version: newVersion,
      addendums,
      metadata: evidenceMetadata,
      updated_at: new Date().toISOString(),
    }).eq('vision_key', visionKey);
  } else {
    await supabase.from('eva_vision_documents').insert({
      vision_key: visionKey,
      level: 'L2',
      venture_id: ventureId,
      content: synthesized,
      version: 1,
      status: 'draft',
      created_by: 'eager-synthesis',
      metadata: evidenceMetadata,
      addendums: [{ stage_number: triggerStage, artifact_count: artifacts.length, evidence_count: artifacts.length, timestamp: new Date().toISOString() }],
    });
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

  // SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001-B: Pre-compute evidence_count for HEAL traceability scoring
  const evidenceMetadata = { evidence_count: artifacts.length, last_evidence_stage: triggerStage };

  const { data: existing } = await supabase
    .from('eva_architecture_plans')
    .select('id, version, addendums')
    .eq('plan_key', planKey)
    .single();

  if (existing) {
    const newVersion = (existing.version || 1) + 1;
    const addendums = existing.addendums || [];
    addendums.push({
      stage_number: triggerStage,
      artifact_count: artifacts.length,
      evidence_count: artifacts.length,
      timestamp: new Date().toISOString(),
    });
    await supabase.from('eva_architecture_plans').update({
      content: synthesized,
      version: newVersion,
      addendums,
      metadata: evidenceMetadata,
      updated_at: new Date().toISOString(),
    }).eq('plan_key', planKey);
  } else {
    await supabase.from('eva_architecture_plans').insert({
      plan_key: planKey,
      venture_id: ventureId,
      content: synthesized,
      version: 1,
      status: 'draft',
      created_by: 'eager-synthesis',
      metadata: evidenceMetadata,
      addendums: [{ stage_number: triggerStage, artifact_count: artifacts.length, evidence_count: artifacts.length, timestamp: new Date().toISOString() }],
    });
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
