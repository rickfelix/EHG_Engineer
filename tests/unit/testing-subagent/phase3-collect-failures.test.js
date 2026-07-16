import { describe, it, expect } from 'vitest';
import { collectFailures } from '../../../lib/sub-agents/testing/phases/phase3-execution.js';

describe('QF-20260713-266: Playwright JSON report failure collection', () => {
  it('collects failed specs recursively and skips passing ones', () => {
    const suite = {
      specs: [
        { title: 'passes', ok: true, file: 'a.spec.js', line: 1 },
        { title: 'fails', ok: false, file: 'a.spec.js', line: 9 }
      ],
      suites: [
        { specs: [{ title: 'nested fail', ok: false, file: 'b.spec.js', line: 3 }], suites: [] }
      ]
    };
    const failures = [];
    collectFailures(suite, failures);
    expect(failures).toEqual([
      { test: 'fails', file: 'a.spec.js', line: 9 },
      { test: 'nested fail', file: 'b.spec.js', line: 3 }
    ]);
  });

  it('handles suites with no specs/suites arrays', () => {
    const failures = [];
    collectFailures({}, failures);
    expect(failures).toEqual([]);
  });
});
