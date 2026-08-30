/**
 * QF-20260830-787 — the priority badge at fleet-dashboard.cjs's printAvailable() used a binary
 * ternary (high-vs-else) over the four-value priority enum (critical/high/medium/low), so
 * priority='critical' fell to the else branch and rendered MED — a chairman/dispatcher-facing
 * surface understating exactly the rows that matter most. Pins the full enum -> badge mapping.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { printAvailable } = require('../../../scripts/fleet-dashboard.cjs');

let logSpy;
beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { logSpy.mockRestore(); });
const output = () => logSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');

const sd = (key, priority) => ({ sd_key: `SD-LEO-INFRA-${key}`, title: `${key} title`, priority });

describe('printAvailable — priority badge maps the full 4-value enum (QF-20260830-787)', () => {
  it('renders a distinct badge for each of critical/high/medium/low', () => {
    const unclaimedStandalone = [
      sd('CRIT-ITEM', 'critical'),
      sd('HIGH-ITEM', 'high'),
      sd('MED-ITEM', 'medium'),
      sd('LOW-ITEM', 'low'),
    ];
    printAvailable({ unclaimedChildren: [], unclaimedStandalone });
    const lines = output().split('\n');

    const critLine = lines.find((l) => l.includes('CRIT-ITEM'));
    const highLine = lines.find((l) => l.includes('HIGH-ITEM'));
    const medLine = lines.find((l) => l.includes('MED-ITEM'));
    const lowLine = lines.find((l) => l.includes('LOW-ITEM'));

    expect(critLine).toMatch(/CRIT\s*$/);
    expect(highLine).toMatch(/HIGH\s*$/);
    expect(medLine).toMatch(/MED\s*$/);
    expect(lowLine).toMatch(/LOW\s*$/);
  });

  it('critical never falls into the else-branch MED badge (the regressed behavior)', () => {
    const unclaimedStandalone = [sd('CRIT-ONLY', 'critical')];
    printAvailable({ unclaimedChildren: [], unclaimedStandalone });
    const out = output();
    const critLine = out.split('\n').find((l) => l.includes('CRIT-ONLY'));
    expect(critLine).toMatch(/CRIT\s*$/);
    expect(critLine).not.toMatch(/MED\s*$/);
  });

  it('an unrecognized priority value falls back to MED rather than throwing or printing undefined', () => {
    const unclaimedStandalone = [sd('WEIRD-ITEM', 'somethingElse')];
    printAvailable({ unclaimedChildren: [], unclaimedStandalone });
    const critLine = output().split('\n').find((l) => l.includes('WEIRD-ITEM'));
    expect(critLine).toMatch(/MED\s*$/);
  });
});
