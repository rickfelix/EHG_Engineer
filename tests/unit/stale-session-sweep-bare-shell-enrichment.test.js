/**
 * SD-FDBK-INFRA-QUALITY-GATE-COUPLED-001 (FR-1, FR-3) — computeBareShellEnrichment
 *
 * Pure decision function extracted from stale-session-sweep.cjs's bare-shell
 * auto-enrich block. Prefers sd.metadata.plan_content over the
 * filename-substring search, closing the relevance-blind enrichment bug
 * (RCA: 'venture'+'design' substring-matched an unrelated
 * 'venture-detail-page-reDESIGN.md' file).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { computeBareShellEnrichment } = require('../../scripts/stale-session-sweep.cjs');

function makeFakeFs(filesByDir) {
  return {
    existsSync: (dir) => Object.prototype.hasOwnProperty.call(filesByDir, dir),
    readdirSync: (dir) => Object.keys(filesByDir[dir] || {}),
    readFileSync: (filePath) => {
      for (const dir of Object.keys(filesByDir)) {
        const base = Object.keys(filesByDir[dir]).find((f) => filePath.endsWith(f));
        if (base) return filesByDir[dir][base];
      }
      throw new Error(`fake fs: no content for ${filePath}`);
    },
  };
}

const fakePath = {
  join: (...parts) => parts.join('/'),
  basename: (p) => p.split('/').pop(),
};

describe('computeBareShellEnrichment (FR-1)', () => {
  it('TS-1: prefers metadata.plan_content over a filename-substring match that WOULD otherwise be found', () => {
    const fsModule = makeFakeFs({
      'docs/plans': { 'venture-detail-page-reDESIGN.md': '# Unrelated page redesign content here, definitely long enough to pass the fifty character floor.' },
    });
    const sd = {
      sd_key: 'SD-X-001',
      title: 'Venture Design System Overhaul',
      metadata: { plan_content: 'This is the REAL authoritative plan content for the venture design system overhaul, sourced from --from-plan authoring.' },
    };
    const decision = computeBareShellEnrichment(sd, { searchDirs: ['docs/plans'], fsModule, pathModule: fakePath });
    expect(decision.sourceLabel).toBe('metadata.plan_content');
    expect(decision.description).toContain('REAL authoritative plan content');
    expect(decision.description).toContain('[Auto-enriched by sweep from plan_content]');
    expect(decision.description).not.toContain('reDESIGN');
  });

  it('TS-2: falls back to the filename-substring search (unchanged behavior) when plan_content is absent', () => {
    const fsModule = makeFakeFs({
      'docs/plans': { 'demand-thesis-gate-plan.md': '# Demand thesis gate plan\n\nThis is the real plan body content, long enough to clear the fifty character minimum threshold easily.' },
    });
    const sd = { sd_key: 'SD-Y-001', title: 'Demand Thesis Gate Implementation', metadata: {} };
    const decision = computeBareShellEnrichment(sd, { searchDirs: ['docs/plans'], fsModule, pathModule: fakePath });
    expect(decision.sourceLabel).toBe('demand-thesis-gate-plan.md');
    expect(decision.description).toContain('[Auto-enriched by sweep from demand-thesis-gate-plan.md]');
  });

  it('falls back to filename search when plan_content is present but trivially short', () => {
    const fsModule = makeFakeFs({
      'docs/plans': { 'demand-thesis-gate-plan.md': '# Demand thesis gate plan\n\nReal plan body content, long enough to clear the fifty character minimum easily here.' },
    });
    const sd = { sd_key: 'SD-Z-001', title: 'Demand Thesis Gate Implementation', metadata: { plan_content: 'too short' } };
    const decision = computeBareShellEnrichment(sd, { searchDirs: ['docs/plans'], fsModule, pathModule: fakePath });
    expect(decision.sourceLabel).toBe('demand-thesis-gate-plan.md');
  });

  it('returns null when no plan_content and no filename match is found', () => {
    const fsModule = makeFakeFs({ 'docs/plans': {} });
    const sd = { sd_key: 'SD-W-001', title: 'Totally Unmatched Title', metadata: {} };
    const decision = computeBareShellEnrichment(sd, { searchDirs: ['docs/plans'], fsModule, pathModule: fakePath });
    expect(decision).toBeNull();
  });

  it('returns tooShort:true when a filename match is found but content is too short to use', () => {
    const fsModule = makeFakeFs({
      'docs/plans': { 'demand-thesis-gate-plan.md': 'short' },
    });
    const sd = { sd_key: 'SD-V-001', title: 'Demand Thesis Gate Implementation', metadata: {} };
    const decision = computeBareShellEnrichment(sd, { searchDirs: ['docs/plans'], fsModule, pathModule: fakePath });
    expect(decision.tooShort).toBe(true);
    expect(decision.description).toBeNull();
  });

  it('returns readError:true (does not throw) when the matched file cannot be read', () => {
    const fsModule = {
      existsSync: () => true,
      readdirSync: () => ['demand-thesis-gate-plan.md'],
      readFileSync: () => { throw new Error('ENOENT: no such file or directory'); },
    };
    const sd = { sd_key: 'SD-U-001', title: 'Demand Thesis Gate Implementation', metadata: {} };
    expect(() => {
      const decision = computeBareShellEnrichment(sd, { searchDirs: ['docs/plans'], fsModule, pathModule: fakePath });
      expect(decision.readError).toBe(true);
      expect(decision.description).toBeNull();
    }).not.toThrow();
  });
});
