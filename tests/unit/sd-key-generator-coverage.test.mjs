// SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-001: unit tests for the cumulative
// range coverage helpers in sd-key-generator.js (replaces the legacy
// readCount >= 3 heuristic with a precise ≥95% coverage check).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unionRangeCoverage } from '../../scripts/modules/sd-key-generator.js';

test('unionRangeCoverage: two non-overlapping ranges covering 100%', () => {
  const r = unionRangeCoverage(
    [{ offset: 1, limit: 500 }, { offset: 501, limit: 500 }],
    1000
  );
  assert.equal(r.covered, 1000);
  assert.equal(r.uncovered.length, 0);
});

test('unionRangeCoverage: overlapping ranges dedup correctly', () => {
  const r = unionRangeCoverage(
    [{ offset: 1, limit: 600 }, { offset: 401, limit: 600 }],
    1000
  );
  assert.equal(r.covered, 1000);
  assert.equal(r.uncovered.length, 0);
});

test('unionRangeCoverage: partial coverage reports uncovered tail', () => {
  const r = unionRangeCoverage([{ offset: 1, limit: 400 }], 1000);
  assert.equal(r.covered, 400);
  assert.deepEqual(r.uncovered, [{ from: 401, to: 1000 }]);
});

test('unionRangeCoverage: empty ranges → 0% coverage', () => {
  const r = unionRangeCoverage([], 1000);
  assert.equal(r.covered, 0);
  assert.deepEqual(r.uncovered, [{ from: 1, to: 1000 }]);
});

test('unionRangeCoverage: gap in the middle is reported', () => {
  const r = unionRangeCoverage(
    [{ offset: 1, limit: 200 }, { offset: 501, limit: 500 }],
    1000
  );
  assert.equal(r.covered, 700);
  assert.deepEqual(r.uncovered, [{ from: 201, to: 500 }]);
});

test('unionRangeCoverage: range extends past totalLines is clipped', () => {
  const r = unionRangeCoverage([{ offset: 900, limit: 500 }], 1000);
  assert.equal(r.covered, 101); // lines 900..1000 inclusive
});

test('unionRangeCoverage: null/undefined inputs degrade safely', () => {
  const r1 = unionRangeCoverage(null, 1000);
  assert.equal(r1.covered, 0);
  const r2 = unionRangeCoverage([{ offset: 1, limit: 500 }], 0);
  assert.equal(r2.covered, 0);
});

test('unionRangeCoverage: adjacent ranges merge (no double-count)', () => {
  const r = unionRangeCoverage(
    [{ offset: 1, limit: 500 }, { offset: 500, limit: 500 }],
    1000
  );
  // offset=500 + limit=500 → lines 500..999; merged with 1..500 → 1..999
  assert.equal(r.covered, 999);
});

test('unionRangeCoverage: offset 0 is treated as line 1', () => {
  const r = unionRangeCoverage([{ offset: 0, limit: 500 }], 1000);
  assert.equal(r.covered, 500);
});

test('unionRangeCoverage: real scenario — 2 partial reads on CLAUDE_CORE.md (1419 lines)', () => {
  // Simulates: Read(offset=1, limit=800) then Read(offset=800, limit=1200)
  // Expected: 100% coverage of the 1419-line file (overlaps + extends past end).
  const r = unionRangeCoverage(
    [{ offset: 1, limit: 800 }, { offset: 800, limit: 1200 }],
    1419
  );
  assert.equal(r.covered, 1419);
  assert.equal(r.uncovered.length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-5: end-to-end gate behavior via validateCoreFileRead / validateLeadFileRead
// Mocks a session state directory via CLAUDE_PROJECT_DIR so the gate reads a
// synthetic state file and synthetic CLAUDE_CORE.md / CLAUDE_LEAD.md.
// ─────────────────────────────────────────────────────────────────────────────

function makeSyntheticProjectDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-key-gate-'));
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  // 1000-line synthetic protocol files so coverage math is easy to reason about.
  const body = Array.from({ length: 1000 }, (_, i) => `line ${i + 1}`).join('\n');
  fs.writeFileSync(path.join(dir, 'CLAUDE_CORE.md'), body);
  fs.writeFileSync(path.join(dir, 'CLAUDE_LEAD.md'), body);
  return dir;
}

function writeState(dir, state) {
  fs.writeFileSync(
    path.join(dir, '.claude', 'unified-session-state.json'),
    JSON.stringify(state, null, 2)
  );
}

async function importFreshModule() {
  // Force a re-import so the module picks up the new CLAUDE_PROJECT_DIR.
  // Node's ESM loader caches by URL — adding a cache-busting query string
  // forces re-evaluation.
  const bust = `?t=${Date.now()}-${Math.random()}`;
  return await import(`../../scripts/modules/sd-key-generator.js${bust}`);
}

test('FR-5 end-to-end: two partial reads covering 100% → gate PASSES', async () => {
  const dir = makeSyntheticProjectDir();
  const prev = process.env.CLAUDE_PROJECT_DIR;
  try {
    process.env.CLAUDE_PROJECT_DIR = dir;
    // Two partial reads: (offset=1, limit=500) + (offset=501, limit=500) = 100%.
    // lastReadWasPartial must be true so the gate uses the coverage path.
    writeState(dir, {
      protocolFileReadStatus: {
        'CLAUDE_CORE.md': {
          lastReadWasPartial: true,
          lastPartialRead: { offset: 501, limit: 500, readAt: new Date().toISOString() },
        },
        'CLAUDE_LEAD.md': {
          lastReadWasPartial: true,
          lastPartialRead: { offset: 501, limit: 500, readAt: new Date().toISOString() },
        },
      },
      protocolFileReadRanges: {
        'CLAUDE_CORE.md': {
          ranges: [{ offset: 1, limit: 500 }, { offset: 501, limit: 500 }],
        },
        'CLAUDE_LEAD.md': {
          ranges: [{ offset: 1, limit: 500 }, { offset: 501, limit: 500 }],
        },
      },
      protocolFilesRead: { 'CLAUDE_CORE.md': true, 'CLAUDE_LEAD.md': true },
    });
    const mod = await importFreshModule();
    const core = mod.validateCoreFileRead();
    const lead = mod.validateLeadFileRead();
    assert.equal(core.valid, true, `core gate should pass but got: ${core.error}`);
    assert.equal(lead.valid, true, `lead gate should pass but got: ${lead.error}`);
    assert.equal(core.error, null);
    assert.equal(lead.error, null);
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('FR-5 end-to-end: 40% coverage → gate REJECTS with uncovered range', async () => {
  const dir = makeSyntheticProjectDir();
  const prev = process.env.CLAUDE_PROJECT_DIR;
  try {
    process.env.CLAUDE_PROJECT_DIR = dir;
    // Single partial read covering only first 400 of 1000 lines = 40%.
    writeState(dir, {
      protocolFileReadStatus: {
        'CLAUDE_CORE.md': {
          lastReadWasPartial: true,
          lastPartialRead: { offset: 1, limit: 400, readAt: new Date().toISOString() },
        },
      },
      protocolFileReadRanges: {
        'CLAUDE_CORE.md': {
          ranges: [{ offset: 1, limit: 400 }],
        },
      },
      protocolFilesRead: { 'CLAUDE_CORE.md': true },
    });
    const mod = await importFreshModule();
    const core = mod.validateCoreFileRead();
    assert.equal(core.valid, false, 'core gate should reject 40% coverage');
    assert.match(core.error, /40%.*95%|coverage.*below/i, `expected coverage error, got: ${core.error}`);
    // Uncovered range 401-1000 must be mentioned in the error or remediation.
    const combined = `${core.error}\n${core.remediation || ''}`;
    assert.match(combined, /401/, 'uncovered range should name the missing offset');
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
