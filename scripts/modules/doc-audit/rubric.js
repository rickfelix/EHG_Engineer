/**
 * Doc-Audit Rubric — Dimension definitions and weights
 *
 * Pure data module. No logic, no side-effects.
 * Mirrors the HEAL scoring pattern for documentation health.
 *
 * Used by:
 *   scripts/modules/doc-audit/scorer.js    (dimension scoring)
 *   scripts/modules/doc-audit/reporter.js  (display)
 *   scripts/eva/doc-health-audit.mjs       (entry point)
 */

import { GRADE } from '../../../lib/standards/grade-scale.js';

// ─── Dimension Definitions ──────────────────────────────────────────────────

export const DIMENSIONS = [
  {
    id: 'D01',
    name: 'Location Compliance',
    weight: 0.15,
    description: 'No .md files in prohibited dirs (src/, lib/, scripts/, tests/, public/). Docs in correct category dirs.',
  },
  {
    id: 'D02',
    name: 'Metadata Completeness',
    weight: 0.12,
    description: 'Required YAML front-matter: Category, Status, Version, Author, Last Updated, Tags.',
  },
  {
    id: 'D03',
    name: 'Naming Convention',
    weight: 0.08,
    description: 'kebab-case filenames. Allowed exceptions: README, CLAUDE*, API_REFERENCE, CHANGELOG.',
  },
  {
    id: 'D04',
    name: 'Cross-Reference Integrity',
    weight: 0.12,
    description: 'Internal links resolve. Relative paths used. No broken links.',
  },
  {
    id: 'D05',
    name: 'Content Freshness',
    weight: 0.10,
    description: 'Docs with Last Updated within 90 days. Penalty for stale docs (>180 days).',
  },
  {
    id: 'D06',
    name: 'Index Coverage',
    weight: 0.10,
    description: 'Every docs/ subdirectory has a README.md. New docs listed in parent index.',
  },
  {
    id: 'D07',
    name: 'Structural Completeness',
    weight: 0.10,
    description: 'Docs >200 lines have TOC. All docs have clear title (# heading). Guides have examples.',
  },
  {
    id: 'D08',
    name: 'Database-First Compliance',
    weight: 0.08,
    description: 'LEO protocol docs sourced from leo_protocol_sections. No rogue protocol .md outside generated CLAUDE*.md.',
  },
  {
    id: 'D09',
    name: 'Orphan Detection',
    weight: 0.08,
    description: 'Docs linked from at least one index or cross-reference. Dead docs penalized.',
  },
  {
    id: 'D10',
    name: 'Duplicate Detection',
    weight: 0.07,
    description: 'No two docs covering the same topic in different locations. Flagged by filename similarity.',
  },
];

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
