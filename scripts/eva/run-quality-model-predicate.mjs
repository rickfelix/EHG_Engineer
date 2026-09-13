#!/usr/bin/env node
/**
 * CI entry point for the Venture Quality Model v1 two-limb predicate (FR-4).
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-B.
 *
 * Exits 1 (blocking) only on a limb-1 failure (a generated category with no registry
 * dimension). Limb-2 (advisory) findings are printed but never affect the exit code --
 * the workflow step wraps this in continue-on-error for defense-in-depth, but the
 * script's own exit code already reflects the intended blocking/advisory split.
 */
import { QUALITY_MODEL_DIMENSIONS } from '../../lib/eva/quality-model/registry.js';
import { FINDING_CATEGORIES } from '../../lib/eva/quality-findings/finding-shape.js';
import {
  STAGE23_REQUIRED_CATEGORY_IDS, STAGE23_ADVISORY_CATEGORY_IDS, STAGE23_GROWTH_CATEGORY_IDS,
} from '../../lib/eva/quality-model/registry.js';
import { evaluateQualityModelPredicate } from '../../lib/eva/quality-model/predicate.js';

const generatedCategoryIds = [
  ...FINDING_CATEGORIES,
  ...STAGE23_REQUIRED_CATEGORY_IDS,
  ...STAGE23_ADVISORY_CATEGORY_IDS,
  ...STAGE23_GROWTH_CATEGORY_IDS,
];

const result = evaluateQualityModelPredicate({ generatedCategoryIds, dimensions: QUALITY_MODEL_DIMENSIONS });

console.log(`[quality-model-predicate] limb 1 (blocking): ${result.blocking.pass ? 'PASS' : 'FAIL'}`);
if (!result.blocking.pass) {
  console.log(`  orphan categories (no registry dimension): ${result.blocking.orphanCategories.join(', ')}`);
}

console.log(`[quality-model-predicate] limb 2 (advisory): ${result.advisory.findings.length} finding(s)`);
for (const f of result.advisory.findings) {
  console.log(`  - ${f.id}: missing ${f.missing}`);
}

if (!result.pass) {
  console.error('[quality-model-predicate] BLOCKING FAILURE: a generated category has no registry dimension.');
  process.exit(1);
}
console.log('[quality-model-predicate] limb 1 passed.');
process.exit(0);
