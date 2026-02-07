/**
 * SD Builders for /learn command
 *
 * Functions that build SD fields from learning items (patterns, improvements).
 * Extracted from executor.js for maintainability.
 */

/**
 * Validate learning item shape before rendering (RCA-LEARN-EMPTY-IMPROVEMENTS)
 * Ensures field consistency between context-builder and sd-builders
 *
 * @param {Object} item - Learning item to validate
 * @param {number} index - Item index (for error messages)
 * @throws {Error} If item is missing both id and pattern_id
 */
function validateLearningItem(item, index) {
  if (!item.id && !item.pattern_id) {
    throw new Error(`Learning item ${index} missing both 'id' and 'pattern_id' fields`);
  }

  // If it looks like a pattern (has category/severity), ensure pattern_id is set
  if ((item.category || item.severity || item.occurrence_count) && !item.pattern_id) {
    console.warn(`⚠️  Warning: Pattern-like item ${item.id} missing 'pattern_id' field - may render incorrectly`);
    console.warn(`   Expected pattern fields: category="${item.category}", severity="${item.severity}"`);
    console.warn('   This indicates a field contract violation between context-builder and sd-builders');
  }

  // If it looks like an improvement (has improvement_type/target_table), ensure description is set
  if ((item.improvement_type || item.target_table) && !item.description) {
    console.warn(`⚠️  Warning: Improvement-like item ${item.id} missing 'description' field - may render incorrectly`);
    console.warn(`   Expected improvement fields: improvement_type="${item.improvement_type}", target_table="${item.target_table}"`);
  }
}

/**
 * Build SD description from selected items
 * @param {Array} items - Selected patterns and improvements
 * @returns {string}
 */
export function buildSDDescription(items) {
  const lines = ['## Items to Address\n'];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // RCA-LEARN-EMPTY-IMPROVEMENTS: Validate item shape before rendering
    validateLearningItem(item, i);

    if (item.pattern_id) {
      lines.push(`### Pattern: ${item.pattern_id}`);
      lines.push(`- **Category:** ${item.category || 'Unknown'}`);
      lines.push(`- **Severity:** ${item.severity || 'Unknown'}`);
      lines.push(`- **Summary:** ${item.issue_summary || 'No summary'}`);
      lines.push(`- **Occurrences:** ${item.occurrence_count || 1}`);
      lines.push('');
    } else {
      lines.push(`### Improvement: ${item.improvement_type || 'General'}`);
      lines.push(`- **Description:** ${item.description || 'No description'}`);
      lines.push(`- **Evidence Count:** ${item.evidence_count || 0}`);
      lines.push(`- **Target Table:** ${item.target_table || 'N/A'}`);
      lines.push('');
    }
  }

  lines.push('## Source');
  lines.push('Created automatically by `/learn` command based on accumulated evidence.');

  return lines.join('\n');
}

/**
 * Build SD title from selected items
 * @param {Array} items - Selected patterns and improvements
 * @returns {string}
 */
export function buildSDTitle(items) {
  if (items.length === 1) {
    const item = items[0];
    if (item.pattern_id) {
      return `Address ${item.pattern_id}: ${(item.issue_summary || '').slice(0, 60)}`;
    }
    return (item.description || 'Learning improvement').slice(0, 80);
  }

  const patternCount = items.filter(i => i.pattern_id).length;
  const improvementCount = items.length - patternCount;

  const parts = [];
  if (patternCount > 0) parts.push(`${patternCount} pattern(s)`);
  if (improvementCount > 0) parts.push(`${improvementCount} improvement(s)`);

  return `Address ${parts.join(' and ')} from /learn`;
}

/**
 * Build success_metrics from selected items with quantifiable baselines
 * @param {Array} items - Selected patterns and improvements
 * @returns {Array} success_metrics array
 */
export function buildSuccessMetrics(items) {
  const metrics = [];

  for (const item of items) {
    if (item.pattern_id) {
      const count = item.occurrence_count || 1;
      metrics.push({
        metric: `${item.pattern_id} recurrence rate`,
        baseline: `${count} occurrence(s) recorded in issue_patterns`,
        target: '0 new occurrences in 30 days post-implementation',
        actual: `${count} occurrences currently`,
        measurement: 'Query issue_patterns for pattern_id after SD completion'
      });
    } else {
      const desc = (item.description || 'Improvement').slice(0, 50);
      const evidence = item.evidence_count || 0;
      metrics.push({
        metric: `${desc}... implementation`,
        baseline: `${evidence} evidence item(s) supporting this improvement`,
        target: 'Implementation validated via smoke tests and sub-agent verification',
        actual: '0% - pending implementation',
        measurement: 'Verify implementation exists in codebase and passes validation'
      });
    }
  }

  metrics.push({
    metric: 'PLAN-TO-LEAD handoff gate score',
    baseline: 'N/A (new SD)',
    target: '≥55% on first attempt without manual metadata patching',
    actual: 'pending',
    measurement: 'RETROSPECTIVE_QUALITY_GATE score from handoff validation'
  });

  return metrics;
}

/**
 * Build smoke_test_steps from selected items
 * @param {Array} items - Selected patterns and improvements
 * @returns {Array} smoke_test_steps array
 */
export function buildSmokeTestSteps(items) {
  const steps = [];

  for (const item of items) {
    if (item.pattern_id) {
      steps.push(`Verify ${item.pattern_id} no longer occurs in the codebase`);
    } else {
      const desc = (item.description || 'improvement').slice(0, 60);
      steps.push(`Verify ${desc}... is implemented correctly`);
    }
  }

  steps.push('Run relevant tests to confirm no regressions');
  return steps;
}

/**
 * Build strategic_objectives from selected items
 * @param {Array} items - Selected patterns and improvements
 * @returns {Array} strategic_objectives array
 */
export function buildStrategicObjectives(items) {
  const objectives = [];

  for (const item of items) {
    if (item.pattern_id) {
      objectives.push(`Eliminate ${item.pattern_id} pattern from the codebase`);
    } else {
      const desc = (item.description || 'improvement').slice(0, 60);
      objectives.push(`Implement: ${desc}`);
    }
  }

  if (objectives.length === 0) {
    objectives.push('Address all identified learning items');
  }

  return objectives;
}

/**
 * Build success_criteria from selected items with quantifiable measures
 * @param {Array} items - Selected patterns and improvements
 * @returns {Array} success_criteria array
 */
export function buildSuccessCriteria(items) {
  const criteria = [];

  for (const item of items) {
    if (item.pattern_id) {
      const count = item.occurrence_count || 1;
      criteria.push({
        criterion: `${item.pattern_id} root cause addressed`,
        measure: `Pattern occurrence drops from ${count} to 0; verified by querying issue_patterns table`,
        verification: 'Automated: check issue_patterns WHERE pattern_id = X AND created_at > SD completion date'
      });
    } else {
      const desc = (item.description || 'improvement').slice(0, 60);
      criteria.push({
        criterion: `${desc}... implemented and validated`,
        measure: 'Implementation exists in codebase, smoke tests pass, sub-agent verification confirms',
        verification: `Manual: code review confirms ${item.target_table || 'target'} changes are correct`
      });
    }
  }

  criteria.push({
    criterion: 'SD completes LEO workflow without manual metadata patching',
    measure: 'PLAN-TO-LEAD handoff passes RETROSPECTIVE_QUALITY_GATE ≥55% on first attempt',
    verification: 'Automated: handoff gate score logged in sd_phase_handoffs'
  });

  return criteria;
}

/**
 * Build risks from selected items for SD metadata
 * @param {Array} items - Selected patterns and improvements
 * @returns {Array} risks array with mitigation strategies
 */
export function buildRisks(items) {
  const risks = [];

  const hasProtocolItems = items.some(i =>
    i.category === 'protocol' || i.description?.toLowerCase().includes('protocol')
  );
  const hasDatabaseItems = items.some(i =>
    i.category === 'database' || i.description?.toLowerCase().includes('schema') ||
    i.description?.toLowerCase().includes('migration')
  );

  if (hasProtocolItems) {
    risks.push({
      risk: 'Protocol section changes may conflict with existing gate logic',
      severity: 'medium',
      mitigation: 'Regenerate CLAUDE*.md files after changes and run handoff precheck to verify gates still pass',
      rollback: 'Revert leo_protocol_sections entries and regenerate'
    });
  }

  if (hasDatabaseItems) {
    risks.push({
      risk: 'Database schema changes may break existing queries or RLS policies',
      severity: 'high',
      mitigation: 'Use DATABASE sub-agent for all schema changes; test with smoke tests before merging',
      rollback: 'Revert migration via compensating SQL or restore from backup'
    });
  }

  if (items.length > 3) {
    risks.push({
      risk: 'Large batch of changes increases regression risk',
      severity: 'medium',
      mitigation: 'Implement changes incrementally; run smoke tests after each change',
      rollback: 'Cherry-pick individual changes rather than reverting all'
    });
  }

  // Always include a low-risk baseline
  if (risks.length === 0) {
    risks.push({
      risk: 'Implementation may not fully address root cause of learning items',
      severity: 'low',
      mitigation: 'Verify each item against its original evidence; check issue_patterns for recurrence after 30 days',
      rollback: 'Items can be re-queued via /learn if pattern recurs'
    });
  }

  return risks;
}

/**
 * Build key_changes from selected items for SD metadata
 * @param {Array} items - Selected patterns and improvements
 * @returns {Array} key_changes array
 */
export function buildKeyChanges(items) {
  const changes = [];

  for (const item of items) {
    if (item.pattern_id) {
      changes.push({
        change: `Address pattern ${item.pattern_id}: ${(item.issue_summary || '').slice(0, 80)}`,
        type: 'fix',
        impact: `Eliminates ${item.occurrence_count || 1} recorded occurrence(s) of this pattern`
      });
    } else {
      changes.push({
        change: `Implement improvement: ${(item.description || '').slice(0, 80)}`,
        type: 'enhancement',
        impact: `Based on ${item.evidence_count || 0} evidence item(s) from retrospectives`
      });
    }
  }

  return changes;
}

/**
 * Build key_principles from selected items
 * @param {Array} items - Selected patterns and improvements
 * @returns {Array} key_principles array
 */
export function buildKeyPrinciples(items) {
  const principles = [
    'Follow LEO Protocol for all changes',
    'Ensure backward compatibility',
    'Validate changes with appropriate sub-agents'
  ];

  const hasProtocolItems = items.some(i =>
    i.category === 'protocol' ||
    i.pattern_id?.includes('PROTOCOL') ||
    i.description?.toLowerCase().includes('protocol')
  );

  if (hasProtocolItems) {
    principles.push('Document protocol changes in CLAUDE.md');
  }

  const hasDatabaseItems = items.some(i =>
    i.category === 'database' ||
    i.pattern_id?.includes('DB') ||
    i.description?.toLowerCase().includes('database') ||
    i.description?.toLowerCase().includes('schema')
  );

  if (hasDatabaseItems) {
    principles.push('Use DATABASE sub-agent for all schema changes');
  }

  return principles;
}
