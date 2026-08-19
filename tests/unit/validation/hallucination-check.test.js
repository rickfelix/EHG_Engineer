// SD-FDBK-ENH-RETRO-SUB-AGENT-001: RETRO sub-agent hallucination-checker false-positives on real
// files. Covers FR-1 (unconditional JSON-escape normalization in extractFileReferences), FR-2
// (bare-basename fallback in checkFileExists via a per-call, node_modules/.git-excluded basename
// index, plus the findBasenameMatches export), and FR-3 (ambiguous-match disclosure via
// result.warnings, not result.file_references).
//
// Runs against this repo's real filesystem rather than a mocked fs -- checkFileExists/
// buildBasenameIndex have no injectable fs dependency, and the module's own real-file behavior
// (which real basenames are unique/ambiguous/node_modules-only) is exactly what these fixes are
// about, so faking the filesystem would test a fiction instead of the actual bug class.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';

vi.mock('../../../lib/validation/hallucination/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, buildBasenameIndex: vi.fn(actual.buildBasenameIndex) };
});

import { buildBasenameIndex } from '../../../lib/validation/hallucination/index.js';
import { extractFileReferences, prepareOutputForAnalysis } from '../../../lib/validation/hallucination/extractors.js';
import { checkFileExists, findBasenameMatches } from '../../../lib/validation/hallucination/file-checks.js';
import { validateSubAgentOutput, quickHallucinationCheck } from '../../../lib/validation/hallucination-check.js';

const baseDir = path.resolve(__dirname, '../../..');

beforeEach(() => {
  buildBasenameIndex.mockClear();
});

describe('FR-1: extractFileReferences unconditional escape normalization', () => {
  it('TS-1: extracts the unmangled reference through the real production chain (prepareOutputForAnalysis -> extractFileReferences)', () => {
    // A real newline immediately before a file:line reference, exactly as it appears when a
    // RETRO sub-agent's findings.sd_metadata.scope (verbatim SD prose) is JSON.stringify'd by
    // prepareOutputForAnalysis. Calling extractFileReferences directly on a raw object would
    // exercise its own (dead-in-production) JSON.stringify branch instead of the real path.
    const output = {
      message: null, summary: null, recommendations: [], critical_issues: [], warnings: [], detailed_analysis: null,
      findings: {
        sd_metadata: {
          scope: 'Fixes lib/eva/bridge/stage-execution-worker.js:694 and\nlib/eva/bridge/venture-build-consumer.js:573) plus more work'
        }
      }
    };
    const analysisContent = prepareOutputForAnalysis(output);
    // Confirms the escape genuinely reaches extractFileReferences as a literal 2-char sequence,
    // proving this test exercises the real bug rather than a synthetic shortcut.
    expect(analysisContent).toContain('\\n');

    const refs = extractFileReferences(analysisContent);
    expect(refs).toContain('lib/eva/bridge/venture-build-consumer.js');
    expect(refs.some(r => r.startsWith('n') && r !== 'node_modules')).toBe(false);
  });

  it('leaves escape-free input unchanged', () => {
    const refs = extractFileReferences('See lib/foo/bar.js and scripts/baz.js:12 for details');
    expect(refs).toContain('lib/foo/bar.js');
    expect(refs).toContain('scripts/baz.js');
  });

  it('TS-8: a doubled-backslash edge case does not throw (naive-vs-backslash-aware tradeoff, documented limitation)', () => {
    // Naive \[nrt] normalization was chosen over a backslash-aware variant: measured zero
    // incidence of this edge case in a 400-row real corpus, while a backslash-aware alternative
    // was measurably worse (breaks consecutive escapes and CRLF sequences). This test pins the
    // choice by documenting the accepted behavior, not by asserting perfect extraction.
    expect(() => extractFileReferences('path\\\\nfile.js:12')).not.toThrow();
  });
});

describe('FR-2: checkFileExists bare-basename fallback', () => {
  it('TS-2: resolves a bare basename for a real, uniquely-named nested file', () => {
    expect(checkFileExists('shared-git-context.js', baseDir)).toBe(true);
    expect(checkFileExists('post-completion-validator.js', baseDir)).toBe(true);
  });

  it('TS-3: returns false for a fabricated basename matching zero real files', () => {
    expect(checkFileExists('totally-fabricated-file-name-zzz-999.js', baseDir)).toBe(false);
  });

  it('TS-4: returns false for a basename that exists only inside node_modules', () => {
    const index = buildBasenameIndex(baseDir);
    // Find a real basename that node_modules contains but the repo tree (excluding node_modules)
    // does not, so the assertion is grounded in this checkout's actual contents rather than a
    // guessed filename.
    let nodeModulesOnlyBasename = null;
    try {
      const nmEntries = fs.readdirSync(path.join(baseDir, 'node_modules'), { withFileTypes: true }).filter(e => e.isDirectory());
      for (const pkg of nmEntries.slice(0, 50)) {
        const pkgDir = path.join(baseDir, 'node_modules', pkg.name);
        let files;
        try { files = fs.readdirSync(pkgDir, { withFileTypes: true }).filter(e => e.isFile()); } catch { continue; }
        const candidate = files.find(f => !index.has(f.name));
        if (candidate) { nodeModulesOnlyBasename = candidate.name; break; }
      }
    } catch { /* node_modules absent in this environment -- skip below */ }

    if (!nodeModulesOnlyBasename) {
      expect(true).toBe(true); // no usable fixture in this environment; not a failure
      return;
    }
    expect(checkFileExists(nodeModulesOnlyBasename, baseDir)).toBe(false);
  });

  it('TS-7: a full-path reference resolves via the direct check and never invokes the fallback', () => {
    expect(checkFileExists('lib/validation/hallucination/extractors.js', baseDir)).toBe(true);
    // A fabricated full path (has a directory separator) must not be resolved by the basename
    // fallback even if some OTHER file shares its basename elsewhere in the repo.
    expect(checkFileExists('lib/validation/hallucination/totally-fake-dir/extractors.js', baseDir)).toBe(false);
  });

  it("FR-2 AC-5: checkFileExists's return type remains a plain boolean, both branches", () => {
    expect(typeof checkFileExists('shared-git-context.js', baseDir)).toBe('boolean');
    expect(typeof checkFileExists('totally-fabricated-file-name-zzz-999.js', baseDir)).toBe('boolean');
  });

  it('buildBasenameIndex excludes node_modules and .git from its walk', () => {
    const index = buildBasenameIndex(baseDir);
    expect(index.size).toBeGreaterThan(0);
    for (const paths of index.values()) {
      for (const p of paths) {
        expect(p.startsWith('node_modules/')).toBe(false);
        expect(p.startsWith('.git/')).toBe(false);
      }
    }
  });

  it('findBasenameMatches builds its own index on demand for a standalone caller (no shared index supplied)', () => {
    const matches = findBasenameMatches('shared-git-context.js', baseDir);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every(p => p.endsWith('shared-git-context.js'))).toBe(true);
  });
});

describe('FR-2/TR-1: basename index shared once per validateSubAgentOutput() call', () => {
  it('TS-6: buildBasenameIndex is invoked at most once per call, across a batch of multiple bare-basename references', async () => {
    const output = {
      message: null, summary: null, recommendations: [], critical_issues: [], warnings: [], detailed_analysis: null,
      findings: {
        sd_metadata: {
          scope: 'shared-git-context.js and post-completion-validator.js and registry.json and totally-fabricated-aaa.js'
        }
      }
    };
    await validateSubAgentOutput(output, { baseDir });
    expect(buildBasenameIndex).toHaveBeenCalledTimes(1);
  });

  it('is called fresh (not skipped) on a second, independent validateSubAgentOutput() call -- no cross-call cache', async () => {
    const output = { message: null, summary: null, recommendations: [], critical_issues: [], warnings: [], detailed_analysis: null,
      findings: { sd_metadata: { scope: 'shared-git-context.js' } } };
    await validateSubAgentOutput(output, { baseDir });
    await validateSubAgentOutput(output, { baseDir });
    expect(buildBasenameIndex).toHaveBeenCalledTimes(2);
  });
});

describe('FR-3: ambiguous basename matches surface via result.warnings, not result.file_references', () => {
  it('TS-5: a basename shared by multiple real files produces an ambiguous_basename_match warning, and still counts as valid', async () => {
    const matches = findBasenameMatches('registry.json', baseDir);
    if (matches.length <= 1) {
      // This repo's contents can drift; skip gracefully rather than assert a false premise.
      expect(true).toBe(true);
      return;
    }
    const output = { message: null, summary: null, recommendations: [], critical_issues: [], warnings: [], detailed_analysis: null,
      findings: { sd_metadata: { scope: 'See registry.json for details' } } };
    const result = await validateSubAgentOutput(output, { baseDir });

    const warning = result.warnings.find(w => w.type === 'ambiguous_basename_match' && w.reference === 'registry.json');
    expect(warning).toBeTruthy();
    expect(result.file_references.invalid.some(i => i.path === 'registry.json')).toBe(false);
  });

  it('a uniquely-resolved bare basename produces no ambiguous_basename_match warning', async () => {
    const output = { message: null, summary: null, recommendations: [], critical_issues: [], warnings: [], detailed_analysis: null,
      findings: { sd_metadata: { scope: 'See shared-git-context.js for details' } } };
    const result = await validateSubAgentOutput(output, { baseDir });
    expect(result.warnings.some(w => w.type === 'ambiguous_basename_match')).toBe(false);
  });

  it('result.file_references carries no ambiguity data -- only result.warnings does', async () => {
    const matches = findBasenameMatches('registry.json', baseDir);
    if (matches.length <= 1) { expect(true).toBe(true); return; }
    const output = { message: null, summary: null, recommendations: [], critical_issues: [], warnings: [], detailed_analysis: null,
      findings: { sd_metadata: { scope: 'See registry.json for details' } } };
    const result = await validateSubAgentOutput(output, { baseDir });
    expect(JSON.stringify(result.file_references)).not.toContain('ambiguous');
  });
});

describe('End-to-end regression: quickHallucinationCheck (dead-but-exported) still behaves correctly', () => {
  it('does not throw and returns the documented shape', () => {
    const qc = quickHallucinationCheck(
      { message: 'See lib/foo/bar.js', summary: '', recommendations: [], critical_issues: [], warnings: [], detailed_analysis: '' },
      baseDir
    );
    expect(typeof qc.hasHallucinations).toBe('boolean');
    expect(Array.isArray(qc.invalidFiles)).toBe(true);
  });
});

describe('FR-3: executor.js logs result.warnings independently of pass/fail (static source check)', () => {
  it('the warnings-logging line exists outside the failing-branch block, so a passing-but-ambiguous result is still logged', () => {
    const executorSrc = fs.readFileSync(path.join(baseDir, 'lib/sub-agent-executor/executor.js'), 'utf8');
    const idx = executorSrc.indexOf('hallucinationCheck.warnings && hallucinationCheck.warnings.length > 0');
    expect(idx).toBeGreaterThan(-1);
    // The existing invalid-path log lives inside `if (hallucinationCheck.passed) {...} else {...}`.
    // The new warnings log must sit AFTER that whole if/else closes, not nested inside the
    // `else` branch -- otherwise a passing (score >= threshold) but ambiguous result would never
    // be logged, which is the exact gap this SD's PLAN-phase review found in the prior design.
    const elseBlockEnd = executorSrc.indexOf('hallucinationCheck.issues.slice(0, 3)');
    expect(elseBlockEnd).toBeGreaterThan(-1);
    expect(idx).toBeGreaterThan(elseBlockEnd);
  });
});
