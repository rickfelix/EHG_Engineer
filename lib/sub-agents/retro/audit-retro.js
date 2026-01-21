/**
 * RETRO Sub-Agent Audit Retrospective Generation
 * Phase 7 of Runtime Audit Protocol
 * Extracted from retro.js for modularity
 */

import { storeRetrospectiveContributions } from './db-operations.js';

/**
 * Generate audit retrospective
 * Implements Phase 7 of the runtime audit protocol with:
 * - Chairman Authority Rule (2x weighting for Chairman verbatim)
 * - Multi-voice contributions (triangulation partners, sub-agents)
 * - Coverage and divergence analysis
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} auditContext - Audit context from audit-retro.mjs
 * @param {Object} results - Results object to populate
 * @returns {Promise<Object>} Audit retrospective results
 */
export async function generateAuditRetrospective(supabase, auditContext, results) {
  console.log('\n📋 Generating Audit Retrospective...');

  if (!auditContext) {
    results.critical_issues.push({
      severity: 'CRITICAL',
      issue: 'No audit context provided for audit retrospective',
      recommendation: 'Pass auditContext in options when calling RETRO with mode=audit_retro'
    });
    results.verdict = 'BLOCKED';
    return results;
  }

  const { audit_id, audit_file_path, findings, triangulation, chairman_verbatim, sub_agent_contributions, metrics } = auditContext;

  console.log('\n📊 Phase 1: Analyzing coverage...');
  const coverage = analyzeCoverage(findings || [], metrics);
  console.log(`   Total findings: ${coverage.total}`);
  console.log(`   SD Created: ${coverage.sd_created}`);
  console.log(`   Deferred: ${coverage.deferred}`);
  console.log(`   Coverage: ${coverage.coverage_pct}%`);

  console.log('\n🔍 Phase 2: Extracting triangulation divergence insights...');
  const divergence = analyzeTriangulationDivergence(triangulation || []);
  console.log(`   Consensus entries: ${divergence.consensus_count}`);
  console.log(`   Divergent entries: ${divergence.divergent_count}`);

  console.log('\n🤖 Phase 3: Collecting sub-agent contributions...');
  const contributions = aggregateSubAgentContributions(sub_agent_contributions || []);
  console.log(`   Contributions collected: ${contributions.total}`);

  console.log('\n👤 Phase 4: Applying Chairman Authority Rule (2x weighting)...');
  const chairmanInsights = extractChairmanInsights(chairman_verbatim || []);
  console.log(`   Verbatim citations: ${chairmanInsights.citations.length}`);
  console.log(`   Strategic observations: ${chairmanInsights.learnings.length}`);

  console.log('\n📝 Phase 5: Generating retrospective content...');

  const whatWentWell = [
    `Captured ${coverage.total} findings across application`,
    `Achieved ${coverage.coverage_pct}% triage coverage`,
    ...(divergence.consensus_count > 0 ? [`Triangulation achieved ${Math.round(divergence.consensus_count / (divergence.consensus_count + divergence.divergent_count) * 100)}% consensus rate`] : []),
    ...contributions.what_went_well
  ];

  const whatNeedsImprovement = [
    ...divergence.missed_by_consensus,
    ...chairmanInsights.improvement_areas.map(a => a.observation)
  ];

  const keyLearnings = [
    ...extractPatternCandidates(findings || []),
    ...divergence.model_specific_insights,
    ...chairmanInsights.learnings.map(l => ({
      learning: l.text,
      source: 'chairman_authority',
      weight: l.weight,
      immutable: l.immutable
    }))
  ];

  const qualityScore = calculateAuditRetroQuality(coverage, chairmanInsights, divergence);
  console.log(`\n⭐ Quality score: ${qualityScore}/100`);

  const retroData = {
    target_application: 'EHG',
    title: `Audit Retrospective: ${audit_file_path || 'Unknown'}`,
    retro_type: 'AUDIT',
    status: qualityScore >= 70 ? 'published' : 'draft',
    auto_generated: true,
    what_went_well: whatWentWell,
    what_needs_improvement: whatNeedsImprovement,
    key_learnings: keyLearnings.map(l => typeof l === 'string' ? l : l.learning),
    audit_id,
    coverage_analysis: coverage,
    triangulation_divergence_insights: divergence,
    verbatim_citations: chairmanInsights.citations,
    quality_score: qualityScore,
    action_items: generateAuditActionItems(coverage, divergence, chairmanInsights)
  };

  console.log('\n💾 Phase 8: Storing retrospective...');

  try {
    const { data: retroRecord, error: retroError } = await supabase
      .from('retrospectives')
      .insert(retroData)
      .select('id')
      .single();

    if (retroError) {
      console.log(`   ⚠️ Failed to store retrospective: ${retroError.message}`);
      results.warnings.push(`Failed to store retrospective: ${retroError.message}`);
    } else {
      console.log(`   ✅ Retrospective stored: ${retroRecord.id}`);
      results.findings.retrospective = {
        id: retroRecord.id,
        quality_score: qualityScore,
        status: retroData.status
      };

      await storeRetrospectiveContributions(supabase, retroRecord.id, chairmanInsights, contributions, triangulation);
    }
  } catch (err) {
    console.log(`   ⚠️ Database error: ${err.message}`);
    results.warnings.push(`Database error: ${err.message}`);
  }

  if (audit_id) {
    await supabase
      .from('runtime_audits')
      .update({
        status: 'retro_complete',
        closed_at: new Date().toISOString()
      })
      .eq('id', audit_id);
  }

  results.findings.audit_coverage = coverage;
  results.findings.triangulation_divergence = divergence;
  results.findings.chairman_insights = chairmanInsights;
  results.findings.quality_score = qualityScore;

  results.detailed_analysis = {
    coverage_analysis: coverage,
    divergence_insights: divergence.insights,
    chairman_authority_applied: chairmanInsights.learnings.length > 0,
    pattern_candidates: extractPatternCandidates(findings || [])
  };

  if (coverage.coverage_pct < 100) {
    results.warnings.push(`Incomplete triage: ${coverage.pending} items still pending`);
  }
  if (chairmanInsights.citations.length < 3) {
    results.warnings.push(`Low verbatim preservation: ${chairmanInsights.citations.length} citations (target: >= 3)`);
  }
  if (divergence.divergent_count === 0) {
    results.recommendations.push('No divergence insights captured - consider reviewing triangulation methodology');
  }

  results.verdict = qualityScore >= 70 ? 'PASS' : 'PASS_WITH_CONCERNS';
  results.confidence = qualityScore;

  console.log(`\n🏁 Audit RETRO Complete: ${results.verdict} (${qualityScore}% confidence)`);
  return results;
}

/**
 * Analyze coverage from audit findings
 */
export function analyzeCoverage(findings, metrics) {
  const coverage = {
    total: findings.length || metrics?.total_findings || 0,
    pending: 0,
    sd_created: 0,
    deferred: 0,
    wont_fix: 0,
    duplicate: 0,
    needs_discovery: 0,
    coverage_pct: 0
  };

  for (const finding of findings) {
    const disposition = finding.disposition || 'pending';
    if (coverage[disposition] !== undefined) {
      coverage[disposition]++;
    }
  }

  if (metrics) {
    coverage.coverage_pct = metrics.coverage_pct || 0;
    coverage.consensus_rate = metrics.consensus_rate || 0;
    coverage.verbatim_preservation_rate = metrics.verbatim_preservation_rate || 0;
  } else if (coverage.total > 0) {
    coverage.coverage_pct = Math.round((coverage.total - coverage.pending) / coverage.total * 1000) / 10;
  }

  return coverage;
}

/**
 * Analyze triangulation divergence
 */
export function analyzeTriangulationDivergence(triangulation) {
  const divergence = {
    consensus_count: 0,
    divergent_count: 0,
    insights: [],
    missed_by_consensus: [],
    model_specific_insights: []
  };

  for (const entry of triangulation) {
    if (entry.consensus_type === 'DIVERGENT' || entry.consensus_score < 70) {
      divergence.divergent_count++;
      divergence.insights.push({
        issue_id: entry.issue_id,
        consensus_type: entry.consensus_type,
        consensus_score: entry.consensus_score,
        claude_analysis: entry.claude_analysis?.substring(0, 200),
        chatgpt_analysis: entry.chatgpt_analysis?.substring(0, 200),
        antigravity_analysis: entry.antigravity_analysis?.substring(0, 200),
        final_decision: entry.final_decision
      });

      if (entry.final_decision && entry.final_decision.includes('missed')) {
        divergence.missed_by_consensus.push(entry.final_decision);
      }
    } else {
      divergence.consensus_count++;
    }

    if (entry.claude_analysis && entry.claude_analysis.includes('unique insight')) {
      divergence.model_specific_insights.push(`Claude: ${entry.claude_analysis.substring(0, 100)}`);
    }
  }

  return divergence;
}

/**
 * Aggregate sub-agent contributions
 */
export function aggregateSubAgentContributions(contributions) {
  const aggregated = {
    total: contributions.length,
    by_agent: {},
    what_went_well: [],
    observations: [],
    risks: [],
    recommendations: []
  };

  for (const contrib of contributions) {
    const agentCode = contrib.sub_agent_code || 'UNKNOWN';
    if (!aggregated.by_agent[agentCode]) {
      aggregated.by_agent[agentCode] = [];
    }
    aggregated.by_agent[agentCode].push(contrib);

    const rc = contrib.retro_contribution || {};
    if (rc.observation) {
      aggregated.observations.push({
        agent: agentCode,
        observation: rc.observation,
        severity: rc.severity
      });
    }
    if (rc.suggested_action) {
      aggregated.recommendations.push({
        agent: agentCode,
        recommendation: rc.suggested_action
      });
    }
  }

  return aggregated;
}

/**
 * Extract Chairman insights with 2x weighting (Antigravity's insight)
 */
export function extractChairmanInsights(verbatimList) {
  return {
    citations: verbatimList.slice(0, 10),
    learnings: verbatimList.map(v => ({
      source: 'chairman',
      text: v,
      weight: 2.0,
      immutable: true
    })),
    improvement_areas: verbatimList
      .filter(v => {
        const lower = v.toLowerCase();
        return lower.includes('first principles') ||
               lower.includes('needs') ||
               lower.includes('purpose unclear') ||
               lower.includes('rethink') ||
               lower.includes('should be');
      })
      .map(v => ({
        observation: v,
        source: 'chairman_authority',
        override_consensus: true
      }))
  };
}

/**
 * Extract pattern candidates from findings
 */
export function extractPatternCandidates(findings) {
  const patterns = [];
  const typeCount = {};
  const routePatterns = {};

  for (const finding of findings) {
    const type = finding.issue_type || 'unknown';
    typeCount[type] = (typeCount[type] || 0) + 1;

    const route = finding.route_path || 'unknown';
    const routeBase = route.split('/').slice(0, 3).join('/');
    if (!routePatterns[routeBase]) {
      routePatterns[routeBase] = [];
    }
    routePatterns[routeBase].push(finding.original_issue_id);
  }

  for (const [type, count] of Object.entries(typeCount)) {
    if (count >= 3) {
      patterns.push(`Pattern: ${count} ${type} issues - consider systemic fix`);
    }
  }

  for (const [route, issues] of Object.entries(routePatterns)) {
    if (issues.length >= 3) {
      patterns.push(`Pattern: ${issues.length} issues in ${route} area (${issues.slice(0, 3).join(', ')})`);
    }
  }

  return patterns;
}

/**
 * Calculate audit retrospective quality score
 */
export function calculateAuditRetroQuality(coverage, chairmanInsights, divergence) {
  let score = 0;

  // Coverage (25%)
  if (coverage.coverage_pct === 100) {
    score += 25;
  } else {
    score += Math.round(coverage.coverage_pct * 0.25);
  }

  // Verbatim citations (20%)
  const citationCount = chairmanInsights.citations.length;
  if (citationCount >= 3) {
    score += 20;
  } else {
    score += citationCount * 7;
  }

  // Evidence-linked lessons (20%)
  score += chairmanInsights.learnings.length > 0 ? 20 : 0;

  // SMART action items (15%)
  score += chairmanInsights.improvement_areas.length > 0 ? 15 : 0;

  // Divergence analysis (10%)
  score += divergence.divergent_count > 0 ? 10 : 0;

  // Process/product split (10%)
  score += (coverage.deferred > 0 || coverage.wont_fix > 0) ? 10 : 0;

  return Math.min(100, Math.round(score));
}

/**
 * Generate action items from audit retrospective
 */
export function generateAuditActionItems(coverage, divergence, chairmanInsights) {
  const actions = [];

  if (coverage.pending > 0) {
    actions.push({
      action: `Complete triage for ${coverage.pending} pending items`,
      owner: 'Triage Team',
      deadline: 'Before next audit',
      success_criteria: '100% triage coverage',
      priority: 'high'
    });
  }

  if (divergence.divergent_count > 0) {
    actions.push({
      action: `Review ${divergence.divergent_count} divergent triangulation findings`,
      owner: 'Architecture Team',
      deadline: 'Within 1 week',
      success_criteria: 'All divergent findings resolved or documented',
      priority: 'medium'
    });
  }

  for (const area of chairmanInsights.improvement_areas.slice(0, 3)) {
    actions.push({
      action: `Address Chairman observation: ${area.observation.substring(0, 80)}...`,
      owner: 'Product Team',
      deadline: 'Next sprint',
      success_criteria: 'Observation addressed or SD created',
      priority: 'high',
      source: 'chairman_authority'
    });
  }

  return actions;
}
