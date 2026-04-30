import { describe, it, expect } from 'vitest';
import TEMPLATE, {
  SALES_MODELS,
  CHANNEL_TYPES,
  REQUIRED_TIERS,
  REQUIRED_CHANNELS,
  MIN_DEAL_STAGES,
  MIN_FUNNEL_STAGES,
  MIN_JOURNEY_STEPS,
  MIN_CANDIDATES,
} from '../../../../lib/eva/stage-templates/stage-12.js';

describe('stage-12 — GTM & Sales Strategy', () => {
  it('has correct id, slug, title, version', () => {
    expect(TEMPLATE.id).toBe('stage-12');
    expect(TEMPLATE.slug).toBe('gtm-sales-strategy');
    expect(TEMPLATE.title).toBe('GTM & Sales Strategy');
    expect(TEMPLATE.version).toBe('3.0.0');
  });

  it('defaultData has expected shape', () => {
    const d = TEMPLATE.defaultData;
    expect(Array.isArray(d.marketTiers)).toBe(true);
    expect(Array.isArray(d.channels)).toBe(true);
    expect(d).toHaveProperty('salesModel');
    expect(d).toHaveProperty('deal_stages');
    expect(d).toHaveProperty('funnel_stages');
    expect(d).toHaveProperty('customer_journey');
  });

  it('validate() returns invalid when required fields are missing', () => {
    const result = TEMPLATE.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('exports SALES_MODELS array', () => {
    expect(Array.isArray(SALES_MODELS)).toBe(true);
    expect(SALES_MODELS.length).toBeGreaterThan(0);
  });

  it('exports CHANNEL_TYPES array', () => {
    expect(Array.isArray(CHANNEL_TYPES)).toBe(true);
    expect(CHANNEL_TYPES.length).toBeGreaterThan(0);
  });

  it('exports REQUIRED_TIERS as 3', () => {
    expect(REQUIRED_TIERS).toBe(3);
  });

  it('exports REQUIRED_CHANNELS as 8', () => {
    expect(REQUIRED_CHANNELS).toBe(8);
  });

  it('exports MIN_DEAL_STAGES as a positive number', () => {
    expect(typeof MIN_DEAL_STAGES).toBe('number');
    expect(MIN_DEAL_STAGES).toBeGreaterThan(0);
  });

  it('exports MIN_FUNNEL_STAGES as a positive number', () => {
    expect(typeof MIN_FUNNEL_STAGES).toBe('number');
    expect(MIN_FUNNEL_STAGES).toBeGreaterThan(0);
  });

  it('exports MIN_JOURNEY_STEPS as a positive number', () => {
    expect(typeof MIN_JOURNEY_STEPS).toBe('number');
    expect(MIN_JOURNEY_STEPS).toBeGreaterThan(0);
  });

  it('exports MIN_CANDIDATES as a positive number', () => {
    expect(typeof MIN_CANDIDATES).toBe('number');
    expect(MIN_CANDIDATES).toBeGreaterThan(0);
  });
});
