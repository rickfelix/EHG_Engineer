/**
 * Tests for scripts/audit-stage17-urls.mjs
 * SD-LEO-INFRA-STAGE17-CROSS-REPO-001 — Arm B vitest spec
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseBackendRoutes,
  extractUrls,
  urlMatchesAnyRoute,
  audit
} from '../../scripts/audit-stage17-urls.mjs';

const SAMPLE_BACKEND = `
import { Router } from 'express';
const router = Router();

router.post('/:ventureId/strategy-recommendation', handler);
router.post('/:ventureId/archetypes', handler);
router.post('/:ventureId/archetypes/cancel', handler);
router.post('/:ventureId/select', handler);
router.post('/:ventureId/refine', handler);
router.post('/:ventureId/qa', handler);
router.get('/health', handler);

export default router;
`;

let tmp;
let backendPath;
let frontendRoot;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'audit-stage17-'));
  backendPath = join(tmp, 'stage17.js');
  writeFileSync(backendPath, SAMPLE_BACKEND, 'utf8');
  frontendRoot = join(tmp, 'src');
  mkdirSync(frontendRoot, { recursive: true });
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('parseBackendRoutes', () => {
  it('extracts all router.<method> definitions and prefixes with /api/stage17', () => {
    const routes = parseBackendRoutes(backendPath);
    expect(routes.length).toBe(7);
    const paths = routes.map(r => r.pathTemplate);
    expect(paths).toContain('/api/stage17/:ventureId/select');
    expect(paths).toContain('/api/stage17/:ventureId/archetypes/cancel');
    expect(paths).toContain('/api/stage17/health');
  });

  it('produces regexes that match concrete UUIDs in place of :ventureId', () => {
    const routes = parseBackendRoutes(backendPath);
    const selectRoute = routes.find(r => r.pathTemplate === '/api/stage17/:ventureId/select');
    expect(selectRoute.regex.test('/api/stage17/abc123/select')).toBe(true);
    expect(selectRoute.regex.test('/api/stage17/abc123/select/extra')).toBe(false);
  });
});

describe('extractUrls', () => {
  it('captures /api/stage17/* and /api/stitch/* URLs from .ts source', () => {
    const f = join(frontendRoot, 'sample.ts');
    writeFileSync(f, `
const a = await fetch('/api/stage17/123/select');
const b = await fetch(\`/api/stage17/\${id}/refine\`);
const c = await fetch('/api/stitch/legacy/path');
const d = "/api/unrelated/route";
`);
    const urls = extractUrls(f);
    expect(urls).toHaveLength(3);
    expect(urls.map(u => u.url)).toEqual([
      '/api/stage17/123/select',
      '/api/stage17/:p/refine',
      '/api/stitch/legacy/path'
    ]);
  });
});

describe('urlMatchesAnyRoute', () => {
  it('matches concrete and template-literal URLs against backend regexes', () => {
    const routes = parseBackendRoutes(backendPath);
    expect(urlMatchesAnyRoute('/api/stage17/abc/select', routes)).toBe(true);
    expect(urlMatchesAnyRoute('/api/stage17/:p/select', routes)).toBe(true);
    expect(urlMatchesAnyRoute('/api/stage17/abc/archetypes/cancel', routes)).toBe(true);
    expect(urlMatchesAnyRoute('/api/stage17/abc/seed-repo', routes)).toBe(false);
    expect(urlMatchesAnyRoute('/api/stitch/abc/select', routes)).toBe(false);
  });
});

describe('audit (integration)', () => {
  it('returns ok=true when frontend URLs all match backend routes', () => {
    const subdir = join(frontendRoot, 'happy');
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, 'good.tsx'), `
const r1 = await fetch('/api/stage17/abc/select');
const r2 = await fetch(\`/api/stage17/\${ventureId}/archetypes\`);
`);
    const result = audit({ backendPath, frontendRoot: subdir });
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.routeCount).toBe(7);
  });

  it('flags STALE_PREFIX when /api/stitch/* URLs appear', () => {
    const subdir = join(frontendRoot, 'stale');
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, 'bad.tsx'), `
const r = await fetch('/api/stitch/abc/legacy');
`);
    const result = audit({ backendPath, frontendRoot: subdir });
    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].reason).toBe('STALE_PREFIX');
    expect(result.findings[0].url).toBe('/api/stitch/abc/legacy');
  });

  it('flags UNREGISTERED_ROUTE when /api/stage17/* URL has no matching backend route', () => {
    const subdir = join(frontendRoot, 'unreg');
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, 'dead.tsx'), `
const r = await fetch('/api/stage17/seed-repo');
`);
    const result = audit({ backendPath, frontendRoot: subdir });
    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].reason).toBe('UNREGISTERED_ROUTE');
    expect(result.findings[0].url).toBe('/api/stage17/seed-repo');
  });

  it('throws if backend route registry is empty (defensive guard)', () => {
    const emptyBackend = join(tmp, 'empty-backend.js');
    writeFileSync(emptyBackend, 'export default null;');
    const subdir = join(frontendRoot, 'whatever');
    mkdirSync(subdir, { recursive: true });
    expect(() => audit({ backendPath: emptyBackend, frontendRoot: subdir }))
      .toThrow(/registry empty/);
  });
});
