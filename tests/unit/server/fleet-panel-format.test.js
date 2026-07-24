import { describe, it, expect } from 'vitest';
import FleetPanelFormat from '../../../server/public/fleet-ui/fleet-panel-format.js';

const { badgeClassFor, formatChipPct, fallbackText, BADGE_STYLES } = FleetPanelFormat;

// SD-LEO-INFRA-LEO-APP-RENDERED-001-A: pure formatters backing fleet-panel.js's DOM
// rendering (server/public/fleet-ui/fleet-panel.js). No DOM here on purpose -- these are
// the render-input -> render-output mappings, unit-tested directly under Node.

describe('badgeClassFor', () => {
  it('maps every design-vocab badge string to its CSS class (7-state contract from computeSessionBadge)', () => {
    for (const [badge, cls] of Object.entries(BADGE_STYLES)) {
      expect(badgeClassFor(badge)).toBe(cls);
    }
  });

  it('falls back to the OFF class for an unknown/missing badge value', () => {
    expect(badgeClassFor('SOMETHING_NEW')).toBe('fp-badge--off');
    expect(badgeClassFor(undefined)).toBe('fp-badge--off');
    expect(badgeClassFor(null)).toBe('fp-badge--off');
  });
});

describe('formatChipPct', () => {
  it('formats a finite number as "wk N% used"', () => {
    expect(formatChipPct(42)).toBe('wk 42% used');
    expect(formatChipPct(0)).toBe('wk 0% used');
  });

  it('formats null/undefined/NaN as "wk --% used" (never "wk null% used" or "wk NaN% used")', () => {
    expect(formatChipPct(null)).toBe('wk --% used');
    expect(formatChipPct(undefined)).toBe('wk --% used');
    expect(formatChipPct(NaN)).toBe('wk --% used');
  });
});

describe('fallbackText', () => {
  it('passes through a real value as a string', () => {
    expect(fallbackText('Alpha')).toBe('Alpha');
    expect(fallbackText(0)).toBe('0');
  });

  it('renders an em-dash for null/undefined/empty-string (never "null" or "undefined")', () => {
    expect(fallbackText(null)).toBe('—');
    expect(fallbackText(undefined)).toBe('—');
    expect(fallbackText('')).toBe('—');
  });
});
