// QF-20260511-361 — static-guard regression pins.
//
// Pins lib/tasks/task-hydrator.js loadSD() to the canonical resolveSdInput
// helper. Before this fix, loadSD did .eq('id', sdId) then .eq('uuid_id', sdId);
// both crashed with PostgREST 22P02 ("invalid input syntax for type uuid")
// when sdId was in sd_key form (the CLI shape passed by handoff.js
// execution-helpers). Witness: feedback 7d1f66f2 — 3 hits in one session on
// SD-FDBK-INFRA-TYPE-SOURCE-TRUTH-001.
//
// Same class as the SD-LEO-REFAC-CONSOLIDATE-KEY-RESOLUTION-001 11-callsite
// sweep but this callsite was missed.
//
// These pins read the source file as a string (no module load) and assert
// that the migration stays in place.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');

function read(rel) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

describe('QF-20260511-361 task-hydrator loadSD canonical resolver pins', () => {
  it('lib/tasks/task-hydrator.js imports resolveSdInput from scripts/lib/sd-id-resolver', () => {
    const src = read('lib/tasks/task-hydrator.js');
    expect(src).toMatch(
      /import\s*\{[^}]*\bresolveSdInput\b[^}]*\}\s*from\s*['"][^'"]*scripts\/lib\/sd-id-resolver(?:\.js)?['"]/
    );
  });

  it('loadSD method calls resolveSdInput', () => {
    const src = read('lib/tasks/task-hydrator.js');
    const start = src.indexOf('async loadSD(');
    expect(start).toBeGreaterThan(-1);
    // Bound the slice to the loadSD method body (next ~1500 chars covers the body).
    const body = src.slice(start, start + 1500);
    expect(body).toMatch(/\bresolveSdInput\s*\(\s*sdId\s*,\s*this\.supabase\s*\)/);
  });

  it('loadSD body does NOT contain the legacy .eq(\'id\', sdId) / .eq(\'uuid_id\', sdId) chain', () => {
    const src = read('lib/tasks/task-hydrator.js');
    const start = src.indexOf('async loadSD(');
    const body = src.slice(start, start + 1500);
    // Both legacy patterns must be gone from the loadSD body.
    expect(body).not.toMatch(/\.eq\(\s*['"]id['"]\s*,\s*sdId/);
    expect(body).not.toMatch(/\.eq\(\s*['"]uuid_id['"]\s*,\s*sdId/);
  });

  it('loadSD preserves the legacy "Failed to load SD" error envelope for caller compat', () => {
    const src = read('lib/tasks/task-hydrator.js');
    const start = src.indexOf('async loadSD(');
    const body = src.slice(start, start + 1500);
    // Existing callers (and possibly tests) parse the prefix of this error message.
    expect(body).toMatch(/Failed to load SD\s*\$\{sdId\}:/);
  });

  it('loadSD wraps resolveSdInput in try/catch to translate errors', () => {
    const src = read('lib/tasks/task-hydrator.js');
    const start = src.indexOf('async loadSD(');
    const body = src.slice(start, start + 1500);
    // resolveSdInput throws on input-validation and on not-found; the wrapper
    // must catch so we keep the legacy Error envelope.
    expect(body).toMatch(/try\s*\{[\s\S]*resolveSdInput[\s\S]*\}\s*catch\s*\(/);
  });
});
