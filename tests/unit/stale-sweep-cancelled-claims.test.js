import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SCRIPT = path.resolve(__dirname, '../../scripts/stale-session-sweep.cjs');

describe('QF-20260508-997: stale-sweep clears cancelled-SD claims', () => {
  const src = readFileSync(SCRIPT, 'utf8');

  it('FIX #2 status filter includes cancelled, not just completed', () => {
    expect(src).toMatch(/\.in\(\s*['"]status['"]\s*,\s*\[\s*['"]completed['"]\s*,\s*['"]cancelled['"]\s*\]/);
  });

  it('FIX #2 query selects status alongside sd_key for accurate logging', () => {
    expect(src).toMatch(/select\(\s*['"][^'"]*\bstatus\b[^'"]*['"]\s*\)\s*\.in\(\s*['"]status['"]/);
  });

  it('action message reports actual status (completed or cancelled), not hardcoded "completed"', () => {
    expect(src).toMatch(/QA: cleared stale claiming_session_id on '\s*\+\s*sd\.status/);
  });

  it('summary output mentions both completed and cancelled', () => {
    expect(src).toMatch(/Cleared.*stale claiming_session_id on completed\/cancelled/);
  });

  it('legacy variable name completedWithClaims is fully replaced (no orphan references)', () => {
    expect(src.includes('completedWithClaims')).toBe(false);
  });
});
