/**
 * Brainstorm Pipeline Health Advisory Display
 *
 * Shows a non-blocking advisory in sd:next when brainstorms
 * have fallen through the pipeline cracks.
 */

import { colors } from '../colors.js';

/**
 * Display brainstorm pipeline health advisory.
 *
 * @param {{ show: boolean, message: string, count: number }} summary
 */
export function displayBrainstormPipelineAdvisory(summary) {
  if (!summary || !summary.show) return;

  console.log(`\n${colors.yellow}${colors.bold}BRAINSTORM PIPELINE${colors.reset}`);
  console.log(`${colors.yellow}   ${summary.message}${colors.reset}`);
}
