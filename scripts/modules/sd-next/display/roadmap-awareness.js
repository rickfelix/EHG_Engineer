/**
 * Roadmap Awareness Display for SD-Next
 * Part of SD-LEO-ORCH-ARCHITECTURE-PHASE-COVERAGE-001-D
 *
 * Displays unscheduled architecture phases from roadmap_wave_items
 * so that deferred phases remain visible between gate checks.
 */

import { colors } from '../colors.js';

/**
 * Display unscheduled roadmap items in the sd:next queue output.
 * Shows nothing when all items are scheduled (clean state).
 *
 * @param {Array} unscheduledItems - Items from loadUnscheduledRoadmapItems()
 */
export function displayRoadmapAwareness(unscheduledItems) {
  if (!unscheduledItems || unscheduledItems.length === 0) return;

  console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.bold}${colors.yellow}ROADMAP (Unscheduled Architecture Phases):${colors.reset}\n`);
  console.log(`${colors.dim}  ${unscheduledItems.length} architecture phase(s) without a scheduled SD${colors.reset}\n`);

  for (const item of unscheduledItems) {
    const title = (item.title || item.metadata?.phase_title || 'Untitled phase').substring(0, 60);
    const planTitle = item.metadata?.source_plan_title;
    const source = planTitle ? `${colors.dim}from: ${planTitle.substring(0, 30)}${colors.reset}` : '';
    const created = item.created_at ? `${colors.dim}added: ${new Date(item.created_at).toLocaleDateString()}${colors.reset}` : '';
    const separator = source && created ? ' | ' : '';

    console.log(`  ${colors.yellow}○${colors.reset} ${title}`);
    if (source || created) {
      console.log(`    ${source}${separator}${created}`);
    }
  }

  console.log(`\n${colors.dim}  These phases need SDs created via /leo create --from-plan${colors.reset}`);
}
