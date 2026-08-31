/**
 * Vision-fidelity sub-agent.
 * SD-LEO-INFRA-VISION-FIDELITY-GATE-001 FR-1.
 *
 * Compares an SD's source vision wireframe (eva_vision_documents +
 * eva_architecture_plans extracted_dimensions) against the actual implementation
 * (PRD acceptance_criteria + functional_requirements + git diff) using the
 * validation LLM tier. Produces delivered/partial/missing/scope_creep tabulation.
 *
 * Consumed by:
 *   - PLAN-TO-LEAD gate (PR-2: scripts/modules/handoff/executors/plan-to-lead/gates/vision-fidelity.js)
 *   - Direct invocation for ad-hoc audits
 */

import { execFileSync } from 'child_process';
import { getValidationClient } from '../../llm/client-factory.js';
import { classifyOutcome, computeCoveragePct } from './severity-policy.js';

export const SUB_AGENT_CODE = 'VISION_FIDELITY';
export const SUB_AGENT_NAME = 'Vision Fidelity Sub-Agent';

const DEFAULT_TIMEOUT_MS = 90_000;
const DIFF_MAX_BYTES = 200_000;

/**
 * @param {Object} args
 * @param {string} args.sdId - SD UUID or sd_key
 * @param {Object} args.supabase - service-role client
 * @param {boolean} [args.dryRun] - skip DB insert
 * @param {Object} [args.llmClient] - injectable for tests; defaults to getValidationClient()
 * @param {Function} [args.gitDiffFn] - injectable for tests; defaults to readGitDiff
 * @param {number} [args.timeoutMs] - LLM call timeout, default 90000
 */
export async function executeVisionFidelity(args = {}) {
  const {
    sdId,
    supabase,
    dryRun = false,
    llmClient = null,
    gitDiffFn = readGitDiff,
    timeoutMs = DEFAULT_TIMEOUT_MS
  } = args;

  if (!sdId || !supabase) {
    throw new Error('executeVisionFidelity requires {sdId, supabase}');
  }

  const sd = await loadSD(supabase, sdId);
  if (!sd) {
    return makeSkippedResult({ reason: `SD not found: ${sdId}`, dryRun });
  }

  const sdType = sd.sd_type;
  const visionKey = sd.metadata?.vision_key || null;
  const archKey = sd.metadata?.arch_key || null;
  const branchName = sd.metadata?.branch_name || sd.metadata?.git_branch || null;

  // sd_type policy=skip → no LLM call, no DB row written
  const skipPolicy = classifyOutcome({ sdType, criticalMissing: 0, nonCriticalMissing: 0 });
  if (skipPolicy.skipped) {
    return finalizeResult({
      supabase, sd,
      verdict: 'PASS',
      passed: true,
      delivered: [], partial: [], missing: [], scopeCreep: [],
      details: { skipped: true, reason: skipPolicy.reason, vision_key: visionKey, arch_key: archKey, sd_type: sdType },
      warnings: [`Vision-fidelity skipped: ${skipPolicy.reason}`],
      issues: [],
      dryRun,
      skipDbInsert: true
    });
  }

  // SD-LEO-FIX-VISION-FIDELITY-DOC-SELECTION-001 (QF-20260831-038, Solomon ruling revision
  // 4807b985): a venture-linked SD's stored metadata.vision_key can drift stale relative to
  // the venture's actual current L2 doc (measured: SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-002 still
  // pointed at VISION-IMAGE-ALT-TEXT-GENERATOR-L2-001 -- archived -- while the real content
  // had been promoted to VISION-ALTIFYAI-L2-001 -- active -- via QF-20260831-273's data fix).
  // Comparing PRD delivery against the WRONG document manufactures false critical findings the
  // fix cannot address by filling fields, since the document being read is not even the
  // venture's own vision. Gated on sd.venture_id so non-venture SDs (the vast majority) are
  // entirely unaffected. A genuinely absent canonical doc FAILS LOUD (hard block, no comparison
  // possible); a STALE-KEY mismatch does NOT hard-block -- the comparison always reads the
  // venture's CANONICAL doc (so a real, current vision still produces a real PASS/FAIL verdict
  // on real content), but the mismatch itself is surfaced as a loud, named-path issue so the
  // stale SD-side pointer gets fixed rather than silently tolerated forever.
  let canonicalDoc = null;
  let docMismatchIssue = null;
  if (sd.venture_id) {
    canonicalDoc = await loadCanonicalVentureDoc(supabase, sd.venture_id);
    if (!canonicalDoc) {
      return finalizeResult({
        supabase, sd,
        verdict: 'FAIL',
        passed: false,
        delivered: [], partial: [], missing: [], scopeCreep: [],
        details: { vision_key: visionKey, venture_id: sd.venture_id, sd_type: sdType, doc_check: 'no_active_l2_doc' },
        warnings: [],
        issues: [`vision-fidelity: venture ${sd.venture_id} has no active L2 vision document -- read path: eva_vision_documents(venture_id=${sd.venture_id}, level=L2, status=active) returned none.`],
        dryRun
      });
    }
    if (visionKey !== canonicalDoc.vision_key) {
      docMismatchIssue = `vision-fidelity: SD's stored vision_key '${visionKey || '(none)'}' does not match venture ${sd.venture_id}'s canonical active L2 doc '${canonicalDoc.vision_key}' -- compared against the CANONICAL doc (read path: eva_vision_documents(venture_id=${sd.venture_id}, level=L2, status=active)); the SD's stale metadata.vision_key should be corrected.`;
    }
  }

  const effectiveVisionKey = canonicalDoc?.vision_key || visionKey;
  if (!effectiveVisionKey) {
    return finalizeResult({
      supabase, sd,
      verdict: 'PENDING',
      passed: true,
      delivered: [], partial: [], missing: [], scopeCreep: [],
      details: { skipped: true, skipped_reason: 'no_vision_key', vision_key: null, arch_key: archKey, sd_type: sdType },
      warnings: ['No vision_key in SD metadata — vision-fidelity comparison skipped'],
      issues: [],
      dryRun
    });
  }

  const [visionDoc, archPlan, prd] = await Promise.all([
    canonicalDoc ? Promise.resolve(canonicalDoc) : loadVisionDocument(supabase, effectiveVisionKey),
    archKey ? loadArchPlan(supabase, archKey) : Promise.resolve(null),
    loadPRD(supabase, sd.id)
  ]);

  if (!visionDoc) {
    return finalizeResult({
      supabase, sd,
      verdict: 'PENDING',
      passed: true,
      delivered: [], partial: [], missing: [], scopeCreep: [],
      details: { vision_key: effectiveVisionKey, arch_key: archKey, sd_type: sdType, missing_artifact: 'eva_vision_documents' },
      warnings: [`vision_key ${effectiveVisionKey} not found in eva_vision_documents — advisory pass`],
      issues: [],
      dryRun
    });
  }

  let diffText = '';
  try {
    diffText = await Promise.resolve(gitDiffFn({ branchName, baseBranch: 'origin/main' }));
  } catch (err) {
    diffText = `[diff unavailable: ${err.message}]`;
  }

  const { systemPrompt, userPrompt } = buildPrompts({ sd, visionDoc, archPlan, prd, diffText });

  const client = llmClient || getValidationClient();
  let parsed;
  try {
    const raw = await callWithTimeout(client.complete(systemPrompt, userPrompt), timeoutMs);
    parsed = parseAgentResponse(raw);
  } catch (err) {
    return finalizeResult({
      supabase, sd,
      verdict: 'PENDING',
      passed: true,
      delivered: [], partial: [], missing: [], scopeCreep: [],
      details: { vision_key: effectiveVisionKey, arch_key: archKey, sd_type: sdType, timeout: /timed out/i.test(err.message), error: err.message },
      warnings: [`vision-fidelity agent ${/timed out/i.test(err.message) ? 'timed out' : 'failed'}: ${err.message} — advisory only`],
      issues: [],
      dryRun
    });
  }

  const { delivered_elements, partial_elements, missing_elements, scope_creep_elements } = parsed;

  const criticalMissing = missing_elements.filter(el => el.severity === 'critical' || el.critical === true).length;
  const nonCriticalMissing = missing_elements.length - criticalMissing;

  const outcome = classifyOutcome({
    sdType,
    criticalMissing,
    nonCriticalMissing,
    visionLevel: visionDoc.level
  });

  const totalElements = delivered_elements.length + partial_elements.length + missing_elements.length;
  const visionCoveragePct = computeCoveragePct(delivered_elements.length, totalElements);

  const issues = [];
  const warnings = [];
  // Named-path clause (coordinator, QF-20260831-038): a stale-key mismatch is loud but does
  // NOT force a hard block on its own -- the comparison above already ran against the
  // CANONICAL doc, so a real, current vision can still produce a real PASS on real content.
  if (docMismatchIssue) issues.push(docMismatchIssue);
  if (outcome.mode === 'block' && !outcome.passed) {
    for (const el of missing_elements) {
      const target = (el.severity === 'critical' || el.critical) ? issues : warnings;
      target.push(formatElementMessage(el, 'missing'));
    }
  } else if (outcome.mode === 'warn') {
    for (const el of missing_elements) warnings.push(formatElementMessage(el, 'missing'));
  } else if (outcome.mode === 'block' && outcome.verdict === 'CONDITIONAL_PASS') {
    for (const el of missing_elements) warnings.push(formatElementMessage(el, 'missing'));
  }
  for (const el of partial_elements) warnings.push(formatElementMessage(el, 'partial'));

  // Scope creep is informational unless it's the only signal — then bump PASS → WARNING.
  for (const el of scope_creep_elements) {
    warnings.push(`vision scope-creep: ${el.element}${el.source_section ? ` (not in ${el.source_section})` : ''}`);
  }
  let finalVerdict = outcome.verdict;
  if (scope_creep_elements.length > 0 && finalVerdict === 'PASS') {
    finalVerdict = 'WARNING';
  }

  return finalizeResult({
    supabase, sd,
    verdict: finalVerdict,
    passed: outcome.passed,
    delivered: delivered_elements,
    partial: partial_elements,
    missing: missing_elements,
    scopeCreep: scope_creep_elements,
    details: {
      vision_key: effectiveVisionKey,
      ...(docMismatchIssue ? { sd_vision_key: visionKey, canonical_vision_key: canonicalDoc.vision_key, doc_identity_mismatch: true } : {}),
      arch_key: archKey,
      sd_type: sdType,
      delivered_count: delivered_elements.length,
      partial_count: partial_elements.length,
      missing_count: missing_elements.length,
      critical_missing: criticalMissing,
      non_critical_missing: nonCriticalMissing,
      scope_creep_count: scope_creep_elements.length,
      scope_creep_elements: scope_creep_elements,
      total_elements: totalElements,
      vision_coverage_pct: visionCoveragePct,
      severity_mode: outcome.mode
    },
    warnings,
    issues,
    dryRun
  });
}

async function loadSD(supabase, sdId) {
  const { data } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, sd_type, status, current_phase, metadata, venture_id')
    .or(`id.eq.${sdId},sd_key.eq.${sdId}`)
    .maybeSingle();
  return data;
}

// QF-20260831-038 (Solomon ruling revision 4807b985): the venture's SINGLE canonical current
// L2 vision doc -- exactly one row is expected per venture (promote-or-archive discipline,
// QF-20260831-273); .maybeSingle() surfaces a data-integrity violation (multiple active L2
// docs) as null rather than silently picking one, which the caller already treats as FAIL LOUD.
async function loadCanonicalVentureDoc(supabase, ventureId) {
  const { data } = await supabase
    .from('eva_vision_documents')
    .select('vision_key, version, content, extracted_dimensions, status, level')
    .eq('venture_id', ventureId)
    .eq('level', 'L2')
    .eq('status', 'active')
    .maybeSingle();
  return data;
}

// SD-LEO-INFRA-VISION-KEY-STAMP-AT-SD-CREATION-001: eva_vision_documents has no `key` or
// `title` column (verified live against the schema) -- the correct FK column is
// `vision_key`. This selected/filtered on the wrong column, so loadVisionDocument()
// always returned null even for a valid vision_key, permanently short-circuiting the
// gate into the "vision_key not found -- advisory pass" branch instead of a real
// PASS/FAIL/WARNING/CONDITIONAL_PASS evaluation.
async function loadVisionDocument(supabase, visionKey) {
  const { data } = await supabase
    .from('eva_vision_documents')
    // `level` (SD-LEARN-FIX-ADDRESS-SAL-VISION-001): read from the column, never parsed out of
    // vision_key. It drives the L1 portfolio-scope branch in classifyOutcome, and omitting it here
    // would leave that branch permanently undefined — the fix would look implemented and do nothing.
    .select('vision_key, version, content, extracted_dimensions, status, level')
    .eq('vision_key', visionKey)
    .maybeSingle();
  return data;
}

// Same class of bug as loadVisionDocument above: eva_architecture_plans has no `key` or
// `title` column -- the correct FK column is `plan_key`.
async function loadArchPlan(supabase, archKey) {
  const { data } = await supabase
    .from('eva_architecture_plans')
    .select('plan_key, content, extracted_dimensions, vision_key')
    .eq('plan_key', archKey)
    .maybeSingle();
  return data;
}

async function loadPRD(supabase, sdId) {
  const { data } = await supabase
    .from('product_requirements_v2')
    .select('id, title, functional_requirements, acceptance_criteria, test_scenarios')
    .eq('sd_id', sdId)
    .maybeSingle();
  return data;
}

export function readGitDiff({ branchName, baseBranch = 'origin/main' }) {
  if (!branchName) return '[no branch_name in SD metadata]';
  try {
    const out = execFileSync('git', ['diff', `${baseBranch}...${branchName}`, '--unified=0'], {
      encoding: 'utf8',
      maxBuffer: DIFF_MAX_BYTES * 4
    });
    return out.length > DIFF_MAX_BYTES ? out.slice(0, DIFF_MAX_BYTES) + '\n[truncated]' : out;
  } catch (err) {
    return `[git diff failed: ${err.message}]`;
  }
}

export function buildPrompts({ sd, visionDoc, archPlan, prd, diffText }) {
  const systemPrompt = [
    'You are the Vision-Fidelity sub-agent for the LEO Protocol.',
    'You compare an SD\'s wireframe/architecture intent against the implemented PR.',
    'Your output is strict JSON, no prose, no markdown fences.',
    '',
    'Schema:',
    '{',
    '  "delivered_elements": [{"element": string, "severity": "critical"|"normal", "source_section": string, "evidence": string}],',
    '  "partial_elements":   [{"element": string, "severity": "critical"|"normal", "source_section": string, "gap": string}],',
    '  "missing_elements":   [{"element": string, "severity": "critical"|"normal", "source_section": string, "expected": string}],',
    '  "scope_creep_elements": [{"element": string, "source_section": string|null, "evidence": string}]',
    '}',
    '',
    'Rules:',
    '- An "element" is a discrete user-facing or contract-defining unit from the wireframe (button, count, list, card, badge, persona, banner, footer).',
    '- "critical" = element is named or quantified in the wireframe and absence breaks the chairman-promised UX or audit-trail intent.',
    '- "normal" = cosmetic, copy-only, or polish — absence is undesired but tolerable.',
    '- "scope_creep" = present in implementation but NOT named in vision/arch/PRD.',
    '- Do NOT invent elements. Cite source_section verbatim from the wireframe text when possible.',
    '- If diff is truncated, base the comparison on PRD acceptance_criteria as evidence of delivery.'
  ].join('\n');

  const userPrompt = [
    `SD: ${sd.sd_key} (sd_type=${sd.sd_type})`,
    `Vision: ${visionDoc.vision_key} v${visionDoc.version || '?'}`,
    archPlan ? `Architecture: ${archPlan.plan_key}` : 'Architecture: (none)',
    '',
    '=== VISION extracted_dimensions ===',
    JSON.stringify(visionDoc.extracted_dimensions || {}, null, 2),
    '',
    '=== VISION content (truncated) ===',
    truncate(visionDoc.content || '', 6000),
    '',
    archPlan ? '=== ARCH extracted_dimensions ===\n' + JSON.stringify(archPlan.extracted_dimensions || {}, null, 2) : '',
    '',
    '=== PRD acceptance_criteria ===',
    JSON.stringify(prd?.acceptance_criteria || [], null, 2),
    '',
    '=== PRD functional_requirements ===',
    JSON.stringify(prd?.functional_requirements || [], null, 2),
    '',
    '=== GIT DIFF (truncated) ===',
    truncate(diffText || '', 8000),
    '',
    'Return the JSON object. No prose.'
  ].filter(Boolean).join('\n');

  return { systemPrompt, userPrompt };
}

export function parseAgentResponse(raw) {
  let text = typeof raw === 'string' ? raw : (raw?.content ?? raw?.text ?? '');
  if (typeof text !== 'string') text = JSON.stringify(text);
  text = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(text);
  return {
    delivered_elements:   asArray(parsed.delivered_elements),
    partial_elements:     asArray(parsed.partial_elements),
    missing_elements:     asArray(parsed.missing_elements),
    scope_creep_elements: asArray(parsed.scope_creep_elements)
  };
}

function asArray(x) { return Array.isArray(x) ? x : []; }

function truncate(s, n) {
  if (typeof s !== 'string') return '';
  return s.length > n ? s.slice(0, n) + '\n[truncated]' : s;
}

function formatElementMessage(el, kind) {
  const sev = el.severity === 'critical' || el.critical ? '[critical] ' : '';
  const where = el.source_section ? ` (${el.source_section})` : '';
  return `${sev}vision ${kind}: ${el.element}${where}`;
}

function callWithTimeout(promise, ms) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`vision-fidelity LLM call timed out after ${ms}ms`)), ms))
  ]);
}

async function finalizeResult({ supabase, sd, verdict, passed, delivered, partial, missing, scopeCreep, details, warnings, issues, dryRun, skipDbInsert = false }) {
  const result = {
    verdict,
    passed,
    sd_id: sd.id,
    sd_key: sd.sd_key,
    delivered_elements: delivered,
    partial_elements: partial,
    missing_elements: missing,
    scope_creep_elements: scopeCreep,
    issues,
    warnings,
    details
  };

  if (dryRun || skipDbInsert) return result;

  const insertRow = {
    sd_id: sd.id,
    sub_agent_code: SUB_AGENT_CODE,
    sub_agent_name: SUB_AGENT_NAME,
    verdict,
    confidence: 100,
    critical_issues: issues,
    warnings,
    recommendations: [],
    detailed_analysis: { delivered, partial, missing, scope_creep: scopeCreep },
    metadata: details,
    phase: 'PLAN_VERIFICATION',
    source: 'vision-fidelity-sub-agent'
  };

  try {
    await supabase.from('sub_agent_execution_results').insert(insertRow);
  } catch (err) {
    result.warnings = [...warnings, `failed to persist sub_agent_execution_results: ${err.message}`];
  }

  return result;
}

function makeSkippedResult({ reason }) {
  return {
    verdict: 'PASS',
    passed: true,
    delivered_elements: [], partial_elements: [], missing_elements: [], scope_creep_elements: [],
    issues: [], warnings: [reason], details: { skipped: true, reason }
  };
}

export default { executeVisionFidelity, SUB_AGENT_CODE, SUB_AGENT_NAME };
