/**
 * SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-A (FR-5, TS-5, TS-6) — checkRatificationCaptureMiss:
 * a genuine, injectable pre-send seam (not a no-op placeholder — TESTING G2). The DEFAULT detector
 * is an honest no-op ({count:0}) until Child C wires the real ruling-vs-ledger diff; a caller can
 * inject a fake detector to prove the WARN path fires and stays non-blocking.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const m = require('../../scripts/solomon-advisory.cjs');

describe('FR-5/TS-5: checkRatificationCaptureMiss — injectable, non-blocking capture-miss seam', () => {
  it('defaults to a real no-op detector returning count:0 when none is injected', async () => {
    const result = await m.checkRatificationCaptureMiss({});
    expect(result.count).toBe(0);
    expect(result.rows).toEqual([]);
  });

  it('TS-5: an injected fake detector returning a non-zero count is surfaced, proving the seam is real (not inert)', async () => {
    const detector = async () => ({ count: 3, rows: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }] });
    const result = await m.checkRatificationCaptureMiss({}, { detector });
    expect(result.count).toBe(3);
    expect(result.rows).toHaveLength(3);
  });

  it('is fail-soft — a throwing detector never propagates', async () => {
    const detector = async () => { throw new Error('detector boom'); };
    const result = await m.checkRatificationCaptureMiss({}, { detector });
    expect(result.count).toBe(0);
    expect(result.error).toMatch(/detector boom/);
  });

  it('TS-6: defaults thresholdHours to DEFAULT_STALE_RATIFICATION_HOURS and threads it into the detector call', async () => {
    const { DEFAULT_STALE_RATIFICATION_HOURS } = require('../../lib/governance/ratification-stall.mjs');
    let seenThreshold = null;
    const detector = async (_sb, thresholdHours) => { seenThreshold = thresholdHours; return { count: 0, rows: [] }; };
    await m.checkRatificationCaptureMiss({}, { detector });
    expect(seenThreshold).toBe(DEFAULT_STALE_RATIFICATION_HOURS);
  });

  it('an explicit thresholdHours overrides the default and is threaded into the detector call', async () => {
    let seenThreshold = null;
    const detector = async (_sb, thresholdHours) => { seenThreshold = thresholdHours; return { count: 0, rows: [] }; };
    await m.checkRatificationCaptureMiss({}, { thresholdHours: 48, detector });
    expect(seenThreshold).toBe(48);
  });
});

describe('FR-5 (b): the pre-send hook in main() is wrapped fail-soft and never blocks the send', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/solomon-advisory.cjs'), 'utf8');

  it('checkRatificationCaptureMiss is called inside its own try/catch, outside the insertCoordinationRow try{}', () => {
    const hookMatch = source.match(/try \{\s*const captureMiss = await checkRatificationCaptureMiss\(supabase\);[\s\S]*?\} catch \(e\) \{\s*console\.error\(`WARN: ratification capture-miss check errored \(non-blocking\)[\s\S]*?\}\)?;?\s*\}/);
    expect(hookMatch).not.toBeNull();
  });

  it('the hook call site precedes insertCoordinationRow in main()', () => {
    const hookIdx = source.indexOf('checkRatificationCaptureMiss(supabase)');
    const insertIdx = source.indexOf('await insertCoordinationRow(');
    expect(hookIdx).toBeGreaterThan(0);
    expect(insertIdx).toBeGreaterThan(hookIdx);
  });
});
