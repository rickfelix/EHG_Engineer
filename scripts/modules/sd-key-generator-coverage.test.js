// QF-20260506-836: tests for the protocol-file-tracker writer/consumer fix.
// Covers: (a) unionRangeCoverage merges overlapping ranges correctly,
// (b) computeCoveragePercent picks explicit ranges[] when populated,
// (c) DIGEST escape hatch in validate{Core,Lead}FileRead.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { unionRangeCoverage, computeCoveragePercent, validateCoreFileRead, validateLeadFileRead } from './sd-key-generator.js';

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR;
const STATE_FILE = path.join(PROJECT_DIR, '.claude', 'unified-session-state.json');

function withState(state, fn) {
  let saved = null;
  if (fs.existsSync(STATE_FILE)) saved = fs.readFileSync(STATE_FILE, 'utf8');
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    return fn();
  } finally {
    if (saved !== null) fs.writeFileSync(STATE_FILE, saved, 'utf8');
    else fs.unlinkSync(STATE_FILE);
  }
}

// ---------- unionRangeCoverage (pure function) ----------

test('unionRangeCoverage: two non-overlapping ranges sum correctly', () => {
  const { covered, uncovered } = unionRangeCoverage(
    [{ offset: 1, limit: 100 }, { offset: 200, limit: 100 }],
    400,
  );
  assert.equal(covered, 200);
  assert.deepEqual(uncovered, [{ from: 101, to: 199 }, { from: 300, to: 400 }]);
});

test('unionRangeCoverage: overlapping ranges merge (no double-count)', () => {
  const { covered } = unionRangeCoverage(
    [{ offset: 1, limit: 200 }, { offset: 100, limit: 200 }],
    400,
  );
  assert.equal(covered, 299); // lines 1..299
});

test('unionRangeCoverage: three sequential reads of CLAUDE_CORE-sized file ≥95%', () => {
  // Mirrors the actual REJECT-KILL session that surfaced this bug.
  const { covered } = unionRangeCoverage(
    [{ offset: 1, limit: 750 }, { offset: 751, limit: 750 }, { offset: 1501, limit: 300 }],
    1644,
  );
  assert.equal(covered, 1644);
  assert.ok((covered / 1644) >= 0.95);
});

test('unionRangeCoverage: empty ranges → zero coverage', () => {
  const { covered, uncovered } = unionRangeCoverage([], 100);
  assert.equal(covered, 0);
  assert.deepEqual(uncovered, [{ from: 1, to: 100 }]);
});

// ---------- computeCoveragePercent (state-backed) ----------

test('computeCoveragePercent: explicit ranges[] path picked when populated', () => {
  withState({
    protocolFileReadStatus: {
      'CLAUDE_CORE.md': {
        readCount: 3,
        lastReadWasPartial: true,
        lastPartialRead: { limit: 300, offset: 1501 },
        ranges: [
          { offset: 1, limit: 750 },
          { offset: 751, limit: 750 },
          { offset: 1501, limit: 300 },
        ],
      },
    },
  }, () => {
    const result = computeCoveragePercent('CLAUDE_CORE.md');
    assert.equal(result.source, 'explicit_ranges');
    assert.ok(result.coveredPercent >= 95, `expected ≥95, got ${result.coveredPercent}`);
  });
});

test('computeCoveragePercent: no_limit_final_read still returns 100% (regression for happy path)', () => {
  withState({
    protocolFileReadStatus: {
      'CLAUDE_CORE.md': {
        readCount: 1,
        lastReadWasPartial: false, // single full read
        lastPartialRead: null,
      },
    },
  }, () => {
    const result = computeCoveragePercent('CLAUDE_CORE.md');
    assert.equal(result.source, 'no_limit_final_read');
    assert.equal(result.coveredPercent, 100);
  });
});

// ---------- DIGEST escape hatch ----------

test('validateCoreFileRead: DIGEST equivalent satisfies the gate', () => {
  withState({
    protocolFileReadStatus: {
      'CLAUDE_CORE_DIGEST.md': { readCount: 1, lastReadWasPartial: false, lastPartialRead: null },
    },
  }, () => {
    const result = validateCoreFileRead();
    assert.equal(result.valid, true);
    assert.equal(result.error, null);
  });
});

test('validateLeadFileRead: DIGEST equivalent satisfies the gate', () => {
  withState({
    protocolFileReadStatus: {
      'CLAUDE_LEAD_DIGEST.md': { readCount: 1, lastReadWasPartial: false, lastPartialRead: null },
    },
  }, () => {
    const result = validateLeadFileRead();
    assert.equal(result.valid, true);
    assert.equal(result.error, null);
  });
});
