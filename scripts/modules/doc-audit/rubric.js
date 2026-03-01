/**
 * Doc-Audit Rubric — 14-dimension definitions and weights
 *
 * D01-D10: Structural dimensions (sync, no DB required).
 * D11-D14: Coverage dimensions (async, requires Supabase or filesystem).
 *
 * Weights are stored for 'full' mode (all 14 sum to 1.0).
 * getDimensions('structural') rescales D01-D10 to sum to 1.0.
 *
 * Used by:
 *   scripts/modules/doc-audit/scorer.js    (dimension scoring)
 *   scripts/modules/doc-audit/reporter.js  (display)
 *   scripts/eva/doc-health-audit.mjs       (entry point)
 */

import { GRADE } from '../../../lib/standards/grade-scale.js';

// ─── Dimension Definitions (full-mode weights, sum = 1.0) ───────────────────

export const DIMENSIONS = [
  // ── Structural (D01-D10) ──
  {
    id: 'D01',
    name: 'Location Compliance',
    weight: 0.0930,
    category: 'structural',
    description: 'No .md files in prohibited dirs (src/, lib/, scripts/, tests/, public/). Docs in correct category dirs.',
  },
  {
    id: 'D02',
    name: 'Metadata Completeness',
    weight: 0.0744,
    category: 'structural',
    description: 'Required YAML front-matter: Category, Status, Version, Author, Last Updated, Tags.',
  },
  {
    id: 'D03',
    name: 'Naming Convention',
    weight: 0.0496,
    category: 'structural',
    description: 'kebab-case filenames. Allowed exceptions: README, CLAUDE*, API_REFERENCE, CHANGELOG.',
  },
  {
    id: 'D04',
    name: 'Cross-Reference Integrity',
    weight: 0.0744,
    category: 'structural',
    description: 'Internal links resolve. Relative paths used. No broken links.',
  },
  {
    id: 'D05',
    name: 'Content Freshness',
    weight: 0.0620,
    category: 'structural',
    description: 'Docs with Last Updated within 90 days. Penalty for stale docs (>180 days).',
  },
  {
    id: 'D06',
    name: 'Index Coverage',
    weight: 0.0620,
    category: 'structural',
    description: 'Every docs/ subdirectory has a README.md. New docs listed in parent index.',
  },
  {
    id: 'D07',
    name: 'Structural Completeness',
    weight: 0.0620,
    category: 'structural',
    description: 'Docs >200 lines have TOC. All docs have clear title (# heading). Guides have examples.',
  },
  {
    id: 'D08',
    name: 'Database-First Compliance',
    weight: 0.0496,
    category: 'structural',
    description: 'LEO protocol docs sourced from leo_protocol_sections. No rogue protocol .md outside generated CLAUDE*.md.',
  },
  {
    id: 'D09',
    name: 'Orphan Detection',
    weight: 0.0496,
    category: 'structural',
    description: 'Docs linked from at least one index or cross-reference. Dead docs penalized.',
  },
  {
    id: 'D10',
    name: 'Duplicate Detection',
    weight: 0.0434,
    category: 'structural',
    description: 'No two docs covering the same topic in different locations. Flagged by filename similarity.',
  },
  // ── Coverage (D11-D14) ──
  {
    id: 'D11',
    name: 'Vision Coverage',
    weight: 0.1000,
    category: 'coverage',
    description: 'Vision capability dimensions have corresponding documentation.',
  },
  {
    id: 'D12',
    name: 'Architecture Coverage',
    weight: 0.0800,
    category: 'coverage',
    description: 'Architecture plan components have corresponding documentation.',
  },
  {
    id: 'D13',
    name: 'SD Documentation Coverage',
    weight: 0.1200,
    category: 'coverage',
    description: 'Completed SDs (feature/api/infrastructure, last 180 days) have corresponding documentation.',
  },
  {
    id: 'D14',
    name: 'Content Accuracy',
    weight: 0.0800,
    category: 'coverage',
    description: 'Documentation content matches codebase reality. Classifies docs as ACCURATE/DRIFTED/ASPIRATIONAL/STALE/UNVERIFIABLE.',
  },
];

// ─── Dimension Accessor ─────────────────────────────────────────────────────

/**
 * Get dimensions for a scoring mode.
 * @param {'full'|'structural'} mode
 *   - 'full': All 14 dimensions (D01-D14), weights sum to 1.0
 *   - 'structural': D01-D10 only, weights rescaled to sum to 1.0
 * @returns {Array<{id: string, name: string, weight: number, category: string, description: string}>}
 */
export function getDimensions(mode = 'full') {
  if (mode === 'structural') {
    const structural = DIMENSIONS.filter(d => d.category === 'structural');
    const totalWeight = structural.reduce((sum, d) => sum + d.weight, 0);
    return structural.map(d => ({
      ...d,
      weight: +(d.weight / totalWeight).toFixed(4),
    }));
  }
  return DIMENSIONS;
}

// ─── Grade Thresholds (reuses standard grade scale) ─────────────────────────

export const GRADE_THRESHOLDS = {
  ACCEPT:      GRADE.A,        // >=93 — no action
  MINOR:       GRADE.B,        // 83-92 — minor documentation SD
  GAP_CLOSURE: GRADE.C_MINUS,  // 70-82 — gap-closure documentation SD
  ESCALATION:  GRADE.F,        // <70 — escalation documentation SD
};

// ─── Threshold Action Classification ────────────────────────────────────────

export const THRESHOLD_ACTIONS = {
  accept:        { label: 'PASS',  priority: null },
  minor_sd:      { label: 'MINOR', priority: 'medium' },
  gap_closure_sd: { label: 'GAP',   priority: 'high' },
  escalate:      { label: 'FAIL',  priority: 'critical' },
};

/**
 * Classify a numeric score into a threshold action.
 * Returns the DB-compatible threshold_action string.
 */
export function classifyScore(score) {
  if (score >= GRADE_THRESHOLDS.ACCEPT)      return 'accept';
  if (score >= GRADE_THRESHOLDS.MINOR)       return 'minor_sd';
  if (score >= GRADE_THRESHOLDS.GAP_CLOSURE) return 'gap_closure_sd';
  return 'escalate';
}

/**
 * Map a numeric score to a letter grade.
 */
export function letterGrade(score) {
  if (score >= GRADE.A_PLUS)  return 'A+';
  if (score >= GRADE.A)       return 'A';
  if (score >= GRADE.A_MINUS) return 'A-';
  if (score >= GRADE.B_PLUS)  return 'B+';
  if (score >= GRADE.B)       return 'B';
  if (score >= GRADE.B_MINUS) return 'B-';
  if (score >= GRADE.C_PLUS)  return 'C+';
  if (score >= GRADE.C)       return 'C';
  if (score >= GRADE.C_MINUS) return 'C-';
  if (score >= GRADE.D_PLUS)  return 'D+';
  if (score >= GRADE.D)       return 'D';
  if (score >= GRADE.D_MINUS) return 'D-';
  return 'F';
}
