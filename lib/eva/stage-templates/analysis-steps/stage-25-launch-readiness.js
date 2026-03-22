/**
 * Stage 24 Analysis Step - Launch Readiness (Chairman Gate)
 * Phase: LAUNCH & LEARN (Stages 23-25)
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-B
 *
 * Queries Stage 22 and Stage 23 artifacts for real readiness data.
 * Computes weighted readiness score from checklist items.
 * Produces go/no-go recommendation for chairman gate.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-24-launch-readiness
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { computeReadinessScore } from '../stage-24.js';

// Duplicated from stage-24.js to avoid circular dependency
const GO_NO_GO_DECISIONS = ['go', 'no_go', 'conditional_go'];
const CHECKLIST_ITEM_STATUSES = ['pass', 'fail', 'pending', 'waived'];
const READINESS_CHECKLIST_KEYS = [
  'release_confirmed',
  'marketing_complete',
  'monitoring_ready',
  'rollback_plan_exists',
];

const SYSTEM_PROMPT = `You are EVA's Launch Readiness Analyst. Evaluate the venture's readiness to launch based on Stage 22 (release) and Stage 23 (marketing) data.

You MUST output valid JSON with exactly this structure:
{
  "readiness_checklist": {
    "release_confirmed": {
      "status": "pass|fail|pending|waived",
      "evidence": "Evidence from Stage 22 release decision",
      "verified_at": "ISO timestamp"
    },
    "marketing_complete": {
      "status": "pass|fail|pending|waived",
      "evidence": "Evidence from Stage 23 marketing SDs status",
      "verified_at": "ISO timestamp"
    },
    "monitoring_ready": {
      "status": "pass|fail|pending|waived",
      "evidence": "Evidence of monitoring infrastructure readiness",
      "verified_at": "ISO timestamp"
    },
    "rollback_plan_exists": {
      "status": "pass|fail|pending|waived",
      "evidence": "Evidence of rollback plan documentation",
      "verified_at": "ISO timestamp"
    }
  },
  "go_no_go_decision": "go|no_go|conditional_go",
  "decision_rationale": "2-3 sentence rationale for the go/no-go recommendation",
  "incident_response_plan": "Description of incident response procedures (at least 10 chars)",
  "monitoring_setup": "Description of monitoring infrastructure (at least 10 chars)",
  "rollback_plan": "Description of rollback procedures (at least 10 chars)",
  "launch_risks": [
    {
      "risk": "Description of launch risk",
      "severity": "critical|high|medium|low",
      "mitigation": "How the risk will be mitigated"
    }
  ]
}

Rules:
- release_confirmed: "pass" if Stage 22 releaseDecision.decision is "release" or "approved"
- marketing_complete: "pass" if Stage 23 has marketing_readiness_pct >= 80 or marketing_items exist
- monitoring_ready: "pass" if monitoring infrastructure is described
- rollback_plan_exists: "pass" if rollback procedures are documented
- go_no_go_decision: "go" only if all critical checklist items pass, "conditional_go" if non-critical items pending, "no_go" if critical items fail
- At least 1 launch risk required
- incident_response_plan, monitoring_setup, rollback_plan must each be at least 10 characters`;

/**
 * Generate launch readiness assessment from Stage 22 and Stage 23 data.
 *
 * @param {Object} params
 * @param {Object} params.stage22Data - Release readiness data
 * @param {Object} params.stage23Data - Marketing preparation data
 * @param {Object} [params.stage01Data] - Venture hydration data
 * @param {string} [params.ventureName]
 * @param {Object} [params.logger]
 * @returns {Promise<Object>} Launch readiness with checklist, score, and recommendation
 */
export async function analyzeStage24({ stage22Data, stage23Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage24] Starting launch readiness analysis', { ventureName });

  if (!stage22Data) {
    throw new Error('Stage 24 launch readiness requires Stage 22 (release readiness) data');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  // Build context from upstream stages
  const releaseContext = stage22Data.releaseDecision
    ? `Release decision: ${stage22Data.releaseDecision.decision} — ${stage22Data.releaseDecision.rationale || 'N/A'}`
    : 'Release decision: not available';

  const promotionContext = stage22Data.promotion_gate
    ? `Promotion gate: ${stage22Data.promotion_gate.pass ? 'PASS' : 'FAIL'} (blockers: ${(stage22Data.promotion_gate.blockers || []).length})`
    : 'Promotion gate: not available';

  const releaseItems = Array.isArray(stage22Data.release_items)
    ? `Release items: ${stage22Data.release_items.length} items (${stage22Data.release_items.filter(i => i.status === 'approved').length} approved)`
    : '';

  const marketingContext = stage23Data
    ? `Marketing: ${stage23Data.total_marketing_items || 0} items, readiness ${stage23Data.marketing_readiness_pct || 0}%, strategy: ${(stage23Data.marketing_strategy_summary || 'N/A').substring(0, 200)}`
    : 'Marketing data: not available';

  const retroContext = stage22Data.sprintRetrospective
    ? `Sprint retrospective: ${(stage22Data.sprintRetrospective.wentWell || []).slice(0, 2).join('; ')}`
    : '';

  const userPrompt = `Evaluate launch readiness for this venture.

Venture: ${ventureName || 'Unnamed'}
${releaseContext}
${promotionContext}
${releaseItems}
${marketingContext}
${retroContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize readiness checklist
  const readiness_checklist = {};
  for (const key of READINESS_CHECKLIST_KEYS) {
    const item = parsed.readiness_checklist?.[key];
    readiness_checklist[key] = {
      status: CHECKLIST_ITEM_STATUSES.includes(item?.status) ? item.status : 'pending',
      evidence: String(item?.evidence || 'Evidence pending').substring(0, 500),
      verified_at: item?.verified_at || new Date().toISOString(),
    };
  }

  // Normalize go/no-go decision
  const go_no_go_decision = GO_NO_GO_DECISIONS.includes(parsed.go_no_go_decision)
    ? parsed.go_no_go_decision
    : 'no_go';

  // Normalize rationale
  const decision_rationale = String(parsed.decision_rationale || 'Readiness assessment pending.').substring(0, 1000);

  // Normalize operational plans
  const incident_response_plan = String(parsed.incident_response_plan || 'Incident response plan pending creation.').substring(0, 2000);
  const monitoring_setup = String(parsed.monitoring_setup || 'Monitoring infrastructure setup pending.').substring(0, 2000);
  const rollback_plan = String(parsed.rollback_plan || 'Rollback procedures pending documentation.').substring(0, 2000);

  // Normalize launch risks
  let launch_risks = Array.isArray(parsed.launch_risks)
    ? parsed.launch_risks.filter(r => r?.risk && r?.mitigation)
    : [];

  if (launch_risks.length === 0) {
    launch_risks = [{
      risk: 'Unidentified launch risks',
      severity: 'medium',
      mitigation: 'Conduct thorough pre-launch review',
    }];
  } else {
    launch_risks = launch_risks.map(r => ({
      risk: String(r.risk).substring(0, 300),
      severity: ['critical', 'high', 'medium', 'low'].includes(r.severity) ? r.severity : 'medium',
      mitigation: String(r.mitigation).substring(0, 300),
    }));
  }

  // Compute derived readiness score
  const { readiness_score, all_checks_pass, blocking_items } = computeReadinessScore({ readiness_checklist });

  const latencyMs = Date.now() - startTime;
  logger.log(`[Stage24] Launch readiness analysis complete`, {
    readiness_score,
    go_no_go_decision,
    blocking_items: blocking_items.length,
    latencyMs,
  });

  return {
    readiness_checklist,
    go_no_go_decision,
    decision_rationale,
    incident_response_plan,
    monitoring_setup,
    rollback_plan,
    launch_risks,
    readiness_score,
    all_checks_pass,
    blocking_items,
    ...(fourBuckets || {}),
    _usage: usage,
    _latencyMs: latencyMs,
  };
}
