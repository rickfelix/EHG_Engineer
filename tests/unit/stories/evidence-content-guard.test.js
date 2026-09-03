// Empty-evidence guard for sub_agent_execution_results.
//
// The specimen these tests are built from is a REAL measured row, not a hypothetical:
//   verdict=BLOCKED, confidence=100, summary=null, critical_issues=[], justification=null,
//   detailed_analysis='{}', recommendations=7
// A blocking verdict at full confidence that never says why it blocks.
//
// Two measured facts shape the assertions, and both would have produced a WRONG guard if assumed
// instead of checked:
//   - recommendations were NOT empty (seven of them, generic boilerplate). Counting them as
//     content would make the guard pass on exactly the rows it exists to catch.
//   - detailed_analysis === '{}' is LEGITIMATE: results-storage.js:658 compresses that field into
//     a separate artifact and leaves '{}' behind. Treating it as empty would refuse good rows.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evidenceRefusalReason, evidenceContentWarning, assertEvidenceHasContent } from '../../../lib/sub-agent-executor/evidence-content-guard.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

const measuredSpecimen = {
  sub_agent_code: 'TESTING',
  verdict: 'BLOCKED',
  confidence: 100,
  summary: null,
  critical_issues: [],
  warnings: [],
  justification: null,
  detailed_analysis: '{}',
  recommendations: [
    'Execute E2E tests before approval (MANDATORY - zero tolerance)',
    'E2E testing is NOT optional per protocol - all tests must pass with zero failures',
    'Use: node scripts/execute-subagent.js --code TESTING --sd-id <SD-ID> --full-e2e',
    'Test evidence is fresh (not cached)',
    'Full troubleshooting arsenal (13 tactics) available',
    'Expected debugging time savings: 3-8x',
    'Consult Troubleshooting Tactics Arsenal'
  ]
};

describe('evidenceRefusalReason — the measured specimen', () => {
  it('REFUSES the real row: BLOCKED at confidence 100 that never says why', () => {
    const reason = evidenceRefusalReason(measuredSpecimen);
    expect(reason).toBeTruthy();
    expect(reason).toMatch(/no summary, no critical_issues and no justification/);
  });

  it('is not fooled by the seven generic recommendations that row carried', () => {
    // The whole point: recommendations are advice, not a finding. If this ever passes, the guard
    // has become vacuous on its own specimen.
    expect(evidenceRefusalReason(measuredSpecimen)).not.toBeNull();
  });
});

describe('evidenceRefusalReason — a blocking verdict must state a reason', () => {
  it.each([['BLOCKED'], ['FAIL'], ['FAILED']])('refuses %s with no reason', (verdict) => {
    expect(evidenceRefusalReason({ ...measuredSpecimen, verdict })).toMatch(/does not say why it blocks/);
  });

  it('accepts a blocking verdict justified by a summary', () => {
    expect(evidenceRefusalReason({ ...measuredSpecimen, summary: 'three E2E specs failed on auth redirect' })).toBeNull();
  });

  it('accepts a blocking verdict justified by a critical issue', () => {
    expect(evidenceRefusalReason({ ...measuredSpecimen, critical_issues: [{ issue: 'schema drift' }] })).toBeNull();
  });

  it('accepts a blocking verdict justified by a justification', () => {
    expect(evidenceRefusalReason({ ...measuredSpecimen, justification: 'pass rate 40% is below threshold' })).toBeNull();
  });

  it('does not treat an all-whitespace summary as a reason', () => {
    expect(evidenceRefusalReason({ ...measuredSpecimen, summary: '   \n  ' })).toBeTruthy();
  });

  it('does not treat an array of empty objects as critical issues', () => {
    expect(evidenceRefusalReason({ ...measuredSpecimen, critical_issues: [{}, {}] })).toBeTruthy();
  });
});

describe('evidenceRefusalReason — non-blocking verdicts are NOT refused', () => {
  // Scoped deliberately. A non-blocking verdict with nothing in it is invisible, not harmful, and
  // this writer's established contract accepts minimal payloads — 17 existing tests construct
  // `{ verdict: 'PASS', confidence: 90 }` fixtures, and one is named "normalizes an absent or blank
  // summary to null". Refusing those would mean rewriting correct tests to fit new code.
  it('accepts a PASS carrying only recommendations', () => {
    expect(evidenceRefusalReason({ verdict: 'PASS', recommendations: ['looks good'] })).toBeNull();
  });

  it('accepts a minimal PASS, matching the writer contract those fixtures encode', () => {
    expect(evidenceRefusalReason({ verdict: 'PASS', confidence: 90 })).toBeNull();
  });

  it('accepts a minimal CONDITIONAL_PASS', () => {
    expect(evidenceRefusalReason({ verdict: 'CONDITIONAL_PASS' })).toBeNull();
  });
});

describe('evidenceContentWarning — the invisible-but-not-harmful class is reported, not refused', () => {
  it('warns on a PASS carrying nothing at all', () => {
    const w = evidenceContentWarning({ verdict: 'PASS', summary: '', critical_issues: [], warnings: [], recommendations: [] });
    expect(w).toMatch(/no summary, findings, warnings or recommendations/);
  });

  it('is silent when a PASS carries any content', () => {
    expect(evidenceContentWarning({ verdict: 'PASS', recommendations: ['ok'] })).toBeNull();
  });

  it('stays silent for blocking verdicts — those are the refusal path, not the warning path', () => {
    expect(evidenceContentWarning(measuredSpecimen)).toBeNull();
  });

  it('assertEvidenceHasContent logs the warning without throwing', () => {
    const logged = [];
    const logger = { warn: (m) => logged.push(m) };
    expect(() => assertEvidenceHasContent({ verdict: 'PASS', sub_agent_code: 'DESIGN' }, { writer: 'w', logger })).not.toThrow();
    expect(logged.join(' ')).toMatch(/EMPTY_EVIDENCE_WARNING \(w\) \[DESIGN\]/);
  });
});

describe('evidenceRefusalReason — a verdict is never optional', () => {
  it.each([[undefined], [null], [''], ['   ']])('refuses a missing verdict (%s)', (verdict) => {
    expect(evidenceRefusalReason({ verdict, summary: 'plenty of content here' }))
      .toMatch(/no verdict/);
  });

  it('refuses an empty object outright', () => {
    expect(evidenceRefusalReason({})).toBeTruthy();
    expect(evidenceRefusalReason()).toBeTruthy();
  });
});

describe('evidenceRefusalReason — what must NOT be treated as empty', () => {
  it("accepts detailed_analysis === '{}' — results-storage.js:658 compresses it to an artifact on purpose", () => {
    // Verified in the source before writing this: '{}' there is expected, not missing data.
    // A guard that refused it would reject legitimate rows across the whole fleet.
    const row = { verdict: 'BLOCKED', summary: 'a real reason', detailed_analysis: '{}' };
    expect(evidenceRefusalReason(row)).toBeNull();
  });

  it('does not require detailed_analysis to be present at all', () => {
    expect(evidenceRefusalReason({ verdict: 'PASS', summary: 'fine' })).toBeNull();
  });
});

describe('EVERY writer is wired to the guard', () => {
  // THIS IS THE TEST THAT PREVENTS THE RECURRENCE. The documented failure at this exact boundary
  // was hardening one writer and missing another: the header of
  // scripts/modules/phase-subagent-orchestrator/execution.js records that it "is the second
  // (orchestrated) insert path ... and was never wired to it", so QF-20260703-369 had to retrofit
  // a fix into it after the canonical writer already had one.
  //
  // A guard that only the canonical writer calls leaves the other two free to persist the rows it
  // exists to refuse. If a FOURTH insert path is ever added, this list must grow with it.
  const WRITERS = [
    'lib/sub-agent-executor/results-storage.js',
    'scripts/modules/phase-subagent-orchestrator/execution.js',
    'scripts/modules/orchestrator/subagent-execution.js'
  ];

  it.each(WRITERS.map((w) => [w]))('%s imports and calls the shared guard', (relPath) => {
    const src = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
    expect(src, `${relPath} must import the shared guard`).toMatch(/from\s+['"].*evidence-content-guard\.js['"]/);
    expect(src, `${relPath} must actually call it, not merely import it`).toMatch(/assertEvidenceHasContent\s*\(/);
  });

  it('the writer list still matches every insert path into sub_agent_execution_results', () => {
    // Non-vacuity: if someone adds a fourth writer, this fails and forces the list to be updated
    // rather than letting the new path silently escape the guard.
    const scan = (dir, acc = []) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(full, acc);
        else if (/\.(js|mjs|cjs)$/.test(entry.name)) acc.push(full);
      }
      return acc;
    };
    const offenders = [];
    for (const dir of ['lib/sub-agent-executor', 'scripts/modules/orchestrator', 'scripts/modules/phase-subagent-orchestrator']) {
      for (const file of scan(path.join(repoRoot, dir))) {
        const src = fs.readFileSync(file, 'utf8');
        const writesTable = /from\(['"]sub_agent_execution_results['"]\)[\s\S]{0,200}?\.insert\(/.test(src)
          || /safeInsert\([^,]+,\s*['"]sub_agent_execution_results['"]/.test(src);
        if (!writesTable) continue;
        const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
        if (!WRITERS.includes(rel)) offenders.push(rel);
      }
    }
    expect(offenders, 'new insert path(s) into sub_agent_execution_results found that are not in the guarded WRITERS list').toEqual([]);
  });
});

describe('assertEvidenceHasContent', () => {
  it('throws a diagnosable error naming the writer and the sub-agent', () => {
    expect(() => assertEvidenceHasContent(measuredSpecimen, { writer: 'results-storage' }))
      .toThrow(/EMPTY_EVIDENCE_REFUSED \(results-storage\) \[TESTING\]/);
  });

  it('does not throw for a row with content', () => {
    expect(() => assertEvidenceHasContent({ verdict: 'PASS', summary: 'ok' }, { writer: 'w' })).not.toThrow();
  });
});
