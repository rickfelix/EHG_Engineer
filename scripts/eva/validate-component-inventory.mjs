/**
 * Validate Component Inventory
 * SD: SD-MAN-FEAT-CORRECTIVE-VISION-GAP-008
 *
 * Cross-validates the legacy component inventory against the actual EHG app
 * filesystem. Ensures:
 *   1. Each listed component file exists in the EHG app
 *   2. All required fields are non-empty
 *   3. Removal plan component references match inventory entries
 *
 * Usage: node scripts/eva/validate-component-inventory.mjs
 * Output: JSON summary { passed, total, valid, issues }
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve, normalize } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(fileURLToPath(import.meta.url), '..');

const REQUIRED_FIELDS = [
  'componentPath',
  'componentName',
  'category',
  'classification',
  'rationale'
];

function resolveEhgAppPath() {
  const registryPath = join(__dirname, '..', '..', 'applications', 'registry.json');
  if (!existsSync(registryPath)) {
    throw new Error(`applications/registry.json not found at ${registryPath}`);
  }

  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));

  // Find EHG app entry — registry.applications is an object keyed by APP001, APP002, etc.
  const apps = registry.applications || {};
  const ehgApp = Object.values(apps).find(a =>
    a.name === 'ehg' || a.github_repo === 'rickfelix/ehg.git'
  );

  if (ehgApp && ehgApp.local_path) {
    return normalize(ehgApp.local_path);
  }

  // Fallback: try known path
  const fallback = normalize('C:/Users/rickf/Projects/_EHG/ehg');
  if (existsSync(fallback)) return fallback;

  throw new Error('Could not resolve EHG app path from registry or fallback');
}

function loadInventory() {
  const inventoryPath = join(__dirname, '..', '..', 'lib', 'eva', 'chairman-v2', 'legacy-component-inventory.json');
  if (!existsSync(inventoryPath)) {
    throw new Error(`Inventory file not found: ${inventoryPath}`);
  }
  const data = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  return data.components || [];
}

function loadRemovalPlan() {
  const planPath = join(__dirname, '..', '..', 'lib', 'eva', 'chairman-v2', 'removal-plan.json');
  if (!existsSync(planPath)) return null;
  return JSON.parse(readFileSync(planPath, 'utf8'));
}

function validateFieldCompleteness(component, index) {
  const issues = [];
  for (const field of REQUIRED_FIELDS) {
    const value = component[field];
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      issues.push(`Component ${index} (${component.componentName || 'unknown'}): empty required field '${field}'`);
    }
  }
  return issues;
}

function validateFileExistence(component, ehgAppPath) {
  const fullPath = join(ehgAppPath, component.componentPath.replace(/\//g, '/'));
  const normalizedPath = normalize(fullPath);
  if (!existsSync(normalizedPath)) {
    return `File not found: ${component.componentPath} (resolved: ${normalizedPath})`;
  }
  return null;
}

function validateRemovalPlanReferences(components, removalPlan) {
  if (!removalPlan) return [];
  const issues = [];
  const inventoryPaths = new Set(components.map(c => c.componentPath));

  for (const phase of (removalPlan.phases || [])) {
    for (const compPath of (phase.components || [])) {
      if (!inventoryPaths.has(compPath)) {
        issues.push(`Removal plan phase '${phase.name}' references '${compPath}' which is not in inventory`);
      }
    }
  }
  return issues;
}

async function main() {
  const issues = [];
  let total = 0;
  let valid = 0;

  try {
    const ehgAppPath = resolveEhgAppPath();
    const components = loadInventory();
    const removalPlan = loadRemovalPlan();
    total = components.length;

    // Validate each component
    for (let i = 0; i < components.length; i++) {
      const comp = components[i];
      const fieldIssues = validateFieldCompleteness(comp, i);
      issues.push(...fieldIssues);

      const fileIssue = validateFileExistence(comp, ehgAppPath);
      if (fileIssue) {
        issues.push(fileIssue);
      }

      if (fieldIssues.length === 0 && !fileIssue) {
        valid++;
      }
    }

    // Validate removal plan cross-references
    const planIssues = validateRemovalPlanReferences(components, removalPlan);
    issues.push(...planIssues);

  } catch (err) {
    issues.push(`Validation error: ${err.message}`);
  }

  const result = {
    passed: issues.length === 0,
    total,
    valid,
    issues
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}

main();
