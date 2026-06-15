/**
 * Unit tests for the YouTube strategy-extraction CLI argument parser (FR-3/FR-5).
 * Importing the module is side-effect-free (the main() run is guarded by
 * isMainModule), so we can exercise the exported parseArgs directly.
 */
import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../../scripts/eva/youtube-strategy-extract.js';

describe('youtube-strategy-extract parseArgs', () => {
  it('safe defaults: no limit, NOT dry-run, dispose OFF', () => {
    expect(parseArgs([])).toEqual({ limit: null, dryRun: false, dispose: false, verbose: false, lang: 'en' });
  });

  it('--limit accepts a positive integer', () => {
    expect(parseArgs(['--limit', '3']).limit).toBe(3);
    expect(parseArgs(['--limit=5']).limit).toBe(5);
  });

  it('--limit 0 / NaN / negative collapse to null (no accidental full-backlog drain)', () => {
    expect(parseArgs(['--limit', '0']).limit).toBe(null);
    expect(parseArgs(['--limit', 'abc']).limit).toBe(null);
    expect(parseArgs(['--limit', '-5']).limit).toBe(null);
  });

  it('--dispose is opt-in and --dry-run / --verbose parse', () => {
    const a = parseArgs(['--dispose', '--dry-run', '-v']);
    expect(a.dispose).toBe(true);
    expect(a.dryRun).toBe(true);
    expect(a.verbose).toBe(true);
  });

  it('--lang accepts space and = forms', () => {
    expect(parseArgs(['--lang', 'es']).lang).toBe('es');
    expect(parseArgs(['--lang=de']).lang).toBe('de');
  });
});
