import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const ROUTE = join(REPO_ROOT, 'server', 'routes', 'stage17.js');

describe('stage17.js POST /:ventureId/archetypes — GVOS composer gate (QF-20260513-179)', () => {
  const src = readFileSync(ROUTE, 'utf8');

  it('exports isGvosComposerEnabled helper', () => {
    expect(src).toContain('export async function isGvosComposerEnabled');
    expect(src).toContain("flag_key', 's17_use_gvos_composer'");
  });

  it('POST handler calls isGvosComposerEnabled BEFORE activeArchetypeGenerations.set', () => {
    // Locate the POST handler block
    const handlerStart = src.indexOf("router.post('/:ventureId/archetypes',");
    expect(handlerStart).toBeGreaterThan(-1);

    const gateCallIdx = src.indexOf('isGvosComposerEnabled(ventureId, supabase)', handlerStart);
    const ledgerSetIdx = src.indexOf('activeArchetypeGenerations.set(ventureId, ac)', handlerStart);

    expect(gateCallIdx).toBeGreaterThan(handlerStart);
    expect(ledgerSetIdx).toBeGreaterThan(handlerStart);
    expect(gateCallIdx).toBeLessThan(ledgerSetIdx);
  });

  it('returns 202 with status=skipped + reason=gvos_composer_active when flag is on', () => {
    expect(src).toMatch(/status:\s*'skipped'/);
    expect(src).toMatch(/reason:\s*'gvos_composer_active'/);
    expect(src).toMatch(/res\.status\(202\)\.json\(\{\s*status:\s*'skipped'/);
  });

  it('preserves existing generation path when flag is off (legacy 4-variants flow intact)', () => {
    expect(src).toContain('activeArchetypeGenerations.set(ventureId, ac)');
    expect(src).toContain('generateArchetypes(ventureId, supabase');
    expect(src).toContain("status: 'generating'");
  });

  it('helper signature accepts ventureId for future per-venture targeting', () => {
    expect(src).toMatch(/isGvosComposerEnabled\(ventureId,\s*supabase\)/);
  });

  it('helper queries leo_feature_flags table', () => {
    expect(src).toContain("from('leo_feature_flags')");
    expect(src).toContain("select('is_enabled')");
  });
});
