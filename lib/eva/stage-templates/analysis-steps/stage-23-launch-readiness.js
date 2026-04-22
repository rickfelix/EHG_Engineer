/**
 * Stage 23 Analysis Step — Launch Readiness Kill Gate
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-E
 *
 * Aggregates readiness signals from S20-S22. Returns checklist
 * with pass/fail per category and overall launch verdict.
 */

const CATEGORIES = ['code_quality', 'marketing_assets', 'distribution_channels', 'analytics', 'monitoring', 'legal'];

export async function analyzeStage23LaunchReadiness(params) {
  const { stage20Data, stage21Data, stage22Data, ventureName, logger = console } = params;

  logger.info?.(`[S23-LaunchReadiness] Aggregating readiness for ${ventureName || 'unknown'}`);

  const checklist = CATEGORIES.map(cat => {
    let status = 'pending';
    let detail = '';

    switch (cat) {
      case 'code_quality':
        if (stage20Data?.verdict === 'PASS') { status = 'pass'; detail = 'Code quality gate passed'; }
        else if (stage20Data?.verdict === 'FAIL') { status = 'fail'; detail = `${stage20Data?.summary?.by_severity?.critical || 0} critical issues`; }
        else if (stage20Data?.verdict === 'WARN') { status = 'warn'; detail = 'Warnings present but no critical issues'; }
        break;
      case 'marketing_assets':
        if (stage21Data?.total_assets > 0) { status = 'pass'; detail = `${stage21Data.total_assets} assets generated`; }
        break;
      case 'distribution_channels':
        if (stage22Data?.active_channels > 0) { status = 'pass'; detail = `${stage22Data.active_channels} channels active`; }
        break;
      default:
        status = 'pending';
        detail = 'Not yet configured';
    }
    return { category: cat, status, detail };
  });

  const passCount = checklist.filter(c => c.status === 'pass').length;
  const failCount = checklist.filter(c => c.status === 'fail').length;
  const verdict = failCount > 0 ? 'HOLD' : passCount >= 3 ? 'READY' : 'NOT_READY';

  return {
    checklist,
    verdict,
    venture_name: ventureName,
    pass_count: passCount,
    fail_count: failCount,
    pending_count: checklist.filter(c => c.status === 'pending').length,
    total_categories: CATEGORIES.length,
    readiness_pct: Math.round((passCount / CATEGORIES.length) * 100),
  };
}

export { CATEGORIES };
