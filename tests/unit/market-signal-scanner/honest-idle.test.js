/**
 * Regression guard for the market-signal-scanner honest-idle marker (FR-5).
 * SD: SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001
 *
 * Pins the exact NO_DATA_MARKER string so a future refactor can't silently
 * soften or remove the "do not fabricate a nomination" contract.
 */

import { describe, it, expect, vi } from 'vitest';
import { NO_DATA_MARKER, reportIdleCycle } from '../../../lib/market-signal-scanner/honest-idle.js';

describe('market-signal-scanner honest-idle', () => {
  it('pins the exact NO_DATA_MARKER string', () => {
    expect(NO_DATA_MARKER).toBe(
      'NO-DATA: market-signal-scan found zero candidates clearing triangulation this cycle -- do not fabricate a nomination',
    );
  });

  it('reportIdleCycle logs the marker via logger.info when available', () => {
    const logger = { info: vi.fn(), log: vi.fn() };
    reportIdleCycle(logger);

    expect(logger.info).toHaveBeenCalledWith(NO_DATA_MARKER);
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('reportIdleCycle falls back to logger.log when .info is absent', () => {
    const logger = { log: vi.fn() };
    reportIdleCycle(logger);

    expect(logger.log).toHaveBeenCalledWith(NO_DATA_MARKER);
  });

  it('reportIdleCycle falls back to console.log when no logger is given', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reportIdleCycle();

    expect(spy).toHaveBeenCalledWith(NO_DATA_MARKER);
    spy.mockRestore();
  });
});
