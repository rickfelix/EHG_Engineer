/**
 * Deprecation Registry for Chairman V2 Legacy Components
 * SD: SD-MAN-FEAT-CORRECTIVE-VISION-GAP-008
 *
 * Provides a programmatic API for querying component lifecycle status.
 * Used by EVA tools and future removal SDs to check whether components
 * are deprecated, retained, or marked for migration.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let _inventory = null;

function loadInventory() {
  if (_inventory) return _inventory;
  const inventoryPath = join(__dirname, 'legacy-component-inventory.json');
  const raw = readFileSync(inventoryPath, 'utf8');
  const data = JSON.parse(raw);
  _inventory = data.components || [];
  return _inventory;
}

/**
 * Get all deprecated components from the inventory.
 * @returns {Array<Object>} Array of component entries classified as deprecated
 */
export function getDeprecatedComponents() {
  return loadInventory().filter(c => c.classification === 'deprecated');
}

/**
 * Check if a component path is marked as deprecated.
 * @param {string} componentPath - Relative path from EHG app root
 * @returns {boolean} true if the component is deprecated
 */
export function isDeprecated(componentPath) {
  if (!componentPath || typeof componentPath !== 'string') return false;
  const normalized = componentPath.replace(/\\/g, '/');
  return loadInventory().some(
    c => c.componentPath === normalized && c.classification === 'deprecated'
  );
}

/**
 * Get the removal phase for a component.
 * @param {string} componentPath - Relative path from EHG app root
 * @returns {string|null} Phase name or null if not in a removal phase
 */
export function getRemovalPhase(componentPath) {
  if (!componentPath || typeof componentPath !== 'string') return null;
  const normalized = componentPath.replace(/\\/g, '/');

  let removalPlan;
  try {
    const planPath = join(__dirname, 'removal-plan.json');
    const raw = readFileSync(planPath, 'utf8');
    removalPlan = JSON.parse(raw);
  } catch {
    return null;
  }

  for (const phase of (removalPlan.phases || [])) {
    if (phase.components && phase.components.includes(normalized)) {
      return phase.name;
    }
  }
  return null;
}

/**
 * Get inventory statistics by classification.
 * @returns {{ deprecated: number, retain: number, migrate: number }}
 */
export function getInventoryStats() {
  const components = loadInventory();
  const stats = { deprecated: 0, retain: 0, migrate: 0 };
  for (const c of components) {
    if (c.classification in stats) {
      stats[c.classification]++;
    }
  }
  return stats;
}
