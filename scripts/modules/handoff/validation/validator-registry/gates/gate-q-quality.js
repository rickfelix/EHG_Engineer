/**
 * Gate Q - Quality Gate Validators (7-element validators)
 * Part of SD-LEO-REFACTOR-VALIDATOR-REG-001
 */

/**
 * Register Gate Q validators
 * @param {import('../core.js').ValidatorRegistry} registry
 */
export function registerGateQValidators(registry) {
  registry.register('executiveSummaryComplete', async (context) => {
    const { handoff } = context;
    const summary = handoff?.executive_summary || '';

    if (summary.length < 100) {
      return {
        passed: false,
        score: 50,
        max_score: 100,
        issues: [`Executive summary too short: ${summary.length} chars, min 100`]
      };
    }
    return { passed: true, score: 100, max_score: 100, issues: [] };
  }, 'Executive summary completeness');

  registry.register('keyDecisionsDocumented', async (context) => {
    const { handoff } = context;
    const decisions = handoff?.key_decisions || [];

    if (decisions.length === 0) {
      return {
        passed: false,
        score: 50,
        max_score: 100,
        issues: ['No key decisions documented']
      };
    }
    return { passed: true, score: 100, max_score: 100, issues: [] };
  }, 'Key decisions documentation');

  registry.register('knownIssuesTracked', async (context) => {
    const { handoff } = context;
    // Known issues can be empty if explicitly stated
    const issues = handoff?.known_issues;
    if (issues === undefined) {
      return {
        passed: false,
        score: 70,
        max_score: 100,
        warnings: ['known_issues field not set (should be empty array if none)']
      };
    }
    return { passed: true, score: 100, max_score: 100, issues: [] };
  }, 'Known issues tracking');

  registry.register('actionItemsPresent', async (context) => {
    const { handoff } = context;
    const actionItems = handoff?.action_items || [];

    if (actionItems.length < 3) {
      return {
        passed: false,
        score: 50,
        max_score: 100,
        issues: [`Only ${actionItems.length} action items, minimum 3 recommended`]
      };
    }
    return { passed: true, score: 100, max_score: 100, issues: [] };
  }, 'Action items presence');

  registry.register('completenessReportValid', async (context) => {
    const { handoff } = context;
    const report = handoff?.completeness_report || {};
    const issues = [];

    if (!report.phase) issues.push('completeness_report missing phase');
    if (report.score === undefined) issues.push('completeness_report missing score');
    if (!report.status) issues.push('completeness_report missing status');

    return {
      passed: issues.length === 0,
      score: issues.length === 0 ? 100 : 50,
      max_score: 100,
      issues
    };
  }, 'Completeness report validation');
}
