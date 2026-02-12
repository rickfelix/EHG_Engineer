/**
 * Findings Extractor - Knowledge Feedback Loop
 * SD-LEO-INFRA-DATABASE-DRIVEN-DYNAMIC-001, Phase 6
 *
 * After a team completes, extracts structured findings into
 * issue_patterns for future teams to learn from.
 */

import IssueKnowledgeBase from '../learning/issue-knowledge-base.js';

const issueKB = new IssueKnowledgeBase();

/**
 * Extract team findings into issue_patterns.
 *
 * @param {Object} options
 * @param {string} options.teamName - Team identifier
 * @param {Object} [options.rcaReport] - Structured RCA JSON (if available)
 * @param {Array<{agent: string, finding: string, severity: string}>} options.findings - Team findings
 * @param {string} [options.sdId] - SD context
 * @returns {Promise<{patternsCreated: number, patternsUpdated: number, details: Array}>}
 */
export async function extractTeamFindings({
  teamName: _teamName,
  rcaReport = null,
  findings = [],
  sdId = null,
}) {
  const results = { patternsCreated: 0, patternsUpdated: 0, details: [] };

  // 1. Extract findings from RCA report if available
  const allFindings = [...findings];
  if (rcaReport) {
    if (rcaReport.root_cause) {
      allFindings.push({
        agent: 'rca-lead',
        finding: rcaReport.root_cause,
        severity: rcaReport.classification === 'code_bug' ? 'high' : 'medium',
        category: rcaReport.category || 'general',
        solution: rcaReport.capa_corrective?.[0]?.action || null,
      });
    }
    // Extract expert findings
    if (Array.isArray(rcaReport.experts_consulted)) {
      for (const expert of rcaReport.experts_consulted) {
        if (expert.findings) {
          allFindings.push({
            agent: expert.expert,
            finding: expert.findings,
            severity: 'medium',
            category: inferCategory(expert.expert),
          });
        }
      }
    }
  }

  // 2. Process each finding
  for (const finding of allFindings) {
    if (!finding.finding || finding.finding.length < 10) continue;

    try {
      // Check for existing similar patterns
      const similar = await issueKB.search(finding.finding, { limit: 1 });

      if (similar.length > 0 && similar[0].similarity > 0.4) {
        // Update existing pattern — increment occurrence
        const pattern = similar[0];
        await issueKB.recordOccurrence({
          pattern_id: pattern.pattern_id,
          sd_id: sdId,
          solution_applied: finding.solution || `Team finding from ${finding.agent}`,
          resolution_time_minutes: 0,
          was_successful: true,
          found_via_search: false,
        });
        results.patternsUpdated++;
        results.details.push({
          action: 'updated',
          patternId: pattern.pattern_id,
          similarity: similar[0].similarity,
          finding: finding.finding.substring(0, 80),
        });
      } else {
        // Create new pattern
        const created = await issueKB.createPattern({
          issue_summary: finding.finding.substring(0, 500),
          category: finding.category || inferCategory(finding.agent),
          severity: finding.severity || 'medium',
          sd_id: sdId,
          solution: finding.solution || null,
          related_sub_agents: [finding.agent],
          source: 'team_investigation',
        });
        results.patternsCreated++;
        results.details.push({
          action: 'created',
          patternId: created.pattern_id,
          finding: finding.finding.substring(0, 80),
        });
      }
    } catch (err) {
      console.warn(`   ⚠️  Failed to process finding from ${finding.agent}: ${err.message}`);
      results.details.push({
        action: 'error',
        agent: finding.agent,
        error: err.message,
      });
    }
  }

  console.log(`   📊 Findings: ${results.patternsCreated} created, ${results.patternsUpdated} updated`);
  return results;
}

/**
 * Infer issue pattern category from agent name/type.
 */
function inferCategory(agentName) {
  const name = (agentName || '').toLowerCase();
  if (name.includes('database') || name.includes('db')) return 'database';
  if (name.includes('security')) return 'security';
  if (name.includes('api')) return 'api';
  if (name.includes('performance') || name.includes('perf')) return 'performance';
  if (name.includes('testing') || name.includes('test')) return 'testing';
  if (name.includes('design') || name.includes('ui')) return 'ui';
  if (name.includes('rca')) return 'debugging';
  return 'general';
}
