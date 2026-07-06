// QF-20260706-648 — registry-wide target_application designation at QF filing time.
// Hermetic pure-function tests: no live DB.
import { describe, it, expect } from 'vitest';
import { validateTargetApplication, detectMisdesignation } from '../../../lib/fleet/qf-target-application.js';

const ACTIVE_APPS = [
  { name: 'EHG', normalized_name: 'ehg' },
  { name: 'EHG_Engineer', normalized_name: 'ehg_engineer' },
  { name: 'MarketLens', normalized_name: 'marketlens' },
  { name: 'Cron Canary', normalized_name: 'cron_canary' },
];

describe('validateTargetApplication (mirrors fn_quick_fixes_validate_target_application)', () => {
  it('accepts an exact name match', () => {
    expect(validateTargetApplication('MarketLens', ACTIVE_APPS).valid).toBe(true);
  });

  it('accepts the normalized_name form (lowercase, matches DB lower() compare)', () => {
    expect(validateTargetApplication('cron_canary', ACTIVE_APPS).valid).toBe(true);
  });

  it('rejects a value matching neither name nor normalized_name', () => {
    const v = validateTargetApplication('cron canary', ACTIVE_APPS); // space, not underscore
    expect(v.valid).toBe(false);
    expect(v.allowedNames).toEqual(['EHG', 'EHG_Engineer', 'MarketLens', 'Cron Canary']);
  });

  it('rejects an unregistered/unknown app', () => {
    expect(validateTargetApplication('SomeUnregisteredVenture', ACTIVE_APPS).valid).toBe(false);
  });
});

describe('detectMisdesignation', () => {
  it('flags a venture name in the text that differs from the resolved (cwd) target', () => {
    const hit = detectMisdesignation('Fix the MarketLens onboarding flow', 'EHG_Engineer', ACTIVE_APPS);
    expect(hit).toBe('MarketLens');
  });

  it('does not flag when the resolved target already matches the mentioned venture', () => {
    expect(detectMisdesignation('Fix the MarketLens onboarding flow', 'MarketLens', ACTIVE_APPS)).toBeNull();
  });

  it('never flags platform names (EHG/EHG_Engineer) — only ventures', () => {
    expect(detectMisdesignation('Fix an EHG_Engineer CLI script', 'EHG_Engineer', ACTIVE_APPS)).toBeNull();
    expect(detectMisdesignation('Fix an EHG dashboard bug', 'EHG_Engineer', ACTIVE_APPS)).toBeNull();
  });

  it('returns null for plain platform text mentioning no venture', () => {
    expect(detectMisdesignation('Fix a CLI parsing bug in create-quick-fix.js', 'EHG_Engineer', ACTIVE_APPS)).toBeNull();
  });
});
