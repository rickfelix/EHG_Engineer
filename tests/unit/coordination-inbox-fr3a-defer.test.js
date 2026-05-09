import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const HOOK = path.resolve(__dirname, '../../scripts/hooks/coordination-inbox.cjs');

describe('QF-20260508-988: coordination-inbox FR-3a deferral guard', () => {
  const src = readFileSync(HOOK, 'utf8');

  it('imports getActiveCoordinatorId from lib/coordinator/resolve.cjs', () => {
    expect(src).toMatch(/getActiveCoordinatorId\b/);
    expect(src).toMatch(/lib\/coordinator\/resolve\.cjs/);
  });

  it('resolves amCoordinator before iterating messages', () => {
    const guardIdx = src.indexOf('let amCoordinator = false');
    const loopIdx = src.indexOf('for (const msg of messages)');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(loopIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(loopIdx);
  });

  it('skips FR-3a signals (INFO + payload.signal_type) when this session IS the coordinator', () => {
    expect(src).toMatch(
      /amCoordinator\s*&&\s*msg\.message_type\s*===\s*'INFO'\s*&&\s*msg\.payload\s*&&\s*msg\.payload\.signal_type/
    );
  });

  it('fail-open: catch swallows resolve.cjs require errors so worker sessions still drain', () => {
    expect(src).toMatch(/catch\s*\{\s*\/\*\s*fail-open[^*]*\*\/\s*\}/);
  });

  it('only marks coordinator-self comparison (not all coordinators)', () => {
    expect(src).toMatch(/coordinatorId\s*===\s*sessionId/);
  });
});
