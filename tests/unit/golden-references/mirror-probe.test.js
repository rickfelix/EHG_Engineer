// -A advisory closed: the mirror's missing-table path must fail LOUD, never
// silently no-op (the supabase-js head/count false-positive class). The script
// probes then throws "refusing to no-op" / "probe failed" — this pins the
// source contract so a refactor cannot quietly drop the probe.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const src = readFileSync(join(REPO_ROOT, 'scripts', 'golden-references', 'mirror-registry.mjs'), 'utf8');

describe('mirror missing-table probe (TS-4)', () => {
  it('probe path exists and throws on missing table (source pin)', () => {
    expect(src).toContain('to_regclass');
    expect(src).toContain('refusing to no-op');
    expect(src).toMatch(/throw new Error\('leo_artifacts probe failed/);
  });

  it('writes only the LIVE column set (no file_path/checksum/version)', () => {
    const insertBlock = src.slice(src.indexOf('.insert({'));
    expect(insertBlock).toContain('prd_id');
    expect(insertBlock).toContain('artifact_type');
    expect(insertBlock).toContain('artifact_name');
    expect(insertBlock).toContain('content');
    for (const absent of ['file_path', 'checksum', 'version']) {
      expect(insertBlock.slice(0, insertBlock.indexOf('})'))).not.toContain(absent);
    }
  });

  it('idempotency is application-level (no upsert-onConflict — no unique index exists)', () => {
    expect(src).not.toContain('onConflict');
    expect(src).toContain('insert only if absent');
  });
});
