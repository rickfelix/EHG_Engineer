/**
 * Unit tests for the wireframe_screens surface backfill classification logic.
 * SD-SURFACEAWARE-WIREFRAME-GENERATION-MARKETING-ORCH-001-C
 *
 * Tests the pure classifyRow() function and assertMarketingSurvival() helper.
 * No live DB required — all tests are deterministic and offline.
 */

import { describe, it, expect } from 'vitest';
import { classifyRow } from '../../scripts/backfill-wireframe-screen-surfaces.mjs';
import { assertMarketingSurvival } from '../../lib/eva/wireframe-surface-normalizer.js';

// ── classifyRow: reads screen_name OR name field ────────────────────────────

describe('classifyRow — classification via screen_name', () => {
  it('classifies a row with screen_name="Landing Page" as marketing', () => {
    const result = classifyRow({ id: '1', screen_name: 'Landing Page' });
    expect(result.surface).toBe('marketing');
    expect(result.page_type).toBe('landing');
  });

  it('classifies a row with screen_name="Pricing" as marketing', () => {
    const result = classifyRow({ id: '2', screen_name: 'Pricing' });
    expect(result.surface).toBe('marketing');
    expect(result.page_type).toBe('pricing');
  });

  it('classifies a row with screen_name="Sign Up" as auth', () => {
    const result = classifyRow({ id: '3', screen_name: 'Sign Up' });
    expect(result.surface).toBe('auth');
    expect(result.page_type).toBe('signup');
  });

  it('classifies a row with screen_name="Log In" as auth', () => {
    const result = classifyRow({ id: '4', screen_name: 'Log In' });
    expect(result.surface).toBe('auth');
    expect(result.page_type).toBe('login');
  });

  it('defaults INDETERMINATE screen_name to surface=app', () => {
    const result = classifyRow({ id: '5', screen_name: 'Some Unknown Screen' });
    expect(result.surface).toBe('app');
    expect(typeof result.page_type).toBe('string');
    expect(result.page_type.length).toBeGreaterThan(0);
  });

  it('defaults Dashboard to surface=app', () => {
    const result = classifyRow({ id: '6', screen_name: 'Dashboard' });
    expect(result.surface).toBe('app');
    expect(result.page_type).toBe('dashboard');
  });

  it('defaults Settings to surface=app', () => {
    const result = classifyRow({ id: '7', screen_name: 'Settings' });
    expect(result.surface).toBe('app');
    expect(result.page_type).toBe('settings');
  });
});

describe('classifyRow — falls back to name field when screen_name absent', () => {
  it('reads name field when screen_name is not present', () => {
    const result = classifyRow({ id: '8', name: 'Landing Page' });
    expect(result.surface).toBe('marketing');
    expect(result.page_type).toBe('landing');
  });

  it('reads name=Signup as auth', () => {
    const result = classifyRow({ id: '9', name: 'Signup' });
    expect(result.surface).toBe('auth');
  });
});

describe('classifyRow — default-to-app for null/missing names (most restrictive)', () => {
  it('defaults to app for null row', () => {
    const result = classifyRow(null);
    expect(result.surface).toBe('app');
  });

  it('defaults to app for empty screen_name', () => {
    const result = classifyRow({ id: '10', screen_name: '' });
    expect(result.surface).toBe('app');
  });

  it('defaults to app for undefined screen_name', () => {
    const result = classifyRow({ id: '11' });
    expect(result.surface).toBe('app');
  });

  it('result always has a non-empty page_type regardless of input', () => {
    const inputs = [
      { screen_name: '' },
      { name: '' },
      { screen_name: null },
      {},
      null,
    ];
    for (const row of inputs) {
      const result = classifyRow(row);
      expect(typeof result.page_type).toBe('string');
      expect(result.page_type.length).toBeGreaterThan(0);
    }
  });
});

// ── assertMarketingSurvival ─────────────────────────────────────────────────

describe('assertMarketingSurvival', () => {
  it('returns ok=true when marketing count meets target', () => {
    const screens = [
      { surface: 'marketing', name: 'Landing Page' },
      { surface: 'auth', name: 'Sign Up' },
      { surface: 'app', name: 'Dashboard' },
    ];
    expect(assertMarketingSurvival(screens, 1).ok).toBe(true);
  });

  it('returns ok=true when marketing count exceeds target', () => {
    const screens = [
      { surface: 'marketing', name: 'Landing Page' },
      { surface: 'marketing', name: 'Pricing' },
      { surface: 'app', name: 'Dashboard' },
    ];
    expect(assertMarketingSurvival(screens, 1).ok).toBe(true);
    expect(assertMarketingSurvival(screens, 2).ok).toBe(true);
  });

  it('returns ok=false when marketing count is below target', () => {
    const screens = [
      { surface: 'auth', name: 'Sign Up' },
      { surface: 'app', name: 'Dashboard' },
    ];
    const result = assertMarketingSurvival(screens, 1);
    expect(result.ok).toBe(false);
    expect(result.actual).toBe(0);
    expect(result.target).toBe(1);
  });

  it('returns correct actual count', () => {
    const screens = [
      { surface: 'marketing', name: 'Landing Page' },
      { surface: 'marketing', name: 'Pricing' },
      { surface: 'app', name: 'Dashboard' },
    ];
    const result = assertMarketingSurvival(screens, 3);
    expect(result.actual).toBe(2);
    expect(result.ok).toBe(false);
  });

  it('handles empty screen list — invariant fails when target >0', () => {
    const result = assertMarketingSurvival([], 1);
    expect(result.ok).toBe(false);
    expect(result.actual).toBe(0);
  });

  it('handles target=0 as always passing', () => {
    const result = assertMarketingSurvival([], 0);
    expect(result.ok).toBe(true);
  });
});
