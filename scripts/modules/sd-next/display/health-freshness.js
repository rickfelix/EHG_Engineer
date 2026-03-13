/**
 * Health Freshness Advisory Display
 * SD: SD-LEO-INFRA-PRIORITY-SCORER-HEALTH-001 (FR-5)
 *
 * Shows a non-blocking advisory when health snapshots are stale (>24h old).
 */

import { colors } from '../colors.js';

/**
 * Display health snapshot freshness advisory.
 *
 * @param {{ stale: boolean, message: string, lastScan: string|null, hoursOld: number|null }} freshness
 */
export function displayHealthFreshness(freshness) {
  if (!freshness) return;

  if (freshness.stale) {
    console.log(`\n${colors.yellow}${colors.bold}HEALTH ADVISORY${colors.reset}`);
    console.log(`${colors.yellow}   ⚠️  ${freshness.message}${colors.reset}`);
    if (freshness.lastScan) {
      console.log(`${colors.dim}   Last scan: ${new Date(freshness.lastScan).toLocaleString()}${colors.reset}`);
    }
  }
}
