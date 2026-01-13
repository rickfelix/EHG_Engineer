/**
 * Action Items Validator
 * Part of LEO Protocol Gate Q Validation (7-element)
 *
 * Validates that action items for next phase are present (minimum 3).
 */

const MIN_ACTION_ITEMS = 3;

/**
 * Validate action items are present
 * @param {object} context - Validation context with handoff
 * @returns {Promise<object>} Validation result
 */
export async function validateActionItems(context) {
  const { handoff } = context;
  const actionItems = handoff?.action_items || [];

  if (!actionItems || actionItems.length === 0) {
    return {
      passed: false,
      score: 0,
      max_score: 100,
      issues: ['No action items for next phase'],
      warnings: [],
      details: { count: 0, minRequired: MIN_ACTION_ITEMS }
    };
  }

  if (actionItems.length < MIN_ACTION_ITEMS) {
    return {
      passed: false,
      score: Math.round((actionItems.length / MIN_ACTION_ITEMS) * 100),
      max_score: 100,
      issues: [`Only ${actionItems.length} action items, minimum ${MIN_ACTION_ITEMS} recommended`],
      warnings: [],
      details: { count: actionItems.length, minRequired: MIN_ACTION_ITEMS }
    };
  }

  // Check quality of action items
  const specific = actionItems.filter(item => {
    if (typeof item === 'string') return item.length > 15;
    if (typeof item === 'object') return item.description || item.action || item.task;
    return false;
  });

  return {
    passed: true,
    score: 100,
    max_score: 100,
    issues: [],
    warnings: specific.length < actionItems.length ? ['Some action items may need more specificity'] : [],
    details: {
      count: actionItems.length,
      minRequired: MIN_ACTION_ITEMS,
      specific: specific.length
    }
  };
}
