/**
 * Regression test for implementation_approach quality floor
 * SD: SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126 (Phase 3)
 * Pattern: PAT-HF-PLANTOEXEC-4c03f832
 *
 * Before: buildDefaultImplementationApproach produced a 1-phase stub that
 * passed field-presence but failed downstream quality rubrics (5 recorded
 * occurrences at 86% quality score).
 *
 * After:
 *   - Always emits >=3 phases (pads with generic QA/DOC/VER phases)
 *   - Extracts files_affected from FR implementation_context
 *   - basicPRDValidation warns on thin implementation_approach content
 */

import { describe, it, expect } from 'vitest';
import { basicPRDValidation } from '../../../scripts/modules/handoff/verifiers/plan-to-exec/prd-validation.js';

describe('basicPRDValidation implementation_approach shape check (PAT-HF-PLANTOEXEC-4c03f832)', () => {
  it('warns on thin string implementation_approach (<200 chars)', () => {
    const prd = {
      executive_summary: 'x'.repeat(100),
      functional_requirements: [{ id: 'FR-1', title: 'a' }, { id: 'FR-2', title: 'b' }, { id: 'FR-3', title: 'c' }],
      system_architecture: 'present',
      acceptance_criteria: ['a', 'b', 'c', 'd', 'e'],
      test_scenarios: [{ id: 'TS-1' }],
      implementation_approach: 'Do the thing.', // thin
      risks: [{ risk: 'r' }]
    };
    const result = basicPRDValidation(prd);
    expect(result.warnings.join(' ')).toMatch(/Thin implementation_approach/i);
  });

  it('warns on thin object implementation_approach (phases < 2)', () => {
    const prd = {
      executive_summary: 'x'.repeat(100),
      functional_requirements: [{ id: 'FR-1', title: 'a' }, { id: 'FR-2', title: 'b' }, { id: 'FR-3', title: 'c' }],
      system_architecture: 'present',
      acceptance_criteria: ['a', 'b', 'c', 'd', 'e'],
      test_scenarios: [{ id: 'TS-1' }],
      implementation_approach: { overview: 'o', phases: [{ phase: 'P1', title: 't' }] }, // 1 phase
      risks: [{ risk: 'r' }]
    };
    const result = basicPRDValidation(prd);
    expect(result.warnings.join(' ')).toMatch(/Thin implementation_approach/i);
  });

  it('does NOT warn on substantive string implementation_approach (>=200 chars)', () => {
    const substantial = 'Phase 1: do X in file foo.js lines 10-20 — detailed change description. Phase 2: add regression test in tests/unit/foo.test.js covering happy path. Phase 3: update CHANGELOG + docs/reference/guide.md with the new behavior. Phase 4: verify handoff passes end-to-end.';
    const prd = {
      executive_summary: 'x'.repeat(100),
      functional_requirements: [{ id: 'FR-1', title: 'a' }, { id: 'FR-2', title: 'b' }, { id: 'FR-3', title: 'c' }],
      system_architecture: 'present',
      acceptance_criteria: ['a', 'b', 'c', 'd', 'e'],
      test_scenarios: [{ id: 'TS-1' }],
      implementation_approach: substantial,
      risks: [{ risk: 'r' }]
    };
    const result = basicPRDValidation(prd);
    expect(result.warnings.filter(w => /Thin implementation_approach/.test(w))).toHaveLength(0);
  });

  it('does NOT warn on object with >=2 phases', () => {
    const prd = {
      executive_summary: 'x'.repeat(100),
      functional_requirements: [{ id: 'FR-1', title: 'a' }, { id: 'FR-2', title: 'b' }, { id: 'FR-3', title: 'c' }],
      system_architecture: 'present',
      acceptance_criteria: ['a', 'b', 'c', 'd', 'e'],
      test_scenarios: [{ id: 'TS-1' }],
      implementation_approach: {
        overview: 'o',
        phases: [
          { phase: 'P1', title: 'a', description: 'd' },
          { phase: 'P2', title: 'b', description: 'd' }
        ]
      },
      risks: [{ risk: 'r' }]
    };
    const result = basicPRDValidation(prd);
    expect(result.warnings.filter(w => /Thin implementation_approach/.test(w))).toHaveLength(0);
  });

  it('still rejects PRDs missing implementation_approach entirely', () => {
    const prd = {
      executive_summary: 'x'.repeat(100),
      functional_requirements: [{ id: 'FR-1', title: 'a' }, { id: 'FR-2', title: 'b' }, { id: 'FR-3', title: 'c' }],
      system_architecture: 'present',
      acceptance_criteria: ['a', 'b', 'c', 'd', 'e'],
      test_scenarios: [{ id: 'TS-1' }],
      // implementation_approach intentionally omitted
      risks: [{ risk: 'r' }]
    };
    const result = basicPRDValidation(prd);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Missing required field: implementation_approach/);
  });
});
