/**
 * Regression tests for lib/prd-grounding-validator.js — the first FUNCTIONAL coverage for
 * this module (the only prior reference was a static source-grep guard).
 *
 * SD-FDBK-FIX-FIX-PRD-GROUNDING-001: validateRequirement used to build its scoring text as
 * (title || requirement) + description, treating `title` and `requirement` as synonyms.
 * Generators emit title as a short label and `requirement` as the rich body, so when both
 * were present the body was silently dropped → the FR scored ~1-2% Jaccard on the label
 * alone → add-prd QUALITY GATE FAILED (any req 0% OR avg < 5%). Witnessed live on
 * SD-LEO-INFRA-ADAM-EVA-SEAM-001 (flag e8008b14).
 *
 * The matrix locks: (a) the fixed trap shape, (b) byte-identical scoring for the shapes
 * that dominate real payloads (~91%: requirement-only, title+description, title-only),
 * (c) display semantics (requirement_title = title || requirement) unchanged, and
 * (d) the aggregate hallucination path the add-prd gate consumes.
 */
import { describe, it, expect } from 'vitest';
import { validateRequirement, validatePRDGrounding } from '../../lib/prd-grounding-validator.js';

// An SD with enough vocabulary that a body reusing it scores well above the 5% floor.
const SD = {
  id: 'SD-TEST-GROUNDING-001',
  title: 'Fix the scheduler heartbeat watcher and acceptance routing',
  description: 'The scheduler watcher must detect a stale heartbeat row, claim the revival ' +
    'with a compare-and-swap on the instance token, spawn the daemon detached, and confirm ' +
    'takeover. Generated artifacts land in a pending acceptance state for chairman review ' +
    'instead of auto-applying. The management reviews table must hold genuine reviews only.',
  scope: 'Watcher claim and confirm phases, heartbeat staleness detection threshold, ' +
    'acceptance state routing for generated artifacts, reviews table purge verification.',
  rationale: 'A dead scheduler froze the heartbeat while status lied as running.',
  strategic_objectives: ['Detect stale heartbeat and revive the scheduler watcher daemon'],
};

// A rich body that reuses SD vocabulary heavily (the realistic well-grounded FR body).
const RICH_BODY = 'The watcher must detect the stale heartbeat row by age, claim the revival ' +
  'via compare-and-swap on the instance token, spawn the daemon detached, confirm takeover, ' +
  'and route generated artifacts into the pending acceptance state for chairman review.';

const SHORT_TITLE = 'Watcher claim and confirm';

describe('validateRequirement — reqText field assembly (the trap fix)', () => {
  it('TRAP SHAPE FIXED: title + rich requirement body scores on the body, not the label alone', () => {
    const withBoth = validateRequirement({ id: 'FR-1', title: SHORT_TITLE, requirement: RICH_BODY }, SD);
    const bodyAsDescription = validateRequirement({ id: 'FR-1', title: SHORT_TITLE, description: RICH_BODY }, SD);
    // The body must contribute regardless of which field carries it: comparable confidence.
    expect(withBoth.confidence).toBeCloseTo(bodyAsDescription.confidence, 5);
    // And decisively above the 5% hallucination floor that produced the witnessed failure.
    expect(withBoth.confidence).toBeGreaterThan(0.05);
  });

  it('title + requirement no longer scores like title-only (the witnessed ~1-2% mode)', () => {
    const titleOnly = validateRequirement({ id: 'FR-1', title: SHORT_TITLE }, SD);
    const withBody = validateRequirement({ id: 'FR-1', title: SHORT_TITLE, requirement: RICH_BODY }, SD);
    expect(withBody.confidence).toBeGreaterThan(titleOnly.confidence);
  });

  it('UNCHANGED: requirement-only FR scores identically to the same text via the old title-fallback path', () => {
    // Old code: reqTitle = requirement.requirement → reqText = body. New code: same single part.
    const reqOnly = validateRequirement({ id: 'FR-1', requirement: RICH_BODY }, SD);
    const titleCarrier = validateRequirement({ id: 'FR-1', title: RICH_BODY }, SD);
    expect(reqOnly.confidence).toBeCloseTo(titleCarrier.confidence, 10);
  });

  it('UNCHANGED: title + description (dominant existing shape) keeps its score', () => {
    const r = validateRequirement({ id: 'FR-1', title: SHORT_TITLE, description: RICH_BODY }, SD);
    // Equivalent to scoring the concatenated text directly — the pre-fix assembly for this shape.
    const concat = validateRequirement({ id: 'FR-1', title: `${SHORT_TITLE} ${RICH_BODY}` }, SD);
    expect(r.confidence).toBeCloseTo(concat.confidence, 10);
  });

  it('DEDUPE: title === requirement collapses to one copy (no double-weighting)', () => {
    const dup = validateRequirement({ id: 'FR-1', title: RICH_BODY, requirement: RICH_BODY }, SD);
    const single = validateRequirement({ id: 'FR-1', title: RICH_BODY }, SD);
    expect(dup.confidence).toBeCloseTo(single.confidence, 10);
  });

  it('ROBUSTNESS: empty/missing all text fields does not throw and yields confidence 0', () => {
    const r = validateRequirement({ id: 'FR-1' }, SD);
    expect(r.confidence).toBe(0);
    const r2 = validateRequirement({ id: 'FR-2', title: '   ', requirement: '', description: null }, SD);
    expect(r2.confidence).toBe(0);
  });
});

describe('validateRequirement — display semantics locked (requirement_title)', () => {
  const shapes = [
    { id: 'FR-1', title: SHORT_TITLE, requirement: RICH_BODY },
    { id: 'FR-2', requirement: RICH_BODY },
    { id: 'FR-3', title: SHORT_TITLE, description: RICH_BODY },
    { id: 'FR-4', title: SHORT_TITLE },
    { id: 'FR-5' },
  ];
  it('requirement_title = title || requirement || "" across all shapes (unchanged by the fix)', () => {
    for (const req of shapes) {
      const r = validateRequirement(req, SD);
      expect(r.requirement_title).toBe(req.title || req.requirement || '');
    }
  });
});

describe('validateRequirement — context-exclusion tightening (documented correct behavior)', () => {
  it('an excluded pattern inside the requirement BODY now fires the penalty (clean title)', () => {
    // cli context excludes UI patterns; previously only title+description were scanned,
    // so a body-carried excluded pattern escaped. Scanning the body is the correct
    // semantics — the requirement field IS part of the requirement (0 real payload hits).
    const clean = validateRequirement(
      { id: 'FR-1', title: SHORT_TITLE, requirement: RICH_BODY },
      SD, { implementationContext: 'cli' }
    );
    const tainted = validateRequirement(
      { id: 'FR-1', title: SHORT_TITLE, requirement: `${RICH_BODY} The page must be responsive design.` },
      SD, { implementationContext: 'cli' }
    );
    const cleanExcl = clean.factors.find((f) => f.name === 'context_exclusion');
    const taintedExcl = tainted.factors.find((f) => f.name === 'context_exclusion');
    expect(cleanExcl).toBeUndefined();
    expect(taintedExcl).toBeDefined();
    expect(taintedExcl.score).toBe(-30);
  });
});

describe('validatePRDGrounding — aggregate gate path (what add-prd consumes)', () => {
  it('a grounded PRD whose FRs carry rich `requirement` bodies passes the hallucination floor', () => {
    const prd = {
      functional_requirements: [
        { id: 'FR-1', title: SHORT_TITLE, requirement: RICH_BODY },
        { id: 'FR-2', title: 'Acceptance routing', requirement: 'Generated artifacts must land in the pending acceptance state for chairman review, never auto-applying.' },
      ],
    };
    const res = validatePRDGrounding(prd, SD);
    expect(res.average_confidence).toBeGreaterThan(0.05);
    const zeroCount = res.all_results.filter((r) => r.confidence === 0).length;
    expect(zeroCount).toBe(0);
  });

  it('a hallucinated (zero-overlap) FR still trips the zero-confidence detector', () => {
    const prd = {
      functional_requirements: [
        { id: 'FR-1', title: 'qqq zzz', requirement: 'xyzzy plugh frobnicate quux flibbertigibbet' },
      ],
    };
    const res = validatePRDGrounding(prd, SD);
    // Genuinely unrelated text yields ~zero similarity regardless of length — more text
    // does not rescue hallucinated content.
    expect(res.all_results[0].confidence).toBeLessThan(0.05);
  });
});
