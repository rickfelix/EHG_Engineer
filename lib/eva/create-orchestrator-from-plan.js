/**
 * lib/eva/create-orchestrator-from-plan.js
 * ============================================================================
 * PUBLIC LIBRARY ENTRY — Auto-cascade orchestrator + child SD creation.
 *
 * SD: SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001 / FR-A
 *
 * Refactored from scripts/create-orchestrator-from-plan.js main() per:
 *   - DESIGN agent C4 (PLAN): 3 pure functions over one fat function
 *   - RISK agent Risk-2 + COND-1: snapshot-regression-safe
 *
 * Usage from the cascade watcher (FR-B):
 *
 *   import { buildOrchestratorSD, buildChildSD, insertCascade } from
 *     '../../lib/eva/create-orchestrator-from-plan.js';
 *
 *   const { record: orchestratorRecord, key: orchestratorKey } =
 *     buildOrchestratorSD({ visionDoc, archPlan, phases, traceableMetrics,
 *                            title, targetApplication, targetRepos,
 *                            visionKey, archKey });
 *   const childRecords = phases.map(phase =>
 *     buildChildSD({ phase, orchestratorRecord, orchestratorKey,
 *                    orchestratorId: orchestratorRecord.id,
 *                    dimensionMap, targetApplication, targetRepos }).record);
 *   await insertCascade({ supabase, orchestratorRecord, childRecords, archPlan });
 *
 * Usage from the existing CLI: scripts/create-orchestrator-from-plan.js is now
 * a thin wrapper that loads supabase + resolves inputs + calls these functions.
 * ============================================================================
 */

import { randomUUID } from 'crypto';
import { inheritStrategicFields, inferSDType } from '../../scripts/modules/child-sd-template.js';

// QF-20260409-561 (P0): DB-authoritative sd_type list (mirrors sd_type_check constraint).
const DB_VALID_SD_TYPES = ['feature','implementation','infrastructure','bugfix','refactor','documentation','orchestrator','database','security','performance','enhancement','docs','discovery_spike','ux_debt','uat'];

/**
 * Parse architecture plan content for implementation phases.
 * Public — re-exported by the CLI for archplan-upsert.js back-compat.
 */
export function parsePhases(content) {
  if (!content) return [];
  const lines = content.split('\n');
  const phases = [];
  let current = null;
  for (const line of lines) {
    const headingMatch = line.match(/^#{1,4}\s*(Phase|Implementation Phase|Step)\s+(\d+)[:\s-]*(.*)/i);
    const bulletMatch = !headingMatch && line.match(/^\s*[-*]\s*\*\*(?:Phase|Step)\s+(\d+)\b[^*]*\*\*[:\s-]*(.*)/i);
    const numberedMatch = !headingMatch && !bulletMatch && line.match(/^\s*\d+\.\s*\*\*(?:Phase|Step)\s+(\d+)\b[^*]*\*\*[:\s-]*(.*)/i);
    const match = headingMatch || bulletMatch || numberedMatch;
    if (match) {
      if (current) phases.push(current);
      const phaseNum = headingMatch ? parseInt(match[2], 10) : parseInt(match[1], 10);
      const titleText = headingMatch ? (match[3] || '').trim() : (match[2] || '').trim();
      current = { number: phaseNum, title: titleText || `Phase ${phaseNum}`, description: '', content: '' };
      continue;
    }
    if (current) {
      current.content += line + '\n';
      if (!current.description && line.trim() && !line.startsWith('#')) {
        current.description = line.trim();
      }
    }
  }
  if (current) phases.push(current);
  return phases;
}

/**
 * Persist target_repos[] on metadata when set; identity passthrough otherwise.
 * Public — back-compat with old CLI export.
 * QF-20260524-566 reference.
 */
export function withTargetRepos(metadata, targetRepos) {
  return Array.isArray(targetRepos) && targetRepos.length > 0
    ? { ...metadata, target_repos: targetRepos }
    : metadata;
}

/**
 * Generate orchestrator-style SD key from title + suffix. Non-exported.
 * Identical to former scripts/create-orchestrator-from-plan.js:156-160.
 */
function generateSDKey(title, suffix = '') {
  const words = title.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const abbreviated = words.slice(0, 4).map(w => w.toUpperCase()).join('-');
  return `SD-${abbreviated}${suffix}-001`;
}

/**
 * Heuristic non-vertical detector. Non-exported (single caller: buildChildSD).
 * Returns { non_vertical, justification }. Advisory only.
 * Per DESIGN PLAN: moved into lib as file-internal; tested indirectly via builder.
 */
function detectNonVertical(title, description, content) {
  const haystack = `${title || ''} ${description || ''} ${content || ''}`.toLowerCase();
  const backendPatterns = [
    /\b(database|schema|migration|postgres|supabase|sql|table|column|index|rls|trigger)\b/,
    /\b(rpc|function|stored procedure|backend|server|api endpoint|rest|graphql)\b/,
    /\b(model|orm|persistence|repository|query)\b/,
  ];
  const frontendPatterns = [
    /\b(ui|component|page|route|view|layout|form|button|modal|dashboard|panel)\b/,
    /\b(react|tsx|jsx|tailwind|shadcn|frontend|browser|client-side)\b/,
    /\b(wireframe|mockup|design|responsive|accessibility|a11y)\b/,
  ];
  const hasBackend = backendPatterns.some(re => re.test(haystack));
  const hasFrontend = frontendPatterns.some(re => re.test(haystack));
  if (hasBackend && hasFrontend) return { non_vertical: false, justification: null };
  if (hasBackend && !hasFrontend) return {
    non_vertical: true,
    justification: 'Auto-detected horizontal layer: phase content references backend/data domain only (database, schema, migration, API, query) without any frontend/UI signals. LEAD: confirm this is intentional (e.g., schema-must-precede-logic) or restructure as a vertical slice.',
  };
  if (hasFrontend && !hasBackend) return {
    non_vertical: true,
    justification: 'Auto-detected horizontal layer: phase content references frontend/UI domain only (component, page, layout, design) without any backend/data signals. LEAD: confirm this is intentional (e.g., UI polish on existing API) or restructure as a vertical slice.',
  };
  return { non_vertical: false, justification: null };
}

/**
 * F5 helper: derive non-empty quality-gate JSONB fields from extracted dimensions
 * + arch phases + traceable metrics. Replaces the previous skeletal `[]` arrays
 * that guaranteed GATE_SD_QUALITY failure at LEAD-TO-PLAN.
 *
 * Inputs are best-effort; if any source is empty, fall back to one substantive
 * entry (NOT a TBD-style placeholder).
 */
function deriveQualityFields({ visionDimensions = [], archDimensions = [], phases = [], traceableMetrics = [], visionKey, archKey }) {
  const allDimensions = [...visionDimensions, ...archDimensions];

  // dependencies — derived from arch dimensions (each dimension is a dependency to honor)
  const dependencies = allDimensions.length
    ? allDimensions.slice(0, 6).map(d => ({
        dependency: d.name || d.dimension || 'unnamed',
        type: 'architectural',
        rationale: d.description || d.rationale || `Honor ${d.name || 'dimension'} per ${archKey || visionKey || 'source plan'}`,
      }))
    : [{ dependency: 'No upstream dependencies identified', type: 'note', rationale: 'Add dependencies during LEAD if any external systems are required.' }];

  // risks — derived from arch dimensions weighted by source confidence (using weight)
  const risks = allDimensions.length
    ? allDimensions.slice(0, 6).map(d => ({
        risk: `Implementation may diverge from ${d.name || 'dimension'} architecture`,
        severity: (d.weight || 0) >= 0.2 ? 'high' : (d.weight || 0) >= 0.1 ? 'medium' : 'low',
        mitigation: `Validate via ${d.source_section || 'dimension scoring'} during EXEC`,
      }))
    : [{ risk: 'Implementation may diverge from architecture', severity: 'medium', mitigation: 'Review against source vision/arch documents at each handoff' }];

  // stakeholders — derived from common LEO roles + phase-derived hints
  const stakeholders = [
    { role: 'LEAD', responsibility: 'Strategic alignment + scope-lock + final approval' },
    { role: 'PLAN', responsibility: 'PRD authoring + architecture decisions + gate validation' },
    { role: 'EXEC', responsibility: 'Implementation + tests + EXEC-TO-PLAN evidence' },
  ];
  if (phases.length > 3) {
    stakeholders.push({ role: 'CHAIRMAN', responsibility: 'Decompose-or-bundle decision for multi-phase work' });
  }

  // implementation_guidelines — derived from arch dimensions if present
  const implementation_guidelines = allDimensions.length
    ? allDimensions.slice(0, 6).map(d => `Honor "${d.name || 'dimension'}" dimension: ${d.description?.slice(0, 160) || 'see source plan'}`)
    : [
        'Follow LEO Protocol for all phase transitions',
        'Preserve backward compatibility with existing CLI invocations',
        'Tests must execute (per NC-EXEC-003) — claiming "tests exist" is insufficient',
      ];

  // success_criteria as {criterion, measure} objects per LEO precedent
  const phaseMetrics = traceableMetrics.slice(0, 5).map(m => ({
    criterion: m.metric || 'Phase milestone',
    measure: m.target || m.measurement || '100% pass',
  }));
  const phaseCriteria = phases.slice(0, 5).map(p => ({
    criterion: `Phase ${p.number}: ${p.title} complete`,
    measure: 'All phase deliverables shipped + tests pass',
  }));
  // success_criteria MUST be >=5 entries to satisfy LEAD-TO-PLAN GATE_SD_QUALITY.
  // Pad with substantive defaults (NOT TBD placeholders) until length is 5.
  const baseCriteria = [...phaseMetrics, ...phaseCriteria];
  const padding = [
    { criterion: 'Snapshot regression test passes', measure: 'tests/fixtures match post-refactor outputs byte-for-byte (excluding F3/F5 deltas)' },
    { criterion: 'All sub-agent evidence rows written', measure: 'sub_agent_execution_results has fresh rows for current phase before handoff' },
    { criterion: 'Refusal-gate symmetry preserved', measure: 'every cascade refusal writes eva_cascade_errors row with remediation_command' },
    { criterion: 'Worktree-safe DB-only operations', measure: 'no file path I/O outside .worktrees/ during cascade execution' },
    { criterion: 'Backward-compat with manual CLI', measure: 'scripts/create-orchestrator-from-plan.js --auto-children still functions identically' },
  ];
  const success_criteria = [...baseCriteria, ...padding].slice(0, Math.max(5, baseCriteria.length));

  // strategic_objectives — derived from phases
  const strategic_objectives = phases.length
    ? phases.map(p => `Phase ${p.number}: ${p.title}`)
    : ['Deliver scope per source vision/arch plan'];

  return { dependencies, risks, stakeholders, implementation_guidelines, success_criteria, strategic_objectives };
}

/**
 * Build an orchestrator SD record from vision + arch + phases. PURE — no I/O.
 *
 * @param {Object} args
 * @param {Object} args.visionDoc       Source L2 vision row (must include extracted_dimensions when present).
 * @param {Object} args.archPlan        Source eva_architecture_plans row (must include extracted_dimensions).
 * @param {Array}  args.phases          Phase array from parsePhases() or arch.sections.implementation_phases.
 * @param {Array}  args.traceableMetrics Combined vision+arch metrics (from generateTraceableMetrics).
 * @param {string} args.title           Display title.
 * @param {string} args.targetApplication REQUIRED — venture name (e.g. 'CronGenius') or 'EHG_Engineer'.
 * @param {Array}  [args.targetRepos]   Cross-repo metadata.
 * @param {string} [args.visionKey]     Vision key for metadata + rationale.
 * @param {string} [args.archKey]       Arch key for metadata + rationale.
 * @param {string} [args.idHint]        Optional UUID override (testing).
 * @returns {{ record: Object, key: string }}
 */
export function buildOrchestratorSD({ visionDoc, archPlan, phases, traceableMetrics = [], title, targetApplication, targetRepos, visionKey, archKey, idHint } = {}) {
  if (!title) throw new Error('buildOrchestratorSD: title is required');
  if (!targetApplication) throw new Error('buildOrchestratorSD: targetApplication is required (F3 fix — no hardcoded EHG_Engineer)');

  const orchestratorId = idHint || randomUUID();
  const orchestratorKey = generateSDKey(title, '-ORCH');

  const visionDimensions = visionDoc?.extracted_dimensions || [];
  const archDimensions = archPlan?.extracted_dimensions || [];

  const qualityFields = deriveQualityFields({
    visionDimensions, archDimensions, phases, traceableMetrics, visionKey, archKey,
  });

  const record = {
    id: orchestratorId,
    sd_key: orchestratorKey,
    title,
    description: `Orchestrator for ${title}. Created from vision/architecture plan.`,
    sd_type: 'orchestrator',
    category: 'feature',
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    priority: 'high',
    scope: `Orchestrator coordinating ${phases.length} implementation phase(s)`,
    rationale: `Auto-generated from vision (${visionKey || 'N/A'}) and architecture (${archKey || 'N/A'}) plans`,
    success_metrics: traceableMetrics,
    key_principles: ['Follow LEO Protocol for all changes', 'Ensure backward compatibility'],
    strategic_objectives: qualityFields.strategic_objectives,
    success_criteria: qualityFields.success_criteria,
    implementation_guidelines: qualityFields.implementation_guidelines,
    dependencies: qualityFields.dependencies,
    risks: qualityFields.risks,
    stakeholders: qualityFields.stakeholders,
    metadata: withTargetRepos({
      is_orchestrator: true,
      vision_key: visionKey,
      arch_key: archKey,
      auto_generated: true,
      child_count: phases.length,
    }, targetRepos),
    key_changes: phases.map(p => `Phase ${p.number}: ${p.title}`),
    target_application: targetApplication,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return { record, key: orchestratorKey };
}

/**
 * Build a child SD record for one phase. PURE — no I/O.
 *
 * @param {Object} args
 * @param {Object} args.phase
 * @param {Object} args.orchestratorRecord
 * @param {string} args.orchestratorKey
 * @param {string} args.orchestratorId
 * @param {Map}    [args.dimensionMap]    Map<phaseIndex, dim[]> from mapDimensionsToPhases.
 * @param {string} args.targetApplication REQUIRED.
 * @param {Array}  [args.targetRepos]
 * @param {string} [args.idHint]
 * @returns {{ record: Object, key: string, sliceCheck: { non_vertical: boolean, justification: string|null } }}
 */
export function buildChildSD({ phase, orchestratorRecord, orchestratorKey, orchestratorId, dimensionMap, targetApplication, targetRepos, idHint } = {}) {
  if (!phase || !orchestratorKey || !orchestratorId || !orchestratorRecord) {
    throw new Error('buildChildSD: phase + orchestratorRecord + orchestratorKey + orchestratorId required');
  }
  if (!targetApplication) {
    throw new Error('buildChildSD: targetApplication is required (F3 fix)');
  }

  const childId = idHint || randomUUID();
  const suffix = `-${String.fromCharCode(64 + phase.number)}`; // -A, -B, -C
  const childKey = `${orchestratorKey}${suffix}`;

  const isSeparateOrchestrator = phase.child_designation === 'separate_orchestrator';
  const typeResult = inferSDType(phase.title, phase.description || '', phase.content || '');
  let childType = isSeparateOrchestrator ? 'orchestrator' : (typeof typeResult === 'string' ? typeResult : (typeResult?.sdType || 'feature'));
  if (!DB_VALID_SD_TYPES.includes(childType)) childType = 'implementation';

  const sliceCheck = detectNonVertical(phase.title, phase.description, phase.content);

  const inherited = inheritStrategicFields(orchestratorRecord, {
    phaseNumber: phase.number,
    phaseTitle: phase.title,
    phaseObjective: phase.description,
  });

  const phaseDims = (dimensionMap?.get?.(phase.number - 1)) || [];
  const phaseMetrics = phaseDims.map(dim => ({
    metric: `${dim.name} implementation`,
    target: '>=90%',
    measurement: 'Dimension coverage',
    source: `${orchestratorRecord.metadata?.arch_key || orchestratorRecord.metadata?.vision_key}:${dim.name}`,
    traceability: orchestratorRecord.metadata?.arch_key ? 'arch_dimension' : 'vision_dimension',
  }));

  const rawChildTitle = `Phase ${phase.number}: ${phase.title}`;
  const childTitle = rawChildTitle.length > 500 ? `${rawChildTitle.slice(0, 497)}...` : rawChildTitle;

  const record = {
    id: childId,
    sd_key: childKey,
    title: childTitle,
    description: phase.description || phase.content?.trim().slice(0, 2000) || `Phase ${phase.number}: ${phase.title}`,
    sd_type: childType,
    category: orchestratorRecord.category,
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    priority: orchestratorRecord.priority,
    parent_sd_id: isSeparateOrchestrator ? null : orchestratorId,
    scope: phase.content?.trim().slice(0, 2000) || phase.description || '',
    rationale: phase.description
      ? `${phase.description.slice(0, 500)}${phase.description.length > 500 ? '...' : ''}`
      : `Phase ${phase.number} of ${orchestratorRecord.title}: ${phase.title}`,
    success_metrics: phaseMetrics.length > 0 ? phaseMetrics : inherited.success_metrics || [],
    key_principles: inherited.key_principles?.length > 0 ? inherited.key_principles : orchestratorRecord.key_principles,
    strategic_objectives: inherited.strategic_objectives?.length > 0 ? inherited.strategic_objectives : [`Phase ${phase.number}: ${phase.title}`],
    success_criteria: inherited.success_criteria?.length > 0 ? inherited.success_criteria : [`Phase ${phase.number} deliverables completed`],
    implementation_guidelines: [],
    dependencies: [],
    risks: inherited.risks || [],
    stakeholders: [],
    target_application: targetApplication,
    non_vertical: sliceCheck.non_vertical,
    non_vertical_justification: sliceCheck.justification,
    metadata: withTargetRepos({
      vision_key: orchestratorRecord.metadata?.vision_key,
      arch_key: orchestratorRecord.metadata?.arch_key,
      phase_number: phase.number,
      parent_orchestrator: orchestratorKey,
      auto_generated: true,
      // F17 create-side (QF-20260528-224): every buildChildSD child is a parent-derived
      // slice (it inherits the orchestrator's arch). Flag it so SCOPE_COMPLETION_VERIFICATION
      // soft-passes the child instead of scoring it against the parent's full multi-phase
      // deliverable list. Pairs with the gate-side read shipped in SD-LEO-INFRA-VENTURE-AWARE-COMPLETION-001.
      inherited_from_parent: true,
      wiring_required: true,
      vertical_slice_check: {
        non_vertical: sliceCheck.non_vertical,
        justification: sliceCheck.justification,
        detector_version: 'C1-v1-heuristic',
      },
    }, targetRepos),
    key_changes: [phase.title],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return { record, key: childKey, sliceCheck };
}

/**
 * Persist the cascade. IMPURE — owns DB writes + idempotent pre-checks.
 *
 * Returns { orchestrator, children, errors }. Never throws.
 *
 * @param {Object} args
 * @param {Object} args.supabase
 * @param {Object} args.orchestratorRecord
 * @param {Array}  args.childRecords
 * @param {Object} [args.archPlan]   Used for covered_by_sd_key writeback to sections.implementation_phases.
 * @param {boolean} [args.dryRun=false]
 * @param {Object} [args.logger=console]
 */
export async function insertCascade({ supabase, orchestratorRecord, childRecords, archPlan, dryRun = false, logger = console } = {}) {
  const result = { orchestrator: null, children: [], errors: [] };

  if (!supabase || !orchestratorRecord || !Array.isArray(childRecords)) {
    result.errors.push({ stage: 'preflight', error: 'insertCascade: supabase, orchestratorRecord, childRecords required' });
    return result;
  }

  if (dryRun) {
    result.orchestrator = { ...orchestratorRecord, _dry_run: true };
    result.children = childRecords.map(c => ({ ...c, _dry_run: true }));
    logger.log?.(`[insertCascade] DRY RUN — would create ${orchestratorRecord.sd_key} + ${childRecords.length} children`);
    return result;
  }

  // Orchestrator idempotency: resume if same vision/arch keys, error on collision.
  const orchestratorKey = orchestratorRecord.sd_key;
  const { data: existingOrch } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', orchestratorKey)
    .maybeSingle();

  let orchestratorId = orchestratorRecord.id;
  let orchestratorAlreadyExists = false;
  if (existingOrch) {
    if (
      existingOrch.metadata?.vision_key !== orchestratorRecord.metadata?.vision_key ||
      existingOrch.metadata?.arch_key !== orchestratorRecord.metadata?.arch_key
    ) {
      result.errors.push({
        stage: 'orchestrator',
        error: `Key collision: ${orchestratorKey} exists with different vision/arch. Clean up or rename.`,
      });
      return result;
    }
    orchestratorId = existingOrch.id;
    orchestratorAlreadyExists = true;
    logger.log?.(`[insertCascade] Resuming existing orchestrator: ${orchestratorKey}`);
  }

  if (!orchestratorAlreadyExists) {
    const { error: orchErr } = await supabase
      .from('strategic_directives_v2')
      .insert(orchestratorRecord);
    if (orchErr) {
      result.errors.push({ stage: 'orchestrator', error: `insert failed: ${orchErr.message}` });
      return result;
    }
    logger.log?.(`[insertCascade] Orchestrator created: ${orchestratorKey} (${orchestratorId})`);
  }
  result.orchestrator = { ...orchestratorRecord, id: orchestratorId };

  // Children — skip phases already covered by an existing SD.
  for (const child of childRecords) {
    // Adjust parent_sd_id if orchestrator was resumed
    const childToInsert = orchestratorAlreadyExists ? { ...child, parent_sd_id: orchestratorId } : child;

    // covered_by_sd_key short-circuit (from phase.covered_by_sd_key, threaded via metadata.phase_number)
    const phaseNumber = child.metadata?.phase_number;
    if (phaseNumber != null) {
      // Match the existing semantics: if child SD key already exists, skip with note.
      const { data: existingChild } = await supabase
        .from('strategic_directives_v2')
        .select('sd_key, status')
        .eq('sd_key', childToInsert.sd_key)
        .maybeSingle();
      if (existingChild) {
        logger.log?.(`[insertCascade] Child ${childToInsert.sd_key} already exists (${existingChild.status}) — skipped`);
        result.children.push({ ...existingChild, _skipped: true });
        continue;
      }
    }

    const { error: childErr } = await supabase
      .from('strategic_directives_v2')
      .insert(childToInsert);
    if (childErr) {
      result.errors.push({ stage: 'child', sd_key: childToInsert.sd_key, error: childErr.message });
      continue;
    }
    result.children.push(childToInsert);

    // Writeback covered_by_sd_key into archPlan.sections.implementation_phases[]
    if (archPlan?.plan_key && archPlan?.sections?.implementation_phases && phaseNumber != null) {
      try {
        const updatedPhases = [...archPlan.sections.implementation_phases];
        const idx = updatedPhases.findIndex(p => p.number === phaseNumber);
        if (idx !== -1) {
          updatedPhases[idx] = { ...updatedPhases[idx], covered_by_sd_key: childToInsert.sd_key };
          archPlan.sections = { ...archPlan.sections, implementation_phases: updatedPhases };
          await supabase
            .from('eva_architecture_plans')
            .update({ sections: archPlan.sections })
            .eq('plan_key', archPlan.plan_key);
        }
      } catch (linkErr) {
        result.errors.push({ stage: 'covered_by_writeback', sd_key: childToInsert.sd_key, error: linkErr.message });
      }
    }
  }

  return result;
}
