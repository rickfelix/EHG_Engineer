import { describe, it, expect } from 'vitest';
import TEMPLATE, { COPY_SECTIONS } from '../../../../lib/eva/stage-templates/stage-18.js';

describe('stage-18 — Marketing Copy Studio', () => {
  it('has correct id, slug, title, version', () => {
    expect(TEMPLATE.id).toBe('stage-18');
    expect(TEMPLATE.slug).toBe('marketing-copy-studio');
    expect(TEMPLATE.title).toBe('Marketing Copy Studio');
    expect(TEMPLATE.version).toBe('3.0.0');
  });

  it('defaultData has expected shape', () => {
    const d = TEMPLATE.defaultData;
    expect(d).toHaveProperty('tagline');
    expect(d).toHaveProperty('app_store_desc');
    expect(d).toHaveProperty('landing_hero');
    expect(d).toHaveProperty('email_welcome');
    expect(d).toHaveProperty('social_posts');
    expect(d).toHaveProperty('seo_meta');
    expect(d).toHaveProperty('totalSections');
    expect(d).toHaveProperty('completedSections');
  });

  it('validate() returns invalid when required section data is missing', () => {
    const result = TEMPLATE.validate({});
    expect(result.valid).toBe(false);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('exports COPY_SECTIONS array with 9 sections', () => {
    expect(Array.isArray(COPY_SECTIONS)).toBe(true);
    expect(COPY_SECTIONS.length).toBe(9);
  });

  it('COPY_SECTIONS contains all required marketing copy types', () => {
    expect(COPY_SECTIONS).toContain('tagline');
    expect(COPY_SECTIONS).toContain('app_store_desc');
    expect(COPY_SECTIONS).toContain('landing_hero');
    expect(COPY_SECTIONS).toContain('email_welcome');
    expect(COPY_SECTIONS).toContain('seo_meta');
    expect(COPY_SECTIONS).toContain('blog_draft');
  });
});
