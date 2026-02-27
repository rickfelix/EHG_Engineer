/**
 * Stage 23 Analysis Step - Launch Execution (LAUNCH & LEARN)
 * Phase: LAUNCH & LEARN (Stages 23-25)
 * Part of SD-EVA-FEAT-TEMPLATES-LAUNCH-001
 *
 * Consumes Stage 22 release readiness data and generates a launch brief
 * with success criteria as a contract with Stage 24.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-23-launch-execution
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';

const LAUNCH_TYPES = ['soft_launch', 'beta', 'general_availability'];
const TASK_STATUSES = ['pending', 'in_progress', 'done', 'blocked'];
const CRITERION_PRIORITIES = ['primary', 'secondary'];

// SD-MAN-INFRA-VISION-HEAL-PLATFORM-001-19: Publish pipeline constants
const APP_STORE_STATUSES = ['not_submitted', 'submitted', 'in_review', 'approved', 'rejected', 'live'];
const DOMAIN_STATUSES = ['not_configured', 'dns_pending', 'ssl_pending', 'active', 'error'];
const CHANNEL_STATUSES = ['not_started', 'drafting', 'scheduled', 'live', 'paused'];

// SD-MAN-INFRA-VISION-HEAL-PLATFORM-001-22: App rankings pipeline constants
const APP_RANKING_TIERS = ['top10', 'top50', 'top100', 'below100', 'unknown'];
const COMPETITIVE_POSITIONS = ['leader', 'challenger', 'follower', 'niche', 'unknown'];

const SYSTEM_PROMPT = `You are EVA's Launch Execution Analyst. Synthesize Stage 22 release readiness data into a launch brief with success criteria.

You MUST output valid JSON with exactly this structure:
{
  "launchType": "soft_launch|beta|general_availability",
  "launchBrief": "2-4 sentence summary of what is being launched and why",
  "successCriteria": [
    {
      "metric": "Name of the metric to track",
      "target": "Specific measurable target (e.g., '100 signups in 7 days')",
      "measurementWindow": "Time window for measurement (e.g., '7 days', '30 days')",
      "priority": "primary|secondary"
    }
  ],
  "rollbackTriggers": [
    {
      "condition": "When this condition is met, rollback should be considered",
      "severity": "critical|warning"
    }
  ],
  "launchTasks": [
    {
      "name": "Task description",
      "owner": "Role responsible",
      "status": "pending|in_progress|done|blocked"
    }
  ],
  "plannedLaunchDate": "YYYY-MM-DD",
  "appStoreReadiness": {
    "status": "not_submitted|submitted|in_review|approved|rejected|live",
    "platform": "ios|android|web|cross_platform",
    "complianceScore": 0-100,
    "blockers": ["List of submission blockers if any"]
  },
  "domainDeployment": {
    "status": "not_configured|dns_pending|ssl_pending|active|error",
    "domain": "Primary domain name",
    "sslValid": true,
    "cdnConfigured": true
  },
  "marketingChannels": [
    {
      "channel": "Channel name (e.g., social_media, email, press, paid_ads)",
      "status": "not_started|drafting|scheduled|live|paused",
      "reach": "Estimated audience reach"
    }
  ],
  "chairmanEscalation": {
    "requiresApproval": true,
    "reason": "Why Chairman approval is needed (irreversible external actions)",
    "escalationItems": ["List of specific items needing approval"]
  },
  "appRankings": {
    "categoryRank": 15,
    "overallRank": 250,
    "rating": 4.2,
    "reviewCount": 500,
    "trend": "improving|stable|declining|unknown"
  },
  "competitivePosition": {
    "marketShareEstimate": 12.5,
    "competitorCount": 8,
    "differentiationScore": 75,
    "position": "leader|challenger|follower|niche|unknown"
  }
}

Rules:
- launchType should reflect the venture's maturity and release scope
- At least 2 success criteria required (at least 1 primary)
- At least 1 rollback trigger required
- At least 1 launch task required
- plannedLaunchDate should be reasonable (within 1-4 weeks)
- Success criteria become the contract with Stage 24 for evaluation
- appStoreReadiness.complianceScore should be 0-100
- domainDeployment should reflect actual infrastructure state
- At least 1 marketing channel required
- chairmanEscalation.requiresApproval MUST be true if any launch action is irreversible (app store submission, domain going live, press releases)
- appRankings: provide ranking data if available, use null for unknown numeric fields
- appRankings.trend: "improving" if rankings climbing, "declining" if dropping, "stable" if steady, "unknown" if insufficient data
- competitivePosition: assess market standing relative to competitors
- competitivePosition.differentiationScore: 0-100 based on unique value proposition strength`;

/**
 * Generate launch execution brief from Stage 22 release readiness data.
 *
 * @param {Object} params
 * @param {Object} params.stage22Data - Release readiness (releaseDecision, releaseItems, etc.)
 * @param {Object} [params.stage01Data] - Venture hydration (successCriteria from Stage 1)
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Launch brief with success criteria and tasks
 */
export async function analyzeStage23({ stage22Data, stage01Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage23] Starting analysis', { ventureName });
  if (!stage22Data) {
    throw new Error('Stage 23 launch execution requires Stage 22 (release readiness) data');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const releaseContext = stage22Data.releaseDecision
    ? `Release: ${stage22Data.releaseDecision.decision} — ${stage22Data.releaseDecision.rationale}`
    : '';

  const itemsContext = Array.isArray(stage22Data.releaseItems)
    ? `Items: ${stage22Data.releaseItems.map(ri => `${ri.name} (${ri.status})`).join(', ')}`
    : '';

  const retroContext = stage22Data.sprintRetrospective
    ? `Retro highlights: ${(stage22Data.sprintRetrospective.wentWell || []).slice(0, 2).join('; ')}`
    : '';

  const stage1Criteria = stage01Data?.successCriteria
    ? `Stage 1 success criteria: ${JSON.stringify(stage01Data.successCriteria)}`
    : '';

  const userPrompt = `Generate launch execution brief for this venture.

Venture: ${ventureName || 'Unnamed'}
${releaseContext}
${itemsContext}
${retroContext}
${stage1Criteria}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize launchType
  const launchType = LAUNCH_TYPES.includes(parsed.launchType)
    ? parsed.launchType
    : 'soft_launch';

  // Normalize launch brief
  const launchBrief = String(parsed.launchBrief || 'Launch brief pending.').substring(0, 1000);

  // Normalize success criteria
  let successCriteria = Array.isArray(parsed.successCriteria)
    ? parsed.successCriteria.filter(sc => sc?.metric)
    : [];

  if (successCriteria.length < 2) {
    successCriteria = [
      { metric: 'User signups', target: '50 in first week', measurementWindow: '7 days', priority: 'primary' },
      { metric: 'Error rate', target: 'Below 5%', measurementWindow: '7 days', priority: 'secondary' },
    ];
  } else {
    successCriteria = successCriteria.map(sc => ({
      metric: String(sc.metric).substring(0, 200),
      target: String(sc.target || 'TBD').substring(0, 200),
      measurementWindow: String(sc.measurementWindow || '30 days').substring(0, 100),
      priority: CRITERION_PRIORITIES.includes(sc.priority) ? sc.priority : 'secondary',
    }));
  }

  // Ensure at least one primary criterion
  if (!successCriteria.some(sc => sc.priority === 'primary')) {
    successCriteria[0].priority = 'primary';
  }

  // Normalize rollback triggers
  let rollbackTriggers = Array.isArray(parsed.rollbackTriggers)
    ? parsed.rollbackTriggers.filter(rt => rt?.condition)
    : [];

  if (rollbackTriggers.length === 0) {
    rollbackTriggers = [{
      condition: 'Error rate exceeds 10% for 1 hour',
      severity: 'critical',
    }];
  } else {
    rollbackTriggers = rollbackTriggers.map(rt => ({
      condition: String(rt.condition).substring(0, 300),
      severity: ['critical', 'warning'].includes(rt.severity) ? rt.severity : 'warning',
    }));
  }

  // Normalize launch tasks
  let launchTasks = Array.isArray(parsed.launchTasks)
    ? parsed.launchTasks.filter(lt => lt?.name)
    : [];

  if (launchTasks.length === 0) {
    launchTasks = [{
      name: 'Execute launch checklist',
      owner: 'Product Owner',
      status: 'pending',
    }];
  } else {
    launchTasks = launchTasks.map(lt => ({
      name: String(lt.name).substring(0, 200),
      owner: String(lt.owner || 'Unassigned').substring(0, 200),
      status: TASK_STATUSES.includes(lt.status) ? lt.status : 'pending',
    }));
  }

  // Normalize planned launch date
  const plannedLaunchDate = parsed.plannedLaunchDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.plannedLaunchDate)
    ? parsed.plannedLaunchDate
    : new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

  // Normalize app store readiness (SD-MAN-INFRA-VISION-HEAL-PLATFORM-001-19)
  const appStoreReadiness = {
    status: APP_STORE_STATUSES.includes(parsed.appStoreReadiness?.status)
      ? parsed.appStoreReadiness.status : 'not_submitted',
    platform: ['ios', 'android', 'web', 'cross_platform'].includes(parsed.appStoreReadiness?.platform)
      ? parsed.appStoreReadiness.platform : 'web',
    complianceScore: Math.max(0, Math.min(100,
      Number(parsed.appStoreReadiness?.complianceScore) || 0)),
    blockers: Array.isArray(parsed.appStoreReadiness?.blockers)
      ? parsed.appStoreReadiness.blockers.filter(b => typeof b === 'string').map(b => b.substring(0, 300))
      : [],
  };

  // Normalize domain deployment
  const domainDeployment = {
    status: DOMAIN_STATUSES.includes(parsed.domainDeployment?.status)
      ? parsed.domainDeployment.status : 'not_configured',
    domain: String(parsed.domainDeployment?.domain || '').substring(0, 253) || 'pending',
    sslValid: Boolean(parsed.domainDeployment?.sslValid),
    cdnConfigured: Boolean(parsed.domainDeployment?.cdnConfigured),
  };

  // Normalize marketing channels
  let marketingChannels = Array.isArray(parsed.marketingChannels)
    ? parsed.marketingChannels.filter(mc => mc?.channel)
    : [];

  if (marketingChannels.length === 0) {
    marketingChannels = [{ channel: 'organic', status: 'not_started', reach: 'TBD' }];
  } else {
    marketingChannels = marketingChannels.map(mc => ({
      channel: String(mc.channel).substring(0, 100),
      status: CHANNEL_STATUSES.includes(mc.status) ? mc.status : 'not_started',
      reach: String(mc.reach || 'TBD').substring(0, 200),
    }));
  }

  // Normalize chairman escalation
  const hasIrreversibleActions = appStoreReadiness.status !== 'not_submitted'
    || domainDeployment.status === 'active'
    || marketingChannels.some(mc => mc.status === 'live');

  const chairmanEscalation = {
    requiresApproval: parsed.chairmanEscalation?.requiresApproval === true || hasIrreversibleActions,
    reason: String(parsed.chairmanEscalation?.reason || (hasIrreversibleActions
      ? 'Irreversible external publish actions detected'
      : 'No irreversible actions detected')).substring(0, 500),
    escalationItems: Array.isArray(parsed.chairmanEscalation?.escalationItems)
      ? parsed.chairmanEscalation.escalationItems.filter(e => typeof e === 'string').map(e => e.substring(0, 300))
      : [],
  };

  // Normalize app rankings (SD-MAN-INFRA-VISION-HEAL-PLATFORM-001-22)
  const categoryRank = Number(parsed.appRankings?.categoryRank) || null;
  const overallRank = Number(parsed.appRankings?.overallRank) || null;
  const rating = parsed.appRankings?.rating != null ? Math.max(0, Math.min(5, Number(parsed.appRankings.rating) || 0)) : null;
  const reviewCount = Number(parsed.appRankings?.reviewCount) || null;

  // Derive tier from category rank
  let rankingTier = 'unknown';
  if (categoryRank != null) {
    if (categoryRank <= 10) rankingTier = 'top10';
    else if (categoryRank <= 50) rankingTier = 'top50';
    else if (categoryRank <= 100) rankingTier = 'top100';
    else rankingTier = 'below100';
  }

  // Detect trend
  const trendValues = ['improving', 'stable', 'declining', 'unknown'];
  const rawTrend = String(parsed.appRankings?.trend || '').toLowerCase();
  const trend = trendValues.includes(rawTrend) ? rawTrend : 'unknown';

  const appRankings = {
    categoryRank,
    overallRank,
    rating,
    reviewCount,
    tier: rankingTier,
    trend,
  };

  // Normalize competitive position
  const marketShareEstimate = parsed.competitivePosition?.marketShareEstimate != null
    ? Math.max(0, Math.min(100, Number(parsed.competitivePosition.marketShareEstimate) || 0))
    : null;
  const competitorCount = Number(parsed.competitivePosition?.competitorCount) || null;
  const differentiationScore = parsed.competitivePosition?.differentiationScore != null
    ? Math.max(0, Math.min(100, Number(parsed.competitivePosition.differentiationScore) || 0))
    : null;

  let competitivePositionValue = 'unknown';
  if (COMPETITIVE_POSITIONS.includes(parsed.competitivePosition?.position)) {
    competitivePositionValue = parsed.competitivePosition.position;
  }

  const competitivePosition = {
    marketShareEstimate,
    competitorCount,
    differentiationScore,
    position: competitivePositionValue,
  };

  // Derived publish metrics
  const liveChannels = marketingChannels.filter(mc => mc.status === 'live').length;
  const totalChannels = marketingChannels.length;
  const publishReadinessScore = Math.round(
    (appStoreReadiness.complianceScore * 0.3)
    + ((domainDeployment.status === 'active' ? 100 : 0) * 0.3)
    + ((liveChannels / Math.max(totalChannels, 1)) * 100 * 0.2)
    + ((launchTasks.filter(lt => lt.status === 'done').length / Math.max(launchTasks.length, 1)) * 100 * 0.2)
  );

  logger.log('[Stage23] Analysis complete', { duration: Date.now() - startTime });
  return {
    launchType,
    launchBrief,
    successCriteria,
    rollbackTriggers,
    launchTasks,
    plannedLaunchDate,
    totalTasks: launchTasks.length,
    blockedTasks: launchTasks.filter(lt => lt.status === 'blocked').length,
    primaryCriteria: successCriteria.filter(sc => sc.priority === 'primary').length,
    totalCriteria: successCriteria.length,
    appStoreReadiness,
    domainDeployment,
    marketingChannels,
    chairmanEscalation,
    publishReadinessScore,
    liveChannels,
    totalChannels,
    requiresChairmanApproval: chairmanEscalation.requiresApproval,
    appRankings,
    competitivePosition,
    fourBuckets, usage,
  };
}


export { LAUNCH_TYPES, TASK_STATUSES, CRITERION_PRIORITIES, APP_STORE_STATUSES, DOMAIN_STATUSES, CHANNEL_STATUSES, APP_RANKING_TIERS, COMPETITIVE_POSITIONS };
