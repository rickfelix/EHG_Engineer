#!/usr/bin/env node
/**
 * Detailed retrospective analysis focusing on specific actionable improvements
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function detailedAnalysis() {
  let client;

  try {
    client = await createDatabaseClient('engineer', { verbose: false });

    const query = `
      SELECT
        sd_id,
        title,
        quality_score,
        failure_patterns,
        improvement_areas,
        what_needs_improvement,
        action_items,
        key_learnings,
        quality_issues
      FROM retrospectives
      WHERE quality_score >= 60
      ORDER BY created_at DESC
      LIMIT 15;
    `;

    console.log('\n🔍 DETAILED RETROSPECTIVE ANALYSIS\n');
    console.log('='.repeat(80));

    const result = await client.query(query);

    // Collect all improvement-related data
    const failurePatterns = new Map();
    const improvementAreas = new Map();
    const actionItems = new Map();
    const qualityIssues = new Map();

    result.rows.forEach((retro) => {
      // Failure patterns
      (retro.failure_patterns || []).forEach(pattern => {
        if (pattern && typeof pattern === 'string') {
          failurePatterns.set(pattern, (failurePatterns.get(pattern) || 0) + 1);
        }
      });

      // Improvement areas
      (retro.improvement_areas || []).forEach(area => {
        if (area && typeof area === 'string') {
          improvementAreas.set(area, (improvementAreas.get(area) || 0) + 1);
        }
      });

      // Action items (extract from JSONB)
      if (retro.action_items) {
        if (Array.isArray(retro.action_items)) {
          retro.action_items.forEach(item => {
            if (typeof item === 'string') {
              actionItems.set(item, (actionItems.get(item) || 0) + 1);
            } else if (typeof item === 'object' && item.action) {
              actionItems.set(item.action, (actionItems.get(item.action) || 0) + 1);
            }
          });
        } else if (typeof retro.action_items === 'object') {
          Object.values(retro.action_items).forEach(item => {
            if (typeof item === 'string') {
              actionItems.set(item, (actionItems.get(item) || 0) + 1);
            }
          });
        }
      }

      // Quality issues (extract from JSONB)
      if (retro.quality_issues) {
        if (Array.isArray(retro.quality_issues)) {
          retro.quality_issues.forEach(issue => {
            if (typeof issue === 'string') {
              qualityIssues.set(issue, (qualityIssues.get(issue) || 0) + 1);
            } else if (typeof issue === 'object' && issue.description) {
              qualityIssues.set(issue.description, (qualityIssues.get(issue.description) || 0) + 1);
            }
          });
        }
      }

      // What needs improvement (extract from JSONB)
      if (retro.what_needs_improvement) {
        if (Array.isArray(retro.what_needs_improvement)) {
          retro.what_needs_improvement.forEach(item => {
            if (typeof item === 'string') {
              improvementAreas.set(item, (improvementAreas.get(item) || 0) + 1);
            }
          });
        } else if (typeof retro.what_needs_improvement === 'object') {
          Object.values(retro.what_needs_improvement).forEach(item => {
            if (typeof item === 'string') {
              improvementAreas.set(item, (improvementAreas.get(item) || 0) + 1);
            }
          });
        }
      }
    });

    // Print failure patterns
    console.log('\n❌ FAILURE PATTERNS (Most Common)');
    console.log('-'.repeat(80));
    if (failurePatterns.size === 0) {
      console.log('No failure patterns recorded ✅');
    } else {
      [...failurePatterns.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([pattern, count]) => {
          console.log(`[${count}x] ${pattern}`);
        });
    }

    // Print improvement areas
    console.log('\n🔧 AREAS FOR IMPROVEMENT (Most Common)');
    console.log('-'.repeat(80));
    if (improvementAreas.size === 0) {
      console.log('No improvement areas recorded');
    } else {
      [...improvementAreas.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .forEach(([area, count]) => {
          console.log(`[${count}x] ${area}`);
        });
    }

    // Print action items
    console.log('\n✅ ACTION ITEMS (Most Common)');
    console.log('-'.repeat(80));
    if (actionItems.size === 0) {
      console.log('No action items recorded');
    } else {
      [...actionItems.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([item, count]) => {
          console.log(`[${count}x] ${item}`);
        });
    }

    // Print quality issues
    console.log('\n⚠️ QUALITY ISSUES (Most Common)');
    console.log('-'.repeat(80));
    if (qualityIssues.size === 0) {
      console.log('No quality issues recorded ✅');
    } else {
      [...qualityIssues.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([issue, count]) => {
          console.log(`[${count}x] ${issue}`);
        });
    }

    // Generate specific recommendations
    console.log('\n\n' + '='.repeat(80));
    console.log('ACTIONABLE RECOMMENDATIONS FOR CLAUDE.md IMPROVEMENTS');
    console.log('='.repeat(80));

    const recommendations = [];

    // Check for context/documentation issues
    const contextIssues = [...improvementAreas.entries()].filter(([area]) =>
      area.toLowerCase().includes('context') ||
      area.toLowerCase().includes('documentation') ||
      area.toLowerCase().includes('clarity')
    );

    if (contextIssues.length > 0) {
      recommendations.push({
        category: 'CLAUDE.md - Documentation Clarity',
        priority: 'HIGH',
        issue: contextIssues.map(([area, count]) => `${area} (${count}x)`).join('; '),
        recommendation: 'Add more examples and decision trees to CLAUDE.md router files'
      });
    }

    // Check for sub-agent invocation issues
    const subAgentIssues = [...failurePatterns.entries()].filter(([pattern]) =>
      pattern.toLowerCase().includes('sub-agent') ||
      pattern.toLowerCase().includes('database agent') ||
      pattern.toLowerCase().includes('qa director')
    );

    if (subAgentIssues.length > 0) {
      recommendations.push({
        category: 'Sub-Agent Invocation',
        priority: 'HIGH',
        issue: subAgentIssues.map(([pattern, count]) => `${pattern} (${count}x)`).join('; '),
        recommendation: 'Strengthen Principal Database Architect prompt to invoke DB agent immediately on errors'
      });
    }

    // Check for handoff/gate issues
    const handoffIssues = [...failurePatterns.entries()].filter(([pattern]) =>
      pattern.toLowerCase().includes('handoff') ||
      pattern.toLowerCase().includes('gate') ||
      pattern.toLowerCase().includes('validation')
    );

    if (handoffIssues.length > 0) {
      recommendations.push({
        category: 'LEO Protocol - Gates & Handoffs',
        priority: 'MEDIUM',
        issue: handoffIssues.map(([pattern, count]) => `${pattern} (${count}x)`).join('; '),
        recommendation: 'Add pre-flight validation checklist to CLAUDE_PLAN.md'
      });
    }

    // Check for testing issues
    const testingIssues = [...improvementAreas.entries()].filter(([area]) =>
      area.toLowerCase().includes('test') ||
      area.toLowerCase().includes('e2e') ||
      area.toLowerCase().includes('coverage')
    );

    if (testingIssues.length > 0) {
      recommendations.push({
        category: 'Testing Strategy',
        priority: 'MEDIUM',
        issue: testingIssues.map(([area, count]) => `${area} (${count}x)`).join('; '),
        recommendation: 'Expand CLAUDE_EXEC.md with more detailed E2E testing patterns'
      });
    }

    if (recommendations.length === 0) {
      console.log('\n✅ No high-priority issues detected across recent retrospectives!');
    } else {
      recommendations.forEach((rec, idx) => {
        console.log(`\n[${idx + 1}] ${rec.priority} - ${rec.category}`);
        console.log(`    Issue: ${rec.issue}`);
        console.log(`    Recommendation: ${rec.recommendation}`);
      });
    }

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    if (client) {
      await client.end();
    }
  }
}

detailedAnalysis()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
