#!/usr/bin/env node
/**
 * V08 Scope & Authorization Boundaries — Dimension Scorer
 * SD: SD-MAN-GEN-CORRECTIVE-VISION-GAP-007-02
 *
 * Evaluates V08 enforcement metrics:
 * - Route auth coverage (% of protected routes with enforced auth)
 * - NEVER_AUTONOMOUS code enforcement (deny list exists and blocks)
 * - Scope validation mode (advisory vs blocking)
 *
 * Can be run standalone or imported by vision-scorer.js for integration.
 *
 * Usage:
 *   node scripts/eva/v08-scope-auth-scorer.js          # Score and display
 *   node scripts/eva/v08-scope-auth-scorer.js --json    # JSON output
 */

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Score the V08 dimension based on enforcement metrics.
 *
 * Scoring rubric:
 *   Route Auth Coverage:         0-40 points (based on % enforced)
 *   NEVER_AUTONOMOUS Enforcement: 0-30 points (code check exists)
 *   Scope Validation Mode:       0-30 points (advisory=10, blocking=30)
 *
 * @returns {{ score: number, maxScore: number, breakdown: Object, govFindings: Object }}
 */
export async function scoreV08() {
  let enforcer, registry;
  try {
    enforcer = await import(pathToFileURL(resolve(__dirname, '../../lib/eva/scope-validation-enforcer.js')).href);
    registry = await import(pathToFileURL(resolve(__dirname, '../../lib/eva/never-autonomous-registry.js')).href);
  } catch {
    return {
      score: 0,
      maxScore: 100,
      breakdown: {
        routeAuthCoverage: { score: 0, max: 40, reason: 'Enforcement modules not found' },
        neverAutonomous: { score: 0, max: 30, reason: 'Registry module not found' },
        scopeValidation: { score: 0, max: 30, reason: 'Enforcer module not found' }
      },
      govFindings: {}
    };
  }

  const metrics = enforcer.getV08EnforcementMetrics();
  const denyList = registry.getDenyList();

  // Route Auth Coverage: 0-40 points
  const routeAuthScore = Math.round((metrics.routeAuthCoverage / 100) * 40);

  // NEVER_AUTONOMOUS: 0-30 points
  let neverAutonomousScore = 0;
  let neverAutonomousReason = 'No deny list';
  if (denyList.length > 0 && metrics.neverAutonomousEnforced) {
    neverAutonomousScore = 30;
    neverAutonomousReason = `Deny list active (${denyList.length} operations blocked)`;
  } else if (denyList.length > 0) {
    neverAutonomousScore = 15;
    neverAutonomousReason = `Deny list exists but enforcement not verified`;
  }

  // Scope Validation Mode: 0-30 points
  let scopeScore = 0;
  let scopeReason = 'No scope validation';
  if (metrics.scopeValidationMode === 'blocking') {
    scopeScore = 30;
    scopeReason = 'Blocking enforcement active';
  } else if (metrics.scopeValidationMode === 'advisory') {
    scopeScore = 10;
    scopeReason = 'Advisory mode only (not enforcing)';
  }

  const totalScore = routeAuthScore + neverAutonomousScore + scopeScore;

  return {
    score: totalScore,
    maxScore: 100,
    breakdown: {
      routeAuthCoverage: {
        score: routeAuthScore,
        max: 40,
        pct: metrics.routeAuthCoverage,
        reason: `${metrics.details.enforcedRoutes}/${metrics.details.totalRoutes} routes enforced`
      },
      neverAutonomous: {
        score: neverAutonomousScore,
        max: 30,
        denyListSize: denyList.length,
        enforced: metrics.neverAutonomousEnforced,
        reason: neverAutonomousReason
      },
      scopeValidation: {
        score: scopeScore,
        max: 30,
        mode: metrics.scopeValidationMode,
        reason: scopeReason
      }
    },
    govFindings: {
      'GOV-001': metrics.details.govResolved.includes('GOV-001') ? 'resolved' : 'open',
      'GOV-002': metrics.details.govResolved.includes('GOV-002') ? 'resolved' : 'open',
      'GOV-003': metrics.details.govResolved.includes('GOV-003') ? 'resolved' : 'open',
      'GOV-011': metrics.details.govResolved.includes('GOV-011') ? 'resolved' : 'open'
    }
  };
}

// CLI entrypoint
const isMain = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isMain) {
  const result = await scoreV08();
  const jsonMode = process.argv.includes('--json');

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('');
    console.log('V08 Scope & Authorization Boundaries');
    console.log('=' .repeat(50));
    console.log(`  Score: ${result.score}/${result.maxScore}`);
    console.log('');
    console.log('  Breakdown:');
    console.log(`    Route Auth Coverage:    ${result.breakdown.routeAuthCoverage.score}/${result.breakdown.routeAuthCoverage.max} — ${result.breakdown.routeAuthCoverage.reason}`);
    console.log(`    NEVER_AUTONOMOUS:       ${result.breakdown.neverAutonomous.score}/${result.breakdown.neverAutonomous.max} — ${result.breakdown.neverAutonomous.reason}`);
    console.log(`    Scope Validation:       ${result.breakdown.scopeValidation.score}/${result.breakdown.scopeValidation.max} — ${result.breakdown.scopeValidation.reason}`);
    console.log('');
    console.log('  GOV Findings:');
    Object.entries(result.govFindings).forEach(([k, v]) => {
      console.log(`    ${k}: ${v === 'resolved' ? 'RESOLVED' : 'OPEN'}`);
    });
    console.log('');
  }
}
