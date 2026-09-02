/**
 * SD-LEO-FIX-CLIENT-FACTORY-FALLBACK-001 (FR-1, FR-3a): the default export that used
 * to alias the ANON client on lib/supabase-client.js is removed. A caller who
 * default-imports the module under a plausible-but-wrong local name (e.g.
 * createServiceClient, since the module also exports a real
 * createSupabaseServiceClient) must now fail LOUD at link time instead of silently
 * receiving the anon client.
 *
 * IMPORTANT: vitest's own module transform (esbuild/rollup) does NOT replicate raw
 * Node's strict ESM link-time validation -- under vitest, `import(fixtureUrl)`
 * resolves successfully with the missing default silently coerced to `undefined`,
 * not a rejected SyntaxError (verified empirically while writing this test). The
 * production runtime is plain `node`, not vitest, so the real, operative behavior
 * must be observed by spawning an actual `node` subprocess against the fixture --
 * exactly what a real caller running this script would experience.
 */
import { describe, it, expect, vi } from 'vitest';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// This suite statically imports lib/supabase-client.js and scripts/modules/sd-creation/
// supabase-client.js to inspect their export shape (never to call a DB operation), and
// separately spawns real `node` subprocesses to observe link-time ESM behavior. Mock the
// live client factory so the DB-test guard (scripts/audit-db-test-guards.mjs) can verify
// this suite never reaches a real Supabase connection from within the vitest process.
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, '../fixtures/client-factory-fallback-001/default-import-attempt.mjs');

describe('SD-LEO-FIX-CLIENT-FACTORY-FALLBACK-001: default-export landmine closed', () => {
  it('FR-1/FR-3a: a bare default import of lib/supabase-client.js fails loud under real Node execution (SyntaxError, non-zero exit), never silently resolves to a client', () => {
    const result = spawnSync(process.execPath, [FIXTURE], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/does not provide an export named 'default'/);
  });

  it('lib/supabase-client.js still exports the real named factories (no regression to the correct-name path)', async () => {
    const mod = await import('../../lib/supabase-client.js');
    expect(typeof mod.createSupabaseServiceClient).toBe('function');
    expect(typeof mod.createSupabaseClient).toBe('function');
    expect(typeof mod.lazyServiceClient).toBe('function');
    expect(mod.default).toBeUndefined();
  });

  it('FR-2: scripts/modules/sd-creation/supabase-client.js also has no default export', async () => {
    const mod = await import('../../scripts/modules/sd-creation/supabase-client.js');
    expect(mod.default).toBeUndefined();
    expect(typeof mod.getSupabaseClient).toBe('function');
    expect(typeof mod.createSupabaseClient).toBe('function');
  });

  it('SECURITY review finding (EXEC-TO-PLAN): scripts/modules/sd-creation/index.js still loads -- it used to re-export the now-removed default export under the name `supabase`, which would break every consumer of the barrel at link time', () => {
    const barrelPath = path.join(__dirname, '../../scripts/modules/sd-creation/index.js');
    // pathToFileURL is required on Windows: a bare absolute path (e.g. "C:/...") is not a
    // valid ESM import specifier for `node -e "import '<spec>'"` -- Node's ESM loader throws
    // ERR_UNSUPPORTED_ESM_URL_SCHEME on the drive-letter "c:" scheme without a file:// prefix.
    const barrelSpec = pathToFileURL(barrelPath).href;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import '${barrelSpec}'; console.log('LOADED_OK');`], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('LOADED_OK');
  });
});
