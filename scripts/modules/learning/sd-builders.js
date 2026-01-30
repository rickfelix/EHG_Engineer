/**
 * SD Builders for /learn command
 *
 * Functions that build SD fields from learning items (patterns, improvements).
 * Extracted from executor.js for maintainability.
 */

/**
 * Build SD description from selected items
 * @param {Array} items - Selected patterns and improvements
 * @returns {string}
 */
export function buildSDDescription(items) {
  const lines = ['## Items to Address\n'];

  for (const item of items) {
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
 * Build success_metrics from selected items
 * @param {Array} items - Selected patterns and improvements
 * @returns {Array} success_metrics array
 */
export function buildSuccessMetrics(items) {
  const metrics = [];

  for (const item of items) {
    if (item.pattern_id) {
      metrics.push({
        metric: `${item.pattern_id} recurrence rate`,
        target: '0 occurrences after implementation',
        actual: `${item.occurrence_count || 1} occurrences currently`
      });
    } else {
      const desc = (item.description || 'Improvement').slice(0, 50);
      metrics.push({
        metric: `${desc}... implementation`,
        target: '100% implemented and validated',
        actual: '0% - pending implementation'
      });
    }
  }

  if (metrics.length === 0) {
    metrics.push({
      metric: 'Learning items addressed',
      target: '100%',
      actual: '0%'
    });
  }

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
 * Build success_criteria from selected items
 * @param {Array} items - Selected patterns and improvements
 * @returns {Array} success_criteria array
 */
export function buildSuccessCriteria(items) {
  const criteria = [];

  for (const item of items) {
    if (item.pattern_id) {
      criteria.push({
        criterion: `${item.pattern_id} eliminated from codebase`,
        measure: 'Zero occurrences after implementation'
      });
    } else {
      const desc = (item.description || 'improvement').slice(0, 60);
      criteria.push({
        criterion: `${desc}... implemented`,
        measure: 'Feature fully functional and tested'
      });
    }
  }

  // Ensure at least one criterion (constraint requires non-empty array)
  if (criteria.length === 0) {
    criteria.push({
      criterion: 'All learning items addressed',
      measure: '100% completion with validation'
    });
  }

  return criteria;
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
