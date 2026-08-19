// SD-FDBK-ENH-RETRO-SUB-AGENT-001: RETRO sub-agent hallucination-checker false-positives on real
// files. Covers FR-1 (unconditional JSON-escape normalization in extractFileReferences), FR-2
// (bare-basename fallback in checkFileExists via a per-call, node_modules/.git/.worktrees/
// .reaper-source-excluded basename index, plus the findBasenameMatches export), and FR-3
// (ambiguous-match disclosure via result.warnings, not result.file_references).
//
// Runs against this repo's real filesystem rather than a mocked fs -- checkFileExists/
// buildBasenameIndex have no injectable fs dependency, and the module's own real-file behavior
// (which real basenames are unique/ambiguous/node_modules-only) is exactly what these fixes are
// about, so faking the filesystem would test a fiction instead of the actual bug class.
//
// Call-count assertions spy on fs.readdirSync directly, not on buildBasenameIndex's own export
// binding: buildBasenameIndex/findBasenameMatches call each other as same-file local functions
// inside file-checks.js, so a vi.mock() on the re-export barrel (hallucination/index.js) only
// ever sees hallucination-check.js's own single top-level call and is blind to file-checks.js's
// internal build-on-demand fallback -- confirmed by a mutation test during EXEC-TO-PLAN review
// that silently passed all assertions even with the index-sharing thread-through reverted.
// fs.readdirSync is the one primitive every path bottoms out at, regardless of which JS function
// calls it, so spying there is immune to that interception-target mismatch.
import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import fs from 'fs';

import { buildBasenameIndex, findBasenameMatches } from '../../../lib/validation/hallucination/index.js';
import { extractFileReferences, prepareOutputForAnalysis } from '../../../lib/validation/hallucination/extractors.js';
import { checkFileExists } from '../../../lib/validation/hallucination/file-checks.js';
import { validateSubAgentOutput, quickHallucinationCheck } from '../../../lib/validation/hallucination-check.js';

const baseDir = path.resolve(__dirname, '../../..');

function makeOutput(scope) {
  return {
    message: null, summary: null, recommendations: [], critical_issues: [], warnings: [], detailed_analysis: null,
    findings: { sd_metadata: { scope } }
  };
}

// Picked live from the real index rather than hardcoded, so this can never silently vacuously
// pass if the repo's contents drift -- the prior fixture (a hardcoded 'registry.json') would
// have early-return-skipped its own assertion the moment the repo stopped having 3 real matches
// for that name. 545 ambiguous basenames were measured in this repo at review time, so a live
// pick is expected to always succeed.
function pickAmbiguousBasename() {
  const index = buildBasenameIndex(baseDir);
  for (const [name, paths] of index) {
    if (paths.length > 1) return { name, paths };
  }
  return null;
}

describe('FR-1: extractFileReferences unconditional escape normalization', () => {
  it('TS-1: extracts the unmangled reference through the real production chain (prepareOutputForAnalysis -> extractFileReferences)', () => {
    // A real newline immediately before a file:line reference, exactly as it appears when a
    // RETRO sub-agent's findings.sd_metadata.scope (verbatim SD prose) is JSON.stringify'd by
    // prepareOutputForAnalysis. Calling extractFileReferences directly on a raw object would
    // exercise its own (dead-in-production) JSON.stringify branch instead of the real path.
    const output = makeOutput('Fixes lib/eva/bridge/stage-execution-worker.js:694 and\nlib/eva/bridge/venture-build-consumer.js:573) plus more work');
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

  it('TS-8: a doubled-backslash edge case degrades to a basename-only capture, not a throw or a full mangled path (pins the naive-vs-backslash-aware tradeoff)', () => {
    // Naive \[nrt] normalization was chosen over a backslash-aware variant: measured zero
    // incidence of this edge case in a 400-row real corpus, while a backslash-aware alternative
    // was measurably worse (breaks consecutive escapes and CRLF sequences). Empirically verified
    // behavior: the SECOND backslash of the doubled pair + 'n' is consumed by the replace,
    // leaving a literal backslash + space that breaks path-segment continuity -- the regex then
    // matches fresh from 'file.js:12', recovering the basename rather than nothing or garbage.
    const refs = extractFileReferences('path\\\\nfile.js:12');
    expect(refs).toEqual(['file.js']);
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
    // Find a real basename that node_modules contains but the repo tree (excluding
    // node_modules/.git/.worktrees/.reaper-source) does not, so the assertion is grounded in
    // this checkout's actual contents rather than a guessed filename.
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

  it('buildBasenameIndex excludes node_modules, .git, .worktrees, and .reaper-source from its walk', () => {
    const index = buildBasenameIndex(baseDir);
    expect(index.size).toBeGreaterThan(0);
    for (const paths of index.values()) {
      for (const p of paths) {
        expect(p.startsWith('node_modules/')).toBe(false);
        expect(p.startsWith('.git/')).toBe(false);
        expect(p.startsWith('.worktrees/')).toBe(false);
        expect(p.startsWith('.reaper-source/')).toBe(false);
      }
    }
  });

  it('findBasenameMatches builds its own index on demand for a standalone caller (no shared index supplied)', () => {
    const matches = findBasenameMatches('shared-git-context.js', baseDir);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every(p => p.endsWith('shared-git-context.js'))).toBe(true);
  });
});

describe('FR-2/TR-1: basename index built lazily, at most once per validateSubAgentOutput() call', () => {
  it('TS-6: fs.readdirSync call count does not scale with the number of bare-basename references in one call (proves the index is shared, not rebuilt per-reference)', async () => {
    const spy = vi.spyOn(fs, 'readdirSync');

    spy.mockClear();
    await validateSubAgentOutput(makeOutput('shared-git-context.js'), { baseDir });
    const oneRefCalls = spy.mock.calls.length;

    spy.mockClear();
    await validateSubAgentOutput(
      makeOutput('shared-git-context.js and post-completion-validator.js and registry.json and totally-fabricated-aaa.js'),
      { baseDir }
    );
    const fourRefCalls = spy.mock.calls.length;

    spy.mockRestore();

    expect(oneRefCalls).toBeGreaterThan(0);
    // A per-reference rebuild would cost ~4x the readdir calls of a single-reference batch. A
    // shared, once-per-call index costs the same regardless of how many references are in the
    // batch -- the walk cost depends on tree size, not reference count.
    expect(fourRefCalls).toBeLessThan(oneRefCalls * 1.5);
  });

  it('does not walk the filesystem at all when every reference is a full path (lazy build)', async () => {
    const spy = vi.spyOn(fs, 'readdirSync');
    spy.mockClear();
    await validateSubAgentOutput(makeOutput('See lib/validation/hallucination/extractors.js for details'), { baseDir });
    const calls = spy.mock.calls.length;
    spy.mockRestore();
    expect(calls).toBe(0);
  });

  it('does not walk the filesystem at all when there are zero file references', async () => {
    const spy = vi.spyOn(fs, 'readdirSync');
    spy.mockClear();
    await validateSubAgentOutput(makeOutput('no file references in this text at all'), { baseDir });
    const calls = spy.mock.calls.length;
    spy.mockRestore();
    expect(calls).toBe(0);
  });

  it('builds a fresh index on a second, independent call -- no cross-call cache (TR-1)', async () => {
    const spy = vi.spyOn(fs, 'readdirSync');
    spy.mockClear();
    await validateSubAgentOutput(makeOutput('shared-git-context.js'), { baseDir });
    const firstCallCount = spy.mock.calls.length;
    spy.mockClear();
    await validateSubAgentOutput(makeOutput('shared-git-context.js'), { baseDir });
    const secondCallCount = spy.mock.calls.length;
    spy.mockRestore();
    expect(firstCallCount).toBeGreaterThan(0);
    expect(secondCallCount).toBe(firstCallCount);
  });
});

describe('FR-3: ambiguous basename matches surface via result.warnings, not result.file_references', () => {
  it('TS-5: a basename shared by multiple real files (picked live from the current index) produces an ambiguous_basename_match warning, and still counts as valid', async () => {
    const picked = pickAmbiguousBasename();
    expect(picked).not.toBeNull();

    const result = await validateSubAgentOutput(makeOutput(`See ${picked.name} for details`), { baseDir });

    const warning = result.warnings.find(w => w.type === 'ambiguous_basename_match' && w.reference === picked.name);
    expect(warning).toBeTruthy();
    expect(result.file_references.invalid.some(i => i.path === picked.name)).toBe(false);
  });

  it('a uniquely-resolved bare basename produces no ambiguous_basename_match warning', async () => {
    const result = await validateSubAgentOutput(makeOutput('See shared-git-context.js for details'), { baseDir });
    expect(result.warnings.some(w => w.type === 'ambiguous_basename_match')).toBe(false);
  });

  it('result.file_references carries no ambiguity data -- only result.warnings does', async () => {
    const picked = pickAmbiguousBasename();
    expect(picked).not.toBeNull();
    const result = await validateSubAgentOutput(makeOutput(`See ${picked.name} for details`), { baseDir });
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
