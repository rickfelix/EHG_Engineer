import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  SHELF_BANDS,
  validateShelfEntry,
  validateShelf,
  assertBandDiversity,
  loadShelf,
} from '../../lib/apa/boundary-material-shelf.mjs';

// SD-LEO-INFRA-APA-BOUNDARY-MATERIAL-001 (PART A): schema + assembler band-diversity guard.
const entry = (over = {}) => ({
  id: 'B-example', format: 'capture_png', band: 'on_line',
  craft_justification: 'ordinary SaaS landing, competent but unremarkable hierarchy',
  a11y_notes: 'contrast ~4.5:1, visible focus rings', ...over,
});

describe('boundary-material shelf: entry schema', () => {
  it('accepts a well-formed capture_png entry in each band', () => {
    for (const band of SHELF_BANDS) {
      expect(() => validateShelfEntry(entry({ band }))).not.toThrow();
    }
  });
  it('rejects a non-capture_png format (boundary material is always a live capture)', () => {
    expect(() => validateShelfEntry(entry({ format: 'html_native' }))).toThrow(/capture_png/);
  });
  it('rejects an unknown band', () => {
    expect(() => validateShelfEntry(entry({ band: 'way_below' }))).toThrow(/band must be one of/);
  });
  it('requires craft_justification and a11y_notes (anti-confabulation discipline)', () => {
    expect(() => validateShelfEntry(entry({ craft_justification: '' }))).toThrow(/craft_justification/);
    expect(() => validateShelfEntry(entry({ a11y_notes: '  ' }))).toThrow(/a11y_notes/);
  });
  it('rejects a non-object entry and a missing/non-string id', () => {
    expect(() => validateShelfEntry(null)).toThrow(/not an object/);
    expect(() => validateShelfEntry(entry({ id: undefined }))).toThrow(/id/);
    expect(() => validateShelfEntry(entry({ id: 42 }))).toThrow(/id/);
  });
});

describe('boundary-material shelf: manifest shape', () => {
  it('accepts a versioned container with a valid (possibly empty) entries array', () => {
    expect(() => validateShelf({ shelf_version: 1, entries: [] })).not.toThrow();
    expect(() => validateShelf({ shelf_version: 2, entries: [entry(), entry({ band: 'above' })] })).not.toThrow();
  });
  it('requires a positive shelf_version and an entries array', () => {
    expect(() => validateShelf({ entries: [] })).toThrow(/shelf_version/);
    expect(() => validateShelf({ shelf_version: 1 })).toThrow(/entries/);
  });
  it('the committed shelf manifest is valid and starts empty at v1', () => {
    const shelf = JSON.parse(readFileSync(path.resolve('docs/design/apa-boundary-material-shelf/manifest.json'), 'utf8'));
    expect(() => validateShelf(shelf)).not.toThrow();
    expect(shelf.shelf_version).toBe(1);
    expect(shelf.entries).toEqual([]);
  });
  it('loadShelf() reads + validates the committed manifest via its own async path', async () => {
    const shelf = await loadShelf();
    expect(shelf.shelf_version).toBe(1);
    expect(shelf.entries).toEqual([]);
    await expect(loadShelf(path.resolve('docs/design/apa-boundary-material-shelf/nope.json'))).rejects.toThrow();
  });
});

describe('boundary-material shelf: assembler FORBIDDEN all-same-side guard', () => {
  it('rejects an all-above selection (no floor-edge test)', () => {
    expect(() => assertBandDiversity([entry({ band: 'above' }), entry({ band: 'above' })])).toThrow(/all-same-side/);
  });
  it('rejects an all-below selection', () => {
    expect(() => assertBandDiversity([entry({ band: 'below' }), entry({ band: 'below' })])).toThrow(/all-same-side/);
  });
  it('rejects a single-band selection (must span >=2 bands)', () => {
    expect(() => assertBandDiversity([entry({ band: 'on_line' })])).toThrow(/>=2 bands|all-same-side/);
  });
  it('rejects an empty selection', () => {
    expect(() => assertBandDiversity([])).toThrow(/non-empty/);
  });
  it('rejects a selection containing an invalid band', () => {
    expect(() => assertBandDiversity([entry({ band: 'above' }), entry({ band: 'nope' })])).toThrow(/invalid band/);
  });
  it('accepts an above+below selection (straddles the floor)', () => {
    const r = assertBandDiversity([entry({ band: 'above' }), entry({ band: 'below' })]);
    expect(r.bands.sort()).toEqual(['above', 'below']);
  });
  it('accepts a full above+on_line+below selection with no warnings', () => {
    const r = assertBandDiversity([entry({ band: 'above' }), entry({ band: 'on_line' }), entry({ band: 'below' })]);
    expect(r.warnings).toHaveLength(0);
    expect(r.bands.sort()).toEqual(['above', 'below', 'on_line']);
  });
  it('warns (but passes) when a 2-band selection includes on_line + one side', () => {
    const r = assertBandDiversity([entry({ band: 'on_line' }), entry({ band: 'above' })]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
