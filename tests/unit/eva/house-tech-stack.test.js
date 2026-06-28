/**
 * Tests for lib/eva/config/house-tech-stack.js
 * SD-LEO-ENH-CONSTRAIN-STAGE-EHG-001
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  EHG_HOUSE_TECH_STACK,
  EHG_HOUSE_AUTH_STRATEGY,
  HOUSE_STACK_LAYER_NAMES,
  HOUSE_STACK_VERSION,
  getHouseStackSummary,
} from '../../../lib/eva/config/house-tech-stack.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('EHG_HOUSE_TECH_STACK', () => {
  it('has all 5 required layers', () => {
    expect(HOUSE_STACK_LAYER_NAMES).toEqual([
      'presentation', 'api', 'business_logic', 'data', 'infrastructure',
    ]);
    for (const name of HOUSE_STACK_LAYER_NAMES) {
      expect(EHG_HOUSE_TECH_STACK[name]).toBeDefined();
    }
  });

  it('every layer has technology, components_hint, rationale', () => {
    for (const name of HOUSE_STACK_LAYER_NAMES) {
      const layer = EHG_HOUSE_TECH_STACK[name];
      expect(typeof layer.technology).toBe('string');
      expect(layer.technology.length).toBeGreaterThan(0);
      expect(Array.isArray(layer.components_hint)).toBe(true);
      expect(layer.components_hint.length).toBeGreaterThan(0);
      expect(typeof layer.rationale).toBe('string');
      expect(layer.rationale.length).toBeGreaterThan(0);
    }
  });

  it('EHG_HOUSE_AUTH_STRATEGY has technology + rationale', () => {
    expect(typeof EHG_HOUSE_AUTH_STRATEGY.technology).toBe('string');
    expect(EHG_HOUSE_AUTH_STRATEGY.technology.length).toBeGreaterThan(0);
    expect(typeof EHG_HOUSE_AUTH_STRATEGY.rationale).toBe('string');
  });

  it('HOUSE_STACK_VERSION matches YYYY.MM format', () => {
    expect(HOUSE_STACK_VERSION).toMatch(/^\d{4}\.\d{2}$/);
  });

  it('object is frozen (immutable at runtime)', () => {
    expect(Object.isFrozen(EHG_HOUSE_TECH_STACK)).toBe(true);
    expect(Object.isFrozen(EHG_HOUSE_AUTH_STRATEGY)).toBe(true);
    expect(Object.isFrozen(HOUSE_STACK_LAYER_NAMES)).toBe(true);
  });

  it('infrastructure layer reflects the Cloudflare-default venture stack (not AWS, not Supabase)', () => {
    expect(EHG_HOUSE_TECH_STACK.infrastructure.technology).toMatch(/Cloudflare/);
    expect(EHG_HOUSE_TECH_STACK.infrastructure.technology).not.toMatch(/AWS/);
    expect(EHG_HOUSE_TECH_STACK.infrastructure.technology).not.toMatch(/Supabase/);
  });
});

// SD-LEO-INFRA-S0-S18-STACK-GROUNDING-001: the S0 (build-cost) and S18 (build-readiness)
// producer prompts hardcoded stale stacks ('Supabase + Vercel' / 'Replit/Neon/Clerk/Gemini/Sentry')
// that contradict the Cloudflare-default SSOT. They now inject getHouseStackSummary().
describe('getHouseStackSummary — SSOT-grounded venture-stack summary', () => {
  it('renders the Cloudflare-default stack with no forbidden/stale tech', () => {
    const s = getHouseStackSummary();
    expect(typeof s).toBe('string');
    expect(s).toMatch(/Cloudflare/);
    expect(s).toMatch(/Clerk/);
    expect(s).not.toMatch(/Supabase/i);
    expect(s).not.toMatch(/Vercel/i);
  });

  it('is derived from the structured SSOT (tracks EHG_HOUSE_TECH_STACK, not a second hardcode)', () => {
    const s = getHouseStackSummary();
    expect(s).toContain(EHG_HOUSE_TECH_STACK.infrastructure.technology);
    expect(s).toContain(EHG_HOUSE_TECH_STACK.data.technology);
    expect(s).toContain(EHG_HOUSE_AUTH_STRATEGY.technology);
  });
});

describe('S0 + S18 producer prompts are SSOT-grounded (no hardcoded stale stack)', () => {
  const s18 = readFileSync(
    resolve(REPO_ROOT, 'lib/eva/stage-templates/analysis-steps/stage-18-build-readiness.js'),
    'utf8',
  );
  const s0 = readFileSync(
    resolve(REPO_ROOT, 'lib/eva/stage-zero/synthesis/build-cost-estimation.js'),
    'utf8',
  );

  it('S18 sources the house-stack summary and no longer hardcodes Replit/Neon/Clerk/Gemini/Sentry', () => {
    expect(s18).toMatch(/getHouseStackSummary\(\)/);
    expect(s18).not.toContain('Replit/Neon/Clerk/Gemini/Sentry');
  });

  it('S0 sources the house-stack summary and no longer asserts Supabase/Vercel venture infra', () => {
    expect(s0).toMatch(/getHouseStackSummary\(\)/);
    // The stale positive assertion is gone (a "NEVER Supabase" prohibition is allowed).
    expect(s0).not.toMatch(/Infrastructure is Supabase/);
    expect(s0).not.toMatch(/"required":\s*\[\s*"supabase"/);
    expect(s0).not.toMatch(/\bVercel\b/);
  });
});
