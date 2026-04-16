import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runChecker, persistResults } from '../../../scripts/wiring-validators/vision-traceability-checker.js';

const __filename = fileURLToPath(import.meta.url);
const WORKTREE_ROOT = resolve(__filename, '..', '..', '..', '..');

function makeTempRoot() {
  const dir = join(tmpdir(), `vtc-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  return dir;
}

// -----------------------------------------------------------------------------
// US-005 — Persistence no-ops
// -----------------------------------------------------------------------------
test('persistResults: no-ops when supabase is null', async () => {
  const r = await persistResults(null, {
    sd_key: 'SD-TEST', check_type: 'vision_traceability', status: 'pass',
    signals_detected: [], evidence: {},
  });
  assert.equal(r.skipped, true);
  assert.equal(r.reason, 'no_client');
});

test('persistResults: no-ops when leo_wiring_validations table absent', async () => {
  // Fake supabase that emulates the PostgREST "table missing" error
  const fakeSupabase = {
    from: () => ({
      upsert: async () => ({ error: { code: 'PGRST205', message: "Could not find the table 'public.leo_wiring_validations'" } }),
    }),
  };
  const r = await persistResults(fakeSupabase, {
    sd_key: 'SD-TEST', check_type: 'vision_traceability', status: 'pass',
    signals_detected: [], evidence: {},
  });
  assert.equal(r.skipped, true);
  assert.equal(r.reason, 'table_absent');
});

// -----------------------------------------------------------------------------
// US-001 — Output shape
// -----------------------------------------------------------------------------
test('runChecker: output shape matches leo_wiring_validations row schema', async () => {
  const fixture = [{ name: 'Orphan Detector', type: 'function', grep_patterns: ['runDetector'], source_quote: 'runs detector' }];
  const visionOverride = { vision_key: 'VISION-UNIT-TEST', version: 1, content: '', sections: null, addendums: [] };
  const results = await runChecker({
    sdKey: 'SD-TEST', supabase: null, root: WORKTREE_ROOT, visionOverride, fixtureMatrix: fixture,
  });
  assert.equal(Array.isArray(results), true);
  assert.equal(results.length, 1);
  const row = results[0];
  assert.equal(row.sd_key, 'SD-TEST');
  assert.equal(row.check_type, 'vision_traceability');
  assert.ok(['pass', 'fail', 'skip'].includes(row.status));
  assert.ok(Array.isArray(row.signals_detected));
  assert.equal(typeof row.evidence, 'object');
});

// -----------------------------------------------------------------------------
// US-004 — Grep classification: happy path (pattern exists in repo)
// -----------------------------------------------------------------------------
test('runChecker: found=true when grep pattern hits a non-test source file', async () => {
  const fixture = [{ name: 'runDetector', type: 'function', grep_patterns: ['runDetector'], source_quote: 'exists in sibling A' }];
  const visionOverride = { vision_key: 'VISION-UNIT-TEST', version: 1, content: '', sections: null, addendums: [] };
  const results = await runChecker({
    sdKey: 'SD-TEST', supabase: null, root: WORKTREE_ROOT, visionOverride, fixtureMatrix: fixture,
  });
  const sig = results[0].signals_detected[0];
  assert.equal(sig.found, true);
  assert.ok(sig.match_count >= 1);
  assert.ok(sig.sample_files.length >= 1);
  // None of the sample files should be test files
  for (const f of sig.sample_files) {
    assert.ok(!/\.(test|spec)\./.test(f), `sample_file must not be a test file: ${f}`);
  }
  assert.equal(results[0].status, 'pass');
});

// -----------------------------------------------------------------------------
// US-004 — Grep classification: fail path
// -----------------------------------------------------------------------------
test('runChecker: found=false when grep pattern is absent; overall status=fail', async () => {
  const fixture = [
    { name: 'Missing Widget', type: 'component', grep_patterns: ['ZzzNonExistentSymbolXyz_12345'], source_quote: 'does not exist' },
  ];
  const visionOverride = { vision_key: 'VISION-UNIT-TEST', version: 1, content: '', sections: null, addendums: [] };
  const results = await runChecker({
    sdKey: 'SD-TEST', supabase: null, root: WORKTREE_ROOT, visionOverride, fixtureMatrix: fixture,
  });
  const sig = results[0].signals_detected[0];
  assert.equal(sig.found, false);
  assert.equal(sig.match_count, 0);
  assert.deepEqual(sig.sample_files, []);
  assert.equal(results[0].status, 'fail');
});

// -----------------------------------------------------------------------------
// US-002 — Skip when no vision_key and no supabase
// -----------------------------------------------------------------------------
test('runChecker: status=skip when no vision_key resolvable and no visionOverride', async () => {
  const results = await runChecker({
    sdKey: 'SD-NO-VISION', supabase: null, root: WORKTREE_ROOT,
  });
  assert.equal(results[0].status, 'skip');
  assert.equal(results[0].evidence.reason, 'no_vision_key');
  assert.equal(results[0].signals_detected.length, 0);
});

// -----------------------------------------------------------------------------
// US-003 — Cache hit avoids LLM call on second run (file-based cache)
// -----------------------------------------------------------------------------
test('runChecker: cache hit sets source=cache and llm_called=false without fixture', async () => {
  const tempRoot = makeTempRoot();
  try {
    const visionKey = 'VISION-CACHE-HIT';
    const version = 1;
    // Pre-write cache file
    const cacheDir = join(tempRoot, '.cache', 'vision-matrices');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, `${visionKey}-v${version}.json`), JSON.stringify({
      vision_key: visionKey,
      version,
      ux_elements: [{ name: 'CachedEl', type: 'function', grep_patterns: ['__never_match__'], source_quote: 'cached' }],
      extracted_at: new Date().toISOString(),
    }));

    const visionOverride = { vision_key: visionKey, version, content: 'irrelevant', sections: null, addendums: [] };
    const results = await runChecker({
      sdKey: 'SD-CACHE', supabase: null, root: tempRoot, visionOverride,
      // Deliberately NOT passing fixtureMatrix — force the extractMatrix path so cache read is exercised.
      llmClientOverride: { complete: async () => { throw new Error('LLM must not be called when cache hits'); } },
    });
    assert.equal(results[0].evidence.source, 'cache');
    assert.equal(results[0].evidence.llm_called, false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

// -----------------------------------------------------------------------------
// US-003 — LLM returns malformed JSON → status=fail, no cache write
// -----------------------------------------------------------------------------
test('runChecker: malformed LLM response produces status=fail and does NOT write cache', async () => {
  const tempRoot = makeTempRoot();
  try {
    const visionKey = 'VISION-BAD-LLM';
    const version = 1;
    const visionOverride = { vision_key: visionKey, version, content: 'prose', sections: null, addendums: [] };
    const results = await runChecker({
      sdKey: 'SD-BAD-LLM', supabase: null, root: tempRoot, visionOverride,
      llmClientOverride: { complete: async () => ({ content: '{malformed' }) },
    });
    assert.equal(results[0].status, 'fail');
    assert.ok(results[0].evidence.llm_error, 'llm_error must be populated');
    const cacheFile = join(tempRoot, '.cache', 'vision-matrices', `${visionKey}-v${version}.json`);
    assert.equal(existsSync(cacheFile), false, 'cache must NOT be written for malformed response');
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

// -----------------------------------------------------------------------------
// US-003 — LLM success writes cache for next run
// -----------------------------------------------------------------------------
test('runChecker: LLM success writes cache file for subsequent runs', async () => {
  const tempRoot = makeTempRoot();
  try {
    const visionKey = 'VISION-WRITE-CACHE';
    const version = 1;
    const visionOverride = { vision_key: visionKey, version, content: 'prose', sections: null, addendums: [] };
    const llmResponse = JSON.stringify({
      ux_elements: [{ name: 'NewEl', type: 'component', grep_patterns: ['NeverMatchesZzz'], source_quote: 'from llm' }],
    });
    const results = await runChecker({
      sdKey: 'SD-WRITE-CACHE', supabase: null, root: tempRoot, visionOverride,
      llmClientOverride: { complete: async () => ({ content: llmResponse }) },
    });
    assert.equal(results[0].evidence.source, 'llm');
    assert.equal(results[0].evidence.llm_called, true);
    const cacheFile = join(tempRoot, '.cache', 'vision-matrices', `${visionKey}-v${version}.json`);
    assert.equal(existsSync(cacheFile), true, 'cache must be written on LLM success');
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
